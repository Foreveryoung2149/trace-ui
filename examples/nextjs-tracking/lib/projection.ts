import { fromTraceTracking, isVerifiedInstant, type TimelineShipment } from "@traceapi/timeline";

export type ShipmentProjection={id:string;order_id:string;revision:number;status:string;tracking:ProjectionTracking|null;last_checked_at:string|null;last_error:string|null};
type ProjectionTracking={tracking_number:string;status:string;carrier?:{name?:string};events:{description:string;location:string|null;status?:string;timestamp:string|null;timestamp_local?:string;timestamp_timezone?:"unknown"}[];estimated_delivery?:string|null};
const object=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==="object"&&!Array.isArray(value);
const text=(value:unknown,max=2048):value is string=>typeof value==="string"&&value.length<=max;
const identifier=(value:unknown):value is string=>text(value,128)&&/^[A-Za-z0-9_-]+$/.test(value);

/** Whitelist the display projection. Never spread arbitrary webhook metadata into React. */
export function parseShipmentSnapshot(value:unknown):ShipmentProjection {
  if(!object(value)||!identifier(value.id)||!text(value.order_id,160)||!value.order_id||!Number.isSafeInteger(value.revision)||Number(value.revision)<1||Number(value.revision)>2147483647||!text(value.status,64)) throw new Error("invalid_shipment_snapshot");
  const lastChecked=isVerifiedInstant(value.last_checked_at as string|null) ? value.last_checked_at as string : null;
  let tracking:ProjectionTracking|null=null;
  if(value.tracking!==null && value.tracking!==undefined) {
    const raw=value.tracking;
    if(!object(raw)||!text(raw.tracking_number,128)||!text(raw.status,64)||!Array.isArray(raw.events)||raw.events.length>500) throw new Error("invalid_tracking_snapshot");
    const events=raw.events.map((event:unknown)=>{
      if(!object(event)||!text(event.description)||!(event.location==null||text(event.location))||!(event.timestamp==null||text(event.timestamp,128))||!(event.timestamp_local==null||text(event.timestamp_local,128))) throw new Error("invalid_tracking_event");
      const unknown=event.timestamp_timezone==="unknown";
      return {description:event.description,location:event.location as string|null||null,
        ...(text(event.status,64)?{status:event.status}:{}),
        timestamp:!unknown&&isVerifiedInstant(event.timestamp as string|null)?event.timestamp as string:null,
        ...(text(event.timestamp_local,128)?{timestamp_local:event.timestamp_local}:{}),...(unknown?{timestamp_timezone:"unknown" as const}:{})};
    });
    tracking={tracking_number:raw.tracking_number,status:raw.status,events,
      ...(object(raw.carrier)&&text(raw.carrier.name,128)?{carrier:{name:raw.carrier.name}}:{}),
      ...(text(raw.estimated_delivery,128)?{estimated_delivery:raw.estimated_delivery}:{})};
  }
  return {id:value.id,order_id:value.order_id,revision:Number(value.revision),status:value.status,tracking,last_checked_at:lastChecked,last_error:value.last_error ? "latest_lookup_unavailable":null};
}

export function shipmentView(snapshot:ShipmentProjection,simulated:boolean,now=Date.now(),staleAfterMs=6*60*60_000):TimelineShipment {
  const checked=snapshot.last_checked_at ? Date.parse(snapshot.last_checked_at) : NaN;
  // Fixed fictional dates must not age every local scenario into a failure state.
  // Real observations still use the explicit last-success/age policy below.
  const stale=Boolean(snapshot.last_error)||(!simulated&&(!Number.isFinite(checked)||now-checked>staleAfterMs));
  if(!snapshot.tracking) return {
    reference:snapshot.last_error?"Latest lookup unavailable":simulated?"Parcel":"Waiting for the first verified carrier update",
    // An API record does not establish that a carrier label was created.
    status:simulated&&!snapshot.last_error&&snapshot.status==="pending"?"pending":"unknown",
    events:[],freshness:simulated?"simulated":"unknown",lastCheckedAt:snapshot.last_checked_at};
  const view=fromTraceTracking({...snapshot.tracking,last_checked_at:snapshot.last_checked_at,stale,
    data_freshness:{state:stale?"stale":"cached"}});
  // The page carries a persistent simulation banner; stale data keeps its warning.
  return {...view,reference:"Parcel",freshness:stale?"stale":simulated?"simulated":"cached"};
}
