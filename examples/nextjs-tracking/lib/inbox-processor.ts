import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { parseShipmentSnapshot } from "./projection.ts";
import type { InboxEvent } from "./webhook.ts";

export type Claim={tenantId:string;eventId:string;token:string};
const MAX_ATTEMPTS=6;
const supported=new Set(["shipment.updated","shipment.delivered","shipment.alert"]);
export async function storeInboxEvent(db:Pool,tenantId:string,event:InboxEvent):Promise<boolean> {
  const result=await db.query("INSERT INTO trace_webhook_inbox (tenant_id,event_id,event_type,payload) VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT (tenant_id,event_id) DO NOTHING RETURNING event_id",[tenantId,event.event_id,event.event_type,JSON.stringify(event)]);
  if(!result.rowCount) {
    const prior=await db.query("SELECT payload=$3::jsonb AS same FROM trace_webhook_inbox WHERE tenant_id=$1 AND event_id=$2",[tenantId,event.event_id,JSON.stringify(event)]);
    if(!prior.rows[0]?.same) throw new Error("event_id_payload_conflict");
  }
  return result.rowCount===1;
}

export async function claimInboxEvent(db:Pool,tenantId:string,{now,leaseMs=60_000}:{now?:Date;leaseMs?:number}={}):Promise<Claim|null> {
  if(leaseMs<1000||leaseMs>60_000) throw new Error("invalid_lease_duration");
  await db.query(`UPDATE trace_webhook_inbox SET status='dead',last_error='attempts_exhausted',lease_token=NULL,lease_until=NULL
    WHERE tenant_id=$1 AND processed_at IS NULL AND attempts>=$3 AND (status IN ('pending','retry') OR (status='processing' AND lease_until<=COALESCE($2::timestamptz,clock_timestamp())))`,[tenantId,now||null,MAX_ATTEMPTS]);
  const token=randomUUID();
  const result=await db.query(`WITH candidate AS (
    SELECT tenant_id,event_id FROM trace_webhook_inbox WHERE tenant_id=$1 AND processed_at IS NULL AND attempts<$5
      AND ((status IN ('pending','retry') AND next_attempt_at<=COALESCE($2::timestamptz,clock_timestamp())) OR (status='processing' AND lease_until<=COALESCE($2::timestamptz,clock_timestamp())))
    ORDER BY received_at,event_id FOR UPDATE SKIP LOCKED LIMIT 1)
    UPDATE trace_webhook_inbox i SET status='processing',attempts=attempts+1,lease_token=$3,lease_until=COALESCE($2::timestamptz,clock_timestamp())+($4::int * interval '1 millisecond')
    FROM candidate c WHERE i.tenant_id=c.tenant_id AND i.event_id=c.event_id RETURNING i.event_id`,[tenantId,now||null,token,leaseMs,MAX_ATTEMPTS]);
  return result.rows.length?{tenantId,eventId:result.rows[0].event_id,token}:null;
}

