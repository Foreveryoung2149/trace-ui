import { createWebhookHandler } from "../../../../lib/webhook";
import { saveEvent } from "../../../../lib/inbox";
export const runtime="nodejs";
export async function POST(request:Request) {return createWebhookHandler({secret:process.env.TRACE_WEBHOOK_SECRET,store:saveEvent})(request);}
