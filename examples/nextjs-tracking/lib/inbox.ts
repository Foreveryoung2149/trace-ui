import "server-only";
import { Pool } from "pg";
import type { InboxEvent } from "./webhook";
let pool:Pool|undefined;
export async function saveEvent(event:InboxEvent):Promise<boolean> {
  if (!process.env.DATABASE_URL) throw new Error("Webhook inbox requires DATABASE_URL");
  pool ||= new Pool({connectionString:process.env.DATABASE_URL,max:3,connectionTimeoutMillis:5000,query_timeout:5000});
  const result=await pool.query("INSERT INTO trace_webhook_inbox (event_id,event_type,payload) VALUES ($1,$2,$3::jsonb) ON CONFLICT (event_id) DO NOTHING RETURNING event_id",[event.event_id,event.event_type,JSON.stringify(event)]);
  return result.rowCount===1;
}
