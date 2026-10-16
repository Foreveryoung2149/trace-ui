#!/usr/bin/env node
import {createHmac, randomBytes, timingSafeEqual} from 'node:crypto';
import {readFile, stat} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

// Offline diagnostics only. No receiver forwarding, payload logging or network access.
export function inspectSignature(raw, header, secret, {now=Date.now(), toleranceSeconds=300}={}) {
  if (!Buffer.isBuffer(raw) || typeof header!=='string' || typeof secret!=='string' || !secret || !Number.isFinite(now) || !Number.isFinite(toleranceSeconds) || toleranceSeconds<0) return {valid:false,code:'invalid_input'};
  const parts=header.split(',').map(part=>part.split('='));
  const times=parts.filter(([key])=>key==='t');
  if(times.length!==1||!/^\d+$/.test(times[0][1]||''))return {valid:false,code:'invalid_timestamp'};
  if(Math.abs(now/1000-Number(times[0][1]))>toleranceSeconds)return {valid:false,code:'signature_expired'};
  const expected=createHmac('sha256',secret).update(`${times[0][1]}.`).update(raw).digest();
  const valid=parts.some(([key,value])=>key==='v1'&&/^[a-f0-9]{64}$/.test(value||'')&&timingSafeEqual(expected,Buffer.from(value,'hex')));
  return {valid,code:valid?'signature_verified':'signature_mismatch'};
}

export function diagnoseReceiver(status) {
  if(!Number.isInteger(status)||status<100||status>599)throw new Error('Provide an HTTP status from 100 to 599.');
  if(status>=200&&status<300)return {code:'receiver_accepted',hint:'Persist before acknowledging. A 2xx response alone does not prove downstream processing completed.'};
  if(status>=300&&status<400)return {code:'receiver_redirect',hint:'Register the final HTTPS route that accepts POST directly. Remove interactive login redirects from that route.'};
  if(status===401||status===403)return {code:'receiver_authentication',hint:'Check gateway authentication and verify Trace-Signature against the original bytes. The webhook route needs server-to-server access.'};
  if(status===404||status===410)return {code:'receiver_route_missing',hint:'Check the deployed route and POST handler.'};
  if(status===429)return {code:'receiver_rate_limited',hint:'Persist quickly, acknowledge, then process asynchronously. Keep event-id deduplication and retry safely.'};
  if(status>=500)return {code:'receiver_failure',hint:'Inspect receiver storage and application failures using the delivery ID. Recover, then replay the same event without duplicating effects.'};
  return {code:'receiver_rejected',hint:'Inspect receiver validation using the delivery ID. Keep nullable timestamps and raw-body signature verification.'};
}

export function selfTest() {
  const raw=Buffer.from('{"event_id":"evt_local_fixture","event_type":"shipment.updated","shipment_revision":2}');
  const secret=randomBytes(32).toString('hex'),previous=randomBytes(32).toString('hex'),timestamp=1700000000;
  const sign=key=>createHmac('sha256',key).update(`${timestamp}.`).update(raw).digest('hex');
  const header=`t=${timestamp},v1=${sign(secret)},v1=${sign(previous)}`;
  const options={now:timestamp*1000};
  const checks={
    original_bytes:inspectSignature(raw,header,secret,options).valid,
    previous_secret_overlap:inspectSignature(raw,header,previous,options).valid,
    changed_bytes_rejected:!inspectSignature(Buffer.concat([raw,Buffer.from(' ')]),header,secret,options).valid,
    expired_signature_rejected:!inspectSignature(raw,header,secret,{now:(timestamp+301)*1000}).valid,
    duplicate_timestamp_rejected:!inspectSignature(raw,header+',t=1700000000',secret,options).valid,
    incorrect_secret_rejected:!inspectSignature(raw,header,'incorrect-local-fixture',options).valid,
  };
  return {mode:'local_generated_fixtures',network_requests:0,checks,passed:Object.values(checks).every(Boolean)};
}

async function boundedFile(path, maximum) {
  if(!path)throw new Error('A file path is required.');
  if((await stat(path)).size>maximum)throw new Error('Input file exceeds its size limit.');
  const bytes=await readFile(path);if(bytes.length>maximum)throw new Error('Input file exceeds its size limit.');return bytes;
}
export async function main(args=process.argv.slice(2)) {
  const command=args[0]||'help';
  if(command==='self-test'){const report=selfTest();console.log(JSON.stringify(report,null,2));return report.passed?0:1;}
  if(command==='status'){console.log(JSON.stringify(diagnoseReceiver(Number(args[1])),null,2));return 0;}
  if(command==='verify'){
    if(args.length!==3)throw new Error('Usage: verify BODY_FILE SIGNATURE_FILE. Supply the secret through TRACE_WEBHOOK_SECRET.');
    const raw=await boundedFile(args[1],1024*1024),header=(await boundedFile(args[2],4096)).toString('utf8').trim();
    if(!process.env.TRACE_WEBHOOK_SECRET)throw new Error('TRACE_WEBHOOK_SECRET must be set privately in your environment.');
    const result=inspectSignature(raw,header,process.env.TRACE_WEBHOOK_SECRET);
    console.log(JSON.stringify({...result,body_logged:false,network_requests:0},null,2));return result.valid?0:1;
  }
  console.log('Trace webhook doctor — offline diagnostics\n\nnode tools/webhook-doctor.mjs self-test\nnode tools/webhook-doctor.mjs status 401\nnode tools/webhook-doctor.mjs verify BODY_FILE SIGNATURE_FILE\n\nVerification uses TRACE_WEBHOOK_SECRET from your environment. Never paste secrets or customer payloads into issues. Signature validity does not establish shipment truth or successful event processing.');
  return command==='help'?0:1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{process.exitCode=await main();}catch{console.error('Diagnostic failed. Check the command, bounded input files and private environment configuration. No payload or secret was logged.');process.exitCode=1;}}
