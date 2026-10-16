export type StarterConfiguration = {tenantId:string; mode:"fixture"|"live"; origin:string; authSecret:string};
export const isLoopback = (hostname:string) => ["localhost","127.0.0.1","[::1]"].includes(hostname);

/** This configuration belongs to one merchant tenant, never to an incoming payload. */
export function starterConfiguration(env:NodeJS.ProcessEnv=process.env): StarterConfiguration {
  if (!["fixture","live"].includes(env.STARTER_DATA_MODE || "")) throw new Error("starter_data_mode_not_configured");
  const mode=env.STARTER_DATA_MODE as "fixture"|"live";
  const tenantId=env.STARTER_TENANT_ID;
  if (!tenantId || !/^[A-Za-z0-9_-]{1,128}$/.test(tenantId)) throw new Error("starter_tenant_not_configured");
  const authSecret=env.STARTER_AUTH_SECRET || "";
  if (authSecret.length<32) throw new Error("starter_auth_secret_not_configured");
  const url=new URL(env.STARTER_ORIGIN || "");
  if (url.username || url.password || url.search || url.hash || url.pathname!=="/") throw new Error("invalid_starter_origin");
  if (mode==="fixture" && !isLoopback(url.hostname)) throw new Error("fixtures_are_loopback_only");
  if (mode==="live" && url.protocol!=="https:") throw new Error("live_requires_https");
  if (mode==="live" && /fixture|example|change.me/i.test(authSecret)) throw new Error("replace_fixture_auth_secret");
  if (mode==="live" && (!env.TRACE_WEBHOOK_SECRET || env.TRACE_WEBHOOK_SECRET.length<24 || /fixture|example|change.me/i.test(env.TRACE_WEBHOOK_SECRET))) throw new Error("configure_live_webhook_secret");
  if (!["https:","http:"].includes(url.protocol)) throw new Error("invalid_starter_origin");
  return {tenantId,mode,origin:url.origin,authSecret};
}

export function sameOrigin(request:Request, origin:string):boolean {
  return request.headers.get("origin")===origin;
}
