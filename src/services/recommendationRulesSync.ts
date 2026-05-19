import { query } from "../db";
import { LineamientosData } from "./iaLineamientosParser";
import {
  ruleValuePairForStandardKey,
  ruleValuePairFromExtracted,
  STANDARD_RULE_VALUES,
} from "./lineamientosRuleValues";
import { ExtractedRule, transformToExtractedRules } from "./ruleTransformer";

type RuleCategory = "investigacion" | "administrativas" | "formacion";

const STANDARD_RULES: Array<{
  category: RuleCategory;
  rule_key: string;
  label: string;
  priority: number;
}> = [
  { category: "formacion", rule_key: "form_doctorado", label: "Estudios doctorado", priority: 100 },
  { category: "formacion", rule_key: "form_maestria", label: "Estudios maestría", priority: 90 },
  { category: "formacion", rule_key: "form_pedagogicos", label: "Estudios Pedagógicos", priority: 80 },
  { category: "administrativas", rule_key: "admin_decano_vicerrector_doctorado", label: "Decano / Vicerrector / Director doctorado", priority: 70 },
  { category: "administrativas", rule_key: "admin_dir_depto_pregrado", label: "Director departamento o pregrado", priority: 60 },
  { category: "administrativas", rule_key: "admin_dir_posgrado_2", label: "Director programa posgrado (2 o más)", priority: 55 },
  { category: "administrativas", rule_key: "admin_dir_posgrado_1", label: "Director programa posgrado (1)", priority: 50 },
  { category: "administrativas", rule_key: "admin_coord_area", label: "Coordinador de área", priority: 45 },
  { category: "investigacion", rule_key: "inv_1p_2c", label: "1 Investigador principal + 2 Co-investigadores", priority: 40 },
  { category: "investigacion", rule_key: "inv_2p", label: "2 Investigadores principales", priority: 35 },
  { category: "investigacion", rule_key: "inv_1p", label: "1 Investigador principal", priority: 30 },
  { category: "investigacion", rule_key: "inv_3c", label: "3 Co-investigadores", priority: 25 },
  { category: "investigacion", rule_key: "inv_2c", label: "2 Co-investigadores", priority: 20 },
  { category: "investigacion", rule_key: "inv_1c", label: "1 Co-investigador", priority: 15 },
];

const EXTRACTED_TO_STANDARD: Record<string, string> = {
  formacion_doctorado: "form_doctorado",
  formacion_maestria: "form_maestria",
  investigador_principal: "inv_1p",
  coinvestigador: "inv_1c",
  director_programa: "admin_dir_depto_pregrado",
  director_posgrado_descarga: "admin_dir_posgrado_1",
  coordinacion_area_descarga: "admin_coord_area",
  docencia_directa_sin_proyecto: "docencia_sin_proyecto",
};

function normalizeCategory(cat: ExtractedRule["category"]): RuleCategory | null {
  if (cat === "investigacion" || cat === "administrativas" || cat === "formacion") return cat;
  if (cat === "docencia") return "formacion";
  return null;
}

async function upsertRecommendationRule(input: {
  category: RuleCategory;
  rule_key: string;
  label: string;
  hours: number;
  subjects: number;
  priority: number;
  touchDefaults?: boolean;
}): Promise<void> {
  const h = Math.round(input.hours);
  const s = Math.round(input.subjects);
  if (input.touchDefaults) {
    await query(
      `INSERT INTO public.recommendation_rules
        (category, rule_key, label, hours, subjects, default_hours, default_subjects, priority, active, updated_at)
       VALUES ($1, $2, $3, $4, $5, $4, $5, $6, true, NOW())
       ON CONFLICT (category, rule_key) DO UPDATE SET
         label = EXCLUDED.label,
         hours = EXCLUDED.hours,
         subjects = EXCLUDED.subjects,
         default_hours = EXCLUDED.default_hours,
         default_subjects = EXCLUDED.default_subjects,
         priority = EXCLUDED.priority,
         updated_at = NOW()`,
      [input.category, input.rule_key, input.label, h, s, input.priority]
    );
  } else {
    await query(
      `INSERT INTO public.recommendation_rules
        (category, rule_key, label, hours, subjects, default_hours, default_subjects, priority, active, updated_at)
       VALUES ($1, $2, $3, $4, $5, $4, $5, $6, true, NOW())
       ON CONFLICT (category, rule_key) DO UPDATE SET
         label = EXCLUDED.label,
         hours = EXCLUDED.hours,
         subjects = EXCLUDED.subjects,
         updated_at = NOW()`,
      [input.category, input.rule_key, input.label, h, s, input.priority]
    );
  }
}

export async function ensureStandardRecommendationRules(): Promise<void> {
  for (const r of STANDARD_RULES) {
    const pair = STANDARD_RULE_VALUES[r.rule_key];
    await upsertRecommendationRule({
      category: r.category,
      rule_key: r.rule_key,
      label: r.label,
      hours: pair?.docenciaDirecta ?? 0,
      subjects: pair?.horasSemanales ?? 0,
      priority: r.priority,
      touchDefaults: true,
    });
  }
}

export async function syncExtractedRulesToRecommendationRules(
  rules: ExtractedRule[],
  config?: LineamientosData
): Promise<number> {
  await ensureStandardRecommendationRules();
  let count = 0;

  for (const rule of rules) {
    const category = normalizeCategory(rule.category);
    if (!category || rule.category === "visual") continue;
    if (rule.hours == null && rule.subjects == null) continue;

    const ruleKey = EXTRACTED_TO_STANDARD[rule.rule_key] ?? rule.rule_key;
    const pair =
      config != null
        ? ruleValuePairFromExtracted(rule.rule_key, rule.hours, rule.subjects, config)
        : {
            docenciaDirecta: rule.hours ?? 0,
            horasSemanales: rule.subjects ?? 0,
          };

    const std = STANDARD_RULES.find((r) => r.rule_key === ruleKey);
    const priority = std?.priority ?? 5;

    await upsertRecommendationRule({
      category,
      rule_key: ruleKey,
      label: rule.label,
      hours: pair.docenciaDirecta,
      subjects: pair.horasSemanales,
      priority,
    });
    count++;
  }

  return count;
}

export async function syncRecommendationRulesFromLineamientos(
  config: LineamientosData
): Promise<void> {
  await ensureStandardRecommendationRules();

  for (const r of STANDARD_RULES) {
    const pair = ruleValuePairForStandardKey(r.rule_key, config);
    await upsertRecommendationRule({
      category: r.category,
      rule_key: r.rule_key,
      label: r.label,
      hours: pair.docenciaDirecta,
      subjects: pair.horasSemanales,
      priority: r.priority,
    });
  }

  const extracted = transformToExtractedRules(config);
  await syncExtractedRulesToRecommendationRules(extracted, config);
}
