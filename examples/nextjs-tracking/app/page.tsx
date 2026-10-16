import { connection } from "next/server";
import Link from "next/link";
import TimelineDemo from "../../../packages/timeline/demo/TimelineDemo";
import { loadTracking } from "../lib/tracking";
export default async function Page() {
  await connection();
  const {shipment,error} = await loadTracking();
  return <main className="starter-shell"><nav><a href="https://traceapi.dev/tracking-timeline">Trace UI</a><Link href="/sign-in">Private order example</Link><a href="https://github.com/Foreveryoung2149/trace-ui">View source ↗</a></nav>
    <header><p className="starter-eyebrow">OPEN SOURCE · REACT + NEXT.JS</p><h1>The journey,<br />beautifully clear.</h1><p>A shipment timeline you can make your own. Start with local samples, then connect your data on the server.</p></header>
    {error ? <section className="starter-error" role="alert"><h2>Tracking is unavailable</h2><p>{error}</p><p>No sample shipment has been substituted for your request.</p></section> : <TimelineDemo shipment={shipment} />}
    <footer><p>Provider-independent component · MIT licensed</p><a href="https://traceapi.dev/docs">Trace API documentation ↗</a></footer>
  </main>;
}
