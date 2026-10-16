import "server-only";
import type { InboxEvent } from "./webhook";
import { starterDatabase } from "./database";
import { starterConfiguration } from "./configuration";
import { storeInboxEvent } from "./inbox-processor";
export async function saveEvent(event:InboxEvent):Promise<boolean> {
  const config=starterConfiguration();
  return storeInboxEvent(starterDatabase(),config.tenantId,event);
}
