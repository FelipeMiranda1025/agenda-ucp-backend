// src/services/lineamientosConfigService.ts
import { pool, query } from "../db";
import { LineamientosData } from "./iaLineamientosParser";

export async function saveLineamientosConfig(config: LineamientosData): Promise<void> {
  // Crear tablas si no existen
  await pool.query(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS lineamientos_history (
      id SERIAL PRIMARY KEY,
      version TEXT,
      config JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Guardar versión activa
  await pool.query(
    `INSERT INTO system_settings (key, value, updated_at)
     VALUES ('lineamientos_activos', $1, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [JSON.stringify(config)]
  );

  // Guardar histórico
  await pool.query(
    `INSERT INTO lineamientos_history (version, config) VALUES ($1, $2)`,
    [config.version, JSON.stringify(config)]
  );
}

export async function getActiveLineamientos(): Promise<LineamientosData | null> {
  const rows = await query<{ value: LineamientosData }>(
    `SELECT value FROM system_settings WHERE key = 'lineamientos_activos'`
  );
  return rows[0]?.value ?? null;
}