import { Router, Response } from "express";
import { query, queryOne } from "../db";
import { requireAuth, AuthRequest } from "../middleware/auth";
import crypto from "crypto";

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

// POST /api/users — Crear usuario 
router.post("/", async (req: any, res: Response) => {
    try {
        const {
            cc, email, first_name, second_name, first_last_name,
            second_last_name, id_rol, id_state, password,
            id_faculty, id_professional_career
        } = req.body ?? {};

        // 🔐 HASHEAR PASSWORD
        const hashedPassword = crypto
            .createHash("sha256")
            .update(password)
            .digest("hex");

        const row = await queryOne(
            `INSERT INTO public.users (
                cc, email, first_name, second_name, first_last_name, 
                second_last_name, id_rol, id_state, password, 
                id_faculty, id_professional_career
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
            [
                cc, email, first_name, second_name ?? null, first_last_name,
                second_last_name ?? null, id_rol, id_state, hashedPassword,
                id_faculty ?? null, id_professional_career ?? null
            ]
        );

        return res.status(201).json(row);

    } catch (e: any) {
        if (e.code === '23505') {
            return res.status(409).json({ message: "La cédula (CC) o el email ya se encuentran registrados" });
        }
        console.error("Error en POST /users:", e);
        return res.status(500).json({ message: "Error interno al crear el usuario" });
    }
});

// PUT /api/users/:id — Actualizar usuario
router.put("/:id", async (req: any, res: Response) => {
    try {
        const {
            cc, email, first_name, second_name, first_last_name,
            second_last_name, id_rol, id_state, password,
            id_faculty, id_professional_career
        } = req.body ?? {};

        const updates: string[] = [
            "cc=$1", "email=$2", "first_name=$3", "second_name=$4",
            "first_last_name=$5", "second_last_name=$6", "id_rol=$7",
            "id_state=$8", "id_faculty=$9", "id_professional_career=$10"
        ];

        const params: any[] = [
            cc, email, first_name, second_name ?? null, first_last_name,
            second_last_name ?? null, id_rol, id_state,
            id_faculty ?? null, id_professional_career ?? null
        ];

        if (password) {
            const hashedPassword = crypto
                .createHash("sha256")
                .update(password)
                .digest("hex");

            updates.push(`password=$${params.length + 1}`);
            params.push(hashedPassword);
        }

        params.push(req.params.id);

        const row = await queryOne(
            `UPDATE public.users SET ${updates.join(", ")} WHERE id=$${params.length} RETURNING id`,
            params
        );

        if (!row) {
            return res.status(404).json({ message: "Usuario no encontrado para actualizar" });
        }

        return res.json(row);

    } catch (e: any) {
        console.error("Error en PUT /users/:id:", e);
        return res.status(500).json({ message: "Error interno al actualizar el usuario" });
    }
});

// DELETE /api/users/:id — Eliminar usuario
router.delete("/:id", async (req: any, res: Response) => {
    try {
        const { id } = req.params;

        // Primero eliminamos dependencias en la jerarquía para evitar errores de llave foránea
        await query(`DELETE FROM public.user_hierarchy WHERE user_id=$1 OR supervisor_id=$1`, [id]);

        const result = await query(`DELETE FROM public.users WHERE id=$1`, [id]);

        // Verificamos si realmente se eliminó algo (dependiendo de cómo retorne datos tu función query)
        return res.status(204).send();

    } catch (e: any) {
        console.error("Error en DELETE /users/:id:", e);
        return res.status(500).json({ message: "Error interno al eliminar el usuario" });
    }
});

export default router;
