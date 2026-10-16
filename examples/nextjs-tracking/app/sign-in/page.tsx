import { connection } from "next/server";
import Link from "next/link";
import { starterConfiguration } from "../../lib/configuration";
import LoginForm from "./LoginForm";
export default async function Page() {
  await connection();
  let simulated=false;let configured=true;
  try{simulated=starterConfiguration().mode==="fixture";}catch{configured=false;}
  return <main className="starter-shell"><nav><Link href="/">Trace UI</Link><a href="https://traceapi.dev/docs">Documentation ↗</a></nav><header><p className="starter-eyebrow">PRIVATE CUSTOMER ORDERS</p><h1>Your order,<br/>in clear view.</h1><p>Sign in with the customer credentials provisioned by this application. The integration preview password does not grant order access.</p></header>
    {simulated&&<p className="order-simulation" role="status">Simulated local example. These are fictional parcels, not live shipments.</p>}
    {configured?<LoginForm/>:<section className="starter-error" role="alert"><h2>Order access is unavailable</h2><p>Configure the starter database, tenant, origin and authentication secret. Sample orders have not been substituted.</p></section>}
  </main>;
}
