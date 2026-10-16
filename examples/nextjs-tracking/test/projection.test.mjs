import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseShipmentSnapshot,shipmentView} from '../lib/projection.ts';
import {fixtureSnapshot} from '../lib/fixtures.ts';
import {starterConfiguration,sameOrigin} from '../lib/configuration.ts';
import {shipmentCreationKey} from '../lib/order-store.ts';
const now=Date.parse('2026-10-16T10:30:00Z');

test('projection retains unknown timezones and never serializes arbitrary metadata or tracking references',()=>{
  const raw=fixtureSnapshot(0,2,'in_transit',{unknownTimezone:true});raw.metadata={private:'do not display'};
  const snapshot=parseShipmentSnapshot(raw);const view=shipmentView(snapshot,true,now);
  assert.equal(view.events[0].timestamp,null);assert.equal(view.events[0].timezone,'unknown');
  assert.equal(view.events[0].localTime,'2026-10-16T09:30:00');assert.equal(view.freshness,'simulated');
  assert.equal(view.reference,'Parcel');assert.ok(!JSON.stringify(view).includes('FICTIONAL-PARCEL'));
  assert.ok(!JSON.stringify(snapshot).includes('do not display'));
});
test('a failed acquisition is unavailable before first scan and stale after a scan',()=>{
  const unavailable=shipmentView(parseShipmentSnapshot(fixtureSnapshot(1,4,'pending',{error:true,noTracking:true})),true,now);
  assert.equal(unavailable.status,'unknown');assert.equal(unavailable.events.length,0);
  const pending=shipmentView(parseShipmentSnapshot(fixtureSnapshot(1,1)),true,now);assert.equal(pending.status,'pending');
  const unobserved=shipmentView(parseShipmentSnapshot(fixtureSnapshot(1,1)),false,now);
  assert.equal(unobserved.status,'unknown');assert.match(unobserved.reference,/Waiting for the first verified/);
  const failed=shipmentView(parseShipmentSnapshot(fixtureSnapshot(1,4,'pending',{error:true,noTracking:true})),false,now);
  assert.equal(failed.status,'unknown');assert.equal(failed.reference,'Latest lookup unavailable');
  const stale=shipmentView(parseShipmentSnapshot(fixtureSnapshot(0,5,'delivered',{error:true})),true,now);
  assert.equal(stale.status,'delivered');assert.equal(stale.freshness,'stale');assert.equal(stale.events.length,1);
  assert.equal(shipmentView(parseShipmentSnapshot(fixtureSnapshot(0,4,'delivered')),false,now+7*60*60_000).freshness,'stale');
  assert.equal(shipmentView(parseShipmentSnapshot(fixtureSnapshot(0,4,'delivered')),true,now+365*24*60*60_000).freshness,'simulated');
});
test('shipment creation keys stay stable and within API limits for maximum identifiers',()=>{
  const tenant='t'.repeat(128),order='Order #'+('o'.repeat(153));
  const key=shipmentCreationKey(tenant,order,0);
  assert.ok(key.length<=128);assert.equal(key,shipmentCreationKey(tenant,order,0));
  assert.notEqual(key,shipmentCreationKey(tenant,order,1));
  assert.notEqual(shipmentCreationKey('a/b','c',0),shipmentCreationKey('a','b/c',0));
  assert.throws(()=>shipmentCreationKey(tenant,order,10));
});
test('revision and snapshot validation fails closed without inventing missing dates',()=>{
  for(const revision of [undefined,0,-1,1.5,Number.MAX_SAFE_INTEGER])assert.throws(()=>parseShipmentSnapshot({...fixtureSnapshot(0,1),revision}));
  assert.throws(()=>parseShipmentSnapshot({...fixtureSnapshot(0,1),order_id:''}));
  assert.equal(parseShipmentSnapshot({...fixtureSnapshot(0,1),order_id:'Order #1042 / Europe'}).order_id,'Order #1042 / Europe');
  const value=fixtureSnapshot(0,2,'in_transit');value.tracking.events[0].timestamp='2026-10-16T09:30:00';
  assert.equal(parseShipmentSnapshot(value).tracking.events[0].timestamp,null);
});
test('fixture deployment is loopback-only; live requires configured HTTPS and strong secrets',()=>{
  const env={STARTER_DATA_MODE:'fixture',STARTER_TENANT_ID:'fixture_tenant',STARTER_ORIGIN:'http://localhost:3000',STARTER_AUTH_SECRET:'fixture-auth-secret-only-for-this-local-example'};
  assert.equal(starterConfiguration(env).mode,'fixture');
  assert.throws(()=>starterConfiguration({...env,STARTER_ORIGIN:'https://example.com'}));
  assert.throws(()=>starterConfiguration({...env,STARTER_DATA_MODE:'live'}));
  assert.throws(()=>starterConfiguration({...env,STARTER_AUTH_SECRET:'short'}));
  assert.throws(()=>starterConfiguration({...env,STARTER_ORIGIN:'http://localhost:3000?token=private'}));
  const live={...env,STARTER_DATA_MODE:'live',STARTER_ORIGIN:'https://orders.example.com',STARTER_AUTH_SECRET:'a'.repeat(64),TRACE_WEBHOOK_SECRET:'b'.repeat(64)};
  assert.equal(starterConfiguration(live).mode,'live');assert.throws(()=>starterConfiguration({...live,TRACE_WEBHOOK_SECRET:undefined}));
  assert.equal(sameOrigin(new Request('http://localhost',{headers:{Origin:'http://localhost:3000'}}),'http://localhost:3000'),true);
  assert.equal(sameOrigin(new Request('http://localhost',{headers:{Origin:'https://attacker.invalid'}}),'http://localhost:3000'),false);
});
