import { Pool } from "pg";

export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function healthcheck() {
  const r = await db.query("SELECT 1 as ok");
  return r.rows[0]?.ok === 1;
}
