import { verifyWebhook } from "@traceapi/sdk";
export type InboxEvent = {event_id:string; event_type:string; created_at:string; [key:string]:unknown};
type Dependencies = {secret:string|undefined; previousSecret?:{value:string;expiresAt:number}; store:(event:InboxEvent)=>Promise<boolean>; now?:()=>number};
const reply = (status:number,body:object) => Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
export function createWebhookHandler({secret,previousSecret,store,now=Date.now}: Dependencies) {
  return async function POST(request:Request):Promise<Response> {
    if (!secret) return reply(503,{error:"webhook_not_configured"});
    const header = request.headers.get("Trace-Signature");
    if (!header || header.length > 4096) return reply(401,{error:"invalid_signature"});
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return reply(415,{error:"json_required"});
    const limit=512_000;
    if (Number(request.headers.get("content-length")) > limit) return reply(413,{error:"payload_too_large"});
    const reader=request.body?.getReader();
    if (!reader) return reply(400,{error:"empty_body"});
    const chunks:Uint8Array[]=[];let size=0;
    try {
      for (;;) {const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>limit){await reader.cancel();return reply(413,{error:"payload_too_large"});}chunks.push(chunk.value);}
    } catch {return reply(400,{error:"body_read_failed"});}
    const raw=Buffer.concat(chunks);
    const verified=verifyWebhook(raw,header,secret,{now:now()}) || Boolean(previousSecret && previousSecret.expiresAt>now() && verifyWebhook(raw,header,previousSecret.value,{now:now()}));
    if (!verified) return reply(401,{error:"invalid_signature"});
    let event:InboxEvent;
    try {
      const parsed:unknown=JSON.parse(raw.toString("utf8"));
      if (!parsed || typeof parsed!=="object" || Array.isArray(parsed)) return reply(400,{error:"invalid_event"});
      event=parsed as InboxEvent;
      if (typeof event.event_id!=="string" || !/^[A-Za-z0-9_-]{1,128}$/.test(event.event_id) || typeof event.event_type!=="string" || event.event_type.length>128 || typeof event.created_at!=="string" || !Number.isFinite(Date.parse(event.created_at))) return reply(400,{error:"invalid_event"});
      const headerId=request.headers.get("Trace-Event-Id");
      if (headerId && headerId!==event.event_id) return reply(400,{error:"event_id_mismatch"});
    } catch {return reply(400,{error:"invalid_json"});}
    try {
      // A successful response follows the durable insert. Duplicate delivery is safe.
      const inserted=await store(event);
      return reply(200,{received:true,duplicate:!inserted});
    } catch {return reply(503,{error:"inbox_unavailable"});}
  };
}
