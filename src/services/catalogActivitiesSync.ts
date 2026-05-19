import { query, queryOne } from "../db";
import { LineamientosData } from "./iaLineamientosParser";

export type ActivityTable =
  | "investigations"
  | "teacher_training"
  | "administrative_activities"
  | "indirect_teaching"
  | "social_projects"
  | "complementary_activities";

export type PendingCatalogActivity = {
  rule_id: string;
  rule_key: string;
  label: string;
  category: string;
  weekly_hours: number;
  number_weeks: number;
  suggested_table: ActivityTable;
};

/** Formularios disponibles para registrar actividades nuevas (con weekly_hours). */
export const CATALOG_FORM_OPTIONS: Array<{
  table: ActivityTable;
  subfunctionId: string;
  labelEs: string;
}> = [
  { table: "investigations", subfunctionId: "investigacion", labelEs: "Investigación" },
  { table: "administrative_activities", subfunctionId: "administrativas", labelEs: "Administrativas" },
  { table: "teacher_training", subfunctionId: "formacion-docentes", labelEs: "Formación docente" },
  { table: "indirect_teaching", subfunctionId: "docencia-indirecta", labelEs: "Docencia indirecta" },
  { table: "social_projects", subfunctionId: "proyeccion-social", labelEs: "Proyección social" },
  { table: "complementary_activities", subfunctionId: "actividades-complementarias", labelEs: "Actividades complementarias" },
];

const WEEKLY_HOURS_TABLES: ActivityTable[] = [
  "investigations",
  "teacher_training",
  "administrative_activities",
  "indirect_teaching",
  "social_projects",
  "complementary_activities",
];

const SKIP_RULE_KEYS = new Set([
  "horas_semestre",
  "semanas_semestre",
  "max_trabajos_grado",
  "preparacion_clase",
  "asesoria_estudiantes",
  "asesoria_trabajo_grado_pregrado",
  "asesoria_trabajo_grado_maestria",
  "asesoria_trabajo_grado_doctorado",
  "equivalencia_especializacion",
  "equivalencia_maestria",
  "equivalencia_doctorado",
  "form_bg_color",
  "docencia_directa_sin_proyecto",
  "docencia_sin_proyecto",
]);

type RuleRow = {
  id: string;
  rule_key: string;
  label: string;
  category: string;
  hours: number;
  subjects: number;
};

export async function findActivityInCatalog(
  name: string
): Promise<{ table: ActivityTable; id: number } | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  for (const table of WEEKLY_HOURS_TABLES) {
    const found = await findActivityInCatalogTable(trimmed, table);
    if (found) return found;
  }
  return null;
}

export async function findActivityInCatalogTable(
  name: string,
  table: ActivityTable
): Promise<{ table: ActivityTable; id: number } | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const row = await queryOne<{ id: number }>(
    `SELECT id FROM public.${table}
     WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
     LIMIT 1`,
    [trimmed]
  );
  if (row) return { table, id: row.id };
  return null;
}

export type ProposedLineamientoRule = {
  id?: string;
  rule_key: string;
  label: string;
  category: string;
  hours: number;
  subjects: number;
};

/**
 * Evalúa reglas propuestas ANTES de aplicar: devuelve las que no tienen fila en catálogo.
 */
