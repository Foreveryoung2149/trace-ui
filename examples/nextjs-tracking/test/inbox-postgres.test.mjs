import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {provisionCustomer,signInCustomer,customerSession,revokeSession,SESSION_SECONDS} from '../lib/customer-auth.ts';
import {createOrder,attachShipment,ownedOrders} from '../lib/order-store.ts';
import {storeInboxEvent,claimInboxEvent,processInboxClaim,processNextInboxEvent,failInboxClaim} from '../lib/inbox-processor.ts';
import {FIXTURE_ORDER_ID,fixtureSnapshot,fixtureScenarios} from '../lib/fixtures.ts';
import {createWebhookHandler} from '../lib/webhook.ts';
import {createHmac} from 'node:crypto';

const enabled=Boolean(process.env.TRACE_STARTER_TEST_DATABASE_URL);
async function database(run) {
  const schema='trace_starter_test_'+randomUUID().replaceAll('-','');
  const admin=new Pool({connectionString:process.env.TRACE_STARTER_TEST_DATABASE_URL});
  let db;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    db=new Pool({connectionString:process.env.TRACE_STARTER_TEST_DATABASE_URL,options:`-c search_path=${schema}`,max:5});
    await db.query(await readFile(new URL('../scripts/webhook-inbox.sql',import.meta.url),'utf8'));
    await run(db,schema);
  }finally{if(db)await db.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}
}
const tenant='tenant_fixture';
const password='fixture-customer-password-with-enough-length';
async function seed(db,tenantId=tenant,customerId='customer_fixture') {
  await provisionCustomer(db,tenantId,'demo-customer',password,customerId);
  await createOrder(db,{tenantId,customerId},'Example order #1042',true,FIXTURE_ORDER_ID,2);
  for(let parcel=0;parcel<2;parcel++)await attachShipment(db,tenantId,FIXTURE_ORDER_ID,fixtureSnapshot(parcel,1));
}
const readRevision=async db=>Number((await db.query('SELECT revision FROM trace_starter_shipments WHERE tenant_id=$1 AND shipment_id=$2',[tenant,'shp_fixture_1042_a'])).rows[0].revision);

test('Postgres deduplicates concurrent accepted raw events within a tenant, without merging tenants',{skip:!enabled},async()=>database(async db=>{
  const event=fixtureScenarios['in-transit']()[0];
  const results=await Promise.all(Array.from({length:4},()=>storeInboxEvent(db,tenant,event)));
  assert.equal(results.filter(Boolean).length,1);
  assert.equal(await storeInboxEvent(db,'other_tenant',event),true);
  await assert.rejects(storeInboxEvent(db,tenant,{...event,created_at:'different'}),/event_id_payload_conflict/);
  const rows=await db.query('SELECT payload FROM trace_webhook_inbox WHERE tenant_id=$1',[tenant]);
  assert.deepEqual(rows.rows[0].payload,event);
}));

test('newer revisions win regardless of delivery order; raw history remains intact',{skip:!enabled},async()=>database(async db=>{
  await seed(db);
  for(const event of fixtureScenarios['out-of-order']())await storeInboxEvent(db,tenant,event);
  assert.equal(await processNextInboxEvent(db,tenant,'fixture'),'applied');
  assert.equal(await processNextInboxEvent(db,tenant,'fixture'),'obsolete');
  assert.equal(await readRevision(db),3);
  assert.equal((await db.query('SELECT count(*)::int AS count FROM trace_webhook_inbox WHERE processed_at IS NOT NULL')).rows[0].count,2);
  assert.equal(await storeInboxEvent(db,tenant,fixtureScenarios['duplicate']()[0]),false);
}));

test('projection and processed marker roll back together; the saved event retries safely',{skip:!enabled},async()=>database(async db=>{
  await seed(db);await storeInboxEvent(db,tenant,fixtureScenarios['in-transit']()[0]);
  const now=new Date(Date.now()+1000);const claim=await claimInboxEvent(db,tenant,{now});assert.ok(claim);
  await assert.rejects(processInboxClaim(db,claim,'fixture',{now,afterProjection(){throw new Error('fixture_commit_failure');}}),/fixture_commit_failure/);
  assert.equal(await readRevision(db),1);
  assert.equal((await db.query('SELECT processed_at FROM trace_webhook_inbox')).rows[0].processed_at,null);
  await failInboxClaim(db,claim,new Error('fixture_commit_failure'),now);
  assert.equal(await processNextInboxEvent(db,tenant,'fixture',{now:new Date(now.getTime()+3000)}),'applied');
  assert.equal(await readRevision(db),2);
}));

