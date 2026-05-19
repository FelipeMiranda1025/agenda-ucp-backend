import { GoogleGenerativeAI } from "@google/generative-ai";
import { extractTextFromPDF } from "./pdfParser";

// Initialize Gemini client
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

const PROMPT = `
Eres un asistente experto en interpretar documentos normativos universitarios.
Recibirás el texto de un documento que contiene lineamientos sobre horas de trabajo académico.
**Tu tarea es extraer ÚNICAMENTE los valores numéricos que aparezcan EXPLÍCITAMENTE en el texto.**
NO uses valores por defecto. Si un concepto no aparece en el texto, asigna 0.

Busca en el texto patrones como:
- "Total horas al semestre: X horas" → horasSemestre = X
- "Semanas por semestre: X semanas" → semanasSemestre = X
- "docencia directa máxima: X horas" → sinProyecto = X
- "tendrán a cargo X horas semanales de docencia" (por rol) → docenciaDirecta.*
- "Se registrará en el formato (de Excel) X horas semanales" → registroHorasSemanales.*
- "investigador principal ... a cargo X horas" → investigadorPrincipal = X
- "co-investigador ... a cargo X horas" → coinvestigador = X
- "director de programa ... a cargo X horas" → directorPrograma = X
- "director de posgrado: X horas de descarga/reducción" → directorPosgradoDescarga = X
- "coordinación de área: X horas de descarga" → coordinacionAreaDescarga = X
- "docentes en formación de doctorado: X horas" → formacionDoctorado = X
- "docentes en formación de maestría: X horas" → formacionMaestria = X
- "preparación de clase: X horas" → preparacionClasePorHora = X
- "asesoría estudiantes: X hora por curso" → asesoriaPorCurso = X
- "máximo de trabajos de grado: X por semestre" → maxTrabajosGrado = X
- "valor asesoría pregrado: X horas" → asesoriaTrabajoGradoPregrado = X

Devuelve **EXCLUSIVAMENTE** un objeto JSON con la siguiente estructura (todos los campos deben ser números; si no se encuentra, usa 0):
{
  "version": "2025-2",
  "horasSemestre": 0,
  "semanasSemestre": 0,
  "docenciaDirecta": {
    "sinProyecto": 0,
    "investigadorPrincipal": 0,
    "coinvestigador": 0,
    "directorPrograma": 0,
    "directorPosgradoDescarga": 0,
    "coordinacionAreaDescarga": 0,
    "formacionDoctorado": 0,
    "formacionMaestria": 0
  },
  "equivalenciasPosgrado": {
    "especializacion": 0,
    "maestria": 0,
    "doctorado": 0
  },
  "docenciaIndirecta": {
    "preparacionClasePorHora": 0,
    "asesoriaPorCurso": 0,
    "asesoriaTrabajoGradoPregrado": 0,
    "asesoriaTrabajoGradoMaestria": 0,
    "asesoriaTrabajoGradoDoctorado": 0,
    "maxTrabajosGrado": 0
  },
  "actividadesAnexas": {
    "liderColectivo": 0,
    "participacionColectivo": 0,
    "comiteCurricular": 0,
    "comiteBasicoFacultad": 0,
    "liderGrupoInvestigacion": 0,
    "liderRevista": 0
  },
  "registroHorasSemanales": {
    "sinProyecto": 0,
    "investigadorPrincipal": 0,
    "coinvestigador": 0,
    "directorPrograma": 0,
    "directorPosgrado": 0,
    "coordinacionArea": 0,
    "formacionDoctorado": 0,
    "formacionMaestria": 0
  },
  "visualSettings": {
    "form_bg_color": ""
  }
}
`;

export async function interpretLineamientosWithGemini(filePath: string): Promise<LineamientosData> {
  const rawText = await extractTextFromPDF(filePath);
  console.log("=== PROCESANDO PDF CON GEMINI ===");

  if (!rawText.trim()) {
    throw new Error("El PDF no contiene texto extraíble");
  }

  try {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: { responseMimeType: "application/json" }
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