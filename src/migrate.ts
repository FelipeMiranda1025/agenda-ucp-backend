import fs from "fs";
import path from "path";
import { pool } from "./db";

const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");

/**
 * Ejecuta migraciones SQL en orden. Idempotente (IF NOT EXISTS en los scripts).
 * Se invoca al arrancar en producción para que Render no requiera Shell manual.
 */
export async function runMigrations(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.warn("[migrate] DATABASE_URL no definida; se omiten migraciones.");
    return;
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql") && !f.toLowerCase().includes("purge"))
    .sort();

  if (files.length === 0) return;

  const client = await pool.connect();
  console.log(`[migrate] Ejecutando ${files.length} archivo(s)…`);

  try {
    for (const file of files) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
      try {
        await client.query(sql);
        console.log(`[migrate] ✓ ${file}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("already exists") || msg.includes("duplicate")) {
          console.log(`[migrate] ⚠ ${file} (ya aplicada)`);
        } else {
          throw err;
        }
      }
    }
  } finally {
    client.release();
  }

  console.log("[migrate] Listo.");
}
