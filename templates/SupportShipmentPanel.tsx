import {ExceptionNotice, FreshnessNotice, ShipmentFreshness, ShipmentHistory, ShipmentSummary, TimelineFrame, type ShipmentTimelineProps} from "@traceapi/timeline";

export type SupportShipmentPanelProps = Omit<ShipmentTimelineProps, "layout" | "stages" | "children"> & {supportNote?: string};

/** Read-only context for a merchant support screen; a note is not carrier evidence. */
export function SupportShipmentPanel({shipment, supportNote, theme = "light", density = "compact", locale = "en", timeZone = "UTC", messages, title = "Shipment context", ...presentation}: SupportShipmentPanelProps) {
  const options = {shipment, locale, timeZone, messages};
  return <aside aria-label={title}>
    <TimelineFrame theme={theme} density={density} locale={locale} title={title} {...presentation}>
      <ShipmentSummary {...options} title={title}/><FreshnessNotice {...options}/><ExceptionNotice {...options}/>
      {supportNote && <div className="tt-notice"><strong>Internal support note</strong><p>{supportNote}</p><p>This note does not change the carrier’s reported status.</p></div>}
      <ShipmentHistory {...options}/><ShipmentFreshness {...options}/>
    </TimelineFrame>
  </aside>;
}
