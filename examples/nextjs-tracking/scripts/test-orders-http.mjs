/** Real Next server + isolated Postgres. Every shipment and credential is fictional. */
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHmac,randomBytes,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {provisionCustomer} from '../lib/customer-auth.ts';
import {createOrder,attachShipment} from '../lib/order-store.ts';
import {fixtureSnapshot,FIXTURE_ORDER_ID,fixtureScenarios} from '../lib/fixtures.ts';
import {processNextInboxEvent} from '../lib/inbox-processor.ts';

if(!process.env.TRACE_STARTER_TEST_DATABASE_URL){console.log(JSON.stringify({ordersHttpSkipped:true,reason:'isolated_test_database_not_configured'}));process.exit(0);}
const schema='trace_starter_http_'+randomUUID().replaceAll('-','');
const admin=new Pool({connectionString:process.env.TRACE_STARTER_TEST_DATABASE_URL});
const tenant='tenant_fixture_http';const password='fixture-password-'+randomUUID();
const secret=randomBytes(32).toString('hex');const authSecret=randomBytes(32).toString('hex');
const key='trc_fixture_must_never_leave_server';
let db,child;let apiCalls=0;
const source=createServer((req,res)=>{apiCalls++;res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{code:'fixture_only'}}));});
const freePort=async()=>{const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;};
async function verifyBrowser(origin) {
  const {default:puppeteer}=await import('puppeteer');
  const {AxePuppeteer}=await import('@axe-core/puppeteer');
  const reportDirectory=resolve(process.env.TRACE_STARTER_BROWSER_REPORT_DIR||fileURLToPath(new URL('../.next/verification',import.meta.url)));
  await mkdir(reportDirectory,{recursive:true});
  const browser=await puppeteer.launch({headless:true,...(process.env.PUPPETEER_EXECUTABLE_PATH?{executablePath:process.env.PUPPETEER_EXECUTABLE_PATH}:{}),args:['--disable-background-networking','--disable-component-update','--no-first-run',...(process.env.CI?['--no-sandbox']:[])]});
  const checks=[];let page;let current='sign-in';
  try {
    page=await browser.newPage();await page.setViewport({width:1280,height:900});
    await page.goto(origin+'/sign-in',{waitUntil:'networkidle0'});
    const signIn=await new AxePuppeteer(page).analyze();
    checks.push({page:'sign-in',width:1280,violations:signIn.violations.map(item=>({id:item.id,impact:item.impact,nodes:item.nodes.length}))});
    await page.type('#handle','owner-customer');await page.type('#password',password);
    await page.click('button[type="submit"],form button');
    await page.waitForFunction(()=>location.pathname==='/orders');
    await page.waitForSelector('.tt-order');
    for(const viewport of [{name:'desktop',width:1280,height:900,deviceScaleFactor:1},{name:'mobile',width:320,height:900,deviceScaleFactor:1},{name:'zoom-200-equivalent-reflow',width:640,height:900,deviceScaleFactor:2}]) {
      current=viewport.name;
      await page.setViewport(viewport);await page.reload({waitUntil:'networkidle0'});
      // A streamed Next shell can be network-idle before its dynamic order data.
      await page.waitForSelector('.tt-order',{visible:true,timeout:15000});
      await page.waitForFunction(()=>document.body.innerText.includes('Simulated local example'),{timeout:15000});
      const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,simulated:document.body.innerText.includes('Simulated local example'),parcels:document.querySelectorAll('.tt-order-parcels .trace-timeline').length}));
      const accessibility=await new AxePuppeteer(page).analyze();
      checks.push({page:'orders',name:viewport.name,width:viewport.width,...layout,violations:accessibility.violations.map(item=>({id:item.id,impact:item.impact,nodes:item.nodes.length}))});
      assert.equal(layout.overflow,false,`${viewport.name}: order page overflows`);assert.equal(layout.simulated,true);assert.equal(layout.parcels,2);
      if(viewport.name==='desktop')await page.screenshot({path:resolve(reportDirectory,'trace-starter-private-order.png'),fullPage:true});
    }
    await writeFile(resolve(reportDirectory,'trace-starter-browser-checks.json'),JSON.stringify({simulatedOnly:true,manualScreenReaderReviewed:false,checks},null,2)+'\n');
    for(const check of checks)assert.deepEqual(check.violations,[],`${check.page}: automated accessibility violations`);
    console.log(JSON.stringify({starterBrowserPassed:true,checks:checks.length,automatedAccessibilityViolations:0,manualScreenReaderReviewed:false}));
  }catch(error){
    const stamp=new Date().toISOString().replace(/[:.]/g,'-');
    await writeFile(resolve(reportDirectory,`trace-starter-browser-failed-${stamp}.json`),JSON.stringify({simulatedOnly:true,current,checks,errorName:error?.name||'Error'},null,2)+'\n');
    if(page)await page.screenshot({path:resolve(reportDirectory,`trace-starter-browser-failed-${stamp}.png`),fullPage:true}).catch(()=>{});
    throw error;
  }finally{await browser.close();}
}
try {
  await admin.query(`CREATE SCHEMA ${schema}`);
  db=new Pool({connectionString:process.env.TRACE_STARTER_TEST_DATABASE_URL,options:`-c search_path=${schema}`,max:5});
  await db.query(await readFile(new URL('./webhook-inbox.sql',import.meta.url),'utf8'));
  await provisionCustomer(db,tenant,'owner-customer',password,'customer_fixture_owner');
  await provisionCustomer(db,tenant,'other-customer',password,'customer_fixture_other');
  await createOrder(db,{tenantId:tenant,customerId:'customer_fixture_owner'},'Example order #1042',true,FIXTURE_ORDER_ID,2);
  await attachShipment(db,tenant,FIXTURE_ORDER_ID,fixtureSnapshot(0,1));
  await new Promise(resolve=>source.listen(0,'127.0.0.1',resolve));
  const port=await freePort(),origin=`http://127.0.0.1:${port}`;
  const connection=new URL(process.env.TRACE_STARTER_TEST_DATABASE_URL);connection.searchParams.set('options',`-c search_path=${schema}`);
  const cwd=fileURLToPath(new URL('../',import.meta.url));
  const next=fileURLToPath(new URL('../../../node_modules/next/dist/bin/next',import.meta.url));
  child=spawn(process.execPath,[next,'start','-p',String(port)],{cwd,stdio:'ignore',env:{...process.env,NODE_ENV:'production',TRACE_MODE:'demo',STARTER_DATA_MODE:'fixture',STARTER_TENANT_ID:tenant,STARTER_ORIGIN:origin,STARTER_AUTH_SECRET:authSecret,DATABASE_URL:connection.href,TRACE_WEBHOOK_SECRET:secret,TRACE_API_KEY:key,TRACE_API_BASE_URL:`http://127.0.0.1:${source.address().port}`}});
  let ready=false;
  for(let attempt=0;attempt<80;attempt++){try{const response=await fetch(origin,{signal:AbortSignal.timeout(1000)});if(response.ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,250));}
  assert.ok(ready,'Starter HTTP server did not start');
  assert.equal((await fetch(origin+'/api/orders')).status,401);
  const privatePage=await fetch(origin+'/orders',{redirect:'manual'});
  if(privatePage.status===307)assert.match(privatePage.headers.get('location'),/\/sign-in$/);
  else {
    // Next inserts a redirect meta tag when the dynamic page has begun streaming.
    assert.equal(privatePage.status,200);const body=await privatePage.text();
    assert.match(body,/(?:http-equiv="refresh"|NEXT_REDIRECT)[\s\S]{0,500}\/sign-in/);assert.ok(!body.includes('Example order #1042'));
  }
  const basic='Basic '+Buffer.from('trace:'+password).toString('base64');
  assert.equal((await fetch(origin+'/api/orders',{headers:{authorization:basic}})).status,401,'Preview credentials became customer authorization');
  const login=(handle,requestOrigin=origin)=>fetch(origin+'/api/session',{method:'POST',headers:{Origin:requestOrigin,'Content-Type':'application/json'},body:JSON.stringify({handle,password})});
  assert.equal((await login('owner-customer','https://attacker.invalid')).status,403);
  const signedIn=await login('owner-customer');assert.equal(signedIn.status,200);
  assert.match(signedIn.headers.get('set-cookie'),/HttpOnly/i);assert.match(signedIn.headers.get('set-cookie'),/SameSite=Strict/i);
  const cookie=signedIn.headers.get('set-cookie').split(';')[0];
  assert.equal((await signedIn.json()).token,undefined);
  const request=path=>fetch(origin+path,{headers:{Cookie:cookie}});
  const initial=await request('/api/orders');assert.match(initial.headers.get('cache-control'),/private.*no-store/);
  const initialBody=await initial.json();assert.equal(initialBody.simulated,true);assert.equal(initialBody.orders.length,1);assert.equal(initialBody.orders[0].shipments.length,2);
  assert.equal(initialBody.orders[0].shipments[0].status,'pending');
  assert.equal(initialBody.orders[0].unconnectedParcels,1);assert.equal(initialBody.orders[0].shipments[1].status,'unknown');
  const partialHtml=(await (await request('/orders')).text()).replace(/<!--.*?-->/gs,'');assert.match(partialHtml,/Tracking for 1 of 2 parcels has not been connected/);assert.match(partialHtml,/Status unavailable/);
  await attachShipment(db,tenant,FIXTURE_ORDER_ID,fixtureSnapshot(1,1));
  const complete=await (await request('/api/orders')).json();assert.equal(complete.orders[0].unconnectedParcels,0);
  const other=await login('other-customer');const otherCookie=other.headers.get('set-cookie').split(';')[0];
  const cross=await fetch(origin+'/api/orders?customer_id=customer_fixture_owner&tenant_id='+tenant,{headers:{Cookie:otherCookie}});
  assert.deepEqual((await cross.json()).orders,[]);
  const emit=async(event,signatureOverride)=>{
    const raw=JSON.stringify(event);const time=Math.floor(Date.now()/1000);
    const signature=createHmac('sha256',secret).update(`${time}.`).update(raw).digest('hex');
    return fetch(origin+'/api/webhooks/trace',{method:'POST',headers:{'Content-Type':'application/json','Trace-Signature':signatureOverride||`t=${time},v1=${signature}`,'Trace-Event-Id':event.event_id},body:raw});
  };
  const events=fixtureScenarios['out-of-order']();
  assert.equal((await emit(events[0],'invalid')).status,401);
  for(const event of events)assert.equal((await emit(event)).status,200);
  assert.equal((await (await emit(events[0])).json()).duplicate,true);
  assert.equal(await processNextInboxEvent(db,tenant,'fixture'),'applied');
  assert.equal(await processNextInboxEvent(db,tenant,'fixture'),'obsolete');
  const changed=await (await request('/api/orders')).json();assert.equal(changed.orders[0].shipments[0].status,'out_for_delivery');
  for(const scenario of ['stale','unavailable'])for(const event of fixtureScenarios[scenario]())await emit(event);
  while(await processNextInboxEvent(db,tenant,'fixture')){}
  const final=await (await request('/api/orders')).json();
  assert.equal(final.orders[0].shipments[0].freshness,'stale');assert.equal(final.orders[0].shipments[1].status,'unknown');
  const html=await (await request('/orders')).text();
  assert.match(html,/Example order #1042/);assert.match(html,/Simulated local example/);assert.match(html,/Last known update/);assert.match(html,/Status unavailable/);
  for(const value of [password,key,authSecret,secret,cookie.split('=')[1],'FICTIONAL-PARCEL-'])assert.ok(!html.includes(value),'Server credential or tracking identifier leaked into HTML');
  assert.equal((await fetch(origin+'/api/session',{method:'DELETE',headers:{Cookie:cookie,Origin:'https://attacker.invalid'}})).status,403);
  assert.equal((await fetch(origin+'/api/session',{method:'DELETE',headers:{Cookie:cookie,Origin:origin}})).status,200);
  assert.equal((await request('/api/orders')).status,401);
  if(process.env.TRACE_STARTER_BROWSER_TEST==='1')await verifyBrowser(origin);
  assert.equal(apiCalls,0);
  console.log(JSON.stringify({ordersHttpPassed:true,simulatedOnly:true,parcels:2,separateCustomerAuthorization:true,tenantCustomerIsolation:true,signedPersistence:true,duplicateAndOutOfOrderSafe:true,staleUnavailableDistinct:true,noSecretsInHtml:true,providerRequests:apiCalls}));
} finally {
  if(child&&child.exitCode===null){child.kill();await new Promise(resolve=>child.once('exit',resolve));}
  if(source.listening)await new Promise(resolve=>source.close(resolve));
  if(db)await db.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();
}
