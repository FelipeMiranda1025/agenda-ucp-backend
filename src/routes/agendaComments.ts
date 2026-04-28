import { Router, Response } from "express";
import { query, queryOne } from "../db";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", async (req: AuthRequest, res: Response) => {
  const { agenda_id } = req.query;
  try {
    let sql = `SELECT * FROM public.agenda_comments`;
    const params: any[] = [];
    if (agenda_id) {
      sql += ` WHERE agenda_id=$1`;
      params.push(agenda_id);
    }
    sql += ` ORDER BY created_at ASC`;
    return res.json(await query(sql, params));
  } catch {
    return res.status(500).json({ message: "Error obteniendo comentarios" });
  }
});

router.post("/", async (req: AuthRequest, res: Response) => {
  const { agenda_id, reviewer_cc, comment } = req.body ?? {};
  try {
    const row = await queryOne(
      `INSERT INTO public.agenda_comments (agenda_id, reviewer_cc, comment)
       VALUES ($1,$2,$3) RETURNING *`,
      [agenda_id, reviewer_cc, comment]
    );
    return res.status(201).json(row);
  } catch {
    return res.status(500).json({ message: "Error creando comentario" });
  }
});

router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    await query(`DELETE FROM public.agenda_comments WHERE id=$1`, [
      req.params.id,
    ]);
    return res.json({ message: "Eliminado" });
  } catch {
    return res.status(500).json({ message: "Error eliminando comentario" });
  }
});

export default router;
