/** Fictional, deterministic payloads. Never send these to Trace or a carrier. */
import type { InboxEvent } from "./webhook.ts";
export const FIXTURE_ORDER_ID="order_fixture_1042";
export const FIXTURE_SHIPMENTS=["shp_fixture_1042_a","shp_fixture_1042_b"] as const;
const checked="2026-10-16T10:00:00Z";
const scan=(description:string,status:string,timestamp:string|null="2026-10-16T09:30:00Z")=>({description,status,timestamp,location:"Fictional distribution centre"});
export function fixtureSnapshot(parcel:0|1,revision:number,status="pending",options:{unknownTimezone?:boolean;error?:boolean;noTracking?:boolean}={}) {
  const events=status==="pending"?[]:[options.unknownTimezone?{...scan("Arrived at the fictional sorting facility",status,null),timestamp_local:"2026-10-16T09:30:00",timestamp_timezone:"unknown"}:scan(status==="delivered"?"Delivered to the fictional recipient":status==="out_for_delivery"?"Out for delivery — fictional scan":"Moving through the fictional network",status)];
  return {id:FIXTURE_SHIPMENTS[parcel],order_id:FIXTURE_ORDER_ID,revision,status,tracking:options.noTracking||status==="pending"?null:{tracking_number:`FICTIONAL-PARCEL-${parcel+1}`,carrier:{name:"Example carrier"},status,events},last_checked_at:status==="pending"?null:checked,last_error:options.error?"fixture_lookup_unavailable":null};
}
const event=(parcel:0|1,revision:number,status:string,options:Parameters<typeof fixtureSnapshot>[3]={}):InboxEvent=>({event_id:`evt_fixture_${parcel}_${revision}`,event_type:status==="delivered"?"shipment.delivered":"shipment.updated",created_at:`2026-10-16T10:${String(revision).padStart(2,"0")}:00Z`,test:true,shipment_revision:revision,shipment:fixtureSnapshot(parcel,revision,status,options)});
export const fixtureScenarios:Record<string,()=>InboxEvent[]>={
  "in-transit":()=>[event(0,2,"in_transit",{unknownTimezone:true}),event(1,2,"in_transit")],
  "out-of-order":()=>[event(0,3,"out_for_delivery"),event(0,2,"in_transit",{unknownTimezone:true})],
  "duplicate":()=>[event(0,3,"out_for_delivery"),event(0,3,"out_for_delivery")],
  "delivered":()=>[event(0,4,"delivered"),event(1,3,"in_transit")],
  "stale":()=>[event(0,5,"delivered",{error:true})],
  "unavailable":()=>[event(1,4,"pending",{error:true,noTracking:true})],
  "restart":()=>[event(1,5,"out_for_delivery")],
};
