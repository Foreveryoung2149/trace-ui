import type { Metadata } from "next";
import "@traceapi/timeline/styles.css";
import "./globals.css";
export const metadata: Metadata = {title:"Trace UI · Shipment timeline starter", description:"A provider-independent React shipment timeline and private Trace integration preview.", robots:{index:false,follow:false}};
export default function Layout({children}: {children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
