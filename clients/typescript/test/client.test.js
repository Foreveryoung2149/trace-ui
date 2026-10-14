import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { Trace, TraceError, verifyWebhook } from "../dist/index.js";
test("idempotent creation retries Retry-After with stable key and preserves unknown-timezone data", async () => {
  let calls = 0;
  const client = new Trace("fixture-key", { fetch: async (_url, options) => {
    calls++; assert.equal(options.headers["Idempotency-Key"], "order-1"); assert.equal(options.redirect, "error");
    return calls === 1 ? Response.json({ error: { code: "busy" } }, { status: 503, headers: { "Retry-After": "0" } })
      : Response.json({ shipment: { tracking: { events: [{ timestamp: null, timestamp_timezone: "unknown" }] } }, replayed: true });
  } });
  const result = await client.createShipment({ tracking_number: "FIXTURE123" }, "order-1");
  assert.equal(calls, 2); assert.equal(result.shipment.tracking.events[0].timestamp, null);
});
test("replay never silently repeats, even through the generic request helper", async () => {
  let calls = 0; const client = new Trace("fixture-key", { fetch: async () => { calls++; return Response.json({ error: { code: "busy", message: "Busy" } }, { status: 503, headers: { "Retry-After": "0" } }); } });
  await assert.rejects(client.request("POST", "/v1/webhooks/fixture/deliveries/fixture/replay", { reason: "fixture" }, { idempotencyKey: "not-supported" }), TraceError); assert.equal(calls, 1);
});
test("mixed batch failures preserve successful rows and structured errors", async () => {
  const results = [{ tracking_number: "FIXTURE123", status: "delivered", events: [] }, { tracking_number: "FIXTURE456", error: { code: "tracking_sources_unavailable" } }];
  const client = new Trace("fixture-key", { fetch: async () => Response.json({ results }) });
  assert.deepEqual((await client.batch({ tracking_numbers: ["FIXTURE123", "FIXTURE456"] })).results, results);
});
test("month-long Retry-After is surfaced, not slept; auth errors are never retried", async () => {
  for (const status of [401, 429]) {
    let calls = 0; const client = new Trace("fixture-key", { fetch: async () => { calls++; return Response.json({ error: { code: "limited", message: "Limited" } }, { status, headers: { "Retry-After": "999999", "X-Request-Id": "fixture" } }); } });
    await assert.rejects(client.shipments(), (e) => e.requestId === "fixture" && e.retryAfter === "999999"); assert.equal(calls, 1);
  }
});
test("signature verification supports overlap; rejects altered body, expired time and duplicate t", () => {
  const body = '{"fixture":true}'; const timestamp = 1000;
  const sign = (secret) => crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  const header = `t=${timestamp},v1=${sign("new")},v1=${sign("old")}`;
  for (const secret of ["new", "old"]) assert.equal(verifyWebhook(body, header, secret, { now: timestamp * 1000 }), true);
  assert.equal(verifyWebhook(body + " ", header, "new", { now: timestamp * 1000 }), false);
  assert.equal(verifyWebhook(body, header, "new", { now: timestamp * 1000 + 301000 }), false);
  assert.equal(verifyWebhook(body, header + ",t=1000", "new", { now: timestamp * 1000 }), false);
});
