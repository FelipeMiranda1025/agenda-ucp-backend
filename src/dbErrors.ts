/** PostgreSQL: undefined_column */
const PG_UNDEFINED_COLUMN = "42703";

export function isMissingPendingReviewerRolColumn(e: unknown): boolean {
  const err = e as { message?: string; code?: string };
  return (
    err?.code === PG_UNDEFINED_COLUMN ||
    String(err?.message ?? "").toLowerCase().includes("pending_reviewer_rol")
  );
}

export const MIGRATION_HINT_MESSAGE =
  "Falta migración de base de datos (pending_reviewer_rol). En Render: Shell del backend → npm run db:migrate, o redeploy con RUN_MIGRATIONS_ON_START=true.";
