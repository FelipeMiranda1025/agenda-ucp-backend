import { Router, Response } from "express";
import { query, queryOne } from "../db";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const { ids, rols, id_state, id_faculty, id_professional_career } = req.query;
    const where: string[] = [];
    const params: any[] = [];

    const pushIn = (col: string, raw: unknown) => {
      const list = String(raw)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (list.length === 0) return;
      const placeholders = list.map((_, i) => `$${params.length + i + 1}`).join(",");
      params.push(...list.map((v) => (Number.isFinite(Number(v)) ? Number(v) : v)));
      where.push(`${col} IN (${placeholders})`);
    };

    if (ids) pushIn("id", ids);
    if (rols) pushIn("id_rol", rols);
    if (id_state) {
      params.push(Number(id_state));
      where.push(`id_state=$${params.length}`);
    }
    if (id_faculty) {
      params.push(Number(id_faculty));
      where.push(`id_faculty=$${params.length}`);
    }
    if (id_professional_career) {
      params.push(Number(id_professional_career));
      where.push(`id_professional_career=$${params.length}`);
    }

    const sql = `
      SELECT id, cc, email, first_name, second_name, first_last_name,
             second_last_name, id_rol, id_state, id_faculty, id_professional_career
        FROM public.users
        ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY id`;
    return res.json(await query(sql, params));
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Error obteniendo usuarios" });
  }
});

router.get("/by-cc/:cc", async (req: AuthRequest, res: Response) => {
  try {
    const user = await queryOne(
      `SELECT id, cc, email, first_name, second_name, first_last_name,
              second_last_name, id_rol, id_state, id_faculty, id_professional_career
         FROM public.users WHERE cc = $1`,
      [req.params.cc]
    );
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    return res.json(user);
  } catch {
    return res.status(500).json({ message: "Error" });
  }
});

export default router;
