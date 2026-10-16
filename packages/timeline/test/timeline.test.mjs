import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ShipmentTimeline,ShipmentSummary,ShipmentHistory,ShipmentProgress,ShipmentFreshness,FreshnessNotice,ExceptionNotice,TimelineFrame,OrderTracking,fromTraceTracking,isVerifiedInstant,progressIndex,latestEventIndex,formatInstant,resolveFormatting,validateShipment,parseShipmentJson,timelineReactExample,getTimelineMessages} from '../dist/index.js';
import {sampleShipments,sampleOrders,simulateJourney} from '../dist/samples.js';
import ts from 'typescript';
const render=shipment=>renderToStaticMarkup(React.createElement(ShipmentTimeline,{shipment}));
test('unknown local times remain unconverted and retain supplied event order',()=>{
  const html=render(sampleShipments.unknown_timezone);
  assert.match(html,/2026-03-17 19:35:00/);assert.match(html,/Timezone not supplied/);
  assert.doesNotMatch(html,/<time dateTime="2026-03-17/);
  assert.ok(html.indexOf('sorting facility')<html.indexOf('Shipping label'));
  assert.match(html,/Unverified times remain unconverted/);
});
test('stale results disclose unverified current state rather than imply a live lookup',()=>{
  const html=render(sampleShipments.stale);assert.match(html,/current shipment state has not been verified/);
  assert.match(html,/Last known delivery progress/);assert.doesNotMatch(html,/Verified at lookup/);
});
test('unavailable is distinct from pending and exceptions do not imply completed stages',()=>{
  assert.match(render(sampleShipments.unavailable),/Status unavailable/);
  assert.doesNotMatch(render(sampleShipments.unavailable),/Awaiting carrier updates/);
  assert.doesNotMatch(render(sampleShipments.exception),/aria-current="step"/);
  assert.doesNotMatch(render(sampleShipments.pending),/aria-current="step"/);
  assert.equal(progressIndex('exception'),null);assert.equal(progressIndex('customs'),1);
});
test('explicit offsets render in the chosen timezone; offset-less and invalid dates stay unverified',()=>{
  for(const value of ['2026-03-17T10:00:00','2026-02-30T10:00:00Z','2026-03-17T25:00:00Z','invalid'])assert.equal(isVerifiedInstant(value),false);
  assert.equal(isVerifiedInstant('2026-03-17T10:00:00+02:00'),true);
  const html=render({status:'in_transit',events:[{timestamp:'2026-03-17T10:00:00+02:00',description:'Scan'}]});
  assert.match(html,/08:00/);assert.match(html,/UTC/);
});
test('Trace adapter preserves provenance, treats unknown states honestly and never mutates input',()=>{
  const input={tracking_number:'FIXTURE',status:'carrier_new_state',stale:true,cached:true,carrier:{name:'Fixture'},events:[{description:'Scan',timestamp:'2026-03-17T10:00:00Z',timestamp_local:'2026-03-17T10:00:00',timestamp_timezone:'unknown'}]};
  const before=JSON.stringify(input);const shipment=fromTraceTracking(input);
  assert.equal(shipment.status,'unknown');assert.equal(shipment.freshness,'stale');assert.equal(shipment.events[0].timestamp,null);assert.equal(JSON.stringify(input),before);
  assert.equal(fromTraceTracking({...input,stale:false,cached:false,data_freshness:undefined}).freshness,'unknown');
});
test('all local examples render accessible lists and escape arbitrary provider text',()=>{
  for(const sample of Object.values(sampleShipments))assert.match(render(sample),/aria-label="Shipment journey"/);
  const html=render({status:'delivered',events:[{timestamp:null,description:'<script>bad()</script>',location:'<img src=x>'}]});
  assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);assert.match(html,/Event time not verified/);
});
test('latest-event highlighting requires order metadata or comparable verified instants',()=>{
  assert.equal(latestEventIndex(sampleShipments.unknown_timezone),null);
  assert.equal(latestEventIndex({...sampleShipments.unknown_timezone,eventOrder:'newest_first'}),0);
  assert.equal(latestEventIndex({...sampleShipments.unknown_timezone,eventOrder:'oldest_first'}),1);
  const events=[{id:'old',description:'Old',timestamp:'2026-03-18T10:00:00+02:00'},{id:'new',description:'New',timestamp:'2026-03-18T09:00:00Z'}];
  assert.equal(latestEventIndex({status:'in_transit',events}),1);
  assert.equal(latestEventIndex({status:'in_transit',events,latestEventId:'old'}),0);
  assert.equal(latestEventIndex({status:'in_transit',events,latestEventId:'missing'}),null);
  assert.doesNotMatch(render(sampleShipments.unknown_timezone),/class="tt-event-mark tt-event-latest"/);
});
test('invalid locale and timezone never crash SSR or silently select host timezone',()=>{
  const formatted=formatInstant('2026-03-17T10:00:00Z','not_a_locale','Bad/Zone');
  assert.match(formatted,/10:00/);assert.match(formatted,/UTC/);
  assert.deepEqual(resolveFormatting('not_a_locale','Bad/Zone'),{locale:'en',timeZone:'UTC'});
  assert.equal(formatInstant('bad','en','UTC'),'Unverified time');
  const html=renderToStaticMarkup(React.createElement(ShipmentTimeline,{shipment:sampleShipments.delivered,locale:'not_a_locale',timeZone:'Bad/Zone'}));
  assert.match(html,/Times shown in UTC/);assert.match(html,/lang="en"/);
});
test('dictionary localization, override labels and RTL apply to UI without altering provider text',()=>{
  const html=renderToStaticMarkup(React.createElement(ShipmentTimeline,{shipment:sampleShipments.unknown_timezone,locale:'ar'}));
  assert.match(html,/dir="rtl"/);assert.match(html,/المنطقة الزمنية غير متوفرة/);assert.match(html,/Arrived at the sorting facility/);
  const spanish=getTimelineMessages('es-MX',{statuses:{delivered:'Recibido'},history:'Movimientos'});
  assert.equal(spanish.statuses.delivered,'Recibido');assert.equal(spanish.statuses.pending,'Esperando actualizaciones');
  assert.equal(spanish.history,'Movimientos');assert.equal(getTimelineMessages('nonsense').title,'Shipment journey');
});
test('primitives compose without a client runtime and preserve freshness/exception distinctions',()=>{
  const shipment=sampleShipments.stale;
  const html=renderToStaticMarkup(React.createElement(TimelineFrame,{theme:'light',density:'compact',title:'Custom shipment'},
    ShipmentSummary({shipment}),FreshnessNotice({shipment}),ExceptionNotice({shipment}),ShipmentProgress({shipment}),ShipmentHistory({shipment}),ShipmentFreshness({shipment}),
  ));
  assert.match(html,/data-theme="light"/);assert.match(html,/data-density="compact"/);assert.match(html,/Last known delivery progress/);
  assert.doesNotMatch(html,/<script|<iframe|https?:\/\//);
});
test('return, cancellation and pickup never imply a completed forward-delivery path',()=>{
  for(const key of ['returning','returned','cancelled','pickup'])assert.doesNotMatch(render(sampleShipments[key]),/aria-current="step"/);
  const stages=[{id:'returning',label:'Return in progress',statuses:['return_in_transit']},{id:'returned',label:'Returned to sender',statuses:['returned']}];
  const html=renderToStaticMarkup(React.createElement(ShipmentTimeline,{shipment:sampleShipments.returned,stages}));
  assert.match(html,/Returned to sender/);assert.equal((html.match(/aria-current="step"/g)||[]).length,1);
});
test('split orders keep separate parcel histories and never claim all delivered prematurely',()=>{
  const html=renderToStaticMarkup(React.createElement(OrderTracking,{order:sampleOrders.split,locale:'en'}));
  assert.match(html,/2 parcels/);assert.match(html,/Parcels have separate delivery journeys/);assert.doesNotMatch(html,/All parcels delivered/);
  assert.match(html,/DEMO-1042/);assert.match(html,/DEMO-1043/);
  const done=renderToStaticMarkup(React.createElement(OrderTracking,{order:{shipments:[sampleShipments.delivered]}}));assert.match(done,/All parcels delivered/);
  for(const freshness of ['stale','unknown',undefined]){const staleDone=renderToStaticMarkup(React.createElement(OrderTracking,{order:{shipments:[{...sampleShipments.delivered,freshness}]}}));assert.doesNotMatch(staleDone,/All parcels delivered/);}
  const empty=renderToStaticMarkup(React.createElement(OrderTracking,{order:{shipments:[]}}));assert.doesNotMatch(empty,/All parcels delivered/);assert.match(empty,/No parcels were supplied/);
});
test('runtime JSON validation rejects hostile shapes but preserves safe unknown-time evidence',()=>{
  for(const value of [null,[],{status:'constructor',events:[]},{status:'delivered',events:[null]},{status:'delivered',events:[{description:{secret:true},timestamp:null}]}])assert.equal(validateShipment(value).ok,false);
  assert.equal(parseShipmentJson('{bad').ok,false);assert.equal(parseShipmentJson(' '.repeat(100001)).ok,false);
  const result=validateShipment({...sampleShipments.unknown_timezone,secret:'not-exported',events:[{...sampleShipments.unknown_timezone.events[0],privateCustomer:'not-exported'}]});
  assert.equal(result.ok,true);assert.equal(result.shipment.events[0].timezone,'unknown');assert.doesNotMatch(JSON.stringify(result.shipment),/not-exported/);
  const naive=validateShipment({status:'in_transit',events:[{description:'Naive scan',timestamp:'2026-03-17T10:00:00'}]});assert.equal(naive.ok,true);assert.equal(naive.warnings.length,1);
});
test('Trace JSON adapter is a checked boundary, including unknown timezone and stale priority',()=>{
  const result=parseShipmentJson(JSON.stringify({tracking_number:'FIXTURE',status:'new_provider_status',cached:true,stale:true,carrier:{name:'Fixture'},events:[{description:'A scan',timestamp:'2026-03-17T10:00:00Z',timestamp_local:'2026-03-17T10:00:00',timestamp_timezone:'unknown'}]}),'trace');
  assert.equal(result.ok,true);assert.equal(result.shipment.status,'unknown');assert.equal(result.shipment.freshness,'stale');assert.equal(result.shipment.events[0].timestamp,null);assert.equal(result.shipment.events[0].localTime,'2026-03-17T10:00:00');
  assert.equal(parseShipmentJson(JSON.stringify({tracking_number:'X',status:'in_transit',events:[{description:'A scan',timestamp:null,timestamp_local:{unsafe:'value'}}]}),'trace').ok,false);
});
test('journey replay uses supplied scans, retains source data and labels snapshots simulated',()=>{
  const original=JSON.stringify(sampleShipments.delivered);
  const start=simulateJourney(sampleShipments.delivered,0), middle=simulateJourney(sampleShipments.delivered,2), end=simulateJourney(sampleShipments.delivered,99);
  assert.equal(start.status,'pending');assert.equal(start.events.length,0);assert.equal(middle.status,'in_transit');assert.equal(middle.events.length,2);assert.equal(end.status,'delivered');
  assert.equal(middle.freshness,'simulated');assert.equal(latestEventIndex(middle),0);assert.equal(JSON.stringify(sampleShipments.delivered),original);
  assert.equal(simulateJourney(sampleShipments.delivered,NaN).events.length,0);
  const unsortable=simulateJourney(sampleShipments.unknown_timezone,1);assert.equal(unsortable.status,'unknown');assert.equal(unsortable.events[0].description,sampleShipments.unknown_timezone.events[0].description);assert.equal(latestEventIndex(unsortable),null);
  const ascending={...sampleShipments.delivered,eventOrder:'oldest_first',events:[...sampleShipments.delivered.events].reverse()};assert.equal(simulateJourney(ascending,1).status,'pending');
});
test('export is valid TSX with exact explicit presentation settings and escaped arbitrary text',()=>{
  const config={theme:'light',density:'compact',layout:'compact',locale:'ar',timeZone:'UTC'};
  const source=timelineReactExample({...sampleShipments.pending,reference:'</script><script>alert(1)</script>'},config);
  const parsed=ts.transpileModule(source,{reportDiagnostics:true,fileName:'TrackingView.tsx',compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}});
  assert.deepEqual(parsed.diagnostics,[]);assert.match(source,/"density": "compact"/);assert.match(source,/"locale": "ar"/);assert.doesNotMatch(source,/<\/script>/);assert.match(source,/\\u003c/);
});
