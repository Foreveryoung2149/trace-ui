import {isVerifiedInstant, type TimelineOrder, type TimelineShipment} from "./model.ts";
const scans = [
  {description: "Delivered to the recipient", location: "Example destination", status: "delivered" as const, timestamp: "2026-03-18T14:20:00Z"},
  {description: "Out for delivery", location: "Example delivery depot", status: "out_for_delivery" as const, timestamp: "2026-03-18T08:10:00Z"},
  {description: "Arrived at the sorting facility", location: "Example sorting hub", status: "in_transit" as const, timestamp: "2026-03-17T19:35:00Z"},
  {description: "Shipping label created", location: "Example origin", status: "pending" as const, timestamp: "2026-03-16T10:00:00Z"},
];
const base = {reference: "DEMO-1042", carrier: "Example carrier", freshness: "simulated" as const};
export const sampleShipments: Record<string, TimelineShipment> = {
  delivered: {...base, status: "delivered", events: scans},
  in_transit: {...base, status: "in_transit", events: scans.slice(2)},
  out_for_delivery: {...base, status: "out_for_delivery", events: scans.slice(1)},
  exception: {...base, status: "exception", events: [{description: "Delivery attempt unsuccessful — recipient unavailable", location: "Example destination", status: "exception", timestamp: "2026-03-18T14:20:00Z"}, ...scans.slice(1)]},
  customs: {...base, status: "customs", events: [{description: "Awaiting customs clearance", location: "Example import facility", status: "customs", timestamp: "2026-03-18T14:20:00Z"}, ...scans.slice(2)]},
  unknown_timezone: {...base, status: "in_transit", events: [{description: "Arrived at the sorting facility", location: "Example sorting hub", status: "in_transit", timestamp: null, localTime: "2026-03-17T19:35:00", timezone: "unknown"}, scans[3]]},
  stale: {...base, status: "in_transit", freshness: "stale", lastCheckedAt: "2026-03-17T20:00:00Z", events: scans.slice(2)},
  pending: {...base, status: "pending", events: []},
  unavailable: {...base, status: "unknown", freshness: "unknown", events: []},
  pickup: {...base, status: "pickup_available", events: [{id: "pickup-1", description: "Ready for collection at the designated pickup point", location: "Example collection point", status: "pickup_available", timestamp: "2026-03-18T12:00:00Z"}, ...scans.slice(2)]},
  returning: {...base, status: "return_in_transit", events: [{description: "Return to sender in progress", location: "Example return depot", status: "return_in_transit", timestamp: "2026-03-19T09:00:00Z"}, ...scans.slice(1)]},
  returned: {...base, status: "returned", events: [{description: "Returned to the sender", location: "Example origin", status: "returned", timestamp: "2026-03-21T15:00:00Z"}, {description: "Return to sender in progress", status: "return_in_transit", timestamp: "2026-03-19T09:00:00Z"}, ...scans.slice(2)]},
  cancelled: {...base, status: "cancelled", events: [{description: "Shipment cancelled by the sender before collection", status: "cancelled", timestamp: "2026-03-16T11:00:00Z"}, scans[3]]},
  handoff: {...base, carrier: "Example destination carrier", status: "in_transit", events: [{id: "handoff-1", kind: "handoff", description: "Accepted by the destination delivery partner", carrier: "Example destination carrier", location: "Example import hub", status: "in_transit", timestamp: "2026-03-18T10:00:00Z"}, {description: "Departed the origin network", carrier: "Example origin carrier", location: "Example export hub", status: "in_transit", timestamp: "2026-03-17T12:00:00Z"}, scans[3]]},
};
export const sampleOrders: Record<string, TimelineOrder> = {
  split: {reference: "DEMO-ORDER-1042", shipments: [sampleShipments.delivered, {...sampleShipments.in_transit, reference: "DEMO-1043", carrier: "Example second carrier"}]},
  attention: {reference: "DEMO-ORDER-1044", shipments: [sampleShipments.exception, {...sampleShipments.pickup, reference: "DEMO-1045"}]},
};
export const sampleScenarioLabels: Record<string, string> = {delivered: "Delivered", in_transit: "In transit", out_for_delivery: "Out for delivery", exception: "Delivery exception", customs: "Customs", unknown_timezone: "Unknown timezone", stale: "Stale data", pending: "No scans yet", unavailable: "Source unavailable", pickup: "Ready for pickup", returning: "Return in transit", returned: "Returned to sender", cancelled: "Cancelled", handoff: "Carrier handoff"};
/** Replays supplied evidence only. A simulated snapshot never pretends to be current carrier data. */
export function simulateJourney(shipment: TimelineShipment, count: number): TimelineShipment {
  const comparable = shipment.events.every(event => event.timezone !== "unknown" && isVerifiedInstant(event.timestamp));
  const ordered = shipment.eventOrder === "oldest_first" ? [...shipment.events] : shipment.eventOrder === "newest_first" ? [...shipment.events].reverse() : comparable ? [...shipment.events].sort((a, b) => Date.parse(a.timestamp!) - Date.parse(b.timestamp!)) : [...shipment.events];
  const visible = ordered.slice(0, Math.max(0, Math.min(ordered.length, Math.floor(Number.isFinite(count) ? count : 0))));
  if (!comparable && !["oldest_first", "newest_first"].includes(shipment.eventOrder || "")) return {...shipment, freshness: "simulated", status: visible.length === shipment.events.length ? shipment.status : "unknown", events: visible, eventOrder: "supplied", latestEventId: undefined};
  const latest = visible[visible.length - 1];
  return {...shipment, freshness: "simulated", status: latest?.status || (visible.length ? "unknown" : "pending"), events: visible.reverse(), eventOrder: "newest_first", latestEventId: latest?.id};
}
