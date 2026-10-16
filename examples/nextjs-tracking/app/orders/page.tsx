import { connection } from "next/server";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { OrderTracking } from "@traceapi/timeline";
import { starterConfiguration } from "../../lib/configuration";
import { starterDatabase } from "../../lib/database";
import { customerSession, SESSION_COOKIE } from "../../lib/customer-auth";
import { ownedOrders, type PrivateOrder } from "../../lib/order-store";
import OrderControls from "./OrderControls";

export default async function Page() {
  await connection();
  let orders:PrivateOrder[]=[];let unavailable=false;let authenticated=false;let simulated=false;
  try {
    const config=starterConfiguration();const db=starterDatabase();simulated=config.mode==="fixture";
    const identity=await customerSession(db,config.tenantId,(await cookies()).get(SESSION_COOKIE)?.value);
    if(identity){authenticated=true;orders=await ownedOrders(db,identity,config.mode);}else{authenticated=false;}
  }catch{unavailable=true;}
  if(!unavailable&&!authenticated) redirect("/sign-in");
  return <main className="starter-shell order-shell"><nav><Link href="/">Trace UI</Link><a href="https://github.com/Foreveryoung2149/trace-ui">View source ↗</a></nav><header><p className="starter-eyebrow">YOUR SHIPMENT UPDATES</p><h1>Every parcel.<br/>One clear picture.</h1><p>Saved carrier observations for your orders. Refresh reads this application&apos;s saved state; it does not initiate a carrier lookup.</p></header>
    {simulated&&<p className="order-simulation" role="status">Simulated local example. All orders and scans on this page are fictional.</p>}
    {unavailable?<section className="starter-error" role="alert"><h2>Saved tracking is unavailable</h2><p>The application could not read its private order state. No sample success has been substituted. Try again later.</p></section>:<><OrderControls/>{orders.length===0?<p>No orders are attached to this customer.</p>:orders.map((order,index)=><section key={index} className="private-order" aria-label={order.reference}>{order.unconnectedParcels>0&&<p className="order-simulation" role="status">Tracking for {order.unconnectedParcels} of {order.expectedParcels} parcels has not been connected by this application yet. This is not a carrier delivery status.</p>}<OrderTracking order={{reference:order.reference,shipments:order.shipments}}/></section>)}</>}
  </main>;
}
