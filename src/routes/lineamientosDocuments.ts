import { Router, Response } from "express";
import { query, queryOne } from "../db";
import { requireAuth, AuthRequest } from "../middleware/auth";
import multer from "multer";
import fs from "fs";
import path from "path";
import { interpretLineamientosWithGemini } from "../services/iaLineamientosParser";
import { transformToExtractedRules } from "../services/ruleTransformer";
import { saveLineamientosConfig, getActiveLineamientos } from "../services/lineamientosConfigService";

const router = Router();
router.use(requireAuth);

// Configuración de multer para almacenar el archivo temporalmente en disco
const upload = multer({
  dest: process.env.UPLOADS_DIR || "/tmp/uploads/",
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Solo se admiten archivos PDF"));
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// Asegurar que el directorio de uploads exista
if (!fs.existsSync(process.env.UPLOADS_DIR || "/tmp/uploads/")) {
  fs.mkdirSync(process.env.UPLOADS_DIR || "/tmp/uploads/", { recursive: true });
}

/**
 * POST /api/lineamientos-documents/upload
 * Sube un PDF, lo interpreta con Gemini, extrae reglas y guarda configuración.
 */
router.post("/upload", upload.single("pdf"), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No se envió ningún archivo PDF" });
    }

    // 1. Interpretar el PDF con Gemini (usa la ruta del archivo temporal)
    const config = await interpretLineamientosWithGemini(req.file.path);

    // 2. Transformar a reglas planas para el frontend
    const rules = transformToExtractedRules(config);
    const summary = `Se extrajeron ${rules.length} reglas de los lineamientos.`;

    // 3. Guardar la configuración completa en system_settings (activa)
    await saveLineamientosConfig(config);

    // 4. Guardar el documento en la tabla lineamientos_documents (historial)
    const semesterLabel = config.version;
    const fileName = req.file.originalname;
    const filePath = req.file.path; // ruta temporal, podrías moverlo a una carpeta permanente si quieres
    const uploadedBy = (req as any).user?.id ?? null;

    const inserted = await queryOne(
      `INSERT INTO public.lineamientos_documents
        (semester_label, file_path, file_name, uploaded_by, uploaded_at, rules_extracted, summary, applied)
       VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7)
       RETURNING id`,
      [semesterLabel, filePath, fileName, uploadedBy, JSON.stringify(rules), summary, true]
    );

    // 5. (Opcional) Eliminar archivo temporal para no acumular basura
    // fs.unlinkSync(req.file.path);

    return res.status(200).json({
      success: true,
      id: inserted.id,
      rules_extracted: rules,
      summary: summary,
      message: "Lineamientos procesados y aplicados correctamente"
    });
  } catch (error: any) {
    console.error("[lineamientos-documents:upload]", error);
    // Limpiar archivo temporal si existe
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    return res.status(500).json({ message: error.message || "Error al procesar el PDF con IA" });
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
    const safeDir = dir?.toLowerCase() === "asc" ? "ASC" : "DESC";

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
 * Crea un registro manual de un documento procesado (útil si se necesita desde otro flujo).
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
 * Actualiza el estado (marcar como aplicado).
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

/**
 * GET /api/lineamientos-documents/active
 * Devuelve la configuración activa actual (desde system_settings) en formato ExtractedRule[]
 */
router.get("/active", async (req: AuthRequest, res: Response) => {
  try {
    const config = await getActiveLineamientos();
    if (!config) {
      return res.status(404).json({ message: "No hay lineamientos activos cargados" });
    }
    const rules = transformToExtractedRules(config);
    return res.json({
      rules_extracted: rules,
      version: config.version
    });
  } catch (err) {
    console.error("[lineamientos-documents:active]", err);
    return res.status(500).json({ message: "Error obteniendo lineamientos activos" });
  }
});

export default router;