import { Router, Request, Response } from "express";
import { query, queryOne } from "../db";
import { requireAuth, AuthRequest } from "../middleware/auth";
import multer from "multer";
import { extractTextFromPDF } from "../services/pdfParser";
import { extractRulesFromText } from "../utils/ruleExtractor";

const router = Router();
router.use(requireAuth);

// Configuración de multer para subida de PDFs
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, process.env.UPLOADS_DIR || "/var/app/uploads"),
  filename: (req, file, cb) => cb(null, `lineamientos_${Date.now()}.pdf`),
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Solo se admiten archivos PDF"));
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

/**
 * POST /api/lineamientos-documents/upload
 * Sube un PDF, extrae texto y reglas automáticamente.
 */
router.post("/upload", upload.single("pdf"), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No se envió ningún archivo PDF" });

    const text = await extractTextFromPDF(req.file.path);
    const rules = extractRulesFromText(text);

    res.json({
      success: true,
      archivo: req.file.filename,
      texto_preview: text.substring(0, 500) + "...",
      reglas_encontradas: rules.length,
      reglas: rules,
    });
  } catch (error: any) {
    console.error("[lineamientos-documents:upload]", error);
    res.status(500).json({ message: error.message || "Error al procesar el PDF" });
  }
});

/**
 * GET /api/lineamientos-documents
 * Lista el historial de documentos cargados.
 */
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const order = String(req.query.order ?? "uploaded_at.desc");
    const [col, dir] = order.split(".");
    const safeCol = ["uploaded_at", "semester_label", "applied"].includes(col) ? col : "uploaded_at";
    const safeDir = String(dir).toLowerCase() === "asc" ? "ASC" : "DESC";

    const rows = await query(
      `SELECT * FROM public.lineamientos_documents ORDER BY ${safeCol} ${safeDir}`
    );
    return res.json(rows);
  } catch (err) {
    console.error("[lineamientos-documents:list]", err);
    return res.status(500).json({ message: "Error obteniendo historial" });
  }
});

/**
 * POST /api/lineamientos-documents
 * Crea un registro de un documento procesado.
 */
router.post("/", async (req: AuthRequest, res: Response) => {
  const {
    semester_label,
    file_path,
    file_name,
    uploaded_by,
    rules_extracted = [],
    summary = "",
    applied = false
  } = req.body ?? {};

  if (!semester_label || !file_path || !file_name) {
    return res.status(400).json({ message: "Faltan campos obligatorios" });
  }

  try {
    const row = await queryOne(
      `INSERT INTO public.lineamientos_documents
        (semester_label, file_path, file_name, uploaded_by, uploaded_at, rules_extracted, summary, applied)
       VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7)
       RETURNING *`,
      [semester_label, file_path, file_name, uploaded_by, JSON.stringify(rules_extracted), summary, applied]
    );
    return res.status(201).json(row);
  } catch (err) {
    console.error("[lineamientos-documents:create]", err);
    return res.status(500).json({ message: "Error guardando registro del documento" });
  }
});

/**
 * PUT /api/lineamientos-documents/:id
 * Actualiza el estado (ej. marcar como aplicado).
 */
router.put("/:id", async (req: AuthRequest, res: Response) => {
  const { applied, applied_at, applied_by } = req.body ?? {};

  try {
    const row = await queryOne(
      `UPDATE public.lineamientos_documents
       SET applied = $1,
           applied_at = $2,
           applied_by = $3
       WHERE id = $4
       RETURNING *`,
      [applied, applied_at, applied_by, req.params.id]
    );
    if (!row) return res.status(404).json({ message: "Documento no encontrado" });
    return res.json(row);
  } catch (err) {
    console.error("[lineamientos-documents:update]", err);
    return res.status(500).json({ message: "Error actualizando documento" });
  }
});

export default router;