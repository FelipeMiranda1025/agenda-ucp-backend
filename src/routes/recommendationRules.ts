import { Router, Response } from "express";
import { query, queryOne } from "../db";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { applyCatalogsFromLineamientos } from "../services/lineamientosApplierService";
import { syncActiveLineamientosFromRecommendationRules } from "../services/recommendationRulesToConfig";
import {
  syncCatalogActivitiesFromRecommendationRules,
  findPendingCatalogActivities,
  registerCatalogActivities,
  previewPendingFromProposedRules,
  ActivityTable,
  ProposedLineamientoRule,
} from "../services/catalogActivitiesSync";
import { getActiveLineamientos } from "../services/lineamientosConfigService";

const router = Router();
router.use(requireAuth);

/**
 * GET /api/recommendation-rules
 * Lista todas las reglas. Acepta `?order=col.dir` (ej. priority.desc).
 */
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const order = String(req.query.order ?? "priority.desc");
    const [col, dir] = order.split(".");
    const safeCol = ["priority", "category", "label", "updated_at"].includes(col) ? col : "priority";
    const safeDir = String(dir).toLowerCase() === "asc" ? "ASC" : "DESC";
    const rows = await query(
      `SELECT * FROM public.recommendation_rules ORDER BY ${safeCol} ${safeDir}, label ASC`
    );
    return res.json(rows);
  } catch (err) {
    console.error("[recommendation-rules:list]", err);
    return res.status(500).json({ message: "Error obteniendo reglas" });
  }
});

/**
 * POST /api/recommendation-rules
 * Crea una nueva regla.
 */
router.post("/", async (req: AuthRequest, res: Response) => {
  const {
    category,
    rule_key,
    label,
    hours = 0,
    subjects = 0,
    default_hours = 0,
    default_subjects = 0,
    priority = 0,
    active = true,
  } = req.body ?? {};

  if (!category || !rule_key || !label) {
    return res.status(400).json({ message: "category, rule_key y label son requeridos" });
  }

  try {
    const row = await queryOne(
      `INSERT INTO public.recommendation_rules
        (category, rule_key, label, hours, subjects,
         default_hours, default_subjects, priority, active, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, NOW())
       RETURNING *`,
      [category, rule_key, label, hours, subjects, default_hours, default_subjects, priority, active]
    );
    return res.status(201).json(row);
  } catch (err) {
    console.error("[recommendation-rules:create]", err);
    return res.status(500).json({ message: "Error creando regla" });
  }
});

/**
 * POST /api/recommendation-rules/preview-catalog-gaps
 * Evalúa reglas propuestas antes de aplicar (sin guardar).
 */
router.post("/preview-catalog-gaps", async (req: AuthRequest, res: Response) => {
  const proposed = req.body?.rules as ProposedLineamientoRule[] | undefined;
  if (!Array.isArray(proposed)) {
    return res.status(400).json({ message: "Debe enviar rules[]" });
  }

  try {
    const config = await getActiveLineamientos();
    const weeks = Number(req.body?.number_weeks) || config?.semanasSemestre || 23;

    const rulesWithMeta = await Promise.all(
      proposed.map(async (p) => {
        if (p.label && p.rule_key && p.category) return p;
        if (!p.id) return p;
        const row = await queryOne<{
          rule_key: string;
          label: string;
          category: string;
        }>(`SELECT rule_key, label, category FROM public.recommendation_rules WHERE id = $1`, [
          p.id,
        ]);
        if (!row) return p;
        return {
          ...p,
          rule_key: p.rule_key || row.rule_key,
          label: p.label || row.label,
          category: p.category || row.category,
        };
      })
    );

    const pending = await previewPendingFromProposedRules(rulesWithMeta, weeks);
    return res.json({ pending, number_weeks: weeks });
  } catch (err) {
    console.error("[recommendation-rules:preview-catalog-gaps]", err);
    return res.status(500).json({ message: "Error evaluando catálogo" });
  }
});

/**
 * POST /api/recommendation-rules/bulk-save
 * Guarda edición manual, sincroniza lineamientos activos y catálogos.
 */
router.post("/bulk-save", async (req: AuthRequest, res: Response) => {
  const items = req.body?.rules;
  const applyToSystem = req.body?.apply_to_system === true;

  if (!applyToSystem && (!Array.isArray(items) || items.length === 0)) {
    return res.status(400).json({ message: "Debe enviar al menos una regla" });
  }

  try {
    let updated = 0;
    for (const item of Array.isArray(items) ? items : []) {
      const { id, hours, subjects } = item ?? {};
      if (!id || hours === undefined || subjects === undefined) continue;

      const row = await queryOne(
        `UPDATE public.recommendation_rules
         SET hours = $1, subjects = $2, updated_at = NOW()
         WHERE id = $3
         RETURNING id`,
        [Math.round(Number(hours)), Math.round(Number(subjects)), id]
      );
      if (row) updated++;
    }

    const config = await syncActiveLineamientosFromRecommendationRules();
    const catalog = await applyCatalogsFromLineamientos(config);

    return res.json({
      message: "Lineamientos guardados y aplicados al sistema",
      updated,
      catalog,
    });
  } catch (err) {
    console.error("[recommendation-rules:bulk-save]", err);
    return res.status(500).json({ message: "Error guardando lineamientos" });
  }
});

