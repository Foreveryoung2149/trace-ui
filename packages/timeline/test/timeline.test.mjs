import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ShipmentTimeline,fromTraceTracking,isVerifiedInstant,progressIndex} from '../dist/index.js';
import {sampleShipments} from '../dist/samples.js';
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
