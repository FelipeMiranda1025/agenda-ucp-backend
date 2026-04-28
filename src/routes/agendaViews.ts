import { Router, Response } from "express";
import { query, queryOne } from "../db";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", async (req: AuthRequest, res: Response) => {
  const { user_cc, user_ccs, status } = req.query;
  try {
    let sql = `SELECT * FROM public.agenda_views WHERE 1=1`;
    const params: any[] = [];
    if (user_cc) {
      params.push(user_cc);
      sql += ` AND user_cc=$${params.length}`;
    }
    if (user_ccs) {
      const list = String(user_ccs)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (list.length > 0) {
        const placeholders = list.map((_, i) => `$${params.length + i + 1}`).join(",");
        params.push(...list);
        sql += ` AND user_cc IN (${placeholders})`;
      }
    }
    if (status) {
      params.push(status);
      sql += ` AND status=$${params.length}`;
    }
    sql += ` ORDER BY created_at DESC`;
    return res.json(await query(sql, params));
  } catch {
    return res.status(500).json({ message: "Error obteniendo agenda views" });
  }
});

router.post("/", async (req: AuthRequest, res: Response) => {
  const { user_cc, records, status } = req.body ?? {};
  try {
    const existing = await queryOne<any>(
      `SELECT id FROM public.agenda_views
        WHERE user_cc=$1 ORDER BY created_at DESC LIMIT 1`,
      [user_cc]
    );
    let row;
    if (existing) {
      row = await queryOne(
        `UPDATE public.agenda_views
            SET records=$1, status=$2, updated_at=now()
          WHERE id=$3 RETURNING *`,
        [JSON.stringify(records ?? []), status ?? "pending", existing.id]
      );
    } else {
      row = await queryOne(
        `INSERT INTO public.agenda_views (user_cc, records, status)
         VALUES ($1,$2,$3) RETURNING *`,
        [user_cc, JSON.stringify(records ?? []), status ?? "pending"]
      );
    }
    return res.status(201).json(row);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Error guardando agenda view" });
  }
});

router.put("/:id", async (req: AuthRequest, res: Response) => {
  const { status, reviewer_cc, reviewer_comment } = req.body ?? {};
  try {
    const row = await queryOne(
      `UPDATE public.agenda_views
          SET status=$1, reviewer_cc=$2, reviewer_comment=$3,
              reviewed_at=now(), updated_at=now()
        WHERE id=$4 RETURNING *`,
      [status, reviewer_cc, reviewer_comment ?? null, req.params.id]
    );
    if (!row) return res.status(404).json({ message: "No encontrado" });
    return res.json(row);
  } catch {
    return res.status(500).json({ message: "Error actualizando agenda view" });
  }
});

export default router;
