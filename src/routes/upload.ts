import { Router, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { query } from "../db";

const UPLOAD_DIR =
  process.env.UPLOADS_DIR ?? process.env.UPLOAD_DIR ?? "/var/app/uploads";

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const MAX_MB = parseInt(process.env.MAX_UPLOAD_MB ?? "20", 10);

const upload = multer({
  storage,
  limits: { fileSize: MAX_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [".pdf", ".docx", ".doc", ".txt"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error("Tipo de archivo no permitido. Solo PDF, DOCX, DOC, TXT."));
  },
});

const router = Router();
router.use(requireAuth);

// POST /api/upload/parse-document
router.post(
  "/parse-document",
  upload.single("file"),
  async (req: AuthRequest, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ message: "No se recibió ningún archivo" });
    }
    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();
    let extractedText = "";

    try {
      if (ext === ".pdf") {
        const pdfParse = (await import("pdf-parse")).default;
        const buffer = fs.readFileSync(filePath);
        const parsed = await pdfParse(buffer);
        extractedText = parsed.text;
      } else if (ext === ".docx" || ext === ".doc") {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ path: filePath });
        extractedText = result.value;
      } else if (ext === ".txt") {
        extractedText = fs.readFileSync(filePath, "utf-8");
      }

      const aiResponse = await extractRulesWithAI(extractedText);

      const userCc = req.user!.cc;
      await query(
        `INSERT INTO public.uploaded_documents
           (user_cc, file_name, file_path, mime_type, size_bytes, extracted_text, ai_summary, ai_metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          userCc,
          req.file.originalname,
          filePath,
          req.file.mimetype,
          req.file.size,
          extractedText,
          aiResponse.summary,
          JSON.stringify(aiResponse.rules)
        ]
      );

      return res.json({
        fileName: req.file.originalname,
        extractedText: extractedText.trim(),
        rules: aiResponse.rules,
        summary: aiResponse.summary,
        filePath: filePath,
        message: "Archivo procesado e interpretado por IA correctamente",
      });
    } catch (err: any) {
      console.error("Error procesando archivo:", err);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch { /* ignore */ }
      }
      return res.status(500).json({ message: err?.message ?? "Error procesando el archivo" });
    }
  }
);

// ================================================================
// EXTRACCIÓN DE REGLAS CON IA (Gemini + fallback Regex)
// ================================================================

async function extractRulesWithAI(text: string): Promise<{ rules: any[]; summary: string }> {
  // Si no hay API Key de Gemini, usar el simulador de regex
  if (!process.env.GEMINI_API_KEY) {
    console.warn("Gemini API Key no configurada. Usando motor de regex.");
    return extractRulesWithRegex(text);
  }

  console.log("Analizando texto con IA (Gemini)...");
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Actúa como asistente para actualizar un sistema de gestión docente universitario.
Analiza este texto de lineamientos y devuelve SOLO un JSON válido (sin texto adicional) con las reglas encontradas.
El formato debe ser: { "rules": [{"category":"categoria","rule_key":"clave","label":"descripcion","value":valor}] }

Categorías válidas: "investigacion", "administrativas", "formacion", "visual"
Para colores rgb, conviértelos a formato hexadecimal #XXXXXX.

Texto del documento:
${text}`
            }]
          }]
        })
      }
    );

    const data: any = await response.json();
    const resultText: string = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    console.log("Respuesta de Gemini:", resultText.substring(0, 200));

    const jsonMatch = resultText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        rules: parsed.rules || [],
        summary: "Reglas extraídas con IA (Gemini)"
      };
    }

    throw new Error("No se encontró JSON en la respuesta");

  } catch (error) {
    console.error("Error con Gemini, usando fallback:", error);
    return extractRulesWithRegex(text);
  }
}

