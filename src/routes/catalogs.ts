import { Router, Request, Response } from "express";
import { query } from "../db";

const router = Router();

function catalogEndpoint(table: string) {
  return async (_req: Request, res: Response) => {
    try {
      const rows = await query(`SELECT * FROM public.${table} ORDER BY id`);
      return res.json(rows);
    } catch (err) {
      console.error(`Error en ${table}:`, err);
      return res.status(500).json({ message: `Error obteniendo ${table}` });
    }
  };
}

router.get("/roles", catalogEndpoint("roles"));
router.get("/states", catalogEndpoint("states"));
router.get("/semester", catalogEndpoint("semester"));
router.get("/faculties", catalogEndpoint("faculties"));
router.get("/education-levels", catalogEndpoint("education_levels"));
router.get("/professional-careers", catalogEndpoint("professional_careers"));
router.get("/indirect-teaching", catalogEndpoint("indirect_teaching"));
router.get("/investigations", catalogEndpoint("investigations"));
router.get("/social-projects", catalogEndpoint("social_projects"));
router.get("/teacher-training", catalogEndpoint("teacher_training"));
router.get("/degree-works", catalogEndpoint("degree_works"));
router.get("/complementary-activities", catalogEndpoint("complementary_activities"));
router.get("/administrative-activities", catalogEndpoint("administrative_activities"));
router.get("/academic-practices", catalogEndpoint("academic_practices"));

export default router;

const VALID_ACTIVITY_TABLES = [
  "indirect_teaching",
  "degree_works",
  "academic_practices",
  "investigations",
  "social_projects",
  "complementary_activities",
  "teacher_training",
  "administrative_activities",
];

router.post("/:table", async (req: Request, res: Response) => {
  const { table } = req.params;
  if (!VALID_ACTIVITY_TABLES.includes(table)) return res.status(404).json({ message: "Table not found" });

  try {
    const keys = Object.keys(req.body);
    const values = Object.values(req.body);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    
    const result = await query(
      `INSERT INTO public.${table} (${keys.join(", ")}) VALUES (${placeholders}) RETURNING *`,
      values
    );
    return res.json(result[0]);
  } catch (err) {
    console.error(`Error POST ${table}:`, err);
    return res.status(500).json({ message: `Error creating ${table}` });
  }
});

router.put("/:table/:id", async (req: Request, res: Response) => {
  const { table, id } = req.params;
  if (!VALID_ACTIVITY_TABLES.includes(table)) return res.status(404).json({ message: "Table not found" });

  try {
    const keys = Object.keys(req.body);
    const values = Object.values(req.body);
    const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
    
    const result = await query(
      `UPDATE public.${table} SET ${setClause} WHERE id = $${keys.length + 1} RETURNING *`,
      [...values, id]
    );
    if (result.length === 0) return res.status(404).json({ message: "Not found" });
    return res.json(result[0]);
  } catch (err) {
    console.error(`Error PUT ${table}:`, err);
    return res.status(500).json({ message: `Error updating ${table}` });
  }
});

router.delete("/:table/:id", async (req: Request, res: Response) => {
  const { table, id } = req.params;
  if (!VALID_ACTIVITY_TABLES.includes(table)) return res.status(404).json({ message: "Table not found" });

  try {
    await query(`DELETE FROM public.${table} WHERE id = $1`, [id]);
    return res.json({ success: true });
  } catch (err) {
    console.error(`Error DELETE ${table}:`, err);
    return res.status(500).json({ message: `Error deleting ${table}` });
  }
});