/** Both projection and acknowledgement commit together; expired workers cannot commit. */
export async function processInboxClaim(db:Pool,claim:Claim,mode:"fixture"|"live",{now,afterProjection}:{now?:Date;afterProjection?:()=>void}={}):Promise<"applied"|"obsolete"|"ignored"|"lost_lease"> {
  const connection=await db.connect();
  try {
    await connection.query("BEGIN");
    const found=await connection.query("SELECT payload FROM trace_webhook_inbox WHERE tenant_id=$1 AND event_id=$2 AND status='processing' AND lease_token=$3 AND lease_until>COALESCE($4::timestamptz,clock_timestamp()) FOR UPDATE",[claim.tenantId,claim.eventId,claim.token,now||null]);
    if(!found.rows.length){await connection.query("ROLLBACK");return "lost_lease";}
    const event=found.rows[0].payload as InboxEvent;
    let result:"applied"|"obsolete"|"ignored"="ignored";
    if(supported.has(event.event_type)) {
      if((event.test===true)!==(mode==="fixture")) throw new Error("simulation_mode_mismatch");
      if(event.shipment&&typeof event.shipment==="object"&&(!("revision" in event.shipment)||event.shipment_revision===undefined)) throw new Error("revision_reconciliation_required");
      const snapshot=parseShipmentSnapshot(event.shipment);
      if(event.shipment_revision!==snapshot.revision) throw new Error("revision_envelope_mismatch");
      const current=await connection.query(`SELECT s.order_id,s.revision,s.snapshot,o.simulated FROM trace_starter_shipments s
        JOIN trace_starter_orders o ON o.tenant_id=s.tenant_id AND o.id=s.order_id
        WHERE s.tenant_id=$1 AND s.shipment_id=$2 FOR UPDATE OF s`,[claim.tenantId,snapshot.id]);
      const row=current.rows[0];
      if(!row) throw new Error("shipment_not_registered");
      if(row.order_id!==snapshot.order_id || row.simulated!==(mode==="fixture")) throw new Error("shipment_ownership_mismatch");
      const previous=Number(row.revision);
      if(snapshot.revision===previous && JSON.stringify(row.snapshot)!==JSON.stringify(snapshot)) {
        // Compare as jsonb: key ordering never turns an exact replay into a conflict.
        const equal=await connection.query("SELECT $1::jsonb=$2::jsonb AS same",[JSON.stringify(row.snapshot),JSON.stringify(snapshot)]);
        if(!equal.rows[0].same) throw new Error("revision_payload_conflict");
      }
      if(snapshot.revision>previous) {
        await connection.query("UPDATE trace_starter_shipments SET revision=$3,snapshot=$4::jsonb,updated_at=COALESCE($5::timestamptz,clock_timestamp()) WHERE tenant_id=$1 AND shipment_id=$2",[claim.tenantId,snapshot.id,snapshot.revision,JSON.stringify(snapshot),now||null]);
        result="applied";
        afterProjection?.();
      } else result="obsolete";
    }
    const finished=await connection.query("UPDATE trace_webhook_inbox SET status='processed',result=$4,processed_at=COALESCE($5::timestamptz,clock_timestamp()),lease_token=NULL,lease_until=NULL,last_error=NULL WHERE tenant_id=$1 AND event_id=$2 AND lease_token=$3 AND lease_until>COALESCE($5::timestamptz,clock_timestamp()) RETURNING event_id",[claim.tenantId,claim.eventId,claim.token,result,now||null]);
    if(finished.rowCount!==1) throw new Error("lease_lost_before_commit");
    await connection.query("COMMIT");
    return result;
  } catch(error) {
    await connection.query("ROLLBACK");
    throw error;
  } finally {connection.release();}
}

export async function failInboxClaim(db:Pool,claim:Claim,error:unknown,now=new Date()):Promise<void> {
  const code=error instanceof Error&&/^[a-z_]{1,80}$/.test(error.message)?error.message:"processor_failed";
  await db.query(`UPDATE trace_webhook_inbox SET status=CASE WHEN $4='revision_reconciliation_required' THEN 'needs_reconciliation' WHEN attempts>=$5 OR $4=ANY($6::text[]) THEN 'dead' ELSE 'retry' END,
    next_attempt_at=$7::timestamptz+(LEAST(900,POWER(2,attempts))::text||' seconds')::interval,last_error=$4,lease_token=NULL,lease_until=NULL
    WHERE tenant_id=$1 AND event_id=$2 AND status='processing' AND lease_token=$3`,[claim.tenantId,claim.eventId,claim.token,code,MAX_ATTEMPTS,
    ["simulation_mode_mismatch","invalid_shipment_snapshot","invalid_tracking_snapshot","invalid_tracking_event","revision_envelope_mismatch","shipment_ownership_mismatch","revision_payload_conflict"],now]);
}

export async function processNextInboxEvent(db:Pool,tenantId:string,mode:"fixture"|"live",options:{now?:Date;leaseMs?:number}={}) {
  const claim=await claimInboxEvent(db,tenantId,options);
  if(!claim) return null;
  try {return await processInboxClaim(db,claim,mode,options);} catch(error){await failInboxClaim(db,claim,error,options.now);return "retry_or_dead" as const;}
}
