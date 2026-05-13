import { GoogleGenerativeAI } from "@google/generative-ai";
import { extractTextFromPDF } from "./pdfParser";

// Inicializar el cliente de Gemini con la API key desde variables de entorno
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

// Interfaz que define la estructura esperada de los lineamientos
export interface LineamientosData {
  version: string;
  docenciaDirecta: {
    sinProyecto: number;
    investigadorPrincipal: number;
    coinvestigador: number;
    directorPrograma: number;
    directorPosgradoDescarga: number;    // horas de reducción por dirigir posgrado
    coordinacionAreaDescarga: number;    // horas de reducción por coordinar área (máx 3)
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
  };
  actividadesAnexas: {
    liderColectivo: number;
    participacionColectivo: number;
    comiteCurricular: number;
    comiteBasicoFacultad: number;
    liderGrupoInvestigacion: number;
    liderRevista: number;
  };
}

// Prompt que se enviará a Gemini. Le pedimos JSON estricto.
const SYSTEM_PROMPT = `
Eres un asistente experto en interpretar documentos normativos universitarios.
Recibirás el texto del documento "AGENDA DOCENTE" de la Universidad Católica de Pereira.
Debes extraer de él los siguientes valores numéricos y devolverlos **EXCLUSIVAMENTE** en formato JSON, sin texto adicional, sin explicaciones, sin marcas de código.

Estructura JSON exacta que debes devolver:
{
  "version": "2025-2",
  "docenciaDirecta": {
    "sinProyecto": 16,
    "investigadorPrincipal": 10,
    "coinvestigador": 13,
    "directorPrograma": 6,
    "directorPosgradoDescarga": 5,
    "coordinacionAreaDescarga": 3,
    "formacionDoctorado": 8,
    "formacionMaestria": 12
  },
  "equivalenciasPosgrado": {
    "especializacion": 1.5,
    "maestria": 2.0,
    "doctorado": 2.5
  },
  "docenciaIndirecta": {
    "preparacionClasePorHora": 0.5,
    "asesoriaPorCurso": 1,
    "asesoriaTrabajoGradoPregrado": 15,
    "asesoriaTrabajoGradoMaestria": 30,
    "asesoriaTrabajoGradoDoctorado": 45
  },
  "actividadesAnexas": {
    "liderColectivo": 4,
    "participacionColectivo": 2,
    "comiteCurricular": 3,
    "comiteBasicoFacultad": 2,
    "liderGrupoInvestigacion": 4,
    "liderRevista": 2
  }
}

Usa números, no strings. Decimales con punto. Si algún valor no se encuentra en el texto, usa el valor más probable según el contexto del documento (por ejemplo, si ves "16 horas semanales de docencia" para un caso, asigna ese número al campo correspondiente).
`;

/**
 * Interpreta un archivo PDF de lineamientos usando Gemini y devuelve la configuración estructurada.
 * @param filePath Ruta del archivo PDF en el sistema de archivos.
 * @returns Promesa con el objeto LineamientosData.
 * @throws Error si no se puede extraer el texto, si Gemini no responde o si el JSON es inválido.
 */
export async function interpretLineamientosWithGemini(filePath: string): Promise<LineamientosData> {
  // 1. Extraer texto plano del PDF usando la función existente
  const rawText = await extractTextFromPDF(filePath);
  
  // 2. Gemini tiene un contexto muy grande, pero por eficiencia y para evitar costos, 
  //    podemos limitar el texto a unos 15000 caracteres (suficiente para un documento de 10-15 páginas)
  const truncated = rawText.length > 15000 ? rawText.substring(0, 15000) : rawText;
  
  // 3. Preparar el contenido para Gemini
  const prompt = `${SYSTEM_PROMPT}\n\nTexto del documento:\n${truncated}`;
  
  // 4. Llamar a Gemini con configuración para forzar JSON
  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.1,               // Baja temperatura para respuestas deterministas
      responseMimeType: "application/json", // Gemini 1.5 Pro/Flash soportan esto
    },
  });
  
  const responseText = result.response.text();
  
  // 5. Limpiar posibles envolturas de markdown (por si acaso)
  let cleanJson = responseText.trim();
  if (cleanJson.startsWith("```json")) {
    cleanJson = cleanJson.replace(/```json\n?/, "").replace(/\n?```$/, "");
  } else if (cleanJson.startsWith("```")) {
    cleanJson = cleanJson.replace(/```\n?/, "").replace(/\n?```$/, "");
  }
  
  // 6. Parsear JSON
  let parsed: LineamientosData;
  try {
    parsed = JSON.parse(cleanJson) as LineamientosData;
  } catch (error) {
    console.error("Error al parsear JSON de Gemini:", cleanJson);
    throw new Error("La respuesta de Gemini no es un JSON válido");
  }
  
  // 7. Validar que al menos el campo más importante exista
  if (!parsed.docenciaDirecta?.sinProyecto) {
    throw new Error("La IA no pudo extraer la carga docente base (sin proyecto)");
  }
  
  // 8. Valores por defecto para campos que pudieran faltar (seguridad)
  parsed.docenciaDirecta = {
    sinProyecto: parsed.docenciaDirecta.sinProyecto ?? 16,
    investigadorPrincipal: parsed.docenciaDirecta.investigadorPrincipal ?? 10,
    coinvestigador: parsed.docenciaDirecta.coinvestigador ?? 13,
    directorPrograma: parsed.docenciaDirecta.directorPrograma ?? 6,
    directorPosgradoDescarga: parsed.docenciaDirecta.directorPosgradoDescarga ?? 5,
    coordinacionAreaDescarga: parsed.docenciaDirecta.coordinacionAreaDescarga ?? 3,
    formacionDoctorado: parsed.docenciaDirecta.formacionDoctorado ?? 8,
    formacionMaestria: parsed.docenciaDirecta.formacionMaestria ?? 12,
  };
  
  // 9. Retornar el objeto completo
  return parsed;
}