import { Router, Response } from "express";
import { query, queryOne } from "../db";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", async (_req: AuthRequest, res: Response) => {
  try {
    const rows = await query(
      `SELECT id, semester_label, archived_by, archived_at,
              schedules, agendas, agenda_comments, agenda_views
         FROM public.semester_archives
        ORDER BY archived_at DESC`
    );
    return res.json(rows);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Error obteniendo archivos de semestre" });
  }
});

function bumpSemesterLabel(label: string): string {
  const m = label.match(/^(\d{4})-(\d+)$/);
  if (!m) return `${label}-archivado`;
  const year = Number(m[1]);
  const term = Number(m[2]);
  if (term >= 2) return `${year + 1}-1`;
  return `${year}-${term + 1}`;
}

router.post("/archive-and-reset", async (req: AuthRequest, res: Response) => {
  const { archived_by } = req.body ?? {};
  try {
    const labelRow = await queryOne<{ value: { label?: string } | null }>(
      `SELECT value FROM public.system_settings WHERE key='semester_label'`
    );
    const currentLabel = labelRow?.value?.label ?? "2026-1";

    const agendaViews = await query(`SELECT * FROM public.agenda_views`);
    const agendaComments = await query(`SELECT * FROM public.agenda_comments`);
    const agendas = await query(`SELECT * FROM public.agendas`).catch(() => []);

    const archive = await queryOne<{ id: string }>(
      `INSERT INTO public.semester_archives
         (semester_label, archived_by, schedules, agendas, agenda_comments, agenda_views)
       VALUES ($1, $2, '[]'::jsonb, $3::jsonb, $4::jsonb, $5::jsonb)
       RETURNING id`,
      [
        currentLabel,
        archived_by ?? req.user?.cc ?? null,
        JSON.stringify(agendas),
        JSON.stringify(agendaComments),
        JSON.stringify(agendaViews),
      ]
    );

    await query(`DELETE FROM public.agenda_comments`);
    await query(`DELETE FROM public.agenda_views`);
    await query(`DELETE FROM public.agendas`).catch(() => {});

    const nextLabel = bumpSemesterLabel(currentLabel);
    await query(
      `INSERT INTO public.system_settings (key, value, updated_by, updated_at)
       VALUES ('semester_label', $1::jsonb, $2, now())
       ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value,
             updated_by = EXCLUDED.updated_by,
             updated_at = now()`,
      [JSON.stringify({ label: nextLabel }), archived_by ?? req.user?.cc ?? null]
    );

    return res.json({ archivedLabel: currentLabel, nextLabel, archiveId: archive?.id });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Error archivando semestre", error: (e as Error).message });
  }
});

export default router;
