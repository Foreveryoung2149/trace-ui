import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createWebhookHandler} from '../lib/webhook.ts';
import {authorizedPreview,starterMode} from '../lib/access.ts';
const secret='fixture-signing-secret';
const now=1760000000000;
const event={event_id:'evt_fixture',event_type:'tracking.updated',created_at:'2026-03-17T10:00:00Z',tracking:{events:[]}};
const signature=(raw,t=now/1000)=>`t=${t},v1=${createHmac('sha256',secret).update(`${t}.`).update(raw).digest('hex')}`;
const request=(raw=JSON.stringify(event),headers={})=>new Request('http://localhost/api/webhooks/trace',{method:'POST',headers:{'content-type':'application/json','Trace-Signature':signature(raw),...headers},body:raw});
test('verifies original bytes, persists before acknowledging and safely accepts repeated deliveries',async()=>{
  const inbox=new Map();let persisted=false;
  const handler=createWebhookHandler({secret,now:()=>now,store:async value=>{const inserted=!inbox.has(value.event_id);inbox.set(value.event_id,value);persisted=true;return inserted;}});
  const first=await handler(request());assert.equal(persisted,true);assert.equal(first.status,200);assert.equal((await first.json()).duplicate,false);
  const second=await handler(request());assert.equal((await second.json()).duplicate,true);assert.equal(inbox.size,1);
});
test('invalid, altered and expired signatures never reach storage',async()=>{
  let calls=0;const handler=createWebhookHandler({secret,now:()=>now,store:async()=>{calls++;return true;}});
  for(const req of [request(undefined,{'Trace-Signature':'invalid'}),request(JSON.stringify(event)+' ',{'Trace-Signature':signature(JSON.stringify(event))}),request(undefined,{'Trace-Signature':signature(JSON.stringify(event),now/1000-301)})])assert.equal((await handler(req)).status,401);
  assert.equal(calls,0);
});
test('failed durable insert returns retryable error, not a successful acknowledgement',async()=>{
  const handler=createWebhookHandler({secret,now:()=>now,store:async()=>{throw new Error('fixture database offline');}});
  const response=await handler(request());assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'inbox_unavailable'});
});
test('missing configuration, malformed events, ID mismatch and oversized bodies fail closed',async()=>{
  let calls=0;const store=async()=>{calls++;return true;};
  assert.equal((await createWebhookHandler({secret:undefined,store})(request())).status,503);
  const handler=createWebhookHandler({secret,store,now:()=>now});
  assert.equal((await handler(request('{'))).status,400);
  assert.equal((await handler(request(JSON.stringify({event_id:'bad id'})))).status,400);
  assert.equal((await handler(request(undefined,{'Trace-Event-Id':'evt_other'}))).status,400);
  assert.equal((await handler(request('x'.repeat(512001)))).status,413);assert.equal(calls,0);
});
test('live preview requires strong separate access credential and unknown modes are rejected',()=>{
  assert.equal(starterMode(undefined),'demo');assert.throws(()=>starterMode('production'));
  assert.equal(authorizedPreview('Basic '+Buffer.from('trace:short').toString('base64'),'short'),false);
  const password='fixture-password-with-enough-length';
  assert.equal(authorizedPreview('Basic '+Buffer.from(`trace:${password}`).toString('base64'),password),true);
  assert.equal(authorizedPreview('Basic '+Buffer.from(`other:${password}`).toString('base64'),password),false);
  assert.equal(authorizedPreview(null,password),false);
});
test('rotation overlap accepts previous secret only until its configured expiry',async()=>{
  let calls=0;const old='fixture-previous-signing-secret';const raw=JSON.stringify(event);
  const previousSignature=`t=${now/1000},v1=${createHmac('sha256',old).update(`${now/1000}.`).update(raw).digest('hex')}`;
  const store=async()=>{calls++;return true;};
  const previousRequest=()=>request(raw,{'Trace-Signature':previousSignature});
  const overlap=createWebhookHandler({secret,previousSecret:{value:old,expiresAt:now+1000},now:()=>now,store});
  assert.equal((await overlap(previousRequest())).status,200);
  const expired=createWebhookHandler({secret,previousSecret:{value:old,expiresAt:now-1},now:()=>now,store});
  assert.equal((await expired(previousRequest())).status,401);assert.equal(calls,1);
});
