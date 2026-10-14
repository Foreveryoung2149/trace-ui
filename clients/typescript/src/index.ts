import { createHmac, timingSafeEqual } from "node:crypto";
import type { Shipment, ShipmentInput, ShipmentPatch, ImportInput, ImportJob, ImportResult, AnalyticsReport, TrackingResult, SandboxTrackingResult, ShipmentAlert, Carrier, Webhook, WebhookDelivery, WebhookAttempt, BatchItemError } from "./models.js";
export * from "./models.js";
export type Page<T> = { data: T[]; next_cursor: string | null };
export class TraceError extends Error {
  constructor(public status: number, public code: string, message: string, public requestId: string | null, public retryAfter: string | null, public body: unknown) { super(message); this.name = "TraceError"; }
}
type RequestOptions = { idempotencyKey?: string; signal?: AbortSignal };
export class Trace {
  private baseUrl: string;
  private fetcher: typeof fetch;
  constructor(private apiKey: string, private options: { baseUrl?: string; timeoutMs?: number; retries?: number; fetch?: typeof fetch } = {}) {
    const url = new URL(options.baseUrl || "https://api.traceapi.dev");
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("Use HTTPS, or localhost for testing");
    if (url.username || url.password || url.search || url.hash) throw new Error("baseUrl must not contain credentials, query or fragment");
    if (!apiKey || !Number.isInteger(options.retries ?? 2) || (options.retries ?? 2) < 0 || (options.retries ?? 2) > 5 || !Number.isFinite(options.timeoutMs ?? 95000) || (options.timeoutMs ?? 95000) <= 0) throw new Error("Invalid client configuration");
    this.baseUrl = url.toString().replace(/\/$/, ""); this.fetcher = options.fetch || fetch;
  }
  async request<T>(method: string, path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    if (!path.startsWith("/v1/") || path.includes("..") || path.startsWith("//")) throw new Error("Use a Trace /v1/ path");
    const safe = method === "GET" || (Boolean(options.idempotencyKey) && ["/v1/shipments", "/v1/imports"].includes(path)) || ["/v1/track", "/v1/track/batch", "/v1/sandbox/track"].includes(path);
    const retries = safe ? this.options.retries ?? 2 : 0;
    for (let attempt = 0; ; attempt++) {
      const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(this.options.timeoutMs ?? 95000)]) : AbortSignal.timeout(this.options.timeoutMs ?? 95000);
      const response = await this.fetcher(this.baseUrl + path, { method, redirect: "error", signal,
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", "User-Agent": "trace-typescript/0.2.1", ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const text = await response.text(); let parsed;
      try { parsed = text ? JSON.parse(text) : null; } catch { throw new TraceError(response.status, "invalid_response", "Trace returned an invalid JSON response", response.headers.get("X-Request-Id"), null, null); }
      if (response.ok) return parsed as T;
      const retryAfter = response.headers.get("Retry-After");
      const delay = retryAfter ? (/^\d+(\.\d+)?$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now()) : 500 * 2 ** attempt;
      if (attempt < retries && [429, 503].includes(response.status) && Number.isFinite(delay) && delay <= 60000) {
        await new Promise<void>((resolve, reject) => { const timer = setTimeout(done, Math.max(0, delay));
          function done() { options.signal?.removeEventListener("abort", abort); resolve(); }
          function abort() { clearTimeout(timer); options.signal?.removeEventListener("abort", abort); reject(options.signal?.reason); }
          if (options.signal?.aborted) abort(); else options.signal?.addEventListener("abort", abort, { once: true }); });
        continue;
      }
      throw new TraceError(response.status, parsed?.error?.code || "request_failed", parsed?.error?.message || "Trace request failed", response.headers.get("X-Request-Id"), retryAfter, parsed);
    }
  }
  track(input: { tracking_number: string; carrier?: string; allow_stale?: boolean }, options?: RequestOptions) { return this.request<TrackingResult>("POST", "/v1/track", input, options); }
  batch(input: { tracking_numbers: string[]; carrier?: string; allow_stale?: boolean }, options?: RequestOptions) { return this.request<{ results: Array<TrackingResult | BatchItemError> }>("POST", "/v1/track/batch", input, options); }
  sandbox(scenario: "pending" | "in_transit" | "out_for_delivery" | "delivered" | "exception" | "unknown_timezone") { return this.request<SandboxTrackingResult>("POST", "/v1/sandbox/track", { scenario }); }
  carriers() { return this.request<{ carriers: Carrier[]; count: number }>("GET", "/v1/carriers"); }
  createShipment(input: ShipmentInput, idempotencyKey: string) { return this.request<{ shipment: Shipment; replayed: boolean }>("POST", "/v1/shipments", input, { idempotencyKey }); }
  shipment(id: string) { return this.request<{ shipment: Shipment }>("GET", `/v1/shipments/${encodeURIComponent(id)}`); }
  shipments(query: { limit?: number; cursor?: string; order_id?: string; status?: string } = {}) { return this.request<Page<Shipment>>("GET", `/v1/shipments${queryString(query)}`); }
  updateShipment(id: string, patch: ShipmentPatch) { return this.request<{ shipment: Shipment }>("PATCH", `/v1/shipments/${encodeURIComponent(id)}`, patch); }
  alerts(query: { limit?: number; cursor?: string; active?: string } = {}) { return this.request<Page<ShipmentAlert>>("GET", `/v1/alerts${queryString(query)}`); }
  acknowledgeAlert(id: string) { return this.request<{ acknowledged: boolean }>("POST", `/v1/alerts/${encodeURIComponent(id)}/acknowledge`, {}); }
  createImport(input: ImportInput, idempotencyKey: string) { return this.request<{ job: ImportJob }>("POST", "/v1/imports", input, { idempotencyKey }); }
  importJob(id: string) { return this.request<{ job: ImportJob }>("GET", `/v1/imports/${encodeURIComponent(id)}`); }
  importResults(id: string, afterRow = 0) { return this.request<{ data: ImportResult[]; next_row: number | null; status: string }>("GET", `/v1/imports/${encodeURIComponent(id)}/results?after_row=${afterRow}`); }
  cancelImport(id: string) { return this.request<{ job: ImportJob }>("POST", `/v1/imports/${encodeURIComponent(id)}/cancel`, {}); }
  analytics(days = 30) { return this.request<AnalyticsReport>("GET", `/v1/analytics?days=${days}`); }
  webhooks() { return this.request<{ webhooks: Webhook[] }>("GET", "/v1/webhooks"); }
  deliveries(id: string, cursor?: string) { return this.request<{ deliveries: WebhookDelivery[]; next_cursor: string | null }>("GET", `/v1/webhooks/${encodeURIComponent(id)}/deliveries${queryString({ cursor })}`); }
  attempts(id: string, deliveryId: string, cursor?: string) { return this.request<Page<WebhookAttempt>>("GET", `/v1/webhooks/${encodeURIComponent(id)}/deliveries/${encodeURIComponent(deliveryId)}/attempts${queryString({ cursor })}`); }
  replay(id: string, deliveryId: string, reason: string) { return this.request<{ delivery: { id: string; event_id: string; status: string } }>("POST", `/v1/webhooks/${encodeURIComponent(id)}/deliveries/${encodeURIComponent(deliveryId)}/replay`, { reason }); }
}
function queryString(query: Record<string, string | number | undefined>) { const search = new URLSearchParams(Object.entries(query).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])); return search.size ? `?${search}` : ""; }
// Pass the original, unparsed request body. JSON serialization changes bytes.
export function verifyWebhook(rawBody: string | Buffer, signature: string, secret: string, { now = Date.now(), toleranceSeconds = 300 } = {}): boolean {
  const parts = signature.split(",").map((part) => part.split("=")); const times = parts.filter(([key]) => key === "t");
  if (times.length !== 1 || !/^\d+$/.test(times[0][1]) || !Number.isFinite(toleranceSeconds) || toleranceSeconds < 0 || Math.abs(now / 1000 - Number(times[0][1])) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret).update(`${times[0][1]}.`).update(rawBody).digest();
  return parts.some(([key, value]) => key === "v1" && /^[a-f0-9]{64}$/.test(value || "") && timingSafeEqual(expected, Buffer.from(value, "hex")));
}
