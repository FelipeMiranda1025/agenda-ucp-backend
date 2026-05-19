import { Router, Response } from "express";
import { query, queryOne } from "../db";
import { requireAuth, requireVicerrector, AuthRequest } from "../middleware/auth";
import { syncExtractedRulesToRecommendationRules } from "../services/recommendationRulesSync";
import multer from "multer";
import fs from "fs";
import path from "path";
import { interpretLineamientosWithGemini } from "../services/iaLineamientosParser";
import { transformToExtractedRules } from "../services/ruleTransformer";
import { saveLineamientosConfig, getActiveLineamientos } from "../services/lineamientosConfigService";
import {
  getDefaultLineamientosConfig,
  syncActiveLineamientosFromRecommendationRules,
} from "../services/recommendationRulesToConfig";
import { applyLineamientosToSystem, applyCatalogsFromLineamientos } from "../services/lineamientosApplierService";
import {
  previewPendingFromProposedRules,
} from "../services/catalogActivitiesSync";

const router = Router();

// Configuración de multer para almacenar el archivo temporalmente en disco
const upload = multer({
  dest: path.resolve(process.cwd(), process.env.UPLOADS_DIR || "uploads"),
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Solo se admiten archivos PDF"));
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// Asegurar que el directorio de uploads exista
if (!fs.existsSync(path.resolve(process.cwd(), process.env.UPLOADS_DIR || "uploads"))) {
  fs.mkdirSync(path.resolve(process.cwd(), process.env.UPLOADS_DIR || "uploads"), { recursive: true });
}

/**
 * POST /api/lineamientos-documents/upload
 * Sube un PDF, lo interpreta con Groq (IA), extrae reglas y guarda configuración. Requiere auth.
 */
router.post("/upload", requireAuth, requireVicerrector, upload.single("pdf"), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No se envió ningún archivo PDF" });
    }

    // 1. Interpretar el PDF con Groq (IA)
    const newConfig = await interpretLineamientosWithGemini(req.file.path);
    console.log("Configuración extraída por IA:", JSON.stringify(newConfig, null, 2));

    // 2. Transformar a reglas planas para el frontend (el formato que espera el componente)
    const rules = transformToExtractedRules(newConfig);
    const summary = `Se extrajeron ${rules.length} reglas de los lineamientos.`;

    // 3. Guardar configuración en borrador (se aplica al confirmar en preview)
    await saveLineamientosConfig(newConfig);

    // 4. Guardar el documento en la tabla lineamientos_documents (historial)
    const semesterLabel = newConfig.version;
    const fileName = req.file.originalname;
    const filePath = req.file.path;
    const uploadedBy = (req as any).user?.id ?? null;

    const inserted = await queryOne(
      `INSERT INTO public.lineamientos_documents
        (semester_label, file_path, file_name, uploaded_by, uploaded_at, rules_extracted, summary, applied)
       VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7)
       RETURNING id`,
      [semesterLabel, filePath, fileName, uploadedBy, JSON.stringify(rules), summary, false]
    );

    // 5. Limpiar archivo temporal (opcional, libera espacio)
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    return res.status(200).json({
      success: true,
      id: inserted.id,
      rules_extracted: rules,
      summary: summary,
      message: "PDF procesado. Revise y confirme la aplicación.",
      applied: false,
    });
  } catch (error: any) {
    console.error("[lineamientos-documents:upload]", error);
    // Limpiar archivo temporal si existe
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) { }
    }
    return res.status(500).json({ message: error.message || "Error al procesar el PDF con IA" });
  }
});

/**
 * GET /api/lineamientos-documents
 * Lista el historial de documentos cargados. Requiere auth.
 */
