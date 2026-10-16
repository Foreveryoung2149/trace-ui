import type { Pool } from "pg";
import { createHash, randomUUID } from "node:crypto";
import type { CustomerIdentity } from "./customer-auth.ts";
import { parseShipmentSnapshot, shipmentView, type ShipmentProjection } from "./projection.ts";
import type { TimelineShipment } from "@traceapi/timeline";

export type PrivateOrder={reference:string;simulated:boolean;shipments:TimelineShipment[];expectedParcels:number;unconnectedParcels:number};
export function shipmentCreationKey(tenantId:string,orderId:string,index:number):string {
  if(!Number.isInteger(index)||index<0||index>=10) throw new Error("invalid_parcel_index");
  return `starter_${createHash("sha256").update(JSON.stringify([tenantId,orderId,index])).digest("hex")}`;
}
export async function createOrder(db:Pool,identity:CustomerIdentity,reference:string,simulated:boolean,id:string=randomUUID(),expectedParcels=1):Promise<string> {
  if(!reference || reference.length>160 || !Number.isInteger(expectedParcels)||expectedParcels<1||expectedParcels>10) throw new Error("invalid_order_configuration");
  await db.query("INSERT INTO trace_starter_orders (tenant_id,id,customer_id,reference,simulated,expected_parcels) VALUES ($1,$2,$3,$4,$5,$6)",[identity.tenantId,id,identity.customerId,reference,simulated,expectedParcels]);
  return id;
}
export async function attachShipment(db:Pool,tenantId:string,orderId:string,value:unknown) {
  const snapshot=parseShipmentSnapshot(value);
  if(snapshot.order_id!==orderId) throw new Error("shipment_order_mismatch");
  const result=await db.query(`INSERT INTO trace_starter_shipments (tenant_id,shipment_id,order_id,revision,snapshot) VALUES ($1,$2,$3,$4,$5::jsonb)
    ON CONFLICT (tenant_id,shipment_id) DO UPDATE SET revision=EXCLUDED.revision,snapshot=EXCLUDED.snapshot,updated_at=now()
    WHERE trace_starter_shipments.order_id=EXCLUDED.order_id AND trace_starter_shipments.revision<EXCLUDED.revision RETURNING order_id`,[tenantId,snapshot.id,orderId,snapshot.revision,JSON.stringify(snapshot)]);
  if(!result.rowCount) {
    const existing=await db.query("SELECT order_id FROM trace_starter_shipments WHERE tenant_id=$1 AND shipment_id=$2",[tenantId,snapshot.id]);
    if(existing.rows[0]?.order_id!==orderId) throw new Error("shipment_ownership_mismatch");
  }
}
/** Authorization is part of the query, independent of any Proxy/preview gate. */
export async function ownedOrders(db:Pool,identity:CustomerIdentity,mode:"fixture"|"live",now=Date.now()):Promise<PrivateOrder[]> {
  const result=await db.query(`SELECT o.id,o.reference,o.simulated,o.expected_parcels,s.snapshot FROM trace_starter_orders o
    LEFT JOIN trace_starter_shipments s ON s.tenant_id=o.tenant_id AND s.order_id=o.id
    WHERE o.tenant_id=$1 AND o.customer_id=$2 AND o.simulated=$3 ORDER BY o.created_at,o.id,s.shipment_id`,[identity.tenantId,identity.customerId,mode==="fixture"]);
  const orders=new Map<string,PrivateOrder>();
  for(const row of result.rows) {
    let order=orders.get(row.id);
    if(!order){order={reference:row.reference,simulated:row.simulated,shipments:[],expectedParcels:row.expected_parcels,unconnectedParcels:0};orders.set(row.id,order);}
    if(row.snapshot) order.shipments.push(shipmentView(row.snapshot as ShipmentProjection,row.simulated,now));
  }
  for(const order of orders.values()) {
    order.unconnectedParcels=Math.max(0,order.expectedParcels-order.shipments.length);
    for(let index=0;index<order.unconnectedParcels;index++)order.shipments.push({reference:"Tracking not connected",status:"unknown",freshness:"unknown",events:[]});
  }
  return [...orders.values()];
}
