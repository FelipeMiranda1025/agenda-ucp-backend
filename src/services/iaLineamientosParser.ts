/**
 * Interpretación de lineamientos UCP desde PDF.
 * Modelo: Google Gemini 1.5 Flash (@google/generative-ai).
 * Requiere GEMINI_API_KEY. Si falla la API, usa fallbackExtract() (regex).
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { extractTextFromPDF } from "./pdfParser";

const GEMINI_MODEL = "gemini-1.5-flash";
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// Helper: fallback extraction using regex patterns
function fallbackExtract(raw: string): LineamientosData {
  const getNumber = (regex: RegExp) => {
    const match = raw.match(regex);
    if (!match) return undefined;
    // Buscamos el grupo que contenga el número (puede ser el 1 o el 2 dependiendo del regex)
    const valStr = match[1] || match[2];
    if (!valStr) return undefined;
    const value = valStr.replace(",", ".");
    return parseFloat(value);
  };

  return {
    version: "extracción-oficial-ucp",
    // Horas semestre: acepta "920 horas" o "horas: 920"
    horasSemestre: getNumber(/(\d+(?:[.,]\d+)?)\s*horas\s*al\s*semestre/i) || getNumber(/horas.*?semestre\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i) || 920,
    // Semanas: acepta "23 semanas" o "semanas: 23"
    semanasSemestre: getNumber(/(\d+)\s*semanas/i) || getNumber(/semanas.*?semestre\s*[:=]?\s*(\d+)/i) || 23,
    
    docenciaDirecta: {
      // Sin proyecto: acepta "16 horas... sin proyecto" o "sin proyecto: 16"
      sinProyecto: getNumber(/(\d+)\s*horas.*?sin\s*proyecto/i) || getNumber(/sin\s*proyecto.*?(\d+)\s*horas/i) || 16,
      // Investigador: acepta "10 horas... investigador" o "investigador: 10"
      investigadorPrincipal: getNumber(/(\d+)\s*horas.*?investigador\s*principal/i) || getNumber(/investigador\s*principal.*?(\d+)\s*horas/i) || 10,
      coinvestigador: getNumber(/(\d+)\s*horas.*?co-investigador/i) || getNumber(/co-investigador.*?(\d+)\s*horas/i) || 13,
      directorPrograma: getNumber(/(\d+)\s*horas.*?director\s*de\s*programa/i) || getNumber(/director\s*de\s*programa.*?(\d+)\s*horas/i) || 6,
      directorPosgradoDescarga: 9,
      coordinacionAreaDescarga: 6,
      formacionDoctorado: getNumber(/(\d+)\s*horas.*?doctorado/i) || getNumber(/doctorado.*?(\d+)\s*horas/i) || 8,
      formacionMaestria: getNumber(/(\d+)\s*horas.*?maestr[íi]a/i) || getNumber(/maestr[íi]a.*?(\d+)\s*horas/i) || 12,
    },
    equivalenciasPosgrado: {
      especializacion: getNumber(/especializaci[oó]n\s+([0-9.,]+)/i) || getNumber(/([0-9.,]+)\s+especializaci[oó]n/i) || 1.5,
      maestria: getNumber(/maestr[íi]a\s+([0-9.,]+)/i) || getNumber(/([0-9.,]+)\s+maestr[íi]a/i) || 2.0,
      doctorado: getNumber(/doctorado\s+([0-9.,]+)/i) || getNumber(/([0-9.,]+)\s+doctorado/i) || 2.5,
    },
    docenciaIndirecta: {
      // Preparación: Buscamos el número pegado a la palabra (máximo 10 caracteres de distancia)
      // Esto evita que salte hasta el "6" del título del artículo.
      preparacionClasePorHora: getNumber(/preparaci[oó]n\s*(?:de\s*clase)?\s*[:=]?\s*([0-9.,]+)/i) || 0.5,
      asesoriaPorCurso: getNumber(/asesor[íi]a\s*estudiantes\s*[:=]?\s*(\d+)/i) || 1,
      asesoriaTrabajoGradoPregrado: Number((15 / 23).toFixed(2)),
      asesoriaTrabajoGradoMaestria: Number((30 / 23).toFixed(2)),
      asesoriaTrabajoGradoDoctorado: Number((45 / 23).toFixed(2)),
      // Max trabajos: acepta "50... trabajos de grado" o "trabajos de grado: 50"
      maxTrabajosGrado: getNumber(/(\d+)\s*trabajos\s*de\s*grado/i) || getNumber(/trabajos\s*de\s*grado.*?(\d+)/i) || 4,
    },
    actividadesAnexas: {
      // Art 6 Notas
      liderColectivo: getNumber(/l[íi]der\s*colectivo\s*(\d+)/i) || 4,
      participacionColectivo: getNumber(/participaci[oó]n\s*en\s*colectivo\s*(\d+)/i) || 2,
      comiteCurricular: getNumber(/comit[ée]\s*curricular\s*(\d+)/i) || 3,
      comiteBasicoFacultad: getNumber(/comit[ée]\s*b[áa]sico.*?(\d+)/i) || 2,
      liderGrupoInvestigacion: getNumber(/l[íi]der\s*grupo\s*investigaci[oó]n\s*(\d+)/i) || 4,
      liderRevista: getNumber(/l[íi]der\s*revista\s*(\d+)/i) || 2,
    },
    registroHorasSemanales: {
      sinProyecto: extractRegistroHoras(raw, /sin\s*proyecto/i),
      investigadorPrincipal: extractRegistroHoras(raw, /investigador\s*principal/i),
      coinvestigador: extractRegistroHoras(raw, /co-?investigador/i),
      directorPrograma: extractRegistroHoras(raw, /director\s*de\s*programa/i),
      directorPosgrado: extractRegistroHoras(raw, /director\s*de\s*posgrado/i),
      coordinacionArea: extractRegistroHoras(raw, /coordinaci[oó]n\s*de\s*[áa]rea/i),
      formacionDoctorado: extractRegistroHoras(raw, /formaci[oó]n\s*doctoral|doctorado/i),
      formacionMaestria: extractRegistroHoras(raw, /formaci[oó]n\s*maestr[íi]a|maestr[íi]a/i),
    },
    visualSettings: {
      form_bg_color: (raw.match(/form_bg_color\s*[:=]?\s*#*(#[0-9A-Fa-f]{6})/i) || raw.match(/form_bg_color\s*[:=]?\s*(#[0-9A-Fa-f]{6})/i) || [])[1] || "#00804E"
    }
  };
}

/** "Se registrará en el formato ... X horas semanales" */
function extractRegistroHoras(raw: string, activityPattern: RegExp): number | undefined {
  const blocks = raw.split(/\n+/);
  for (const line of blocks) {
    if (!activityPattern.test(line)) continue;
    if (!/registr/i.test(line) && !/formato/i.test(line) && !/excel/i.test(line)) continue;
    const m =
      line.match(/(\d+(?:[.,]\d+)?)\s*horas?\s*semanales?/i) ||
      line.match(/registr(?:ar)?[áa]?\s+(\d+(?:[.,]\d+)?)\s*horas?/i);
    if (m?.[1]) return parseFloat(m[1].replace(",", "."));
  }
  const global =
    raw.match(
      new RegExp(
        `registr(?:ar)?[áa]?[^\\n]{0,120}${activityPattern.source}[^\\n]{0,120}(\\d+(?:[.,]\\d+)?)\\s*horas?\\s*semanales?`,
        "i"
      )
    ) ||
    raw.match(
      new RegExp(
        `${activityPattern.source}[^\\n]{0,160}registr(?:ar)?[áa]?[^\\n]{0,80}(\\d+(?:[.,]\\d+)?)\\s*horas?`,
        "i"
      )
    );
  if (global?.[1]) return parseFloat(global[1].replace(",", "."));
  return undefined;
}

