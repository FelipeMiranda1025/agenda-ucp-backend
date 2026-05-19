import { LineamientosData } from "./iaLineamientosParser";
import { syncRecommendationRulesFromLineamientos } from "./recommendationRulesSync";
import {
  syncCatalogActivitiesFromRecommendationRules,
  syncCatalogsFromLineamientosConfig,
} from "./catalogActivitiesSync";
import { getActiveLineamientos } from "./lineamientosConfigService";

/**
 * Propaga lineamientos a recommendation_rules y tablas de actividades (catálogos).
 */
export async function applyLineamientosToSystem(config: LineamientosData): Promise<void> {
  console.log("Aplicando lineamientos a las tablas del sistema...");

  await syncRecommendationRulesFromLineamientos(config);
  await syncCatalogsFromLineamientosConfig(config);
  await syncCatalogActivitiesFromRecommendationRules(config.semanasSemestre);

  console.log("Lineamientos aplicados (reglas + catálogos de actividades).");
}

/**
 * Tras edición manual: sincroniza catálogos desde reglas guardadas.
 */
export async function applyCatalogsFromLineamientos(
  _config?: LineamientosData
): Promise<{ updated: number; inserted: number }> {
  const config = _config ?? (await getActiveLineamientos());
  const weeks = config?.semanasSemestre ?? 23;

  if (config) {
    await syncCatalogsFromLineamientosConfig(config);
  }
  return syncCatalogActivitiesFromRecommendationRules(weeks);
}
