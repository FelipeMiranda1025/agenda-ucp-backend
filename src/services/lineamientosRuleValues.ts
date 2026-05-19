import { LineamientosData } from "./iaLineamientosParser";

/** Horas base de docencia directa sin descargas (Art. 6). */
export const BASE_DOCENCIA_DIRECTA = 16;

export interface RuleValuePair {
  docenciaDirecta: number;
  horasSemanales: number;
}

/** Valores institucionales por defecto (docencia directa + horas a registrar). */
export const STANDARD_RULE_VALUES: Record<string, RuleValuePair> = {
  form_doctorado: { docenciaDirecta: 8, horasSemanales: 15 },
  form_maestria: { docenciaDirecta: 12, horasSemanales: 7 },
  form_pedagogicos: { docenciaDirecta: 13, horasSemanales: 13 },
  admin_decano_vicerrector_doctorado: { docenciaDirecta: 4, horasSemanales: 4 },
  admin_dir_depto_pregrado: { docenciaDirecta: 6, horasSemanales: 6 },
  admin_dir_posgrado_2: { docenciaDirecta: 6, horasSemanales: 6 },
  admin_dir_posgrado_1: { docenciaDirecta: 7, horasSemanales: 9 },
  admin_coord_area: { docenciaDirecta: 13, horasSemanales: 6 },
  inv_1p_2c: { docenciaDirecta: 6, horasSemanales: 17 },
  inv_2p: { docenciaDirecta: 4, horasSemanales: 22 },
  inv_1p: { docenciaDirecta: 10, horasSemanales: 11 },
  inv_3c: { docenciaDirecta: 6, horasSemanales: 12 },
  inv_2c: { docenciaDirecta: 9, horasSemanales: 12 },
  inv_1c: { docenciaDirecta: 13, horasSemanales: 6 },
  docencia_sin_proyecto: { docenciaDirecta: 16, horasSemanales: 16 },
};

const DESCARGA_CONFIG_KEYS = new Set([
  "directorPosgradoDescarga",
  "coordinacionAreaDescarga",
]);

function registro(
  config: LineamientosData,
  key: keyof NonNullable<LineamientosData["registroHorasSemanales"]>,
  fallback: number
): number {
  const v = config.registroHorasSemanales?.[key];
  return v != null && v > 0 ? v : fallback;
}

function docenciaFromDescarga(descarga: number): number {
  return Math.max(0, BASE_DOCENCIA_DIRECTA - (descarga || 0));
}

/**
 * Calcula el par (⌛ Docencia directa, ✍🏼 Horas semanales) para una regla estándar.
 */