export async function previewPendingFromProposedRules(
  proposed: ProposedLineamientoRule[],
  numberWeeks: number
): Promise<PendingCatalogActivity[]> {
  const weeks = numberWeeks > 0 ? numberWeeks : 23;
  const pending: PendingCatalogActivity[] = [];
  const seen = new Set<string>();

  for (const rule of proposed) {
    if (!["investigacion", "administrativas", "formacion", "docencia"].includes(rule.category)) {
      continue;
    }
    const cat =
      rule.category === "docencia" ? "formacion" : rule.category;
    if (SKIP_RULE_KEYS.has(rule.rule_key)) continue;

    const label = rule.label?.trim();
    if (!label) continue;

    const weeklyHours =
      rule.subjects != null && rule.subjects > 0
        ? Math.round(rule.subjects)
        : Math.round(rule.hours ?? 0);
    if (weeklyHours <= 0) continue;

    const ruleId = rule.id ?? rule.rule_key;

    const mapping = RULE_TO_ACTIVITIES[rule.rule_key];
    if (mapping) {
      for (const activityName of mapping.names) {
        const exists = await findActivityInCatalogTable(activityName, mapping.table);
        if (exists) continue;

        const dedupeKey = `${mapping.table}::${activityName.toLowerCase()}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        pending.push({
          rule_id: `${ruleId}::${activityName}`,
          rule_key: rule.rule_key,
          label: activityName,
          category: cat,
          weekly_hours: weeklyHours,
          number_weeks: weeks,
          suggested_table: mapping.table,
        });
      }
      continue;
    }

    const exists = await findActivityInCatalog(label);
    if (exists) continue;

    const dedupeKey = `${rule.rule_key}::${label.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const suggested = CATEGORY_TO_TABLE[cat] ?? "investigations";

    pending.push({
      rule_id: ruleId,
      rule_key: rule.rule_key,
      label,
      category: cat,
      weekly_hours: weeklyHours,
      number_weeks: weeks,
      suggested_table: suggested,
    });
  }

  return pending;
}

/**
 * Lineamientos sin fila en catálogo (p. ej. combinaciones IP+2C).
 * Las reglas con mapeo fijo (inv_1p → Investigador principal) se actualizan solas.
 */
export async function findPendingCatalogActivities(
  numberWeeks: number
): Promise<PendingCatalogActivity[]> {
  const weeks = numberWeeks > 0 ? numberWeeks : 23;
  const pending: PendingCatalogActivity[] = [];

  const rows = await query<RuleRow>(
    `SELECT id, rule_key, label, category, hours, subjects
     FROM public.recommendation_rules
     WHERE active = true`
  );

  for (const rule of rows) {
    if (!["investigacion", "administrativas", "formacion"].includes(rule.category)) continue;
    if (SKIP_RULE_KEYS.has(rule.rule_key)) continue;
    if (RULE_TO_ACTIVITIES[rule.rule_key]) continue;

    const label = rule.label?.trim();
    if (!label) continue;

    const weeklyHours =
      rule.subjects != null && rule.subjects > 0 ? rule.subjects : rule.hours;
    if (weeklyHours <= 0) continue;

    const exists = await findActivityInCatalog(label);
    if (exists) continue;

    const suggested =
      CATEGORY_TO_TABLE[rule.category] ?? "investigations";

    pending.push({
      rule_id: rule.id,
      rule_key: rule.rule_key,
      label,
      category: rule.category,
      weekly_hours: Math.round(weeklyHours),
      number_weeks: weeks,
      suggested_table: suggested,
    });
  }

  return pending;
}

export async function registerCatalogActivities(
  items: Array<{
    table: ActivityTable;
    label: string;
    weekly_hours: number;
    number_weeks: number;
  }>
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;
  for (const item of items) {
    const result = await upsertCatalogActivity(
      item.table,
      item.label.trim(),
      item.weekly_hours,
      item.number_weeks
    );
    if (result === "inserted") created++;
    else updated++;
  }
  return { created, updated };
}

/** rule_key → actividades en catálogo (weekly_hours = ✍🏼 horas semanales / subjects). */
const RULE_TO_ACTIVITIES: Record<
  string,
  { table: ActivityTable; names: string[] }
> = {
  inv_1p: { table: "investigations", names: ["Investigador principal"] },
  inv_1c: { table: "investigations", names: ["Co-investigador"] },
  form_doctorado: { table: "teacher_training", names: ["Estudios doctorado"] },
  form_maestria: { table: "teacher_training", names: ["Estudios maestría"] },
  form_pedagogicos: { table: "teacher_training", names: ["Estudios Pedagogicos"] },
  admin_dir_depto_pregrado: {
    table: "administrative_activities",
    names: ["Director de departamento", "Director de programa pregrado"],
  },
  admin_dir_posgrado_1: {
    table: "administrative_activities",
    names: ["Director de programa posgrado"],
  },
  admin_dir_posgrado_2: {
    table: "administrative_activities",
    names: ["Director de programa posgrado"],
  },
  admin_coord_area: {
    table: "administrative_activities",
    names: ["Coordinador de área"],
  },
  admin_decano_vicerrector_doctorado: {
    table: "administrative_activities",
    names: [
      "Decano de Facultad",
      "Vicerrector académico",
      "Director de programa doctorado",
    ],
  },
  investigador_principal: { table: "investigations", names: ["Investigador principal"] },
  coinvestigador: { table: "investigations", names: ["Co-investigador"] },
  formacion_doctorado: { table: "teacher_training", names: ["Estudios doctorado"] },
  formacion_maestria: { table: "teacher_training", names: ["Estudios maestría"] },
  director_programa: {
    table: "administrative_activities",
    names: ["Director de programa pregrado", "Director de departamento"],
  },
  director_posgrado_descarga: {
    table: "administrative_activities",
    names: ["Director de programa posgrado"],
  },
  coordinacion_area_descarga: {
    table: "administrative_activities",
    names: ["Coordinador de área"],
  },
  lider_colectivo: {
    table: "administrative_activities",
    names: ["Líder de colectivo"],
  },
  participacion_colectivo: {
    table: "administrative_activities",
    names: ["Participación en colectivo"],
  },
  comite_curricular: {
    table: "complementary_activities",
    names: ["Comité curricular"],
  },
  comite_basico_facultad: {
    table: "complementary_activities",
    names: ["Comité básico de facultad"],
  },
  lider_grupo_investigacion: {
    table: "investigations",
    names: ["Líder de grupo de investigación"],
  },
  lider_revista: {
    table: "complementary_activities",
    names: ["Líder de revista"],
  },
};

const CATEGORY_TO_TABLE: Record<string, ActivityTable> = {
  investigacion: "investigations",
  administrativas: "administrative_activities",
  formacion: "teacher_training",
};

/**
 * Crea o actualiza una actividad en catálogo.
 * weekly_hours = horas semanales a registrar (✍🏼 del lineamiento).
 */
export async function upsertCatalogActivity(
  table: ActivityTable,
  name: string,
  weeklyHours: number,
  numberWeeks: number
): Promise<"inserted" | "updated" | "unchanged"> {
  const wh = Math.round(weeklyHours);
  const nw = Math.round(numberWeeks);

  const existing = await queryOne<{
    id: number;
    weekly_hours: number;
    number_weeks: number;
  }>(
    `SELECT id, weekly_hours, number_weeks FROM public.${table}
     WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
     LIMIT 1`,
    [name]
  );

  if (existing) {
    if (existing.weekly_hours === wh && existing.number_weeks === nw) {
      return "unchanged";
    }
    await query(
      `UPDATE public.${table}
       SET weekly_hours = $1, number_weeks = $2
       WHERE id = $3`,
      [wh, nw, existing.id]
    );
    return "updated";
  }

  await query(
    `INSERT INTO public.${table} (name, weekly_hours, number_weeks)
     VALUES ($1, $2, $3)`,
    [name, wh, nw]
  );
  return "inserted";
}

/**
 * Sincroniza catálogos desde recommendation_rules según categoría:
 * investigacion → investigations, administrativas → administrative_activities,
 * formacion → teacher_training.
 * name = label de la regla; weekly_hours = horas semanales (subjects).
 */
export async function syncCatalogActivitiesFromRecommendationRules(
  numberWeeks: number
): Promise<{ updated: number; inserted: number }> {
  const weeks = numberWeeks > 0 ? numberWeeks : 23;
  let updated = 0;
  let inserted = 0;

  const rows = await query<RuleRow>(
    `SELECT rule_key, label, category, hours, subjects
     FROM public.recommendation_rules
     WHERE active = true`
  );

  const seen = new Set<string>();

  for (const rule of rows) {
    if (!["investigacion", "administrativas", "formacion"].includes(rule.category)) {
      continue;
    }
    if (SKIP_RULE_KEYS.has(rule.rule_key)) continue;

    const table = CATEGORY_TO_TABLE[rule.category];
    if (!table) continue;

    const label = rule.label?.trim();
    if (!label) continue;

    const horasSemanales =
      rule.subjects != null && rule.subjects > 0 ? rule.subjects : rule.hours;
    if (horasSemanales <= 0) continue;

    const dedupeKey = `${table}::${label.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const result = await upsertCatalogActivity(table, label, horasSemanales, weeks);
    if (result === "updated") updated++;
    else if (result === "inserted") inserted++;
  }

  return { updated, inserted };
}

/** Docencia indirecta, anexas y settings (actividades de formularios van vía recommendation_rules). */
export async function syncCatalogsFromLineamientosConfig(
  config: LineamientosData
): Promise<void> {
  const weeks = config.semanasSemestre > 0 ? config.semanasSemestre : 23;
  const di = config.docenciaIndirecta;

  // Docencia indirecta (factores; weekly_hours puede ser decimal)
  const prep = di.preparacionClasePorHora;
  const existingPrep = await queryOne<{ id: number }>(
    `SELECT id FROM public.indirect_teaching WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))`,
    ["Preparación de clases"]
  );
  if (existingPrep) {
    await query(
      `UPDATE public.indirect_teaching SET weekly_hours = $1, number_weeks = $2 WHERE id = $3`,
      [prep, weeks, existingPrep.id]
    );
  } else {
    await query(
      `INSERT INTO public.indirect_teaching (name, weekly_hours, number_weeks) VALUES ($1, $2, $3)`,
      ["Preparación de clases", prep, weeks]
    );
  }

  const ases = di.asesoriaPorCurso;
  const existingAses = await queryOne<{ id: number }>(
    `SELECT id FROM public.indirect_teaching WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))`,
    ["Asesorías de estudiantes"]
  );
  if (existingAses) {
    await query(
      `UPDATE public.indirect_teaching SET weekly_hours = $1, number_weeks = $2 WHERE id = $3`,
      [ases, weeks, existingAses.id]
    );
  } else {
    await query(
      `INSERT INTO public.indirect_teaching (name, weekly_hours, number_weeks) VALUES ($1, $2, $3)`,
      ["Asesorías de estudiantes", ases, weeks]
    );
  }

  // Actividades anexas
  const anexas: Array<{ key: keyof typeof config.actividadesAnexas; name: string; table: ActivityTable }> = [
    { key: "liderColectivo", name: "Líder de colectivo", table: "administrative_activities" },
    { key: "participacionColectivo", name: "Participación en colectivo", table: "administrative_activities" },
    { key: "comiteCurricular", name: "Comité curricular", table: "complementary_activities" },
    { key: "comiteBasicoFacultad", name: "Comité básico de facultad", table: "complementary_activities" },
    { key: "liderGrupoInvestigacion", name: "Líder de grupo de investigación", table: "investigations" },
    { key: "liderRevista", name: "Líder de revista", table: "complementary_activities" },
  ];
  for (const a of anexas) {
    const val = config.actividadesAnexas[a.key];
    if (val > 0) {
      await upsertCatalogActivity(a.table, a.name, val, weeks);
    }
  }

  await query(
    `INSERT INTO public.system_settings (key, value, updated_at)
     VALUES ('horas_semestre_defecto', $1, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [JSON.stringify(config.horasSemestre)]
  );

  if (config.visualSettings?.form_bg_color) {
    await query(
      `INSERT INTO public.system_settings (key, value, updated_at)
       VALUES ('form_bg_color', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [JSON.stringify(config.visualSettings.form_bg_color)]
    );
  }
}
