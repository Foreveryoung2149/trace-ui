import { Pool } from "pg";

let pool: Pool | undefined;
/** Server/worker database only. Never import this module into a client component. */
export function starterDatabase(): Pool {
  if (!process.env.DATABASE_URL) throw new Error("starter_database_not_configured");
  return pool ||= new Pool({connectionString:process.env.DATABASE_URL, max:5, connectionTimeoutMillis:5000, query_timeout:10000});
}
