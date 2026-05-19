/**
 * Ejecuta migraciones SQL en orden (001, 003, 004, …).
 * Uso en Render Shell: node scripts/run-migrations.js
 * Requiere DATABASE_URL en el entorno.
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const migrationsDir = path.join(__dirname, "..", "migrations");

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL no está definida.");
    process.exit(1);
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.log("No hay archivos .sql en migrations/");
    return;
  }

  const client = new Client({
    connectionString,
    ssl: connectionString.includes("render.com")
      ? { rejectUnauthorized: false }
      : undefined,
  });

  await client.connect();
  console.log(`Conectado. Ejecutando ${files.length} migración(es)…`);

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    console.log(`→ ${file}`);
    try {
      await client.query(sql);
      console.log(`  ✓ OK`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("already exists") || msg.includes("duplicate")) {
        console.log(`  ⚠ Omitida (ya aplicada): ${msg.slice(0, 80)}`);
      } else {
        console.error(`  ✗ Error:`, msg);
        await client.end();
        process.exit(1);
      }
    }
  }

  await client.end();
  console.log("Migraciones finalizadas.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
