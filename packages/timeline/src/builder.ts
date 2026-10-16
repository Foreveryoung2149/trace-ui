import {validateShipment, validateTraceTracking, type TimelineShipment, type ProgressStage, type ValidationResult} from "./model.ts";
export type TimelineBuilderConfig = {theme: "dark" | "light"; density: "comfortable" | "compact"; layout: "full" | "compact"; locale: string; timeZone: string; stages?: readonly ProgressStage[]};
export function parseShipmentJson(raw: string, adapter: "canonical" | "trace" = "canonical"): ValidationResult {
  if (raw.length > 100_000) return {ok: false, errors: ["Keep the local preview under 100 KB."]};
  let value: unknown;
  try { value = JSON.parse(raw); } catch {return {ok: false, errors: ["Invalid JSON. Check double quotes, commas and brackets."]};}
  return adapter === "trace" ? validateTraceTracking(value) : validateShipment(value);
}
/** Valid TypeScript/React source containing only normalized data and explicit presentation settings. */
export function timelineReactExample(shipment: TimelineShipment, config: TimelineBuilderConfig): string {
  const literal = (value: unknown) => JSON.stringify(value, null, 2).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  return `import { ShipmentTimeline, type TimelineShipment, type ShipmentTimelineProps } from "@traceapi/timeline";\nimport "@traceapi/timeline/styles.css";\n\nconst shipment = ${literal(shipment)} satisfies TimelineShipment;\n\nconst presentation = ${literal(config)} satisfies Omit<ShipmentTimelineProps, "shipment">;\n\nexport default function TrackingView() {\n  return <ShipmentTimeline shipment={shipment} {...presentation} />;\n}\n`;
}
