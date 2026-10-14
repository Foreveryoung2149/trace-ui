import type { CSSProperties } from "react";
import { formatInstant, isVerifiedInstant, progressIndex, statusLabels, type TimelineShipment } from "./model.ts";
export * from "./model.ts";

export type ShipmentTimelineProps = {
  shipment: TimelineShipment;
  theme?: "dark" | "light";
  title?: string;
  locale?: string;
  timeZone?: string;
  className?: string;
  style?: CSSProperties;
};
const steps = ["Label created", "On the way", "Out for delivery", "Delivered"];

export function ShipmentTimeline({shipment, theme = "dark", title = "Shipment journey", locale = "en", timeZone = "UTC", className = "", style}: ShipmentTimelineProps) {
  const active = progressIndex(shipment.status);
  const stale = shipment.freshness === "stale";
  const attention = shipment.status === "exception" || shipment.status === "customs";
  const knownScans = shipment.events.filter(event => isVerifiedInstant(event.timestamp) && event.timezone !== "unknown").length;
  return <section className={`trace-timeline ${className}`} data-theme={theme} data-status={shipment.status} aria-label={title} style={style}>
    <header className="tt-header">
      <div><p className="tt-eyebrow">{shipment.carrier || "Shipment tracking"}</p><h2>{title}</h2>{shipment.reference && <p className="tt-reference">{shipment.reference}</p>}</div>
      <span className={`tt-badge ${attention ? "tt-attention" : ""}`}><span className="tt-status-dot" aria-hidden="true" />{statusLabels[shipment.status]}</span>
    </header>
    {shipment.freshness === "simulated" && <p className="tt-notice">Demo data · This is an illustrative shipment, not a live tracking result.</p>}
    {stale && <p className="tt-notice tt-attention" role="status"><strong>Last known update.</strong> These scans are stale. The current shipment state has not been verified.</p>}
    {shipment.status === "exception" && <p className="tt-notice tt-attention">Review the carrier&apos;s scan below to understand the reported delivery issue.</p>}
    {shipment.status === "unknown" && <p className="tt-notice">No reliable current status was supplied. This does not mean the parcel is awaiting shipment.</p>}
    <ol className="tt-progress" aria-label={stale ? "Last known delivery progress" : "Reported delivery progress"}>
      {steps.map((step, index) => <li key={step} className={active === null ? "" : index < active ? "tt-complete" : index === active ? "tt-current" : ""} aria-current={index === active ? "step" : undefined}>
        <span className="tt-step-mark" aria-hidden="true">{active !== null && index < active ? "✓" : index + 1}</span><span>{step}</span>
      </li>)}
    </ol>
    <div className="tt-history-head"><h3>Scan history</h3><span>{shipment.events.length} {shipment.events.length === 1 ? "event" : "events"}</span></div>
    {shipment.events.length === 0 ? <p className="tt-empty">No scans were supplied. Check again after the carrier has published an update.</p> : <ol className="tt-events">
      {shipment.events.map((event, index) => {
        const verified = event.timezone !== "unknown" && isVerifiedInstant(event.timestamp);
        return <li key={event.id || `${index}:${event.description}`}>
          <span className={`tt-event-mark ${index === 0 ? "tt-event-latest" : ""}`} aria-hidden="true" />
          <div className="tt-event-body"><p className="tt-event-description">{event.description}</p>{event.location && <p className="tt-location">{event.location}</p>}
            {verified ? <time dateTime={event.timestamp!}>{formatInstant(event.timestamp!, locale, timeZone)}</time> : <p className="tt-unverified-time">{event.localTime ? <><span>{event.localTime.replace("T", " ")}</span><span className="tt-time-label">Timezone not supplied</span></> : "Event time not verified"}</p>}
          </div>
        </li>;
      })}
    </ol>}
    <footer className="tt-footer">
      <span>{shipment.freshness === "cached" ? "Cached carrier data" : shipment.freshness === "live" ? "Verified at lookup" : shipment.freshness === "stale" ? "Stale carrier data" : shipment.freshness === "simulated" ? "Local example" : "Freshness not supplied"}</span>
      {isVerifiedInstant(shipment.lastCheckedAt) && <span>Checked {formatInstant(shipment.lastCheckedAt, locale, timeZone)}</span>}
      {shipment.events.length > 0 && <span>Events in supplied order · {knownScans < shipment.events.length ? "Unverified times remain unconverted" : `Times shown in ${timeZone}`}</span>}
      {shipment.estimatedDelivery && <span>Carrier estimate: {isVerifiedInstant(shipment.estimatedDelivery) ? formatInstant(shipment.estimatedDelivery, locale, timeZone) : shipment.estimatedDelivery} · Not a delivery guarantee</span>}
    </footer>
  </section>;
}
