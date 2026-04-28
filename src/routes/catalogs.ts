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
