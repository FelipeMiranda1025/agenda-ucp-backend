import { query, queryOne } from "../db";
import { getDirectSupervisor } from "./agendaWorkflow";
import {
  sendAgendaPendingReviewEmail,
  sendAgendaReturnedEmail,
} from "./email";

interface UserContact {
  id: number;
  email: string;
  first_name: string | null;
}

function fullName(row: {
  first_name: string | null;
  second_name?: string | null;
  first_last_name?: string | null;
  second_last_name?: string | null;
}): string {
  return [
    row.first_name,
    row.second_name,
    row.first_last_name,
    row.second_last_name,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
}

export function shouldNotifyPendingReview(
  before: { status: string; pending_reviewer_rol: number | null } | null,
  after: { status: string; pending_reviewer_rol: number | null }
): boolean {
  if (after.status !== "pending" || after.pending_reviewer_rol == null) return false;
  if (!before) return true;
  if (before.status !== "pending") return true;
  return before.pending_reviewer_rol !== after.pending_reviewer_rol;
}

async function countPendingForDirector(supervisorId: number): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM public.agenda_views av
       INNER JOIN public.users u ON u.cc = av.user_cc AND u.id_state = 1
       INNER JOIN public.user_hierarchy h ON h.user_id = u.id
      WHERE av.status = 'pending'
        AND av.pending_reviewer_rol = 2
        AND h.supervisor_id = $1`,
    [supervisorId]
  );
  return Number(row?.count ?? 0);
}

async function countPendingForDecano(facultyId: number): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM public.agenda_views av
       INNER JOIN public.users u ON u.cc = av.user_cc AND u.id_state = 1
      WHERE av.status = 'pending'
        AND av.pending_reviewer_rol = 3
        AND u.id_faculty = $1`,
    [facultyId]
  );
  return Number(row?.count ?? 0);
}

async function countPendingForVicerrector(): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM public.agenda_views av
      WHERE av.status = 'pending'
        AND av.pending_reviewer_rol = 4`
  );
  return Number(row?.count ?? 0);
}

async function getReviewersForPendingRol(
  pendingReviewerRol: number,
  ownerCc: string
): Promise<UserContact[]> {
  const owner = await queryOne<{ id: number; id_faculty: number | null }>(
    `SELECT id, id_faculty FROM public.users WHERE cc=$1 AND id_state=1`,
    [ownerCc]
  );
  if (!owner) return [];

  if (pendingReviewerRol === 2) {
    const sup = await getDirectSupervisor(ownerCc);
    if (!sup) return [];
    const row = await queryOne<UserContact>(
      `SELECT id, email, first_name FROM public.users
        WHERE id=$1 AND id_state=1 AND email IS NOT NULL AND TRIM(email) <> ''`,
      [sup.id]
    );
    return row ? [row] : [];
  }

  if (pendingReviewerRol === 3 && owner.id_faculty != null) {
    return query<UserContact>(
      `SELECT id, email, first_name FROM public.users
        WHERE id_rol=3 AND id_faculty=$1 AND id_state=1
          AND email IS NOT NULL AND TRIM(email) <> ''`,
      [owner.id_faculty]
    );
  }

  if (pendingReviewerRol === 4) {
    return query<UserContact>(
      `SELECT id, email, first_name FROM public.users
        WHERE id_rol=4 AND id_state=1
          AND email IS NOT NULL AND TRIM(email) <> ''`
    );
  }

  return [];
}

/** Correo al docente cuando su agenda es retornada. */
export async function notifyAgendaReturnedToOwner(
  ownerCc: string,
  reviewerCc: string | null,
  reviewerComment: string | null
): Promise<void> {
  const owner = await queryOne<{
    email: string;
    first_name: string | null;
    second_name: string | null;
    first_last_name: string | null;
    second_last_name: string | null;
  }>(
    `SELECT email, first_name, second_name, first_last_name, second_last_name
       FROM public.users WHERE cc=$1 AND id_state=1`,
    [ownerCc]
  );
  if (!owner?.email?.trim()) {
    console.warn(
      "[agenda-email] Retorno sin correo para docente",
      ownerCc
    );
    return;
  }

  let reviewerName = "Su supervisor";
  if (reviewerCc) {
    const rev = await queryOne<{
      first_name: string | null;
      second_name: string | null;
      first_last_name: string | null;
      second_last_name: string | null;
    }>(
      `SELECT first_name, second_name, first_last_name, second_last_name
         FROM public.users WHERE cc=$1 AND id_state=1`,
      [reviewerCc]
    );
    if (rev) reviewerName = fullName(rev) || reviewerName;
  }

  await sendAgendaReturnedEmail(
    owner.email.trim(),
    fullName(owner) || owner.first_name || "Docente",
    reviewerName,
    reviewerComment?.trim() || ""
  );
}

/** Correo a director, decano o vicerrectoría con agendas pendientes de revisión. */
export async function notifyReviewersOfPendingAgenda(
  ownerCc: string,
  pendingReviewerRol: number
): Promise<void> {
  const owner = await queryOne<{
    first_name: string | null;
    second_name: string | null;
    first_last_name: string | null;
    second_last_name: string | null;
    id_faculty: number | null;
  }>(
    `SELECT first_name, second_name, first_last_name, second_last_name, id_faculty
       FROM public.users WHERE cc=$1 AND id_state=1`,
    [ownerCc]
  );
  const docenteName = owner ? fullName(owner) || ownerCc : ownerCc;
  const reviewers = await getReviewersForPendingRol(pendingReviewerRol, ownerCc);

  if (reviewers.length === 0) {
    console.warn(
      "[agenda-email] Sin destinatarios para pending_reviewer_rol",
      pendingReviewerRol,
      "docente",
      ownerCc
    );
    return;
  }

  for (const reviewer of reviewers) {
    let pendingCount = 1;
    if (pendingReviewerRol === 2) {
      pendingCount = await countPendingForDirector(reviewer.id);
    } else if (pendingReviewerRol === 3 && owner?.id_faculty != null) {
      pendingCount = await countPendingForDecano(owner.id_faculty);
    } else if (pendingReviewerRol === 4) {
      pendingCount = await countPendingForVicerrector();
    }

    await sendAgendaPendingReviewEmail(
      reviewer.email.trim(),
      reviewer.first_name?.trim() || "Revisor",
      pendingReviewerRol,
      docenteName,
      pendingCount
    );
  }
}
