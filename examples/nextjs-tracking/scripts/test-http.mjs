import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const key='trc_fixture_http_only';
const password=`fixture_${randomUUID()}`;
const authorization='Basic '+Buffer.from(`trace:${password}`).toString('base64');
let calls=0;
const fixture=createServer(async(req,res)=>{
  calls++;assert.equal(req.headers.authorization,`Bearer ${key}`);
  let raw='';for await(const chunk of req)raw+=chunk;
  const body=JSON.parse(raw);res.setHeader('Content-Type','application/json');
  if(req.url==='/v1/sandbox/track'){
    assert.equal(body.scenario,'unknown_timezone');
    res.end(JSON.stringify({test:true,scenario:'unknown_timezone',tracking_number:'TRACE_SANDBOX_UNKNOWN_TIMEZONE',status:'in_transit',carrier:{name:'HTTP fixture carrier'},events:[{description:'Fixture scan',timestamp:null,timestamp_local:'2026-03-17T10:00:00',timestamp_timezone:'unknown'}],cached:false,data_freshness:{state:'simulated'}}));
  }else{
    assert.equal(req.url,'/v1/track');assert.equal(body.tracking_number,'FIXTURE_ONLY');
    res.statusCode=503;res.end(JSON.stringify({error:{code:'tracking_sources_unavailable',message:'Fixture source unavailable'}}));
  }
});
await new Promise(resolve=>fixture.listen(0,'127.0.0.1',resolve));
const apiPort=fixture.address().port;
const cwd=fileURLToPath(new URL('../',import.meta.url));
const next=fileURLToPath(new URL('../../../node_modules/next/dist/bin/next',import.meta.url));
const serverPort=async()=>{const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;};
try{
  for(const mode of ['sandbox','live']){
    const port=await serverPort();
    const child=spawn(process.execPath,[next,'start','-p',String(port)],{cwd,stdio:'ignore',env:{...process.env,NODE_ENV:'production',TRACE_MODE:mode,TRACE_API_KEY:key,TRACE_API_BASE_URL:`http://127.0.0.1:${apiPort}`,STARTER_ACCESS_TOKEN:password,TRACE_SANDBOX_SCENARIO:'unknown_timezone',TRACE_TRACKING_NUMBER:'FIXTURE_ONLY',TRACE_CARRIER:'ups'}});
    try{
      let unauthenticated;
      for(let i=0;i<40;i++){try{unauthenticated=await fetch(`http://127.0.0.1:${port}`,{signal:AbortSignal.timeout(1000)});break;}catch{await new Promise(resolve=>setTimeout(resolve,250));}}
      assert.ok(unauthenticated,'Starter did not become ready');assert.equal(unauthenticated.status,401);assert.equal(calls,mode==='sandbox'?0:1);
      const response=await fetch(`http://127.0.0.1:${port}`,{headers:{authorization},signal:AbortSignal.timeout(15000)});
      const html=await response.text();assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
      assert.ok(!html.includes(key),'API credential leaked');assert.ok(!html.includes(password),'Preview credential leaked');
      if(mode==='sandbox'){assert.match(html,/Timezone not supplied/);assert.match(html,/Fixture scan/);}else{assert.match(html,/Tracking sources are unavailable/);assert.ok(!html.includes('Delivered to the recipient'),'Source failure replaced with sample scans');}
      console.log(JSON.stringify({mode,httpIntegrationPassed:true,privatePreview:true,credentialsInClient:false,realCarrierRequests:0}));
    }finally{child.kill();await new Promise(resolve=>child.once('exit',resolve));}
  }
  assert.equal(calls,2);
}finally{await new Promise(resolve=>fixture.close(resolve));}