export interface LineamientosData {
  version: string;
  horasSemestre: number;
  semanasSemestre: number;
  docenciaDirecta: {
    sinProyecto: number;
    investigadorPrincipal: number;
    coinvestigador: number;
    directorPrograma: number;
    directorPosgradoDescarga: number;
    coordinacionAreaDescarga: number;
    formacionDoctorado: number;
    formacionMaestria: number;
  };
  equivalenciasPosgrado: {
    especializacion: number;
    maestria: number;
    doctorado: number;
  };
  docenciaIndirecta: {
    preparacionClasePorHora: number;
    asesoriaPorCurso: number;
    asesoriaTrabajoGradoPregrado: number;
    asesoriaTrabajoGradoMaestria: number;
    asesoriaTrabajoGradoDoctorado: number;
    maxTrabajosGrado: number;
  };
  actividadesAnexas: {
    liderColectivo: number;
    participacionColectivo: number;
    comiteCurricular: number;
    comiteBasicoFacultad: number;
    liderGrupoInvestigacion: number;
    liderRevista: number;
  };
  /** Horas a registrar en Excel ("Se registrará ... X horas semanales"). */
  registroHorasSemanales?: {
    sinProyecto?: number;
    investigadorPrincipal?: number;
    coinvestigador?: number;
    directorPrograma?: number;
    directorPosgrado?: number;
    coordinacionArea?: number;
    formacionDoctorado?: number;
    formacionMaestria?: number;
  };
  visualSettings?: {
    form_bg_color?: string;
  };
}

