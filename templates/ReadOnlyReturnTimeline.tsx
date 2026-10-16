import {ShipmentTimeline, type ProgressStage, type ShipmentTimelineProps} from "@traceapi/timeline";

export type ReadOnlyReturnTimelineProps = Omit<ShipmentTimelineProps, "stages" | "children">;
const returnStages: readonly ProgressStage[] = [
  {id: "returning", label: "Returning to sender", statuses: ["return_in_transit"]},
  {id: "returned", label: "Returned to sender", statuses: ["returned"]},
];

/** Displays supplied return events. It never creates labels, requests a return or issues a refund. */
export function ReadOnlyReturnTimeline({shipment, title = "Return shipment", ...options}: ReadOnlyReturnTimelineProps) {
  const returnReported = [shipment.status, ...shipment.events.map(event => event.status)].some(status => status === "return_in_transit" || status === "returned");
  return <ShipmentTimeline shipment={shipment} title={title} stages={returnStages} {...options}>
    <p className="tt-notice">{returnReported ? "This view shows the supplied carrier-reported return journey. Return scans do not establish that a refund was issued." : "No return status or return scan was supplied. A failed delivery or cancellation alone does not establish a return."}</p>
  </ShipmentTimeline>;
}
