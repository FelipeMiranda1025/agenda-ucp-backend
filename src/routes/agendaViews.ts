import { Router, Response } from "express";
import { query, queryOne } from "../db";
import { requireAuth, AuthRequest } from "../middleware/auth";
import {
  getInitialPendingReviewerRol,
  resolveStateAfterApprove,
  canUserReviewAgenda,
} from "../services/agendaWorkflow";
import { isMissingPendingReviewerRolColumn, MIGRATION_HINT_MESSAGE } from "../dbErrors";

const router = Router();
router.use(requireAuth);

/**
 * DELETE /api/agenda-views/admin/purge-all
 * Elimina todas las agendas enviadas/aprobadas (solo Vicerrector o Soporte).
 */
router.delete("/admin/purge-all", async (req: AuthRequest, res: Response) => {
  const rolId = req.user?.rolId;
  if (rolId !== 4 && rolId !== 5) {
    return res.status(403).json({ message: "No autorizado" });
  }
  try {
    await query(`DELETE FROM public.agenda_comments`);
    await query(`DELETE FROM public.agendas`);
    const result = await query(`DELETE FROM public.agenda_views RETURNING id`);
    return res.json({
      message: "Todas las agendas eliminadas",
      deleted_views: result.length,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Error eliminando agendas" });
  }
});

/**
 * TEMP QA — Elimina todas las agenda_views del usuario autenticado (y comentarios ligados).
 */
router.delete("/me", async (req: AuthRequest, res: Response) => {
  const cc = req.user?.cc;
  if (!cc) {
    return res.status(400).json({ message: "Sin cédula en sesión" });
  }
  try {
    const rows = await query<{ id: string }>(
      `SELECT id FROM public.agenda_views WHERE user_cc=$1`,
      [cc]
    );
    for (const row of rows) {
      await query(`DELETE FROM public.agenda_comments WHERE agenda_id=$1`, [row.id]);
    }
    await query(`DELETE FROM public.agenda_views WHERE user_cc=$1`, [cc]);
    return res.status(204).send();
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Error eliminando agenda", error: (e as any).message });
  }
});

router.get("/", async (req: AuthRequest, res: Response) => {
  const { user_cc, user_ccs, status, pending_for_supervisor_cc, approved_for_supervisor_cc } =
    req.query;
  res.setHeader("Cache-Control", "no-store");
  try {
    let sql = `SELECT av.*,
      trim(concat_ws(' ', owner.first_name, owner.second_name, owner.first_last_name)) AS owner_name
      FROM public.agenda_views av
      LEFT JOIN public.users owner ON owner.cc = av.user_cc
      WHERE 1=1`;
    const params: any[] = [];

    if (user_cc) {
      params.push(user_cc);
      sql += ` AND av.user_cc=$${params.length}`;
    }
    if (user_ccs) {
      const list = String(user_ccs)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (list.length > 0) {
        const placeholders = list.map((_, i) => `$${params.length + i + 1}`).join(",");
        params.push(...list);
        sql += ` AND av.user_cc IN (${placeholders})`;
      }
    }
    if (status) {
      params.push(status);
      sql += ` AND av.status=$${params.length}`;
    }

    // Agendas pendientes de revisión para el supervisor logueado (por rol en el flujo)
    if (pending_for_supervisor_cc) {
      const sup = await queryOne<{ id: number; id_rol: number; id_faculty: number | null }>(
        `SELECT id, id_rol, id_faculty FROM public.users WHERE cc=$1 AND id_state=1`,
        [String(pending_for_supervisor_cc)]
      );
      if (!sup) {
        return res.json([]);
      }

      params.push("pending", sup.id_rol);
      sql += ` AND av.status=$${params.length - 1} AND av.pending_reviewer_rol=$${params.length}`;

      if (sup.id_rol === 2) {
        // Director: solo subordinados directos en jerarquía
        params.push(sup.id);
        sql += ` AND av.user_cc IN (
          SELECT u.cc FROM public.users u
          INNER JOIN public.user_hierarchy h ON h.user_id = u.id
          WHERE h.supervisor_id = $${params.length} AND u.id_state = 1
        )`;
      } else if (sup.id_rol === 3 && sup.id_faculty != null) {
        // Decano: agendas de usuarios de su facultad en su nivel
        params.push(sup.id_faculty);
        sql += ` AND av.user_cc IN (
          SELECT cc FROM public.users WHERE id_faculty=$${params.length} AND id_state=1
        )`;
      }
      // Vicerrector (4): todas las agendas pendientes en su nivel
    }

    // Agendas aprobadas visibles en historial (supervisores y docente)
    if (approved_for_supervisor_cc) {
      const sup = await queryOne<{ id: number; cc: string; id_rol: number; id_faculty: number | null }>(
        `SELECT id, cc, id_rol, id_faculty FROM public.users WHERE cc=$1 AND id_state=1`,
        [String(approved_for_supervisor_cc)]
      );
      if (!sup) {
        return res.json([]);
      }

      params.push("approved");
      sql += ` AND av.status=$${params.length}`;

      if (sup.id_rol === 1) {
        params.push(sup.cc);
        sql += ` AND av.user_cc=$${params.length}`;
      } else if (sup.id_rol === 2) {
        params.push(sup.id);
        sql += ` AND av.user_cc IN (
          SELECT u.cc FROM public.users u
          INNER JOIN public.user_hierarchy h ON h.user_id = u.id
          WHERE h.supervisor_id = $${params.length} AND u.id_state = 1
        )`;
      } else if (sup.id_rol === 3 && sup.id_faculty != null) {
        params.push(sup.id_faculty);
        sql += ` AND av.user_cc IN (
          SELECT cc FROM public.users WHERE id_faculty=$${params.length} AND id_state=1
        )`;
      } else if (sup.id_rol === 4) {
        sql += ` AND av.user_cc IN (
          SELECT cc FROM public.users WHERE id_rol IN (1, 2, 3) AND id_state = 1
        )`;
      }
    }

    sql += ` ORDER BY av.updated_at DESC, av.created_at DESC`;
    return res.json(await query(sql, params));
  } catch (e) {
    const err = e as { message?: string };
    console.error("[agenda-views:list]", e);
    return res.status(500).json({
      message: isMissingPendingReviewerRolColumn(e)
        ? MIGRATION_HINT_MESSAGE
        : "Error obteniendo agenda views",
      error: err?.message,
    });
  }
});

router.post("/", async (req: AuthRequest, res: Response) => {
  const { user_cc, records, status } = req.body ?? {};
  const cc = user_cc != null ? String(user_cc).trim() : "";
  if (!cc) {
    return res.status(400).json({ message: "user_cc es requerido" });
  }
  const payload = Array.isArray(records) ? records : [];
  const requestedStatus =
    typeof status === "string" && status.trim() ? status.trim() : "pending";

  let recordsJson: string;
  try {
    recordsJson = JSON.stringify(payload);
  } catch (serializeErr: any) {
    return res.status(400).json({
      message: "Los registros no se pudieron convertir a JSON",
      error: serializeErr?.message ?? String(serializeErr),
    });
  }

  try {
    const existing = await queryOne<{
      id: string;
      status: string;
    }>(
      `SELECT id, status FROM public.agenda_views
        WHERE user_cc=$1 ORDER BY created_at DESC LIMIT 1`,
      [cc]
    );

    const pendingReviewerRol = await getInitialPendingReviewerRol(cc);

    // Reenvío tras retorno o primer envío: pending + revisor según jerarquía
    const nextStatus =
      requestedStatus === "pending" || existing?.status === "returned"
        ? "pending"
        : requestedStatus;

    let row;
    if (existing) {
      row = await queryOne(
        `UPDATE public.agenda_views
            SET records=$1::jsonb,
                status=$2,
                pending_reviewer_rol=$3,
                reviewer_cc=CASE WHEN $2 = 'pending' THEN NULL ELSE reviewer_cc END,
                reviewer_comment=CASE WHEN $2 = 'pending' THEN NULL ELSE reviewer_comment END,
                reviewed_at=CASE WHEN $2 = 'pending' THEN NULL ELSE reviewed_at END,
                updated_at=now()
          WHERE id=$4 RETURNING *`,
        [
          recordsJson,
          nextStatus,
          nextStatus === "pending" ? pendingReviewerRol : null,
          existing.id,
        ]
      );
    } else {
      row = await queryOne(
        `INSERT INTO public.agenda_views
           (user_cc, records, status, pending_reviewer_rol)
         VALUES ($1,$2::jsonb,$3,$4) RETURNING *`,
        [cc, recordsJson, nextStatus, pendingReviewerRol]
      );
    }
    return res.status(201).json(row);
  } catch (e) {
    console.error("[agenda-views:post]", e);
    const err = e as { message?: string };
    return res.status(500).json({
      message: isMissingPendingReviewerRolColumn(e)
        ? MIGRATION_HINT_MESSAGE
        : "Error guardando agenda view",
      error: err?.message,
    });
  }
});

router.put("/:id", async (req: AuthRequest, res: Response) => {
  const { status, reviewer_cc, reviewer_comment, records } = req.body ?? {};
  try {
    const current = await queryOne<{
      id: string;
      user_cc: string;
      status: string;
      pending_reviewer_rol: number | null;
    }>(`SELECT id, user_cc, status, pending_reviewer_rol FROM public.agenda_views WHERE id=$1`, [
      req.params.id,
    ]);
    if (!current) return res.status(404).json({ message: "No encontrado" });

    const reviewer = reviewer_cc
      ? await queryOne<{ id_rol: number }>(
          `SELECT id_rol FROM public.users WHERE cc=$1 AND id_state=1`,
          [String(reviewer_cc)]
        )
      : null;

    const owner = await queryOne<{ id_rol: number }>(
      `SELECT id_rol FROM public.users WHERE cc=$1 AND id_state=1`,
      [current.user_cc]
    );

    const recordsJson =
      Array.isArray(records) ? JSON.stringify(records) : null;

    if (status === "returned") {
      if (
        reviewer &&
        !canUserReviewAgenda(reviewer.id_rol, current.pending_reviewer_rol)
      ) {
        return res.status(403).json({ message: "No autorizado para retornar esta agenda" });
      }
      const row = await queryOne(
        `UPDATE public.agenda_views
            SET status='returned',
                reviewer_cc=$1,
                reviewer_comment=$2,
                reviewed_at=now(),
                pending_reviewer_rol=NULL,
                records=COALESCE($4::jsonb, records),
                updated_at=now()
          WHERE id=$3 RETURNING *`,
        [
          reviewer_cc,
          reviewer_comment ?? null,
          req.params.id,
          recordsJson,
        ]
      );
      return res.json(row);
    }

    if (status === "approved") {
      if (!reviewer || !owner) {
        return res.status(400).json({ message: "Datos de revisor o dueño inválidos" });
      }
      if (!canUserReviewAgenda(reviewer.id_rol, current.pending_reviewer_rol)) {
        return res.status(403).json({ message: "No autorizado para aprobar esta agenda en este nivel" });
      }

      const next = resolveStateAfterApprove(owner.id_rol, reviewer.id_rol);

      const row = await queryOne(
        `UPDATE public.agenda_views
            SET status=$1,
                pending_reviewer_rol=$2,
                reviewer_cc=$3,
                reviewer_comment=$4,
                reviewed_at=now(),
                records=COALESCE($6::jsonb, records),
                updated_at=now()
          WHERE id=$5 RETURNING *`,
        [
          next.status,
          next.pending_reviewer_rol,
          reviewer_cc,
          reviewer_comment ?? null,
          req.params.id,
          recordsJson,
        ]
      );
      return res.json(row);
    }

    const row = await queryOne(
      `UPDATE public.agenda_views
          SET status=$1, reviewer_cc=$2, reviewer_comment=$3,
              reviewed_at=now(), updated_at=now()
        WHERE id=$4 RETURNING *`,
      [status, reviewer_cc, reviewer_comment ?? null, req.params.id]
    );
    return res.json(row);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Error actualizando agenda view", error: (e as any).message });
  }
});

export default router;
