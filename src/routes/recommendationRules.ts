import { Router, Response } from "express";
import { query, queryOne } from "../db";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

/**
 * GET /api/recommendation-rules
 * Lista todas las reglas. Acepta `?order=col.dir` (ej. priority.desc).
 */
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const order = String(req.query.order ?? "priority.desc");
    const [col, dir] = order.split(".");
    const safeCol = ["priority", "category", "label", "updated_at"].includes(col) ? col : "priority";
    const safeDir = String(dir).toLowerCase() === "asc" ? "ASC" : "DESC";
    const rows = await query(
      `SELECT * FROM public.recommendation_rules ORDER BY ${safeCol} ${safeDir}, label ASC`
    );
    return res.json(rows);
  } catch (err) {
    console.error("[recommendation-rules:list]", err);
    return res.status(500).json({ message: "Error obteniendo reglas" });
  }
});

/**
 * POST /api/recommendation-rules
 * Crea una nueva regla.
 */
router.post("/", async (req: AuthRequest, res: Response) => {
  const {
    category,
    rule_key,
    label,
    hours = 0,
    subjects = 0,
    default_hours = 0,
    default_subjects = 0,
    priority = 0,
    active = true,
  } = req.body ?? {};

  if (!category || !rule_key || !label) {
    return res.status(400).json({ message: "category, rule_key y label son requeridos" });
  }

  try {
    const row = await queryOne(
      `INSERT INTO public.recommendation_rules
        (category, rule_key, label, hours, subjects,
         default_hours, default_subjects, priority, active, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, NOW())
       RETURNING *`,
      [category, rule_key, label, hours, subjects, default_hours, default_subjects, priority, active]
    );
    return res.status(201).json(row);
  } catch (err) {
    console.error("[recommendation-rules:create]", err);
    return res.status(500).json({ message: "Error creando regla" });
  }
});

/**
 * POST /api/recommendation-rules/reset
 * Restaura hours/subjects a sus valores default_* y reactiva todas.
 */
router.post("/reset", async (_req: AuthRequest, res: Response) => {
  try {
    await query(
      `UPDATE public.recommendation_rules
          SET hours = default_hours,
              subjects = default_subjects,
              active = true,
              updated_at = NOW()`
    );
    return res.json({ message: "Reglas restauradas" });
  } catch (err) {
    console.error("[recommendation-rules:reset]", err);
    return res.status(500).json({ message: "Error restaurando reglas" });
  }
});

/**
 * PUT /api/recommendation-rules/:id
 * Actualización parcial de campos editables.
 */
router.put("/:id", async (req: AuthRequest, res: Response) => {
  const { hours, subjects, active, label, priority } = req.body ?? {};
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (hours !== undefined) { fields.push(`hours = $${i++}`); values.push(hours); }
  if (subjects !== undefined) { fields.push(`subjects = $${i++}`); values.push(subjects); }
  if (active !== undefined) { fields.push(`active = $${i++}`); values.push(active); }
  if (label !== undefined) { fields.push(`label = $${i++}`); values.push(label); }
  if (priority !== undefined) { fields.push(`priority = $${i++}`); values.push(priority); }

  if (fields.length === 0) {
    return res.status(400).json({ message: "Sin campos para actualizar" });
  }
  fields.push(`updated_at = NOW()`);
  values.push(req.params.id);

  try {
    const row = await queryOne(
      `UPDATE public.recommendation_rules SET ${fields.join(", ")} WHERE id = $${i} RETURNING *`,
      values
    );
    if (!row) return res.status(404).json({ message: "Regla no encontrada" });
    return res.json(row);
  } catch (err) {
    console.error("[recommendation-rules:update]", err);
    return res.status(500).json({ message: "Error actualizando regla" });
  }
});

/**
 * DELETE /api/recommendation-rules/:id
 */
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    await query(`DELETE FROM public.recommendation_rules WHERE id = $1`, [req.params.id]);
    return res.json({ message: "Regla eliminada" });
  } catch (err) {
    console.error("[recommendation-rules:delete]", err);
    return res.status(500).json({ message: "Error eliminando regla" });
  }
});

export default router;
