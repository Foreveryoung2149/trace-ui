import {OrderTracking, type TimelineOrder, type TimelineOptions, type TimelinePresentation} from "@traceapi/timeline";

export type OrderTrackingPageProps = TimelineOptions & Pick<TimelinePresentation, "theme" | "density" | "direction"> & {order: TimelineOrder; heading?: string};

/** A server-renderable page body. Authorize access to the order before passing its display data. */
export function OrderTrackingPage({order, heading = "Your order, on its way.", theme = "light", density = "comfortable", ...options}: OrderTrackingPageProps) {
  return <main aria-label="Order tracking" style={{maxWidth: 1120, marginInline: "auto", padding: "32px 20px", color: theme === "light" ? "#18181b" : "#f4f4f5", background: theme === "light" ? "#fafafa" : "#09090b", fontFamily: "system-ui, sans-serif"}}>
    <header style={{marginBlockEnd: 28}}><h1 style={{fontWeight: 400, fontSize: "clamp(28px, 5vw, 44px)", letterSpacing: "-.04em", margin: "0 0 12px"}}>{heading}</h1><p style={{fontSize: 14, lineHeight: 1.7, margin: 0}}>Each parcel has its own journey. Check its latest reported scan and any freshness notice below.</p></header>
    <OrderTracking order={order} theme={theme} density={density} {...options}/>
  </main>;
}
