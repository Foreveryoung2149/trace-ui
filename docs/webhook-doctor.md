# Diagnose a tracking webhook locally

The webhook doctor explains common receiver errors and checks Trace signatures
against the original request bytes. It runs on your machine: there is no hosted
forwarder, network request or payload logging.

## Try it without credentials

From the repository root:

```sh
npm run doctor -- self-test
npm run doctor -- status 401
```

The self-test generates its own fictional event and temporary signing material
in memory. It checks matching bytes, changed bytes, expired signatures and
overlapping signatures. It does not contact Trace or a receiver.

`status 401` explains where to inspect authentication. Change the status to the
actual HTTP response from your receiver:

| Response | Investigate |
| --- | --- |
| 2xx | Acceptance is not proof of processing; persist before acknowledging |
| 3xx | Register the final POST-capable HTTPS route rather than a login/redirect page |
| 401 / 403 | Gateway authentication and raw-body signature verification |
| 404 / 410 | Deployed route and POST handler |
| 429 | Receiver admission, durable acceptance and safe retry |
| 5xx | Receiver application/storage availability and event replay after recovery |

## Verify a request you are authorized to inspect

Keep the original body bytes in a local file and the `Trace-Signature` header
value in another local file. Set `TRACE_WEBHOOK_SECRET` through your private
environment or secret manager; do not put it in command arguments or source.

```sh
node tools/webhook-doctor.mjs verify body.bin signature.txt
```

The result reports a code and a boolean. The tool does not print the body or
secret. It accepts a body up to 1 MB and a signature file up to 4 KB. Signature
verification uses a five-minute window, so an old captured request may correctly
report `signature_expired`; do not weaken the window to make a production
receiver accept stale signatures. JSON parsing/reserialization changes bytes and
can invalidate a correct signature.

The tool verifies the signature convention; it does not establish that a parcel
moved, your database committed an event, or your merchant side effects completed.
Use the [durable starter](../examples/nextjs-tracking/README.md) to demonstrate
saved events, duplicate delivery, revision ordering and process recovery locally.

[Read the implementation](../tools/webhook-doctor.mjs) ·
[Trace webhook documentation](https://traceapi.dev/docs#webhooks)