test('expired leases recover and an old worker cannot overwrite the new claim',{skip:!enabled},async()=>database(async db=>{
  await seed(db);await storeInboxEvent(db,tenant,fixtureScenarios['in-transit']()[0]);
  const now=new Date(Date.now()+1000);const old=await claimInboxEvent(db,tenant,{now,leaseMs:1000});assert.ok(old);
  const later=new Date(now.getTime()+1001);const fresh=await claimInboxEvent(db,tenant,{now:later,leaseMs:1000});
  assert.notEqual(old.token,fresh.token);
  assert.equal(await processInboxClaim(db,old,'fixture',{now:later}),'lost_lease');
  assert.equal(await processInboxClaim(db,fresh,'fixture',{now:later}),'applied');
  assert.equal(await readRevision(db),2);
}));

test('parallel processors apply a revision once and a replay cannot create another effect',{skip:!enabled},async()=>database(async db=>{
  await seed(db);await storeInboxEvent(db,tenant,fixtureScenarios['in-transit']()[0]);
  const results=await Promise.all(Array.from({length:4},()=>processNextInboxEvent(db,tenant,'fixture')));
  assert.equal(results.filter(result=>result==='applied').length,1);
  assert.equal(await readRevision(db),2);
  const replay={...fixtureScenarios['in-transit']()[0],event_id:'evt_fixture_replay_different_delivery'};
  await storeInboxEvent(db,tenant,replay);assert.equal(await processNextInboxEvent(db,tenant,'fixture'),'obsolete');
}));

test('revision conflicts and wrong order ownership go to dead letter without altering a projection',{skip:!enabled},async()=>database(async db=>{
  await seed(db);
  const base=fixtureScenarios['in-transit']()[0];
  const mismatched={...base,event_id:'evt_wrong_order',shipment:{...base.shipment,order_id:'someone_elses_order'}};
  await storeInboxEvent(db,tenant,mismatched);assert.equal(await processNextInboxEvent(db,tenant,'fixture'),'retry_or_dead');
  assert.equal(await readRevision(db),1);
  const conflict={...base,event_id:'evt_same_revision_conflict',shipment_revision:1,shipment:{...base.shipment,revision:1}};
  await storeInboxEvent(db,tenant,conflict);await processNextInboxEvent(db,tenant,'fixture');
  assert.equal(await readRevision(db),1);
  assert.equal((await db.query("SELECT count(*)::int AS count FROM trace_webhook_inbox WHERE status='dead'")).rows[0].count,2);
}));

test('fixture updates cannot enter live projections and equal envelope/snapshot revision is required',{skip:!enabled},async()=>database(async db=>{
  await seed(db);const event=fixtureScenarios['in-transit']()[0];
  await storeInboxEvent(db,tenant,event);await processNextInboxEvent(db,tenant,'live');assert.equal(await readRevision(db),1);
  const invalid={...event,event_id:'evt_bad_revision',shipment_revision:99};
  await storeInboxEvent(db,tenant,invalid);await processNextInboxEvent(db,tenant,'fixture');assert.equal(await readRevision(db),1);
  assert.equal((await db.query("SELECT count(*)::int AS count FROM trace_webhook_inbox WHERE status='dead'")).rows[0].count,2);
}));
test('legacy snapshots without revisions await explicit reconciliation and never regress saved state',{skip:!enabled},async()=>database(async db=>{
  await seed(db);const event=fixtureScenarios['in-transit']()[0];delete event.shipment.revision;delete event.shipment_revision;
  await storeInboxEvent(db,tenant,event);await processNextInboxEvent(db,tenant,'fixture');
  assert.equal(await readRevision(db),1);
  const row=(await db.query('SELECT status,last_error,processed_at,payload FROM trace_webhook_inbox')).rows[0];
  assert.equal(row.status,'needs_reconciliation');assert.equal(row.last_error,'revision_reconciliation_required');assert.equal(row.processed_at,null);assert.deepEqual(row.payload,event);
  assert.equal(await processNextInboxEvent(db,tenant,'fixture'),null);
}));