const PROMPT = `Eres un extractor de configuración normativa académica. Tu única tarea es leer el texto del PDF proporcionado y devolver un JSON con los valores que rigen la Agenda Docente para ese semestre específico. Los valores cambian cada semestre; NUNCA uses valores de memoria o de documentos anteriores.

Sigue estos pasos en orden estricto:

---

### PASO 1 — Encontrar el DEFECTO (valor base universal)

Busca el párrafo que contenga alguna de estas frases o su equivalente semántico:
- "no tengan aprobados proyectos de investigación"
- "docentes sin proyecto"
- "docentes que no tengan proyecto"

Extrae el número de horas semanales que aparece en esa oración. Ese número es el DEFECTO.
Ejemplo: "tendrán a cargo 18 horas semanales de docencia" → DEFECTO = 18

El DEFECTO es la base aritmética para calcular todos los demás roles. Si no lo encuentras, el JSON completo es inválido — detente y devuelve { "error": "DEFECTO_NO_ENCONTRADO" }.

---

### PASO 2 — Calcular "dd" (Docencia Directa) para cada rol

Para cada rol que aparezca en el documento, aplica EXACTAMENTE UNA de estas reglas:

REGLA A — Carga directa:
  Si el texto dice "tendrán X horas semanales de docencia directa" → dd = X

REGLA B — Descarga o disminución:
  Si el texto dice "tendrán X horas de descarga" o "disminución de X horas" → dd = DEFECTO − X

REGLA DE ACUMULACIÓN (cuando un docente ejerce el mismo rol dos o más veces):
  Si el documento indica que la descarga se puede acumular (ej. dos programas de posgrado):
  dd_x2 = DEFECTO − X − X
  Fxl_x2 = Fxl_x1 × 2
  Crea una clave separada para cada nivel de acumulación (ej. director_posgrado_x1, director_posgrado_x2).

REGLA ESPECIAL — Roles sin horas numéricas:
  Si el texto dice "solo dictará N curso(s)" sin mencionar un número de horas → dd = "Solo N curso(s)" (texto literal).

---

### PASO 3 — Extraer "Fxl" (horas a registrar en Formato Excel) para cada rol

Para cada rol, busca en el párrafo correspondiente alguna de estas frases:
- "Se registrará en el formato de Excel X horas semanales"
- "registrará X horas semanales de [actividad]"
- "formato Excel: X horas semanales"

El número X es el valor Fxl para ese rol.

Si esa frase NO aparece para un rol → Fxl = "No aplica"
Si el texto dice explícitamente que no aplica → Fxl = "No aplica"

---

### PASO 4 — Extraer parámetros generales y actividades complementarias

Busca y extrae los siguientes valores exactamente como aparecen en el documento:

Parámetros generales:
- Semanas por semestre
- Horas semanales totales por contrato
- Total horas semestrales (puede ser semanas × horas/semana)

Actividades (respeta si el valor es semanal o semestral según el texto):
- Preparación de clase: horas por cada hora programada
- Asesoría a estudiantes: horas por curso asignado
- Líder de colectivo: horas semanales
- Participación en colectivo: horas semanales
- Asesoría a práctica: horas semestrales
- Asesoría trabajo de grado pregrado: horas semestrales
- Asesoría trabajo de grado maestría: horas semestrales
- Asesoría trabajo de grado doctorado: horas semestrales
- Comité curricular: horas semanales
- Comité básico de facultad: horas semanales
- Líder grupo de investigación: horas semanales
- Líder de revista: horas semanales

---

### REGLAS DE ROBUSTEZ (aplican siempre, sin importar el semestre)

- Si un rol desaparece del PDF respecto a semestres anteriores → omite su clave del JSON.
- Si aparece un rol nuevo no contemplado en la estructura → agrégalo bajo "valores_roles" con su nombre en snake_case.
- Si un valor es ambiguo o no fue encontrado → usa el string "NO_ENCONTRADO" como valor.
- Si un número tiene coma decimal (ej. "0,5") → conviértelo a punto decimal (0.5).
- No inferas ni calcules valores que no estén explícitamente escritos en el texto del PDF.

---

### FORMATO DE SALIDA

Devuelve ÚNICAMENTE el objeto JSON. Sin markdown, sin bloques de código, sin texto explicativo antes o después. Comienza directamente con { y termina con }.

{
  "parametros_generales": {
    "semanasSemestre": 0,
    "horasContratoSemanal": 0,
    "totalHorasSemestre": 0
  },
  "defecto": 0,
  "valores_roles": {
    "defecto": { "dd": 0, "Fxl": "No aplica" },
    "investigador_principal": { "dd": 0, "Fxl": 0 },
    "co_investigador": { "dd": 0, "Fxl": 0 },
    "jefes_depto_director_programa": { "dd": "Solo N cursos", "Fxl": "No aplica" },
    "director_posgrado_x1": { "dd": 0, "Fxl": 0 },
    "director_posgrado_x2": { "dd": 0, "Fxl": 0 },
    "coordinador_area": { "dd": 0, "Fxl": 0 },
    "decano_vicerrector_director_doctorado": { "dd": "Solo N cursos", "Fxl": "No aplica" },
    "formacion_doctoral": { "dd": 0, "Fxl": 0 },
    "formacion_maestria": { "dd": 0, "Fxl": 0 },
    "formacion_pedagogica": { "dd": 0, "Fxl": 0 }
  },
  "otras_actividades": {
    "preparacion_clase": 0.0,
    "asesoria_estudiantes_por_curso": 0,
    "lider_colectivo_semanal": 0,
    "participacion_colectivo_semanal": 0,
    "asesoria_practica_semestral": 0,
    "asesoria_grado_pregrado_semestral": 0,
    "asesoria_grado_maestria_semestral": 0,
    "asesoria_grado_doctorado_semestral": 0,
    "comite_curricular_semanal": 0,
    "comite_basico_facultad_semanal": 0,
    "lider_grupo_investigacion_semanal": 0,
    "lider_revista_semanal": 0
  }
}`;
export async function interpretLineamientosWithGemini(filePath: string): Promise<LineamientosData> {
  const rawText = await extractTextFromPDF(filePath);
  console.log("=== PROCESANDO PDF CON GEMINI ===");

  if (!rawText.trim()) {
    throw new Error("El PDF no contiene texto extraíble");
  }

  try {
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: { responseMimeType: "application/json" },
    });

    const result = await model.generateContent(`${PROMPT}\n\nTexto del documento:\n${rawText}`);
    const responseText = result.response.text();
    
    const parsed = JSON.parse(responseText) as LineamientosData;
    return parsed;
  } catch (e) {
    console.warn("Fallo al procesar con Gemini, intentando extracción fallback", e);
    const fallback = fallbackExtract(rawText);
    return fallback;
  }
}