/**
 * GET /api/recommendation-rules/pending-catalog-activities
 */
router.get("/pending-catalog-activities", async (_req: AuthRequest, res: Response) => {
  try {
    const config = await getActiveLineamientos();
    const pending = await findPendingCatalogActivities(config?.semanasSemestre ?? 23);
    return res.json({ pending, number_weeks: config?.semanasSemestre ?? 23 });
  } catch (err) {
    console.error("[recommendation-rules:pending-catalog]", err);
    return res.status(500).json({ message: "Error listando actividades pendientes" });
  }
});

/**
 * POST /api/recommendation-rules/register-catalog-activities
 * Crea actividades en el catálogo del formulario elegido por el vicerrector.
 */
router.post("/register-catalog-activities", async (req: AuthRequest, res: Response) => {
  const items = req.body?.items;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "Debe enviar al menos una actividad" });
  }

  const validTables: ActivityTable[] = [
    "investigations",
    "teacher_training",
    "administrative_activities",
    "indirect_teaching",
    "social_projects",
    "complementary_activities",
  ];

  try {
    const normalized = items
      .map((it: { table?: string; label?: string; weekly_hours?: number; number_weeks?: number }) => {
        if (!it?.table || !it?.label || !validTables.includes(it.table as ActivityTable)) {
          return null;
        }
        return {
          table: it.table as ActivityTable,
          label: String(it.label).trim(),
          weekly_hours: Math.round(Number(it.weekly_hours ?? 0)),
          number_weeks: Math.round(Number(it.number_weeks ?? 23)),
        };
      })
      .filter(Boolean) as Array<{
      table: ActivityTable;
      label: string;
      weekly_hours: number;
      number_weeks: number;
    }>;

    if (normalized.length === 0) {
      return res.status(400).json({ message: "Datos de actividades inválidos" });
    }

    const result = await registerCatalogActivities(normalized);
    const config = await getActiveLineamientos();
    const pending = await findPendingCatalogActivities(config?.semanasSemestre ?? 23);

    return res.json({ ...result, pending });
  } catch (err) {
    console.error("[recommendation-rules:register-catalog]", err);
    return res.status(500).json({ message: "Error registrando actividades" });
  }
});

/**
 * POST /api/recommendation-rules/reset
 * Restaura hours/subjects a sus valores default_* y reactiva todas.
 */
router.post("/reset", async (_req: AuthRequest, res: Response) => {
  try {
    await query(
      `UPDATE public.recommendation_rules
          SET hours = default_hours,
              subjects = default_subjects,
              active = true,
              updated_at = NOW()`
    );
    const config = await syncActiveLineamientosFromRecommendationRules();
    await applyCatalogsFromLineamientos(config);
    return res.json({ message: "Reglas restauradas" });
  } catch (err) {
    console.error("[recommendation-rules:reset]", err);
    return res.status(500).json({ message: "Error restaurando reglas" });
  }
});

/**
 * PUT /api/recommendation-rules/:id
 * Actualización parcial de campos editables.
 */
router.put("/:id", async (req: AuthRequest, res: Response) => {
  const { hours, subjects, active, label, priority } = req.body ?? {};
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (hours !== undefined) { fields.push(`hours = $${i++}`); values.push(hours); }
  if (subjects !== undefined) { fields.push(`subjects = $${i++}`); values.push(subjects); }
  if (active !== undefined) { fields.push(`active = $${i++}`); values.push(active); }
  if (label !== undefined) { fields.push(`label = $${i++}`); values.push(label); }
  if (priority !== undefined) { fields.push(`priority = $${i++}`); values.push(priority); }

  if (fields.length === 0) {
    return res.status(400).json({ message: "Sin campos para actualizar" });
  }
  fields.push(`updated_at = NOW()`);
  values.push(req.params.id);

  try {
    const row = await queryOne(
      `UPDATE public.recommendation_rules SET ${fields.join(", ")} WHERE id = $${i} RETURNING *`,
      values
    );
    if (!row) return res.status(404).json({ message: "Regla no encontrada" });
    return res.json(row);
  } catch (err) {
    console.error("[recommendation-rules:update]", err);
    return res.status(500).json({ message: "Error actualizando regla" });
  }
});

/**
 * DELETE /api/recommendation-rules/:id
 */
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    await query(`DELETE FROM public.recommendation_rules WHERE id = $1`, [req.params.id]);
    return res.json({ message: "Regla eliminada" });
  } catch (err) {
    console.error("[recommendation-rules:delete]", err);
    return res.status(500).json({ message: "Error eliminando regla" });
  }
});

export default router;
