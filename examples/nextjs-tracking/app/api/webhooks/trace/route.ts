import { createWebhookHandler } from "../../../../lib/webhook";
import { saveEvent } from "../../../../lib/inbox";
import { isVerifiedInstant } from "@traceapi/timeline";
export const runtime="nodejs";
export async function POST(request:Request) {
  const previous=process.env.TRACE_WEBHOOK_PREVIOUS_SECRET;
  const expiry=process.env.TRACE_WEBHOOK_PREVIOUS_SECRET_UNTIL||"";
  const expiresAt=Date.parse(expiry);
  if(previous&&(!isVerifiedInstant(expiry)||expiresAt>Date.now()+24*60*60_000)) return Response.json({error:"rotation_not_configured"},{status:503,headers:{"Cache-Control":"no-store"}});
  return createWebhookHandler({secret:process.env.TRACE_WEBHOOK_SECRET,...(previous?{previousSecret:{value:previous,expiresAt}}:{}),store:saveEvent})(request);
}
