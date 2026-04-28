import { Router, Response } from "express";
import { query, queryOne } from "../db";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

/**
 * GET /api/system-settings
 * Lista todos los settings.
 */
router.get("/", async (_req: AuthRequest, res: Response) => {
  try {
    const rows = await query(`SELECT * FROM public.system_settings ORDER BY key`);
    return res.json(rows);
  } catch (err) {
    console.error("[system-settings:list]", err);
    return res.status(500).json({ message: "Error obteniendo settings" });
  }
});

/**
 * GET /api/system-settings/:key
 * Devuelve la fila o null si no existe (sin 404).
 */
router.get("/:key", async (req: AuthRequest, res: Response) => {
  try {
    const row = await queryOne(
      `SELECT * FROM public.system_settings WHERE key = $1`,
      [req.params.key]
    );
    return res.json(row ?? null);
  } catch (err) {
    console.error("[system-settings:get]", err);
    return res.status(500).json({ message: "Error obteniendo setting" });
  }
});

/**
 * PUT /api/system-settings/:key
 * Body: { value: jsonb, updated_by?: string }
 * Upsert por la PK `key`.
 */
router.put("/:key", async (req: AuthRequest, res: Response) => {
  const { value, updated_by = null } = req.body ?? {};
  if (value === undefined) {
    return res.status(400).json({ message: "El campo 'value' es requerido" });
  }

  try {
    const row = await queryOne(
      `INSERT INTO public.system_settings (key, value, updated_by, updated_at)
       VALUES ($1, $2::jsonb, $3, NOW())
       ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value,
             updated_by = EXCLUDED.updated_by,
             updated_at = NOW()
       RETURNING *`,
      [req.params.key, JSON.stringify(value), updated_by]
    );
    return res.json(row);
  } catch (err) {
    console.error("[system-settings:upsert]", err);
    return res.status(500).json({ message: "Error guardando setting" });
  }
});

export default router;
