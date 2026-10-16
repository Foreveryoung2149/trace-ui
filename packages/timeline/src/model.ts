export type ShipmentStatus = "pending" | "in_transit" | "out_for_delivery" | "customs" | "delivered" | "exception" | "unknown" | "pickup_available" | "return_in_transit" | "returned" | "cancelled";
export type TimelineEvent = {
  id?: string;
  status?: ShipmentStatus;
  description: string;
  location?: string | null;
  timestamp: string | null;
  localTime?: string | null;
  timezone?: "unknown";
  carrier?: string | null;
  kind?: "scan" | "handoff";
};
export type TimelineShipment = {
  reference?: string;
  carrier?: string;
  status: ShipmentStatus;
  events: readonly TimelineEvent[];
  freshness?: "live" | "cached" | "stale" | "simulated" | "unknown";
  lastCheckedAt?: string | null;
  estimatedDelivery?: string | null;
  eventOrder?: "supplied" | "newest_first" | "oldest_first";
  latestEventId?: string;
};
export type TimelineOrder = {reference?: string; shipments: readonly TimelineShipment[]};
export type ProgressStage = {id: string; label: string; statuses: readonly ShipmentStatus[]};
export const statusLabels: Record<ShipmentStatus, string> = {
  pending: "Awaiting carrier updates", in_transit: "On the way", out_for_delivery: "Out for delivery",
  customs: "In customs", delivered: "Delivered", exception: "Needs attention", unknown: "Status unavailable",
  pickup_available: "Ready for pickup", return_in_transit: "Returning to sender", returned: "Returned", cancelled: "Cancelled",
};
export function normalizeStatus(value: string): ShipmentStatus {
  return Object.prototype.hasOwnProperty.call(statusLabels, value) ? value as ShipmentStatus : "unknown";
}
// Offset-less values must never be interpreted in the viewer's timezone.
export function isVerifiedInstant(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
  const year = Number(value.slice(0, 4)), month = Number(value.slice(5, 7)), day = Number(value.slice(8, 10));
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return month >= 1 && month <= 12 && day >= 1 && day <= days && Number(value.slice(11, 13)) < 24 && Number(value.slice(14, 16)) < 60 && Number(value.slice(17, 19)) < 60 && Number.isFinite(Date.parse(value));
}
export function formatInstant(value: string, locale = "en", timeZone = "UTC"): string {
  if (!isVerifiedInstant(value)) return "Unverified time";
  const options = resolveFormatting(locale, timeZone);
  return new Intl.DateTimeFormat(options.locale, {year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: options.timeZone, timeZoneName: "short"}).format(new Date(value));
}
export function resolveFormatting(locale = "en", timeZone = "UTC") {
  let safeLocale = "en", safeZone = "UTC";
  try { if (Intl.DateTimeFormat.supportedLocalesOf([locale]).length) safeLocale = new Intl.DateTimeFormat(locale).resolvedOptions().locale; } catch { /* Invalid locale falls back deterministically. */ }
  try { safeZone = new Intl.DateTimeFormat("en", {timeZone}).resolvedOptions().timeZone; } catch { /* Never reinterpret a scan in the host timezone. */ }
  return {locale: safeLocale, timeZone: safeZone};
}
/** No sorting or clock guessing: preserve input order and highlight only supported evidence. */
export function latestEventIndex(shipment: TimelineShipment): number | null {
  if (!shipment.events.length) return null;
  if (shipment.latestEventId) {
    const index = shipment.events.findIndex(event => event.id === shipment.latestEventId);
    return index < 0 ? null : index;
  }
  if (shipment.eventOrder === "newest_first") return 0;
  if (shipment.eventOrder === "oldest_first") return shipment.events.length - 1;
  if (!shipment.events.every(event => event.timezone !== "unknown" && isVerifiedInstant(event.timestamp))) return null;
  let latest = 0;
  shipment.events.forEach((event, index) => { if (Date.parse(event.timestamp!) > Date.parse(shipment.events[latest].timestamp!)) latest = index; });
  return latest;
}
export function progressIndex(status: ShipmentStatus): number | null {
  return ({pending: 0, in_transit: 1, customs: 1, out_for_delivery: 2, delivered: 3} as Partial<Record<ShipmentStatus, number>>)[status] ?? null;
}

