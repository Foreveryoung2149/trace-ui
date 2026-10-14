import "server-only";
import { Trace, TraceError } from "@traceapi/sdk";
import { fromTraceTracking, type TimelineShipment } from "@traceapi/timeline";
import { starterMode } from "./access";
export async function loadTracking(): Promise<{shipment?: TimelineShipment; error?: string}> {
  try {
    const mode = starterMode(process.env.TRACE_MODE);
    if (mode === "demo") return {};
    if (!process.env.TRACE_API_KEY) return {error:"Add TRACE_API_KEY on your server to use this mode."};
    const trace = new Trace(process.env.TRACE_API_KEY, {retries:0, timeoutMs:95000});
    if (mode === "sandbox") {
      const scenario = process.env.TRACE_SANDBOX_SCENARIO || "delivered";
      if (!["pending","in_transit","out_for_delivery","delivered","exception","unknown_timezone"].includes(scenario)) return {error:"Choose a supported TRACE_SANDBOX_SCENARIO."};
      return {shipment:fromTraceTracking(await trace.sandbox(scenario as Parameters<Trace["sandbox"]>[0]))};
    }
    if (!process.env.TRACE_TRACKING_NUMBER) return {error:"Add TRACE_TRACKING_NUMBER and, when known, TRACE_CARRIER on your server."};
    return {shipment:fromTraceTracking(await trace.track({tracking_number:process.env.TRACE_TRACKING_NUMBER, ...(process.env.TRACE_CARRIER ? {carrier:process.env.TRACE_CARRIER} : {}), allow_stale:true}))};
  } catch (error) {
    if (error instanceof TraceError) return {error:error.status === 503 ? "Tracking sources are unavailable. No current carrier result was verified. Retry later; this is not a pending shipment." : `Trace returned ${error.status} (${error.code}). Check your server configuration and account limits.`};
    return {error:"The tracking request could not complete. Check the server configuration and retry later."};
  }
}
