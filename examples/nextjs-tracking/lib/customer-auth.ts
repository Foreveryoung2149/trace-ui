import { createHash, createHmac, randomBytes, randomUUID, scrypt as derive, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Pool } from "pg";
import type { StarterConfiguration } from "./configuration.ts";

const scrypt=promisify(derive);
export const SESSION_COOKIE="trace_order_session";
export const SESSION_SECONDS=8*60*60;
const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
export const normalizeHandle=(handle:string)=>handle.trim().toLowerCase();
export type CustomerIdentity={tenantId:string;customerId:string};

export async function provisionCustomer(db:Pool,tenantId:string,handle:string,password:string,id=randomUUID()):Promise<string> {
  const normalized=normalizeHandle(handle);
  if (!/^[a-z0-9][a-z0-9_.@+-]{2,127}$/.test(normalized) || password.length<24 || password.length>256) throw new Error("invalid_customer_credentials");
  const salt=randomBytes(16).toString("hex");
  const hash=(await scrypt(password,salt,64) as Buffer).toString("hex");
  const result=await db.query("INSERT INTO trace_starter_customers (tenant_id,id,handle,password_salt,password_hash) VALUES ($1,$2,$3,$4,$5) RETURNING id",[tenantId,id,normalized,salt,hash]);
  return result.rows[0].id;
}

/** Bounded shared-DB throttle; deploy your normal identity/edge abuse controls as well. */
export async function signInCustomer(db:Pool,config:StarterConfiguration,handle:string,password:string,now=new Date()):Promise<{token:string}|{error:"invalid_credentials"|"rate_limited"}> {
  const normalized=normalizeHandle(handle);
  if (normalized.length>128 || password.length>256) return {error:"invalid_credentials"};
  const keys=[`${config.tenantId}:all`,`${config.tenantId}:${normalized}`].map(value=>createHmac("sha256",config.authSecret).update(value).digest("hex"));
  const limits=[100,10];
  for(let index=0;index<keys.length;index++) {
    const result=await db.query(`INSERT INTO trace_starter_auth_attempts (key,attempts,window_until) VALUES ($1,1,$2)
      ON CONFLICT (key) DO UPDATE SET attempts=CASE WHEN trace_starter_auth_attempts.window_until<=$3 THEN 1 ELSE trace_starter_auth_attempts.attempts+1 END,
      window_until=CASE WHEN trace_starter_auth_attempts.window_until<=$3 THEN $2 ELSE trace_starter_auth_attempts.window_until END RETURNING attempts`,[keys[index],new Date(now.getTime()+15*60_000),now]);
    if(result.rows[0].attempts>limits[index]) return {error:"rate_limited"};
  }
  const found=await db.query("SELECT id,password_salt,password_hash FROM trace_starter_customers WHERE tenant_id=$1 AND handle=$2",[config.tenantId,normalized]);
  const customer=found.rows[0];
  // Unknown customers perform the same expensive password derivation.
  const salt=customer?.password_salt || "00000000000000000000000000000000";
  const actual=await scrypt(password,salt,64) as Buffer;
  const expected=Buffer.from(customer?.password_hash || "00".repeat(64),"hex");
  if(!timingSafeEqual(actual,expected) || !customer) return {error:"invalid_credentials"};
  const token=randomBytes(32).toString("hex");
  await db.query("INSERT INTO trace_starter_sessions (token_hash,tenant_id,customer_id,expires_at) VALUES ($1,$2,$3,$4)",[digest(token),config.tenantId,customer.id,new Date(now.getTime()+SESSION_SECONDS*1000)]);
  return {token};
}

export async function customerSession(db:Pool,tenantId:string,token:string|undefined,now=new Date()):Promise<CustomerIdentity|null> {
  if(!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const result=await db.query("SELECT customer_id FROM trace_starter_sessions WHERE token_hash=$1 AND tenant_id=$2 AND expires_at>$3",[digest(token),tenantId,now]);
  return result.rows.length ? {tenantId,customerId:result.rows[0].customer_id} : null;
}
export async function revokeSession(db:Pool,tenantId:string,token:string|undefined) {
  if(token && /^[a-f0-9]{64}$/.test(token)) await db.query("DELETE FROM trace_starter_sessions WHERE token_hash=$1 AND tenant_id=$2",[digest(token),tenantId]);
}
