import {readFile} from 'node:fs/promises';
import {createHmac} from 'node:crypto';
import nextEnv from '@next/env';
import {Trace} from '@traceapi/sdk';
import {starterDatabase} from '../lib/database.ts';
import {starterConfiguration} from '../lib/configuration.ts';
import {provisionCustomer} from '../lib/customer-auth.ts';
import {createOrder,attachShipment,shipmentCreationKey} from '../lib/order-store.ts';
import {claimInboxEvent,processNextInboxEvent} from '../lib/inbox-processor.ts';
import {FIXTURE_ORDER_ID,FIXTURE_SHIPMENTS,fixtureSnapshot,fixtureScenarios} from '../lib/fixtures.ts';

nextEnv.loadEnvConfig(process.cwd());
const command=process.argv[2];
const db=starterDatabase();
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const cleanupExpired=async()=>{await db.query('DELETE FROM trace_starter_sessions WHERE expires_at<now()');await db.query("DELETE FROM trace_starter_auth_attempts WHERE window_until<now()-interval '1 day'");};
let stopping=false;
process.on('SIGINT',()=>{stopping=true;});process.on('SIGTERM',()=>{stopping=true;});
try {
  const config=starterConfiguration();
  if(command==='setup') {
    await db.query(await readFile(new URL('./webhook-inbox.sql',import.meta.url),'utf8'));
    console.log('Starter database ready. Existing raw inbox events retained. No provider requests made.');
  } else if(command==='customer') {
    const password=process.env.STARTER_CUSTOMER_PASSWORD||'';
    if(config.mode==='live'&&/fixture|example|change.me/i.test(password)) throw new Error('replace_fixture_credentials');
    const id=await provisionCustomer(db,config.tenantId,process.env.STARTER_CUSTOMER_HANDLE||'',password,process.env.STARTER_CUSTOMER_ID);
    console.log(JSON.stringify({customerCreated:true,customerId:id,passwordPrinted:false}));
  } else if(command==='seed') {
    if(config.mode!=='fixture')throw new Error('fixtures_only');
    const handle=process.env.STARTER_CUSTOMER_HANDLE||'demo-customer';
    let customer=await db.query('SELECT id FROM trace_starter_customers WHERE tenant_id=$1 AND handle=$2',[config.tenantId,handle]);
    const customerId=customer.rows[0]?.id||await provisionCustomer(db,config.tenantId,handle,process.env.STARTER_CUSTOMER_PASSWORD||'','customer_fixture');
    const existing=await db.query('SELECT customer_id FROM trace_starter_orders WHERE tenant_id=$1 AND id=$2',[config.tenantId,FIXTURE_ORDER_ID]);
    if(existing.rows.length&&existing.rows[0].customer_id!==customerId) throw new Error('fixture_customer_conflict');
    if(!existing.rows.length)await createOrder(db,{tenantId:config.tenantId,customerId},'Example order #1042',true,FIXTURE_ORDER_ID,2);
    for(let parcel=0;parcel<FIXTURE_SHIPMENTS.length;parcel++)await attachShipment(db,config.tenantId,FIXTURE_ORDER_ID,fixtureSnapshot(parcel,1));
    console.log(JSON.stringify({simulated:true,orderReady:true,parcels:2,next:'/sign-in',credentialsPrinted:false,providerRequests:0}));
  } else if(command==='emit') {
    if(config.mode!=='fixture')throw new Error('fixtures_only');
    const scenario=process.argv[3];
    if(!Object.hasOwn(fixtureScenarios,scenario||''))throw new Error('unknown_fixture_scenario');
    const secret=process.env.TRACE_WEBHOOK_SECRET;if(!secret)throw new Error('webhook_secret_not_configured');
    for(const event of fixtureScenarios[scenario]()) {
      const raw=JSON.stringify(event);const timestamp=Math.floor(Date.now()/1000);
      const signature=createHmac('sha256',secret).update(`${timestamp}.`).update(raw).digest('hex');
      const response=await fetch(`${config.origin}/api/webhooks/trace`,{method:'POST',headers:{'Content-Type':'application/json','Trace-Signature':`t=${timestamp},v1=${signature}`,'Trace-Event-Id':event.event_id},body:raw,redirect:'error',signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw new Error('fixture_receiver_rejected');
      const outcome=await response.json();
      console.log(JSON.stringify({simulated:true,scenario,persisted:true,duplicate:outcome.duplicate===true,providerRequests:0}));
    }
  } else if(command==='worker') {
    const once=process.argv.includes('--once');
    const leaseMs=config.mode==='fixture'?Number(process.env.STARTER_FIXTURE_LEASE_MS||60000):60000;
    if(process.argv.includes('--crash-after-claim')) {
      if(config.mode!=='fixture')throw new Error('fixtures_only');
      const claim=await claimInboxEvent(db,config.tenantId,{leaseMs});
      console.log(JSON.stringify({simulated:true,claimed:Boolean(claim),abandonedForRestartTest:Boolean(claim)}));
      if(claim)process.exitCode=70;
    } else {
      let processed=0;let lastCleanup=0;
      do {
        if(Date.now()-lastCleanup>=60000){await cleanupExpired();lastCleanup=Date.now();}
        const result=await processNextInboxEvent(db,config.tenantId,config.mode,{leaseMs});
        if(result){processed++;console.log(JSON.stringify({inboxOutcome:result}));}
        else if(once)break;
        else await pause(1000);
      }while(!stopping&&processed<=(once?100:Infinity));
      if(once)console.log(JSON.stringify({workerPassComplete:true,processed}));
    }
    await cleanupExpired();
  } else if(command==='status') {
    const statuses=await db.query('SELECT status,result,count(*)::int AS count FROM trace_webhook_inbox WHERE tenant_id=$1 GROUP BY status,result ORDER BY status,result',[config.tenantId]);
    const parcels=await db.query('SELECT revision,snapshot->>\'status\' AS status,(snapshot->>\'last_error\') IS NOT NULL AS latest_lookup_failed FROM trace_starter_shipments WHERE tenant_id=$1 ORDER BY shipment_id',[config.tenantId]);
    console.log(JSON.stringify({simulated:config.mode==='fixture',inbox:statuses.rows,parcels:parcels.rows,trackingNumbersPrinted:false}));
  } else if(command==='connect') {
    if(config.mode!=='live'||!process.argv.includes('--confirm-live'))throw new Error('explicit_live_confirmation_required');
    if(process.env.TRACE_API_BASE_URL)throw new Error('live_api_override_not_allowed');
    const customerId=process.env.STARTER_CUSTOMER_ID,orderId=process.env.STARTER_ORDER_ID;
    if(!customerId||!orderId||!/^[A-Za-z0-9_-]{1,128}$/.test(orderId))throw new Error('customer_and_order_required');
    const key=process.env.TRACE_API_KEY;if(!key)throw new Error('trace_key_not_configured');
    const numbers=JSON.parse(process.env.TRACE_TRACKING_NUMBERS||'null');
    if(!Array.isArray(numbers)||numbers.length<1||numbers.length>10||numbers.some(number=>typeof number!=='string'||number.length<3||number.length>100))throw new Error('invalid_tracking_numbers');
    const existing=await db.query('SELECT customer_id,simulated,expected_parcels FROM trace_starter_orders WHERE tenant_id=$1 AND id=$2',[config.tenantId,orderId]);
    if(existing.rows.length&&(existing.rows[0].customer_id!==customerId||existing.rows[0].simulated))throw new Error('order_ownership_mismatch');
    if(existing.rows.length&&existing.rows[0].expected_parcels!==numbers.length)throw new Error('order_parcel_count_conflict');
    if(!existing.rows.length)await createOrder(db,{tenantId:config.tenantId,customerId},process.env.STARTER_ORDER_REFERENCE||'Your order',false,orderId,numbers.length);
    const trace=new Trace(key,{retries:0,timeoutMs:15000});
    for(let index=0;index<numbers.length;index++) {
      const result=await trace.createShipment({tracking_number:numbers[index],order_id:orderId,...(process.env.TRACE_CARRIER?{carrier:process.env.TRACE_CARRIER}:{})},shipmentCreationKey(config.tenantId,orderId,index));
      await attachShipment(db,config.tenantId,orderId,result.shipment);
    }
    console.log(JSON.stringify({liveOrderConnected:true,parcels:numbers.length,trackingNumbersPrinted:false,backgroundMonitoringMayConsumeAllowance:true}));
  } else throw new Error('unknown_starter_command');
} catch(error) {
  // Never print SDK errors/payloads: they can contain customer data or credentials.
  console.error(JSON.stringify({ok:false,error:error instanceof Error&&/^[a-z_]{1,80}$/.test(error.message)?error.message:'starter_operation_failed'}));
  process.exitCode=1;
} finally {await db.end();}
