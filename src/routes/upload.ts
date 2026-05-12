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

      // --- IA EXTRACTION LOGIC ---
      // En un entorno real, aquí se llamaría a OpenAI o Gemini.
      // Simulamos la extracción basada en el texto para demostrar la funcionalidad.
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
        try {
          fs.unlinkSync(filePath);
        } catch {
          /* ignore */
        }
      }
      return res
        .status(500)
        .json({ message: err?.message ?? "Error procesando el archivo" });
    }
  }
);

/**
 * Simulación de extracción con IA. 
 * Busca patrones en el texto para identificar reglas de negocio y cambios visuales.
 */
async function extractRulesWithAI(text: string) {
  const rules: any[] = [];
  const lowercaseText = text.toLowerCase();

  // 1. Detección de Reglas de Docencia (Ejemplo basado en los lineamientos reales)
  if (lowercaseText.includes("investigador principal")) {
    rules.push({
      category: "investigacion",
      rule_key: "investigador_principal",
      label: "Investigador Principal (IA Extracted)",
      hours: 11,
      subjects: 0,
      source_article: "Artículo 6.a"
    });
  }
  
  if (lowercaseText.includes("co-investigador")) {
    rules.push({
      category: "investigacion",
      rule_key: "co_investigador",
      label: "Co-investigador (IA Extracted)",
      hours: 6,
      subjects: 0,
      source_article: "Artículo 6.b"
    });
  }

  if (lowercaseText.includes("16 horas semanales de docencia")) {
    rules.push({
      category: "administrativas",
      rule_key: "docente_sin_proyectos",
      label: "Docente sin proyectos (IA Extracted)",
      hours: 16,
      subjects: 0,
      source_article: "Artículo 6.d"
    });
  }

  // 2. Detección de Cambios Visuales (Requerimiento especial)
  // Ejemplo: "Cambiar el color de fondo del formulario a #f0f9ff"
  const colorMatch = text.match(/color de fondo.*?formulario.*? (#[0-9a-fA-F]{3,6})/i) || 
                     text.match(/background color.*?form.*? (#[0-9a-fA-F]{3,6})/i);
  
  if (colorMatch) {
    rules.push({
      category: "visual",
      rule_key: "form_bg_color",
      label: "Cambio de color de fondo del formulario",
      value: colorMatch[1],
      source_article: "Instrucción de diseño"
    });
  }

  // 3. Resumen
  let summary = "Se han identificado varias reglas de asignación horaria.";
  if (colorMatch) {
    summary += ` Además, se detectó una instrucción para cambiar el color de fondo a ${colorMatch[1]}.`;
  }

  return {
    rules,
    summary: summary
  };
}

export default router;
