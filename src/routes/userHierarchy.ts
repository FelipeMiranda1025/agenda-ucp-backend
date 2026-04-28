import { Router, Response } from "express";
import { query, queryOne } from "../db";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", async (_req, res: Response) => {
  try {
    const rows = await query(
      `SELECT * FROM public.user_hierarchy ORDER BY created_at`
    );
    return res.json(rows);
  } catch {
    return res.status(500).json({ message: "Error obteniendo jerarquía" });
  }
});

router.post("/", async (req: AuthRequest, res: Response) => {
  const { user_id, supervisor_id } = req.body ?? {};
  try {
    const row = await queryOne(
      `INSERT INTO public.user_hierarchy (user_id, supervisor_id)
       VALUES ($1,$2)
       ON CONFLICT (user_id) DO UPDATE SET supervisor_id = EXCLUDED.supervisor_id
       RETURNING *`,
      [user_id, supervisor_id]
    );
    return res.status(201).json(row);
  } catch {
    return res.status(500).json({ message: "Error guardando jerarquía" });
  }
});

router.delete("/:userId", async (req: AuthRequest, res: Response) => {
  try {
    await query(`DELETE FROM public.user_hierarchy WHERE user_id=$1`, [
      req.params.userId,
    ]);
    return res.json({ message: "Eliminada" });
  } catch {
    return res.status(500).json({ message: "Error eliminando jerarquía" });
  }
});

export default router;
