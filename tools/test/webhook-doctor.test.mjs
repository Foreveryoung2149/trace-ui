import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {inspectSignature,diagnoseReceiver,selfTest} from '../webhook-doctor.mjs';
test('generated fixture suite covers bytes, expiration and overlapping signatures without a provider',()=>{assert.equal(selfTest().passed,true);assert.equal(selfTest().network_requests,0);});
test('signature verification preserves whitespace and distinguishes timestamp problems',()=>{
  const raw=Buffer.from('{ "fixture": true }'),secret='local-test-secret',now=1000*1000;
  const signature=createHmac('sha256',secret).update('1000.').update(raw).digest('hex');
  assert.deepEqual(inspectSignature(raw,`t=1000,v1=${signature}`,secret,{now}),{valid:true,code:'signature_verified'});
  assert.equal(inspectSignature(Buffer.from('{"fixture":true}'),`t=1000,v1=${signature}`,secret,{now}).code,'signature_mismatch');
  assert.equal(inspectSignature(raw,`t=1000,v1=${signature}`,secret,{now:now+301000}).code,'signature_expired');
  assert.equal(inspectSignature(raw,`t=1000,t=1000,v1=${signature}`,secret,{now}).code,'invalid_timestamp');
  assert.equal(inspectSignature(raw,'t=abc,v1=bad',secret,{now}).valid,false);
  assert.equal(inspectSignature(raw,`t=1000,v1=${signature}`,'',{now}).code,'invalid_input');
});
test('receiver repair hints distinguish redirects, auth, throttling and accepted delivery',()=>{
  assert.equal(diagnoseReceiver(307).code,'receiver_redirect');assert.equal(diagnoseReceiver(401).code,'receiver_authentication');
  assert.equal(diagnoseReceiver(429).code,'receiver_rate_limited');assert.equal(diagnoseReceiver(503).code,'receiver_failure');
  assert.match(diagnoseReceiver(202).hint,/does not prove/);assert.throws(()=>diagnoseReceiver(999));
});
