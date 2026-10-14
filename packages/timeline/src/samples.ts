import type { TimelineShipment } from "./model.ts";
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
};
