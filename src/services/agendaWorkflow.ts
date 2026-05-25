import { queryOne } from "../db";

interface UserRow {
  id: number;
  cc: string;
  id_rol: number;
  id_faculty: number | null;
}

/** Supervisor directo en user_hierarchy */
export async function getDirectSupervisor(
  userCc: string
): Promise<UserRow | null> {
  const user = await queryOne<UserRow>(
    `SELECT id, cc, id_rol, id_faculty FROM public.users WHERE cc=$1 AND id_state=1`,
    [userCc]
  );
  if (!user) return null;

  const link = await queryOne<{ supervisor_id: number }>(
    `SELECT supervisor_id FROM public.user_hierarchy WHERE user_id=$1`,
    [user.id]
  );
  if (!link) return null;

  return queryOne<UserRow>(
    `SELECT id, cc, id_rol, id_faculty FROM public.users WHERE id=$1 AND id_state=1`,
    [link.supervisor_id]
  );
}

/** Rol del revisor que debe actuar cuando el dueño envía o reenvía la agenda */
export async function getInitialPendingReviewerRol(
  ownerCc: string
): Promise<number | null> {
  const sup = await getDirectSupervisor(ownerCc);
  return sup?.id_rol ?? null;
}

/**
 * Tras aprobar: escalar al siguiente nivel o cerrar como approved.
 * DocentePlanta: director (2) -> decano (3) -> vicerrector (4) -> approved.
 * DirectorPrograma: decano (3) -> vicerrector (4) -> approved.
 * DecanoFacultad: vicerrector (4) -> approved.
 */
export function resolveStateAfterApprove(
  _ownerRolId: number,
  approverRolId: number
): { status: "pending" | "approved"; pending_reviewer_rol: number | null } {
  if (approverRolId === 4) {
    return { status: "approved", pending_reviewer_rol: null };
  }
  if (approverRolId === 3) {
    return { status: "pending", pending_reviewer_rol: 4 };
  }
  if (approverRolId === 2) {
    return { status: "pending", pending_reviewer_rol: 3 };
  }
  return { status: "approved", pending_reviewer_rol: null };
}

/** El aprobador actual debe coincidir con pending_reviewer_rol */
export function canUserReviewAgenda(
  userRolId: number,
  pendingReviewerRol: number | null
): boolean {
  if (pendingReviewerRol == null) return false;
  return userRolId === pendingReviewerRol;
}

/** Solo director (2) o decano (3) pueden editar una agenda ya aprobada. */
export function canSupervisorAmendApprovedAgenda(editorRolId: number): boolean {
  return editorRolId === 2 || editorRolId === 3;
}

/**
 * Tras modificar una agenda aprobada: reingresa al flujo normal desde el nivel siguiente.
 * Director (2) → decano (3); Decano (3) → vicerrector (4).
 */
export function resolveStateAfterSupervisorAmendment(
  editorRolId: number
): { status: "pending"; pending_reviewer_rol: number } | null {
  if (editorRolId === 2) {
    return { status: "pending", pending_reviewer_rol: 3 };
  }
  if (editorRolId === 3) {
    return { status: "pending", pending_reviewer_rol: 4 };
  }
  return null;
}

/**
 * Guardado por director/decano: agenda aprobada o corrección mientras espera el siguiente nivel.
 */
export function resolveSupervisorAmendmentSave(
  editorRolId: number,
  existing: { status: string; pending_reviewer_rol: number | null }
): { status: "pending"; pending_reviewer_rol: number } | null {
  if (existing.status === "approved") {
    return resolveStateAfterSupervisorAmendment(editorRolId);
  }
  if (
    existing.status === "pending" &&
    existing.pending_reviewer_rol === 3 &&
    editorRolId === 2
  ) {
    return { status: "pending", pending_reviewer_rol: 3 };
  }
  if (
    existing.status === "pending" &&
    existing.pending_reviewer_rol === 4 &&
    editorRolId === 3
  ) {
    return { status: "pending", pending_reviewer_rol: 4 };
  }
  return null;
}

/** Director: subordinado directo; Decano: misma facultad. */
export async function canSupervisorAmendAgendaForDocente(
  editorRolId: number,
  editorUserId: number,
  editorFacultyId: number | null,
  ownerCc: string
): Promise<boolean> {
  if (!canSupervisorAmendApprovedAgenda(editorRolId)) return false;

  const owner = await queryOne<{ id: number; id_faculty: number | null }>(
    `SELECT id, id_faculty FROM public.users WHERE cc=$1 AND id_state=1`,
    [ownerCc]
  );
  if (!owner) return false;

  if (editorRolId === 3) {
    return (
      editorFacultyId != null &&
      owner.id_faculty != null &&
      owner.id_faculty === editorFacultyId
    );
  }

  const link = await queryOne<{ supervisor_id: number }>(
    `SELECT supervisor_id FROM public.user_hierarchy WHERE user_id=$1`,
    [owner.id]
  );
  return link?.supervisor_id === editorUserId;
}
