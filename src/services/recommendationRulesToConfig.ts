import { query } from "../db";
import { LineamientosData } from "./iaLineamientosParser";
import { getActiveLineamientos, saveLineamientosConfig } from "./lineamientosConfigService";
type RuleRow = {
  rule_key: string;
  hours: number;
  subjects: number;
};

function defaultConfig(): LineamientosData {
  return {
    version: "manual-edicion",
    horasSemestre: 920,
    semanasSemestre: 23,
    docenciaDirecta: {
      sinProyecto: 16,
      investigadorPrincipal: 10,
      coinvestigador: 13,
      directorPrograma: 6,
      directorPosgradoDescarga: 9,
      coordinacionAreaDescarga: 6,
      formacionDoctorado: 8,
      formacionMaestria: 12,
    },
    equivalenciasPosgrado: { especializacion: 1.5, maestria: 2, doctorado: 2.5 },
    docenciaIndirecta: {
      preparacionClasePorHora: 0.5,
      asesoriaPorCurso: 1,
      asesoriaTrabajoGradoPregrado: 0.65,
      asesoriaTrabajoGradoMaestria: 1.3,
      asesoriaTrabajoGradoDoctorado: 1.96,
      maxTrabajosGrado: 4,
    },
    actividadesAnexas: {
      liderColectivo: 4,
      participacionColectivo: 2,
      comiteCurricular: 3,
      comiteBasicoFacultad: 2,
      liderGrupoInvestigacion: 4,
      liderRevista: 2,
    },
    registroHorasSemanales: {},
  };
}

/**
 * Actualiza lineamientos_activos a partir de recommendation_rules (edición manual).
 */
export async function syncActiveLineamientosFromRecommendationRules(): Promise<LineamientosData> {
  const base = (await getActiveLineamientos()) ?? defaultConfig();
  const registro = { ...(base.registroHorasSemanales ?? {}) };

  const rows = await query<RuleRow>(
    `SELECT rule_key, hours, subjects FROM public.recommendation_rules WHERE active = true`
  );
  const byKey = new Map(rows.map((r) => [r.rule_key, r]));

  const get = (key: string) => byKey.get(key);

  const inv1p = get("inv_1p");
  if (inv1p) {
    base.docenciaDirecta.investigadorPrincipal = inv1p.hours;
    registro.investigadorPrincipal = inv1p.subjects;
  }

  const inv1c = get("inv_1c");
  if (inv1c) {
    base.docenciaDirecta.coinvestigador = inv1c.hours;
    registro.coinvestigador = inv1c.subjects;
  }

  const formDoc = get("form_doctorado");
  if (formDoc) {
    base.docenciaDirecta.formacionDoctorado = formDoc.hours;
    registro.formacionDoctorado = formDoc.subjects;
  }

  const formMaes = get("form_maestria");
  if (formMaes) {
    base.docenciaDirecta.formacionMaestria = formMaes.hours;
    registro.formacionMaestria = formMaes.subjects;
  }

  const dirPre = get("admin_dir_depto_pregrado");
  if (dirPre) {
    base.docenciaDirecta.directorPrograma = dirPre.hours;
    registro.directorPrograma = dirPre.subjects;
  }

  const dirPos1 = get("admin_dir_posgrado_1");
  if (dirPos1) {
    base.docenciaDirecta.directorPosgradoDescarga = dirPos1.subjects;
    registro.directorPosgrado = dirPos1.subjects;
  }

  const coord = get("admin_coord_area");
  if (coord) {
    base.docenciaDirecta.coordinacionAreaDescarga = coord.subjects;
    registro.coordinacionArea = coord.subjects;
  }

  const sinProy = get("docencia_sin_proyecto");
  if (sinProy) {
    base.docenciaDirecta.sinProyecto = sinProy.hours;
    registro.sinProyecto = sinProy.subjects;
  }

  base.registroHorasSemanales = registro;
  base.version = base.version || "manual-edicion";

  await saveLineamientosConfig(base);
  return base;
}
