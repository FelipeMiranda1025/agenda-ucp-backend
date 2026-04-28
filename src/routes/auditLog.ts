import { Router, Response } from "express";
import { query } from "../db";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", async (req: AuthRequest, res: Response) => {
  const { table_name, record_id } = req.query;
  try {
    let sql = `SELECT * FROM public.audit_log WHERE 1=1`;
    const params: any[] = [];
    if (table_name) {
      params.push(table_name);
      sql += ` AND table_name=$${params.length}`;
    }
    if (record_id) {
      params.push(record_id);
      sql += ` AND record_id=$${params.length}`;
    }
    sql += ` ORDER BY created_at DESC LIMIT 200`;
    return res.json(await query(sql, params));
  } catch {
    return res.status(500).json({ message: "Error obteniendo audit log" });
  }
});

export default router;
