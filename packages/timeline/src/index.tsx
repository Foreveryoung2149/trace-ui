import type { CSSProperties, ReactNode } from "react";
import { formatInstant, isVerifiedInstant, latestEventIndex, normalizeStatus, progressIndex, resolveFormatting, type ProgressStage, type TimelineEvent, type TimelineOrder, type TimelineShipment } from "./model.ts";
import {getTimelineMessages, timelineDirection, type TimelineMessageOverrides} from "./messages.ts";
export * from "./model.ts";
export * from "./messages.ts";
export * from "./builder.ts";
export type TimelineOptions = {locale?: string; timeZone?: string; messages?: TimelineMessageOverrides};
export type TimelinePresentation = {theme?: "dark" | "light"; density?: "comfortable" | "compact"; direction?: "ltr" | "rtl"; className?: string; style?: CSSProperties};
export type ShipmentTimelineProps = TimelineOptions & TimelinePresentation & {shipment: TimelineShipment; title?: string; stages?: readonly ProgressStage[]; layout?: "full" | "compact"; children?: ReactNode};
type PrimitiveProps = TimelineOptions & {shipment: TimelineShipment};

/** A CSS boundary for consumers composing primitives in their own layout. No context or client JS required. */
export function TimelineFrame({children, theme = "dark", density = "comfortable", direction, locale = "en", className = "", style, title}: TimelinePresentation & {children: ReactNode; locale?: string; title?: string}) {
  return <section className={`trace-timeline ${className}`} data-theme={theme} data-density={density} dir={direction || timelineDirection(locale)} lang={resolveFormatting(locale).locale} aria-label={title} style={style}>{children}</section>;
}
export function ShipmentSummary({shipment, title, locale = "en", messages}: PrimitiveProps & {title?: string}) {
  const text = getTimelineMessages(locale, messages), status = normalizeStatus(shipment.status);
  const attention = status === "exception" || status === "customs";
  return <header className="tt-header"><div><p className="tt-eyebrow">{shipment.carrier || text.tracking}</p><h2>{title || text.title}</h2>{shipment.reference && <p className="tt-reference"><bdi>{shipment.reference}</bdi></p>}</div><span data-status={status} className={`tt-badge ${attention ? "tt-attention" : ""}`}><span className="tt-status-dot" aria-hidden="true" />{text.statuses[status]}</span></header>;
}
export function FreshnessNotice({shipment, locale = "en", messages}: PrimitiveProps) {
  const text = getTimelineMessages(locale, messages);
  if (shipment.freshness === "simulated") return <p className="tt-notice">{text.demo}</p>;
  if (shipment.freshness === "stale") return <p className="tt-notice tt-attention" role="status">{text.stale}</p>;
  return null;
}
export function ExceptionNotice({shipment, locale = "en", messages, children}: PrimitiveProps & {children?: ReactNode}) {
  const text = getTimelineMessages(locale, messages);
  if (shipment.status === "exception") return <div className="tt-notice tt-attention"><p>{text.exception}</p>{children}</div>;
  if (shipment.status === "unknown") return <p className="tt-notice">{text.unavailable}</p>;
  return null;
}
export function ShipmentProgress({shipment, stages, locale = "en", messages}: PrimitiveProps & {stages?: readonly ProgressStage[]}) {
  const text = getTimelineMessages(locale, messages);
  const defaults: ProgressStage[] = text.steps.map((label, index) => ({id: `stage-${index}`, label, statuses: [["pending"], ["in_transit", "customs"], ["out_for_delivery"], ["delivered"]][index] as ProgressStage["statuses"]}));
  const displayed = stages?.length ? stages : defaults;
  // Exception/unknown/return paths have no inferred forward-delivery completion.
  const active = stages?.length ? displayed.findIndex(stage => stage.statuses.includes(shipment.status)) : shipment.status === "pending" && !shipment.events.length ? null : progressIndex(shipment.status);
  return <ol className="tt-progress" style={{"--tt-stages": displayed.length} as CSSProperties} aria-label={shipment.freshness === "stale" ? text.lastProgress : text.progress}>{displayed.map((step, index) => <li key={`${step.id}:${index}`} className={active === null || active < 0 ? "" : index < active ? "tt-complete" : index === active ? "tt-current" : ""} aria-current={index === active ? "step" : undefined}><span className="tt-step-mark" aria-hidden="true">{active !== null && active >= 0 && index < active ? "✓" : index + 1}</span><span>{step.label}</span></li>)}</ol>;
}
function EventTime({event, locale = "en", timeZone = "UTC", messages}: TimelineOptions & {event: TimelineEvent}) {
  const text = getTimelineMessages(locale, messages), verified = event.timezone !== "unknown" && isVerifiedInstant(event.timestamp);
  return verified ? <time dateTime={event.timestamp!}>{formatInstant(event.timestamp!, locale, timeZone)}</time> : <p className="tt-unverified-time">{event.localTime ? <><bdi>{event.localTime.replace("T", " ")}</bdi><span className="tt-time-label">{text.unknownTimezone}</span></> : text.unverifiedTime}</p>;
}
export function ShipmentHistory({shipment, locale = "en", timeZone = "UTC", messages}: PrimitiveProps) {
  const text = getTimelineMessages(locale, messages), latest = latestEventIndex(shipment);
  return <><div className="tt-history-head"><h3>{text.history}</h3><span>{shipment.events.length} {shipment.events.length === 1 ? text.event : text.events}</span></div>{shipment.events.length === 0 ? <p className="tt-empty">{text.empty}</p> : <ol className="tt-events">{shipment.events.map((event, index) => <li key={`${event.id || index}:${index}`}><span className={`tt-event-mark ${index === latest ? "tt-event-latest" : ""}`} aria-hidden="true" /><div className="tt-event-body"><p className="tt-event-description">{event.description}</p>{index === latest && <span className="tt-event-tag">{text.latest}</span>}{event.kind === "handoff" && <span className="tt-event-tag">{text.handoff}</span>}{event.carrier && <p className="tt-location">{event.carrier}</p>}{event.location && <p className="tt-location">{event.location}</p>}<EventTime event={event} locale={locale} timeZone={timeZone} messages={messages}/></div></li>)}</ol>}</>;
}
export function ShipmentFreshness({shipment, locale = "en", timeZone = "UTC", messages}: PrimitiveProps) {
  const text = getTimelineMessages(locale, messages), zone = resolveFormatting(locale, timeZone).timeZone;
  const knownScans = shipment.events.filter(event => isVerifiedInstant(event.timestamp) && event.timezone !== "unknown").length;
  const label = ({cached: text.cached, live: text.live, stale: text.staleLabel, simulated: text.simulated, unknown: text.unknownFreshness})[shipment.freshness || "unknown"];
  return <footer className="tt-footer"><span>{label}</span>{isVerifiedInstant(shipment.lastCheckedAt) && <span>{text.checked} {formatInstant(shipment.lastCheckedAt, locale, timeZone)}</span>}{shipment.events.length > 0 && <span>{text.suppliedOrder} · {knownScans < shipment.events.length ? text.unconverted : `${text.timesIn} ${zone}`}</span>}{shipment.estimatedDelivery && <span>{text.estimate}: {isVerifiedInstant(shipment.estimatedDelivery) ? formatInstant(shipment.estimatedDelivery, locale, timeZone) : shipment.estimatedDelivery} · {text.noGuarantee}</span>}</footer>;
}
export function ShipmentTimeline({shipment, theme = "dark", density = "comfortable", layout = "full", title, locale = "en", timeZone = "UTC", direction, messages, stages, className = "", style, children}: ShipmentTimelineProps) {
  const text = getTimelineMessages(locale, messages), options = {shipment, locale, timeZone, messages};
  return <TimelineFrame theme={theme} density={density} direction={direction} locale={locale} className={className} style={style} title={title || text.title}><div data-status={normalizeStatus(shipment.status)} data-layout={layout}><ShipmentSummary {...options} title={title}/><FreshnessNotice {...options}/><ExceptionNotice {...options}/>{layout === "full" && <ShipmentProgress {...options} stages={stages}/>}<ShipmentHistory {...options}/>{children}<ShipmentFreshness {...options}/></div></TimelineFrame>;
}
export function OrderTracking({order, theme = "dark", density = "comfortable", locale = "en", timeZone = "UTC", direction, messages, className = "", style}: TimelinePresentation & TimelineOptions & {order: TimelineOrder}) {
  const text = getTimelineMessages(locale, messages);
  const allDelivered = order.shipments.length > 0 && order.shipments.every(shipment => shipment.status === "delivered" && ["live", "cached", "simulated"].includes(shipment.freshness || "unknown"));
  return <div className={`tt-order ${className}`} data-theme={theme} dir={direction || timelineDirection(locale)} lang={resolveFormatting(locale).locale} style={style}><header className="tt-order-header"><div><p>{text.order}{order.reference && <> · <bdi>{order.reference}</bdi></>}</p><h2>{order.shipments.length} {order.shipments.length === 1 ? text.parcel : text.parcels}</h2></div><span>{allDelivered ? text.allDelivered : text.partialDelivery}</span></header>{!order.shipments.length && <p className="tt-order-empty">{text.orderEmpty}</p>}<div className="tt-order-parcels">{order.shipments.map((shipment, index) => <ShipmentTimeline key={`${shipment.reference || index}:${index}`} shipment={shipment} title={`${text.parcel} ${index + 1}`} theme={theme} density={density} locale={locale} timeZone={timeZone} direction={direction} messages={messages}/>)}</div></div>;
}
