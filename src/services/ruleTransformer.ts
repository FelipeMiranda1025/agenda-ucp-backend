import { LineamientosData } from "./iaLineamientosParser";
import { ruleValuePairFromExtracted } from "./lineamientosRuleValues";

export interface ExtractedRule {
  rule_key: string;
  label: string;
  hours: number | null;
  subjects: number | null;
  value?: any;
  source_article: string;
  category: "docencia" | "investigacion" | "administrativas" | "formacion" | "visual";
  is_default?: boolean; 
}

function pushRulePair(
  rules: ExtractedRule[],
  config: LineamientosData,
  input: {
    rule_key: string;
    label: string;
    category: ExtractedRule["category"];
    source_article: string;
    rawHours: number | null;
    rawSubjects?: number | null;
    is_default?: boolean;
  }
): void {
  const pair = ruleValuePairFromExtracted(
    input.rule_key,
    input.rawHours,
    input.rawSubjects ?? null,
    config
  );
  rules.push({
    rule_key: input.rule_key,
    label: input.label,
    hours: pair.docenciaDirecta,
    subjects: pair.horasSemanales,
    source_article: input.source_article,
    category: input.category,
    is_default: input.is_default,
  });
}

export function transformToExtractedRules(config: LineamientosData): ExtractedRule[] {
  const rules: ExtractedRule[] = [];

  const isDef = (val: any, def: any) => {
    if (typeof val === 'number' && typeof def === 'number') {
      return Math.abs(val - def) < 0.01;
    }
    return val === def;
  };

  // 1. Configuración General
  rules.push({
    rule_key: "horas_semestre",
    label: "Horas totales al semestre",
    hours: config.horasSemestre,
    subjects: null,
    source_article: "General",
    category: "formacion",
    is_default: isDef(config.horasSemestre, 920)
  });

  rules.push({
    rule_key: "semanas_semestre",
    label: "Semanas por semestre",
    hours: config.semanasSemestre,
    subjects: null,
    source_article: "General",
    category: "formacion",
    is_default: isDef(config.semanasSemestre, 23)
  });

  rules.push({
    rule_key: "max_trabajos_grado",
    label: "Máximo de trabajos de grado (Semestre)",
    hours: config.docenciaIndirecta.maxTrabajosGrado,
    subjects: null,
    source_article: "Art. 6.o",
    category: "formacion",
    is_default: isDef(config.docenciaIndirecta.maxTrabajosGrado, 4)
  });

  // 2. Docencia directa y roles (hours = ⌛ docencia directa, subjects = ✍🏼 horas semanales registro)
  pushRulePair(rules, config, {
    rule_key: "docencia_directa_sin_proyecto",
    label: "Docencia sin proyecto de investigación",
    rawHours: config.docenciaDirecta.sinProyecto,
    source_article: "Art. 6.d",
    category: "formacion",
    is_default: isDef(config.docenciaDirecta.sinProyecto, 16),
  });

  pushRulePair(rules, config, {
    rule_key: "investigador_principal",
    label: "Investigador principal (con proyecto aprobado)",
    rawHours: config.docenciaDirecta.investigadorPrincipal,
    source_article: "Art. 6.a",
    category: "investigacion",
    is_default: isDef(config.docenciaDirecta.investigadorPrincipal, 10),
  });

  pushRulePair(rules, config, {
    rule_key: "coinvestigador",
    label: "Co-investigador",
    rawHours: config.docenciaDirecta.coinvestigador,
    source_article: "Art. 6.b",
    category: "investigacion",
    is_default: isDef(config.docenciaDirecta.coinvestigador, 13),
  });

  pushRulePair(rules, config, {
    rule_key: "director_programa",
    label: "Director de programa (pregrado)",
    rawHours: config.docenciaDirecta.directorPrograma,
    source_article: "Art. 6.e",
    category: "administrativas",
    is_default: isDef(config.docenciaDirecta.directorPrograma, 6),
  });

  pushRulePair(rules, config, {
    rule_key: "director_posgrado_descarga",
    label: "Director de posgrado (reducción horaria)",
    rawHours: config.docenciaDirecta.directorPosgradoDescarga,
    source_article: "Art. 6.f",
    category: "administrativas",
    is_default: isDef(config.docenciaDirecta.directorPosgradoDescarga, 9),
  });

  pushRulePair(rules, config, {
    rule_key: "coordinacion_area_descarga",
    label: "Coordinación de área (reducción hasta)",
    rawHours: config.docenciaDirecta.coordinacionAreaDescarga,
    source_article: "Art. 6.g",
    category: "administrativas",
    is_default: isDef(config.docenciaDirecta.coordinacionAreaDescarga, 6),
  });

  pushRulePair(rules, config, {
    rule_key: "formacion_doctorado",
    label: "Docente en formación doctoral",
    rawHours: config.docenciaDirecta.formacionDoctorado,
    source_article: "Art. 6.i",
    category: "formacion",
    is_default: isDef(config.docenciaDirecta.formacionDoctorado, 8),
  });

  pushRulePair(rules, config, {
    rule_key: "formacion_maestria",
    label: "Docente en formación maestría",
    rawHours: config.docenciaDirecta.formacionMaestria,
    source_article: "Art. 6.j",
    category: "formacion",
    is_default: isDef(config.docenciaDirecta.formacionMaestria, 12),
  });

  // 4. Factores de Docencia Indirecta
  rules.push({
    rule_key: "preparacion_clase",
    label: "Preparación de clase (factor)",
    hours: config.docenciaIndirecta.preparacionClasePorHora,
    subjects: null,
    source_article: "Art. 6",
    category: "formacion",
    is_default: isDef(config.docenciaIndirecta.preparacionClasePorHora, 0.5)
  });

  rules.push({
    rule_key: "asesoria_estudiantes",
    label: "Asesoría a estudiantes (por curso)",
    hours: config.docenciaIndirecta.asesoriaPorCurso,
    subjects: null,
    source_article: "Art. 6",
    category: "formacion",
    is_default: isDef(config.docenciaIndirecta.asesoriaPorCurso, 1)
  });

  rules.push({
    rule_key: "asesoria_trabajo_grado_pregrado",
    label: "Asesoría trabajo grado (Pregrado)",
    hours: config.docenciaIndirecta.asesoriaTrabajoGradoPregrado,
    subjects: null,
    source_article: "Art. 6.o",
    category: "formacion",
    is_default: isDef(config.docenciaIndirecta.asesoriaTrabajoGradoPregrado, 0.65)
  });

  rules.push({
    rule_key: "asesoria_trabajo_grado_maestria",
    label: "Asesoría trabajo grado (Maestría)",
    hours: config.docenciaIndirecta.asesoriaTrabajoGradoMaestria,
    subjects: null,
    source_article: "Art. 6.o",
    category: "formacion",
    is_default: isDef(config.docenciaIndirecta.asesoriaTrabajoGradoMaestria, 1.30)
  });

  rules.push({
    rule_key: "asesoria_trabajo_grado_doctorado",
    label: "Asesoría trabajo grado (Doctorado)",
    hours: config.docenciaIndirecta.asesoriaTrabajoGradoDoctorado,
    subjects: null,
    source_article: "Art. 6.o",
    category: "formacion",
    is_default: isDef(config.docenciaIndirecta.asesoriaTrabajoGradoDoctorado, 1.96)
  });

  // 5. Equivalencias Posgrado
  rules.push({
    rule_key: "equivalencia_especializacion",
    label: "Equivalencia especialización (factor)",
    hours: config.equivalenciasPosgrado.especializacion,
    subjects: null,
    source_article: "Tabla",
    category: "formacion",
    is_default: isDef(config.equivalenciasPosgrado.especializacion, 1.5)
  });

  rules.push({
    rule_key: "equivalencia_maestria",
    label: "Equivalencia maestría (factor)",
    hours: config.equivalenciasPosgrado.maestria,
    subjects: null,
    source_article: "Tabla",
    category: "formacion",
    is_default: isDef(config.equivalenciasPosgrado.maestria, 2.0)
  });

  rules.push({
    rule_key: "equivalencia_doctorado",
    label: "Equivalencia doctorado (factor)",
    hours: config.equivalenciasPosgrado.doctorado,
    subjects: null,
    source_article: "Tabla",
    category: "formacion",
    is_default: isDef(config.equivalenciasPosgrado.doctorado, 2.5)
  });

  // 6. Actividades Anexas
  const anexas = [
    { key: "lider_colectivo", label: "Líder de colectivo", val: config.actividadesAnexas.liderColectivo, def: 4, cat: "administrativas" },
    { key: "participacion_colectivo", label: "Participación en colectivo", val: config.actividadesAnexas.participacionColectivo, def: 2, cat: "administrativas" },
    { key: "comite_curricular", label: "Comité curricular", val: config.actividadesAnexas.comiteCurricular, def: 3, cat: "administrativas" },
    { key: "comite_basico_facultad", label: "Comité básico de facultad", val: config.actividadesAnexas.comiteBasicoFacultad, def: 2, cat: "administrativas" },
    { key: "lider_grupo_investigacion", label: "Líder de grupo de investigación", val: config.actividadesAnexas.liderGrupoInvestigacion, def: 4, cat: "investigacion" },
    { key: "lider_revista", label: "Líder de revista", val: config.actividadesAnexas.liderRevista, def: 2, cat: "investigacion" }
  ];

  anexas.forEach(a => {
    rules.push({
      rule_key: a.key,
      label: a.label,
      hours: a.val,
      subjects: a.val,
      source_article: "Art. 6 (Notas)",
      category: a.cat as ExtractedRule["category"],
      is_default: isDef(a.val, a.def),
    });
  });

  // 7. Visual
  if (config.visualSettings?.form_bg_color) {
    rules.push({
      rule_key: "form_bg_color",
      label: "Color de fondo del formulario (Marca)",
      hours: null,
      subjects: null,
      value: config.visualSettings.form_bg_color,
      source_article: "Identidad Visual",
      category: "visual",
      is_default: isDef(config.visualSettings.form_bg_color, "#00804E")
    });
  }

  return rules;
}