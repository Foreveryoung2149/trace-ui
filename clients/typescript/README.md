# Official Trace TypeScript client - 0.3.0

```sh
npm install https://traceapi.dev/downloads/traceapi-sdk-0.3.0.tgz
```

```ts
import { Trace, TraceError, verifyWebhook } from '@traceapi/sdk';
const trace = new Trace(process.env.TRACE_API_KEY!);
// Sandbox exercises authentication without a carrier lookup.
const example = await trace.sandbox('delivered');
const result = await trace.track({tracking_number: 'YOUR_NUMBER', carrier: 'ups'});
```

Requires Node 22+. Keep this client on the server. The UI component is a separate
package: https://traceapi.dev/tracking-timeline. Source is public at
https://github.com/Foreveryoung2149/trace-ui/tree/main/clients/typescript.
The future registry command is `npm install @traceapi/sdk@0.3.0`; use the pinned
download until registry publication is confirmed.

Server-side client for tracking, order-linked shipments, imports, action feeds,
merchant cohorts and webhook recovery. See https://traceapi.dev/docs#official-clients
for versioned download/install instructions and the full API reference.

Models are generated from the public OpenAPI contract by npm run sdk:generate.
Unknown timezone timestamps remain null. Import success means record creation;
verified carrier acquisition is a separate asynchronous outcome.

Defaults: timeout 95 seconds per attempt, at most two retries on confirmed
429/503 for reads or supported idempotent creates, honoring Retry-After up to
60 seconds. Ambiguous transport errors and non-idempotent actions are surfaced
without retries. Explicit webhook replay never silently repeats.

Verify webhook signatures on raw bytes within five minutes, accepting any
matching v1 signature during rotation overlap. Deduplicate event IDs after
verification. Keep API keys/signing secrets on your server.

Pin this 0.x version; future 0.x releases may break compatibility. New /v1
response fields are additive; clients must tolerate them. Download artifacts
are served by Trace; registry publication is separate. MIT license covers SDK
code only. Python requires 3.11+; the TypeScript client requires Node 22+.
