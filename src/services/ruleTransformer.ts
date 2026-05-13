// src/services/ruleTransformer.ts
import { LineamientosData } from "./iaLineamientosParser";

export interface ExtractedRule {
  label: string;
  hours: number | null;
  subjects: number | null;
  source_article: string;
  category: "docencia" | "investigacion" | "administrativas" | "formacion" | "visual";
}

export function transformToExtractedRules(config: LineamientosData): ExtractedRule[] {
  const rules: ExtractedRule[] = [];

  // Docencia directa
  rules.push({
    label: "Docencia sin proyecto de investigación",
    hours: config.docenciaDirecta.sinProyecto,
    subjects: Math.floor(config.docenciaDirecta.sinProyecto / 3),
    source_article: "Art. 6.d",
    category: "docencia",
  });
  rules.push({
    label: "Investigador principal (con proyecto aprobado)",
    hours: config.docenciaDirecta.investigadorPrincipal,
    subjects: Math.floor(config.docenciaDirecta.investigadorPrincipal / 3),
    source_article: "Art. 6.a",
    category: "investigacion",
  });
  rules.push({
    label: "Co-investigador",
    hours: config.docenciaDirecta.coinvestigador,
    subjects: Math.floor(config.docenciaDirecta.coinvestigador / 3),
    source_article: "Art. 6.b",
    category: "investigacion",
  });
  rules.push({
    label: "Director de programa (pregrado)",
    hours: config.docenciaDirecta.directorPrograma,
    subjects: Math.floor(config.docenciaDirecta.directorPrograma / 3),
    source_article: "Art. 6.e",
    category: "administrativas",
  });
  rules.push({
    label: "Director de posgrado (reducción horaria)",
    hours: config.docenciaDirecta.directorPosgradoDescarga,
    subjects: null,
    source_article: "Art. 6.f",
    category: "administrativas",
  });
  rules.push({
    label: "Coordinación de área (reducción hasta)",
    hours: config.docenciaDirecta.coordinacionAreaDescarga,
    subjects: null,
    source_article: "Art. 6.g",
    category: "administrativas",
  });
  rules.push({
    label: "Docente en formación doctoral",
    hours: config.docenciaDirecta.formacionDoctorado,
    subjects: Math.floor(config.docenciaDirecta.formacionDoctorado / 3),
    source_article: "Art. 6.i",
    category: "formacion",
  });
  rules.push({
    label: "Docente en formación maestría",
    hours: config.docenciaDirecta.formacionMaestria,
    subjects: Math.floor(config.docenciaDirecta.formacionMaestria / 3),
    source_article: "Art. 6.j",
    category: "formacion",
  });

  // Equivalencias posgrado
  rules.push({
    label: "Equivalencia especialización (factor sobre hora pregrado)",
    hours: config.equivalenciasPosgrado.especializacion,
    subjects: null,
    source_article: "Tabla de equivalencias",
    category: "docencia",
  });
  rules.push({
    label: "Equivalencia maestría (factor)",
    hours: config.equivalenciasPosgrado.maestria,
    subjects: null,
    source_article: "Tabla de equivalencias",
    category: "docencia",
  });
  rules.push({
    label: "Equivalencia doctorado (factor)",
    hours: config.equivalenciasPosgrado.doctorado,
    subjects: null,
    source_article: "Tabla de equivalencias",
    category: "docencia",
  });

  // Docencia indirecta
  rules.push({
    label: "Preparación de clase (horas por cada hora programada)",
    hours: config.docenciaIndirecta.preparacionClasePorHora,
    subjects: null,
    source_article: "Art. 6",
    category: "docencia",
  });
  rules.push({
    label: "Asesoría a estudiantes (horas por curso asignado)",
    hours: config.docenciaIndirecta.asesoriaPorCurso,
    subjects: null,
    source_article: "Art. 6",
    category: "docencia",
  });
  rules.push({
    label: "Asesoría trabajo de grado - Pregrado",
    hours: config.docenciaIndirecta.asesoriaTrabajoGradoPregrado,
    subjects: null,
    source_article: "Art. 6.o",
    category: "docencia",
  });
  rules.push({
    label: "Asesoría trabajo de grado - Maestría",
    hours: config.docenciaIndirecta.asesoriaTrabajoGradoMaestria,
    subjects: null,
    source_article: "Art. 6.o",
    category: "docencia",
  });
  rules.push({
    label: "Asesoría trabajo de grado - Doctorado",
    hours: config.docenciaIndirecta.asesoriaTrabajoGradoDoctorado,
    subjects: null,
    source_article: "Art. 6.o",
    category: "docencia",
  });

  // Actividades anexas
  rules.push({
    label: "Líder de colectivo",
    hours: config.actividadesAnexas.liderColectivo,
    subjects: null,
    source_article: "Art. 6 (Notas)",
    category: "administrativas",
  });
  rules.push({
    label: "Participación en colectivo",
    hours: config.actividadesAnexas.participacionColectivo,
    subjects: null,
    source_article: "Art. 6 (Notas)",
    category: "administrativas",
  });
  rules.push({
    label: "Comité curricular",
    hours: config.actividadesAnexas.comiteCurricular,
    subjects: null,
    source_article: "Art. 6 (Notas)",
    category: "administrativas",
  });
  rules.push({
    label: "Comité básico de facultad",
    hours: config.actividadesAnexas.comiteBasicoFacultad,
    subjects: null,
    source_article: "Art. 6 (Notas)",
    category: "administrativas",
  });
  rules.push({
    label: "Líder de grupo de investigación",
    hours: config.actividadesAnexas.liderGrupoInvestigacion,
    subjects: null,
    source_article: "Art. 6 (Notas)",
    category: "investigacion",
  });
  rules.push({
    label: "Líder de revista",
    hours: config.actividadesAnexas.liderRevista,
    subjects: null,
    source_article: "Art. 6 (Notas)",
    category: "investigacion",
  });

  return rules;
}