# Next.js shipment tracking starter

## 1. Run the local demo

From the repository root: `npm ci && npm run dev`. Open http://localhost:3000.
No key, database or account is needed. All scenario switches stay local.

## 2. Connect the Trace sandbox

Copy `.env.example` to `.env.local` **inside this example directory**.
Create your Trace account and API key at https://traceapi.dev/dashboard/api-keys.
Generate a separate preview password (Node: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
Set these values on your machine, never in chat or a public repository:

```dotenv
TRACE_MODE=sandbox
TRACE_API_KEY=YOUR_SERVER_API_KEY
STARTER_ACCESS_TOKEN=YOUR_RANDOM_PREVIEW_PASSWORD
TRACE_SANDBOX_SCENARIO=delivered
```

Restart the dev server, then sign in through the browser prompt as username
`trace` with that preview password. The SDK request runs only on the server.
Sandbox uses normal auth/RPM but no monthly carrier-lookup allowance. It is not
proof that a carrier source works. Missing configuration fails closed.

## 3. Track your own shipment

```dotenv
TRACE_MODE=live
TRACE_TRACKING_NUMBER=YOUR_REAL_NUMBER
TRACE_CARRIER=ups
```

Use a shipment you are entitled to access. A successful lookup uses your monthly
allowance. Reloading this private page makes another API request (the API may
serve its cache). The starter does not poll automatically. Only the number
configured on your server is fetched; it does not expose an anonymous tracking
proxy. Keys, access passwords and database URLs are never passed to React.

The live example opts into stale fallback and visibly labels it. A 503 stays an
unavailable result, without fabricated sample scans. Private responses are
no-store. Use HTTPS when deploying sandbox/live outside localhost.

## 4. Receive signed webhooks durably

This is optional and takes additional setup beyond the local UI demo.

1. Provision a **separate Postgres database for your application**.
2. Set DATABASE_URL in this example's `.env.local`, preserving TLS verification.
3. From this example directory run `npm run webhook:setup`.
4. Deploy to HTTPS and register your receiver in the Trace webhooks dashboard:
   `https://YOUR_HOST/api/webhooks/trace`.
5. Store the generated signing secret as TRACE_WEBHOOK_SECRET and redeploy.
6. Use the dashboard's explicit webhook test, then inspect your inbox table.

POST verifies the original request bytes and Trace-Signature within five minutes.
Trace-Event-Id, if present, must match the signed body. A maximum 512 KB body is
accepted. Invalid/expired signatures return 401. A missing secret or failed
database write returns 503 so delivery can be retried. Replays deduplicate on
event_id with a database primary key, including concurrent requests.

```sql
SELECT event_id, event_type, received_at, processed_at
FROM trace_webhook_inbox ORDER BY received_at DESC LIMIT 20;
```

The receiver stores verified events; it does not update orders, email customers
or perform other side effects. Add a separate worker that claims rows and commits
your merchant changes transactionally before setting processed_at. Keep incoming
events for the replay horizon you support and define a payload-retention policy.

The Basic preview gate excludes the webhook receiver because webhooks use their
own signatures. Do not replace verification with a publicly shared API key.

## Before a customer-facing deployment

Replace the private Basic preview with your own tenant/order authorization.
Add bounded refresh budgets and rate limits, persist owned shipment records,
control caching per customer, and minimize personal data. The starter is not a
public hosted tracking portal, refresh scheduler or complete order-management app.

Node 22+, React 19, Next.js 16.3.8. Run root `npm test`, `npm run typecheck`, and
`npm run build`. The optional Postgres test only uses an explicitly supplied
isolated TRACE_STARTER_TEST_DATABASE_URL, never your application DATABASE_URL.