// Simulación con regex (fallback)
function extractRulesWithRegex(text: string): { rules: any[]; summary: string } {
  const rules: any[] = [];
  const lowerText = text.toLowerCase();

  // Investigador principal
  if (lowerText.includes("investigador principal")) {
    const match = text.match(/investigador\s*principal.*?(\d{1,2})\s*horas?/i);
    rules.push({
      category: "investigacion",
      rule_key: "investigador_principal",
      label: `Investigador Principal: ${match ? match[1] : 11}h`,
      hours: match ? parseInt(match[1]) : 11,
      source_article: "Artículo 6.a"
    });
  }

  // Co-investigador
  if (lowerText.includes("co-investigador") || lowerText.includes("coinvestigador")) {
    const match = text.match(/co-?investigador.*?(\d{1,2})\s*horas?/i);
    rules.push({
      category: "investigacion",
      rule_key: "co_investigador",
      label: `Co-investigador: ${match ? match[1] : 6}h`,
      hours: match ? parseInt(match[1]) : 6,
      source_article: "Artículo 6.b"
    });
  }

  // Docencia directa
  const docenciaMatch = text.match(/(\d{1,2})\s*horas?\s*semanales\s*de\s*docencia\s*directa/i);
  if (docenciaMatch || lowerText.includes("docencia directa")) {
    rules.push({
      category: "administrativas",
      rule_key: "docencia_directa_default",
      label: `Docencia directa: ${docenciaMatch ? docenciaMatch[1] : 16}h`,
      hours: docenciaMatch ? parseInt(docenciaMatch[1]) : 16,
      source_article: "Artículo 6.d"
    });
  }

  // Preparación de clase
  const prepMatch = text.match(/preparación\s*(?:de\s*)?clase\s*[:=]\s*(\d+[,.]?\d*)\s*hora/i) ||
                    text.match(/prep_class_hours\s*[:=]\s*(\d+[,.]?\d*)/i);
  if (prepMatch) {
    rules.push({
      category: "investigacion",
      rule_key: "preparacion_clase_factor",
      label: `Preparación de clase: ${prepMatch[1]}h por hora`,
      value: parseFloat(prepMatch[1].replace(",", ".")),
      source_article: "Lineamientos"
    });
  }

  // Horas totales del semestre
  const horasSemestreMatch = text.match(/(\d{3,4})\s*horas?\s*(totales|al semestre)/i);
  if (horasSemestreMatch) {
    rules.push({
      category: "administrativas",
      rule_key: "horas_totales_semestre",
      label: `Horas totales: ${horasSemestreMatch[1]}h`,
      hours: parseInt(horasSemestreMatch[1]),
      source_article: "Artículo 4"
    });
  }

  // Semanas
  const semanasMatch = text.match(/(\d{1,2})\s*semanas/i);
  if (semanasMatch) {
    rules.push({
      category: "administrativas",
      rule_key: "semanas_por_semestre",
      label: `Semanas: ${semanasMatch[1]}`,
      value: parseInt(semanasMatch[1]),
      source_article: "Artículo 4"
    });
  }

  // Trabajos de grado
  const trabajosMatch = text.match(/hasta\s*(\d{1,2})\s*trabajos?\s*(?:de\s*grado)?/i);
  if (trabajosMatch || lowerText.includes("trabajos de grado")) {
    rules.push({
      category: "formacion",
      rule_key: "max_trabajos_grado",
      label: `Máx trabajos de grado: ${trabajosMatch ? trabajosMatch[1] : 4}`,
      value: trabajosMatch ? parseInt(trabajosMatch[1]) : 4,
      source_article: "Artículo 6.o"
    });
  }

  // Administrativos
  const adminMatch = text.match(/(?:director|decano|administrativ[oa]s?).*?(\d{1,2})\s*horas?/i);
  if (adminMatch || lowerText.includes("labores de administración")) {
    rules.push({
      category: "administrativas",
      rule_key: "horas_administrativos",
      label: `Admin: ${adminMatch ? adminMatch[1] : 6}h`,
      hours: adminMatch ? parseInt(adminMatch[1]) : 6,
      source_article: "Artículo 6.e"
    });
  }

  // Cambios visuales (color)
  const colorMatch = 
    text.match(/color de fondo.*?formulario.*?(#[0-9a-fA-F]{3,6})/i) || 
    text.match(/form_bg_color\s*[:=]\s*(#[0-9a-fA-F]{3,6})/i) ||
    text.match(/rgb\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)/i);

  if (colorMatch) {
    let colorValue = colorMatch[1];
    if (colorMatch[0].startsWith("rgb")) {
      const r = parseInt(colorMatch[1]);
      const g = parseInt(colorMatch[2]);
      const b = parseInt(colorMatch[3]);
      colorValue = "#" + [r, g, b].map(x => x.toString(16).padStart(2, "0")).join("");
    }
    rules.push({
      category: "visual",
      rule_key: "color_header_formulario",
      label: `Color formulario: ${colorValue}`,
      value: colorValue,
      source_article: "Instrucción de diseño"
    });
  }

  // Formación doctorado
  if (lowerText.includes("formación de doctorado") || lowerText.includes("doctorado")) {
    const match = text.match(/doctorado.*?(\d{1,2})\s*horas?/i);
    rules.push({
      category: "formacion",
      rule_key: "docencia_doctorado",
      label: `Docencia doctorado: ${match ? match[1] : 8}h`,
      hours: match ? parseInt(match[1]) : 8,
      source_article: "Artículo 6.i"
    });
  }

  // Formación maestría
  if (lowerText.includes("formación de maestría") || lowerText.includes("maestría")) {
    const match = text.match(/maestría.*?(\d{1,2})\s*horas?/i);
    rules.push({
      category: "formacion",
      rule_key: "docencia_maestria",
      label: `Docencia maestría: ${match ? match[1] : 12}h`,
      hours: match ? parseInt(match[1]) : 12,
      source_article: "Artículo 6.j"
    });
  }

  // Equivalencias posgrado
  const espMatch = text.match(/especialización\s*[:=]?\s*(\d+[,.]?\d*)\s*x/i);
  if (espMatch) {
    rules.push({
      category: "formacion",
      rule_key: "factor_especializacion",
      label: `Factor Especialización: ${espMatch[1]}x`,
      value: parseFloat(espMatch[1].replace(",", ".")),
      source_article: "Tabla de equivalencias"
    });
  }

  const maestriaMatch = text.match(/maestría\s*[:=]?\s*(\d+[,.]?\d*)\s*x/i);
  if (maestriaMatch) {
    rules.push({
      category: "formacion",
      rule_key: "factor_maestria",
      label: `Factor Maestría: ${maestriaMatch[1]}x`,
      value: parseFloat(maestriaMatch[1].replace(",", ".")),
      source_article: "Tabla de equivalencias"
    });
  }

  const docMatch = text.match(/doctorado\s*[:=]?\s*(\d+[,.]?\d*)\s*x/i);
  if (docMatch) {
    rules.push({
      category: "formacion",
      rule_key: "factor_doctorado",
      label: `Factor Doctorado: ${docMatch[1]}x`,
      value: parseFloat(docMatch[1].replace(",", ".")),
      source_article: "Tabla de equivalencias"
    });
  }

  const summary = rules.length > 0
    ? `Se detectaron ${rules.length} reglas del PDF.`
    : "No se detectaron reglas en el PDF.";

  return { rules, summary };
}

export default router;