export type ValidationResult = {ok: true; shipment: TimelineShipment; warnings: string[]} | {ok: false; errors: string[]};
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const optionalString = (value: unknown) => value === undefined || value === null || typeof value === "string";
/** Runtime boundary for JSON playgrounds and untyped providers. Pure, bounded, and never requests data. */
export function validateShipment(value: unknown): ValidationResult {
  const errors: string[] = [], warnings: string[] = [];
  if (!record(value)) return {ok: false, errors: ["Expected a shipment object."]};
  if (typeof value.status !== "string" || !Object.prototype.hasOwnProperty.call(statusLabels, value.status)) errors.push("status must be a supported shipment status.");
  if (!Array.isArray(value.events)) errors.push("events must be an array.");
  else if (value.events.length > 500) errors.push("Use at most 500 events in the local preview.");
  else value.events.forEach((event, index) => {
    const field = `events[${index}]`;
    if (!record(event)) { errors.push(`${field} must be an object.`); return; }
    if (typeof event.description !== "string" || !event.description.trim() || event.description.length > 4000) errors.push(`${field}.description must be 1–4000 characters.`);
    if (!(event.timestamp === null || typeof event.timestamp === "string")) errors.push(`${field}.timestamp must be a string or null.`);
    if (event.timestamp && !isVerifiedInstant(event.timestamp as string)) warnings.push(`${field}: timestamp has no verified offset/date; it will not be converted.`);
    if (event.status !== undefined && (typeof event.status !== "string" || !Object.prototype.hasOwnProperty.call(statusLabels, event.status))) errors.push(`${field}.status is unsupported.`);
    for (const key of ["id", "location", "localTime", "carrier"]) if (!optionalString(event[key])) errors.push(`${field}.${key} must be a string or null.`);
    if (event.timezone !== undefined && event.timezone !== "unknown") errors.push(`${field}.timezone must be 'unknown' or omitted.`);
    if (event.kind !== undefined && !["scan", "handoff"].includes(event.kind as string)) errors.push(`${field}.kind must be scan or handoff.`);
  });
  for (const key of ["reference", "carrier", "lastCheckedAt", "estimatedDelivery", "latestEventId"]) if (!optionalString(value[key])) errors.push(`${key} must be a string or null.`);
  if (value.freshness !== undefined && !["live", "cached", "stale", "simulated", "unknown"].includes(value.freshness as string)) errors.push("freshness is unsupported.");
  if (value.eventOrder !== undefined && !["supplied", "newest_first", "oldest_first"].includes(value.eventOrder as string)) errors.push("eventOrder is unsupported.");
  if (errors.length) return {ok: false, errors};
  // Copy only supported fields; extra provider fields never leak into exported example data.
  const shipment: TimelineShipment = {status: value.status as ShipmentStatus, events: (value.events as Record<string, unknown>[]).map(event => ({
    description: event.description as string, timestamp: event.timestamp as string | null,
    ...(typeof event.id === "string" ? {id: event.id} : {}), ...(typeof event.status === "string" ? {status: event.status as ShipmentStatus} : {}),
    ...(typeof event.location === "string" ? {location: event.location} : {}), ...(typeof event.localTime === "string" ? {localTime: event.localTime} : {}),
    ...(typeof event.carrier === "string" ? {carrier: event.carrier} : {}), ...(event.timezone === "unknown" ? {timezone: "unknown" as const} : {}),
    ...(event.kind ? {kind: event.kind as "scan" | "handoff"} : {}),
  }))};
  for (const key of ["reference", "carrier", "lastCheckedAt", "estimatedDelivery", "latestEventId", "freshness", "eventOrder"] as const) {
    if (typeof value[key] === "string") Object.assign(shipment, {[key]: value[key]});
  }
  if (shipment.latestEventId && !shipment.events.some(event => event.id === shipment.latestEventId)) warnings.push("latestEventId does not match an event; no event will be highlighted.");
  return {ok: true, shipment, warnings};
}
export function validateTraceTracking(value: unknown): ValidationResult {
  if (!record(value) || typeof value.tracking_number !== "string" || typeof value.status !== "string" || !Array.isArray(value.events)) return {ok: false, errors: ["Expected the Trace tracking result object with tracking_number, status and events fields."]};
  if (value.events.length > 500) return {ok: false, errors: ["Use at most 500 events in the local preview."]};
  // Adapt at a checked structural boundary; never forward arbitrary provider fields.
  const canonical = validateShipment({...value, reference: value.tracking_number, status: normalizeStatus(value.status), carrier: record(value.carrier) ? value.carrier.name : undefined, events: value.events.map(event => !record(event) ? event : ({...event, status: typeof event.status === "string" ? normalizeStatus(event.status) : undefined, localTime: event.timestamp_local, timezone: event.timestamp_timezone, timestamp: event.timestamp_timezone === "unknown" ? null : event.timestamp}))});
  if (!canonical.ok) return canonical;
  const state = record(value.data_freshness) ? value.data_freshness.state : undefined;
  const freshness = value.stale === true || state === "stale" ? "stale" : value.test === true || state === "simulated" ? "simulated" : state === "live" ? "live" : value.cached === true || state === "cached" ? "cached" : "unknown";
  return {ok: true, shipment: {...canonical.shipment, freshness, lastCheckedAt: typeof value.last_checked_at === "string" ? value.last_checked_at : undefined, estimatedDelivery: typeof value.estimated_delivery === "string" ? value.estimated_delivery : undefined}, warnings: canonical.warnings};
}
// Structural adapter: no SDK dependency, requests, keys or hidden telemetry.
export function fromTraceTracking(data: {
  tracking_number: string; carrier?: {name?: string}; status: string;
  events: readonly {status?: string; description: string; location?: string | null; timestamp: string | null; timestamp_local?: string; timestamp_timezone?: "unknown"}[];
  stale?: boolean; cached?: boolean; test?: boolean; estimated_delivery?: string | null; last_checked_at?: string | null;
  data_freshness?: {state?: string};
}): TimelineShipment {
  const state = data.data_freshness?.state;
  const freshness = data.stale || state === "stale" ? "stale" : data.test || state === "simulated" ? "simulated" : state === "live" ? "live" : data.cached || state === "cached" ? "cached" : "unknown";
  return {reference: data.tracking_number, carrier: data.carrier?.name, status: normalizeStatus(data.status),
    events: data.events.map(event => ({status: event.status ? normalizeStatus(event.status) : undefined, description: event.description, location: event.location,
      timestamp: event.timestamp_timezone === "unknown" ? null : event.timestamp, localTime: event.timestamp_local,
      timezone: event.timestamp_timezone})), freshness, lastCheckedAt: data.last_checked_at, estimatedDelivery: data.estimated_delivery};
}