export function ruleValuePairForStandardKey(
  ruleKey: string,
  config: LineamientosData
): RuleValuePair {
  const dd = config.docenciaDirecta;
  const defaults = STANDARD_RULE_VALUES[ruleKey] ?? {
    docenciaDirecta: BASE_DOCENCIA_DIRECTA,
    horasSemanales: BASE_DOCENCIA_DIRECTA,
  };

  switch (ruleKey) {
    case "form_doctorado":
      return {
        docenciaDirecta: dd.formacionDoctorado || defaults.docenciaDirecta,
        horasSemanales: registro(config, "formacionDoctorado", defaults.horasSemanales),
      };
    case "form_maestria":
      return {
        docenciaDirecta: dd.formacionMaestria || defaults.docenciaDirecta,
        horasSemanales: registro(config, "formacionMaestria", defaults.horasSemanales),
      };
    case "form_pedagogicos":
      return defaults;
    case "admin_dir_depto_pregrado":
      return {
        docenciaDirecta: dd.directorPrograma || defaults.docenciaDirecta,
        horasSemanales: registro(config, "directorPrograma", defaults.horasSemanales),
      };
    case "admin_dir_posgrado_1":
      return {
        docenciaDirecta:
          dd.directorPosgradoDescarga > 0
            ? docenciaFromDescarga(dd.directorPosgradoDescarga)
            : defaults.docenciaDirecta,
        horasSemanales: registro(
          config,
          "directorPosgrado",
          dd.directorPosgradoDescarga || defaults.horasSemanales
        ),
      };
    case "admin_dir_posgrado_2":
      return {
        docenciaDirecta: dd.directorPrograma || defaults.docenciaDirecta,
        horasSemanales: registro(config, "directorPosgrado", defaults.horasSemanales),
      };
    case "admin_coord_area":
      return {
        docenciaDirecta: defaults.docenciaDirecta,
        horasSemanales: registro(
          config,
          "coordinacionArea",
          dd.coordinacionAreaDescarga || defaults.horasSemanales
        ),
      };
    case "admin_decano_vicerrector_doctorado":
      return defaults;
    case "inv_1p":
      return {
        docenciaDirecta: dd.investigadorPrincipal || defaults.docenciaDirecta,
        horasSemanales: registro(config, "investigadorPrincipal", defaults.horasSemanales),
      };
    case "inv_1c":
      return {
        docenciaDirecta: dd.coinvestigador || defaults.docenciaDirecta,
        horasSemanales: registro(config, "coinvestigador", defaults.horasSemanales),
      };
    case "inv_1p_2c":
    case "inv_2p":
    case "inv_3c":
    case "inv_2c":
      return defaults;
    case "docencia_sin_proyecto":
      return {
        docenciaDirecta: dd.sinProyecto || defaults.docenciaDirecta,
        horasSemanales: registro(config, "sinProyecto", defaults.horasSemanales),
      };
    default:
      return defaults;
  }
}

/** Par para reglas extraídas del PDF (por rule_key del transformer). */
export function ruleValuePairFromExtracted(
  ruleKey: string,
  rawHours: number | null,
  rawSubjects: number | null,
  config: LineamientosData
): RuleValuePair {
  const stdKey = EXTRACTED_TO_STANDARD_KEY[ruleKey] ?? ruleKey;
  if (STANDARD_RULE_VALUES[stdKey]) {
    const fromConfig = ruleValuePairForStandardKey(stdKey, config);
    return {
      docenciaDirecta: rawHours != null ? resolveDocenciaDirecta(ruleKey, rawHours, config) : fromConfig.docenciaDirecta,
      horasSemanales:
        rawSubjects != null && rawSubjects > 0 ? rawSubjects : fromConfig.horasSemanales,
    };
  }

  const hours = rawHours ?? 0;
  return {
    docenciaDirecta: resolveDocenciaDirecta(ruleKey, hours, config),
    horasSemanales: rawSubjects != null && rawSubjects > 0 ? rawSubjects : hours,
  };
}

const EXTRACTED_TO_STANDARD_KEY: Record<string, string> = {
  formacion_doctorado: "form_doctorado",
  formacion_maestria: "form_maestria",
  investigador_principal: "inv_1p",
  coinvestigador: "inv_1c",
  director_programa: "admin_dir_depto_pregrado",
  director_posgrado_descarga: "admin_dir_posgrado_1",
  coordinacion_area_descarga: "admin_coord_area",
  docencia_directa_sin_proyecto: "docencia_sin_proyecto",
};

function resolveDocenciaDirecta(
  ruleKey: string,
  rawHours: number,
  config: LineamientosData
): number {
  if (ruleKey === "director_posgrado_descarga") {
    return docenciaFromDescarga(config.docenciaDirecta.directorPosgradoDescarga || rawHours);
  }
  if (ruleKey === "coordinacion_area_descarga") {
    return docenciaFromDescarga(config.docenciaDirecta.coordinacionAreaDescarga || rawHours);
  }
  if (DESCARGA_CONFIG_KEYS.has(ruleKey)) {
    return docenciaFromDescarga(rawHours);
  }
  return rawHours;
}

export function isDescargaExtractedRule(ruleKey: string): boolean {
  return (
    ruleKey === "director_posgrado_descarga" ||
    ruleKey === "coordinacion_area_descarga"
  );
}
