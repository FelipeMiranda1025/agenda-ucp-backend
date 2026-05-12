export interface ExtractedRule {
  type: "horas" | "recomendacion" | "color" | "visual";
  key: string;
  value: string | number;
  description: string;
}

export function extractRulesFromText(text: string): ExtractedRule[] {
  const rules: ExtractedRule[] = [];

  const horasSemestre = text.match(/(\d{3,4})\s*horas?\s*(totales|al semestre)/i);
  if (horasSemestre) rules.push({ type: "horas", key: "horas_semestre", value: parseInt(horasSemestre[1]), description: `Horas totales: ${horasSemestre[1]}h` });

  const semanas = text.match(/(\d{1,2})\s*semanas/i);
  if (semanas) rules.push({ type: "horas", key: "semanas", value: parseInt(semanas[1]), description: `Semanas: ${semanas[1]}` });

  const docencia = text.match(/(\d{1,2})\s*horas\s*semanales\s*de\s*docencia\s*directa/i);
  if (docencia) rules.push({ type: "recomendacion", key: "docencia_directa_default", value: parseInt(docencia[1]), description: `Docencia directa: ${docencia[1]}h` });

  const trabajos = text.match(/hasta\s+(\d{1,2})\s+trabajos?\s+de\s+grado/i);
  if (trabajos) rules.push({ type: "recomendacion", key: "max_trabajos_grado", value: parseInt(trabajos[1]), description: `Max trabajos: ${trabajos[1]}` });

  const color = text.match(/COLOR_FORMULARIO\s*[:=]\s*(#[0-9A-Fa-f]{6,7})/i);
  if (color) rules.push({ type: "color", key: "color_header_formulario", value: color[1], description: `Color formulario: ${color[1]}` });

  const bgColor = text.match(/form_bg_color\s*[:=]\s*(#[0-9A-Fa-f]{6,7})/i);
  if (bgColor) rules.push({ type: "color", key: "color_header_formulario", value: bgColor[1], description: `Color formulario: ${bgColor[1]}` });

  // Detectar rgb() o rgba()
const rgbColor = text.match(/form_bg_color\s*[:=]\s*rgba?\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
if (rgbColor) {
  const hex = "#" + [rgbColor[1], rgbColor[2], rgbColor[3]]
    .map(x => parseInt(x).toString(16).padStart(2, "0"))
    .join("");
  rules.push({ type: "color", key: "color_header_formulario", value: hex, description: `Color formulario: ${hex}` });
}
  
  
  return rules;
}