test('customer session and order queries enforce both tenant and customer ownership',{skip:!enabled},async()=>database(async db=>{
  await seed(db);await seed(db,'other_tenant','other_customer');await provisionCustomer(db,tenant,'another-customer',password,'another_customer');
  const config={tenantId:tenant,mode:'fixture',origin:'http://localhost:3000',authSecret:'fixture-auth-secret-with-enough-characters'};
  const login=await signInCustomer(db,config,'demo-customer',password);assert.ok(login.token);
  const identity=await customerSession(db,tenant,login.token);assert.equal(identity.customerId,'customer_fixture');
  assert.equal(await customerSession(db,'other_tenant',login.token),null);
  const orders=await ownedOrders(db,identity,'fixture',Date.parse('2026-10-16T10:30:00Z'));assert.equal(orders.length,1);assert.equal(orders[0].shipments.length,2);
  assert.deepEqual(await ownedOrders(db,{tenantId:tenant,customerId:'another_customer'},'fixture'),[]);
  assert.deepEqual(await ownedOrders(db,identity,'live'),[]);
  assert.equal(await customerSession(db,tenant,login.token,new Date(Date.now()+SESSION_SECONDS*1000+1000)),null);
  await revokeSession(db,tenant,login.token);assert.equal(await customerSession(db,tenant,login.token),null);
}));
test('an interrupted two-parcel connection stays explicitly unavailable for its missing parcel',{skip:!enabled},async()=>database(async db=>{
  await provisionCustomer(db,tenant,'demo-customer',password,'customer_fixture');
  await createOrder(db,{tenantId:tenant,customerId:'customer_fixture'},'Example order #1042',true,FIXTURE_ORDER_ID,2);
  await attachShipment(db,tenant,FIXTURE_ORDER_ID,fixtureSnapshot(0,4,'delivered'));
  const [order]=await ownedOrders(db,{tenantId:tenant,customerId:'customer_fixture'},'fixture',Date.parse('2026-10-16T10:30:00Z'));
  assert.equal(order.expectedParcels,2);assert.equal(order.unconnectedParcels,1);assert.equal(order.shipments.length,2);
  assert.equal(order.shipments[0].status,'delivered');assert.equal(order.shipments[1].status,'unknown');assert.equal(order.shipments[1].events.length,0);
}));

test('password errors and database-backed throttle do not mint sessions',{skip:!enabled},async()=>database(async db=>{
  await seed(db);const config={tenantId:tenant,mode:'fixture',origin:'http://localhost:3000',authSecret:'fixture-auth-secret-with-enough-characters'};
  for(let index=0;index<10;index++)assert.equal((await signInCustomer(db,config,'demo-customer','wrong')).error,'invalid_credentials');
  assert.equal((await signInCustomer(db,config,'demo-customer',password)).error,'rate_limited');
  assert.equal((await db.query('SELECT count(*)::int AS count FROM trace_starter_sessions')).rows[0].count,0);
}));

test('receiver storage failure is retryable and never acknowledged as saved',{skip:!enabled},async()=>database(async db=>{
  const secret='fixture-secret';const body=JSON.stringify(fixtureScenarios['in-transit']()[0]);const time=Math.floor(Date.now()/1000);
  const signature=createHmac('sha256',secret).update(`${time}.`).update(body).digest('hex');
  const handler=createWebhookHandler({secret,store:()=>db.query('INSERT INTO intentionally_missing_table VALUES (1)')});
  const response=await handler(new Request('http://localhost/api/webhooks/trace',{method:'POST',headers:{'Content-Type':'application/json','Trace-Signature':`t=${time},v1=${signature}`},body}));
  assert.equal(response.status,503);assert.equal((await db.query('SELECT count(*)::int AS count FROM trace_webhook_inbox')).rows[0].count,0);
}));

test('a real worker process crashes after claim then a new process recovers the saved event',{skip:!enabled},async()=>database(async(db,schema)=>{
  await seed(db);const event=fixtureScenarios.restart()[0];await storeInboxEvent(db,tenant,event);
  const url=new URL(process.env.TRACE_STARTER_TEST_DATABASE_URL);url.searchParams.set('options',`-c search_path=${schema}`);
  const environment={...process.env,DATABASE_URL:url.href,STARTER_TENANT_ID:tenant,STARTER_DATA_MODE:'fixture',STARTER_ORIGIN:'http://localhost:3000',STARTER_AUTH_SECRET:'fixture-auth-secret-for-local-process-tests',STARTER_FIXTURE_LEASE_MS:'1000'};
  const execute=args=>new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['--experimental-strip-types',fileURLToPath(new URL('../scripts/starter.mjs',import.meta.url)),'worker',...args],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:environment,stdio:['ignore','pipe','pipe']});
    let output='';child.stdout.on('data',data=>{output+=data;});child.on('error',reject);child.on('exit',code=>resolve({code,output}));
  });
  const crashed=await execute(['--crash-after-claim']);assert.equal(crashed.code,70);assert.match(crashed.output,/abandonedForRestartTest":true/);
  await new Promise(resolve=>setTimeout(resolve,1100));
  const recovered=await execute(['--once']);assert.equal(recovered.code,0);assert.match(recovered.output,/inboxOutcome":"applied"/);
  const row=(await db.query('SELECT revision FROM trace_starter_shipments WHERE tenant_id=$1 AND shipment_id=$2',[tenant,'shp_fixture_1042_b'])).rows[0];assert.equal(Number(row.revision),5);
}));
