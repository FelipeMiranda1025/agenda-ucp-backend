import pg from "pg";

const { Pool, types } = pg;

// BIGINT (oid 20) → number cuando sea seguro
types.setTypeParser(20, (val: string) => parseInt(val, 10));

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  application_name: "agenda-ucp-api",
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on("error", (err) => {
  console.error("[db] Error inesperado en cliente del pool:", err);
});

/** Ejecuta una query y devuelve todas las filas */
export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

/** Devuelve la primera fila o null */
export async function queryOne<T = any>(
  text: string,
  params?: any[]
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function pingDb(): Promise<boolean> {
  try {
    const result = await query<{ ok: number }>("SELECT 1 AS ok");
    return result[0]?.ok === 1;
  } catch (err) {
    console.error("[db] ping falló:", err);
    return false;
  }
}

export async function closeDb(): Promise<void> {
  await pool.end();
}
