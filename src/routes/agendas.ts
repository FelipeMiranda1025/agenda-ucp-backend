import { Router, Response } from "express";
import { query, queryOne } from "../db";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const { docente_cc } = req.query;
    let sql = `SELECT * FROM public.agendas`;
    const params: any[] = [];
    if (docente_cc) {
      sql += ` WHERE docente_cc = $1`;
      params.push(docente_cc);
    }
    sql += ` ORDER BY confirmed_at DESC`;
    return res.json(await query(sql, params));
  } catch {
    return res.status(500).json({ message: "Error obteniendo agendas" });
  }
});

router.post("/", async (req: AuthRequest, res: Response) => {
  const { user_id, docente_cc, subfunction_id, data, total_horas, semester_id } =
    req.body ?? {};
  try {
    const row = await queryOne(
      `INSERT INTO public.agendas
         (user_id, docente_cc, subfunction_id, data, total_horas, semester_id)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [
        user_id,
        docente_cc,
        subfunction_id,
        JSON.stringify(data ?? {}),
        total_horas ?? 0,
        semester_id ?? null,
      ]
    );
    return res.status(201).json(row);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error creando agenda" });
  }
});

router.put("/:id", async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { data, total_horas, subfunction_id, semester_id } = req.body ?? {};
  try {
    const row = await queryOne(
      `UPDATE public.agendas
          SET data=$1, total_horas=$2, subfunction_id=$3, semester_id=$4, updated_at=now()
        WHERE id=$5 RETURNING *`,
      [JSON.stringify(data ?? {}), total_horas, subfunction_id, semester_id, id]
    );
    if (!row) return res.status(404).json({ message: "Agenda no encontrada" });
    return res.json(row);
  } catch {
    return res.status(500).json({ message: "Error actualizando agenda" });
  }
});

router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    await query(`DELETE FROM public.agendas WHERE id=$1`, [req.params.id]);
    return res.json({ message: "Agenda eliminada" });
  } catch {
    return res.status(500).json({ message: "Error eliminando agenda" });
  }
});

export default router;
