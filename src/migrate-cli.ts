/**
 * CLI: node dist/migrate-cli.js  (npm run db:migrate)
 * Funciona en Render/Docker donde no existe scripts/run-migrations.js
 */
import "dotenv/config";
import { runMigrations } from "./migrate";
import { pool } from "./db";

runMigrations()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(err);
    await pool.end().catch(() => undefined);
    process.exit(1);
  });
