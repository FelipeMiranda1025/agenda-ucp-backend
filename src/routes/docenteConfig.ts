import { Router, Response } from "express";
import { query, queryOne } from "../db";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", async (req: AuthRequest, res: Response) => {
  const { user_cc, semester_label } = req.query;
  try {
    let sql = `SELECT * FROM public.docente_semester_config WHERE 1=1`;
    const params: any[] = [];
    if (user_cc) {
      params.push(user_cc);
      sql += ` AND user_cc=$${params.length}`;
    }
    if (semester_label) {
      params.push(semester_label);
      sql += ` AND semester_label=$${params.length}`;
    }
    sql += ` ORDER BY created_at DESC LIMIT 1`;
    return res.json(await query(sql, params));
  } catch {
    return res.status(500).json({ message: "Error obteniendo configuración" });
  }
});

router.post("/", async (req: AuthRequest, res: Response) => {
  const {
    user_cc,
    semester_label,
    responses,
    computed_direct_hours,
    conflicts,
    observations,
    confirmed,
  } = req.body ?? {};
  try {
    const row = await queryOne(
      `INSERT INTO public.docente_semester_config
         (user_cc, semester_label, responses, computed_direct_hours,
          conflicts, observations, confirmed)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (user_cc, semester_label) DO UPDATE
         SET responses=$3,
             computed_direct_hours=$4,
             conflicts=$5,
             observations=$6,
             confirmed=$7,
             updated_at=now()
       RETURNING *`,
      [
        user_cc,
        semester_label ?? "2025-1",
        JSON.stringify(responses ?? {}),
        computed_direct_hours ?? 16,
        JSON.stringify(conflicts ?? []),
        JSON.stringify(observations ?? []),
        confirmed ?? false,
      ]
    );
    return res.status(201).json(row);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error guardando configuración" });
  }
});

export default router;
