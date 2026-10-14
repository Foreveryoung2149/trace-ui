export type ShipmentStatus = "pending" | "in_transit" | "out_for_delivery" | "customs" | "delivered" | "exception" | "unknown";
export type TimelineEvent = {
  id?: string;
  status?: ShipmentStatus;
  description: string;
  location?: string | null;
  timestamp: string | null;
  localTime?: string | null;
  timezone?: "unknown";
};
export type TimelineShipment = {
  reference?: string;
  carrier?: string;
  status: ShipmentStatus;
  events: readonly TimelineEvent[];
  freshness?: "live" | "cached" | "stale" | "simulated" | "unknown";
  lastCheckedAt?: string | null;
  estimatedDelivery?: string | null;
};
export const statusLabels: Record<ShipmentStatus, string> = {
  pending: "Awaiting carrier updates", in_transit: "On the way", out_for_delivery: "Out for delivery",
  customs: "In customs", delivered: "Delivered", exception: "Needs attention", unknown: "Status unavailable",
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
  return new Intl.DateTimeFormat(locale, {year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone, timeZoneName: "short"}).format(new Date(value));
}
export function progressIndex(status: ShipmentStatus): number | null {
  return ({pending: 0, in_transit: 1, customs: 1, out_for_delivery: 2, delivered: 3} as Partial<Record<ShipmentStatus, number>>)[status] ?? null;
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