router.get("/", requireAuth, async (req: AuthRequest, res: Response) => {
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
 * Crea un registro manual de un documento procesado. Requiere auth.
 */
router.post("/", requireAuth, async (req: AuthRequest, res: Response) => {
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
 * POST /api/lineamientos-documents/preview-catalog-gaps
 * Evalúa reglas del PDF antes de aplicar.
 */
router.post("/preview-catalog-gaps", requireAuth, requireVicerrector, async (req: AuthRequest, res: Response) => {
  const { rules = [], number_weeks } = req.body ?? {};
  if (!Array.isArray(rules) || rules.length === 0) {
    return res.status(400).json({ message: "Debe enviar al menos una regla" });
  }

  try {
    const config = await getActiveLineamientos();
    const weeks = Number(number_weeks) || config?.semanasSemestre || 23;
    const proposed = rules.map((r: { rule_key?: string; label?: string; category?: string; hours?: number; subjects?: number }) => ({
      rule_key: r.rule_key ?? "",
      label: r.label ?? "",
      category: r.category ?? "formacion",
      hours: Number(r.hours ?? 0),
      subjects: Number(r.subjects ?? 0),
    }));
    const pending = await previewPendingFromProposedRules(proposed, weeks);
    return res.json({ pending, number_weeks: weeks });
  } catch (err) {
    console.error("[lineamientos-documents:preview-catalog-gaps]", err);
    return res.status(500).json({ message: "Error evaluando catálogo" });
  }
});

/**
 * POST /api/lineamientos-documents/:id/apply-rules
 * Aplica reglas seleccionadas al sistema (recommendation_rules + catálogos + configuración).
 */
router.post("/:id/apply-rules", requireAuth, requireVicerrector, async (req: AuthRequest, res: Response) => {
  const { rules = [] } = req.body ?? {};
  if (!Array.isArray(rules) || rules.length === 0) {
    return res.status(400).json({ message: "Debe enviar al menos una regla" });
  }

  try {
    const config = await getActiveLineamientos();
    if (!config) {
      return res.status(400).json({ message: "No hay lineamientos activos para aplicar" });
    }
    const appliedCount = await syncExtractedRulesToRecommendationRules(rules, config);
    await applyLineamientosToSystem(config);
    await queryOne(
      `UPDATE public.lineamientos_documents
       SET applied = true, applied_at = NOW(), applied_by = $1
       WHERE id = $2
       RETURNING id`,
      [req.user?.id ?? null, req.params.id]
    );
    return res.json({
      success: true,
      applied_count: appliedCount,
      message: "Lineamientos procesados y aplicados correctamente",
    });
  } catch (err) {
    console.error("[lineamientos-documents:apply-rules]", err);
    return res.status(500).json({ message: "Error aplicando reglas seleccionadas" });
  }
});

/**
 * PUT /api/lineamientos-documents/:id
 * Actualiza el estado (marcar como aplicado). Requiere auth.
 */
router.put("/:id", requireAuth, requireVicerrector, async (req: AuthRequest, res: Response) => {
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

    // Si se está marcando como aplicado, propagar los cambios a las tablas del sistema
    if (applied) {
      const config = await getActiveLineamientos();
      if (config) {
        await applyLineamientosToSystem(config);
      }
    }

    return res.json(row);
  } catch (err) {
    console.error("[lineamientos-documents:update]", err);
    return res.status(500).json({ message: "Error actualizando documento" });
  }
});

/**
 * GET /api/lineamientos-documents/active
 * Devuelve la configuración activa completa (system_settings). Es pública.
 * Si no hay PDF importado aún, responde con los valores por defecto UCP (200, no 404).
 */
router.get("/active", async (_req: AuthRequest, res: Response) => {
  try {
    const stored = await getActiveLineamientos();
    const config = stored ?? getDefaultLineamientosConfig();
    const rules = transformToExtractedRules(config);
    return res.json({
      ...config,
      rules_extracted: rules,
    });
  } catch (err) {
    console.error("[lineamientos-documents:active]", err);
    return res.status(500).json({ message: "Error obteniendo lineamientos activos" });
  }
});

export default router;