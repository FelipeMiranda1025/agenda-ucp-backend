import { Router, Response } from "express";
import { query, queryOne } from "../db";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", async (_req, res: Response) => {
  try {
    const rows = await query(`SELECT * FROM public.subjects ORDER BY id`);
    return res.json(rows);
  } catch {
    return res.status(500).json({ message: "Error obteniendo asignaturas" });
  }
});

router.post("/", async (req: AuthRequest, res: Response) => {
  const {
    name,
    weekly_hours,
    number_weeks,
    id_semester,
    id_education_level,
    id_state,
    id_faculty,
    id_professional_career,
  } = req.body ?? {};
  try {
    const row = await queryOne(
      `INSERT INTO public.subjects
        (name, weekly_hours, number_weeks, id_semester, id_education_level,
         id_state, id_faculty, id_professional_career)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        name,
        weekly_hours,
        number_weeks,
        id_semester,
        id_education_level,
        id_state,
        id_faculty,
        id_professional_career,
      ]
    );
    return res.status(201).json(row);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error creando asignatura" });
  }
});

router.put("/:id", async (req: AuthRequest, res: Response) => {
  const {
    name,
    weekly_hours,
    number_weeks,
    id_semester,
    id_education_level,
    id_state,
    id_faculty,
    id_professional_career,
  } = req.body ?? {};
  try {
    const row = await queryOne(
      `UPDATE public.subjects
          SET name=$1, weekly_hours=$2, number_weeks=$3, id_semester=$4,
              id_education_level=$5, id_state=$6, id_faculty=$7, id_professional_career=$8
        WHERE id=$9 RETURNING *`,
      [
        name,
        weekly_hours,
        number_weeks,
        id_semester,
        id_education_level,
        id_state,
        id_faculty,
        id_professional_career,
        req.params.id,
      ]
    );
    if (!row) return res.status(404).json({ message: "No encontrado" });
    return res.json(row);
  } catch {
    return res.status(500).json({ message: "Error actualizando asignatura" });
  }
});

router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    await query(`DELETE FROM public.subjects WHERE id=$1`, [req.params.id]);
    return res.json({ message: "Eliminada" });
  } catch {
    return res.status(500).json({ message: "Error eliminando asignatura" });
  }
});

export default router;
