# Next.js order-tracking starter

A complete private example: one customer owns an order, an order has two parcels,
a signed webhook is saved durably, a separate worker updates a revisioned
projection, and the customer sees the saved update. The UI works with other
providers too. No emails, refunds or other merchant side effects are performed.

The root component demo still runs without an account, key or database. The
persistent order example needs your own Postgres. Local fixtures never contact
Trace or a carrier. Fixture pages are explicitly simulated and restricted to a
loopback deployment. A live deployment is a separate, explicit configuration.

## 1. Render local UI immediately

From the repository root:

```sh
npm ci
npm run dev
```

Open http://localhost:3000 and switch shipment states and themes. The
five-minute goal covers this local render; database provisioning, customer
identity, account verification and live monitoring require additional steps.

## 2. Run the complete fictional order workflow

From `examples/nextjs-tracking`, copy `.env.example` to `.env.local`. Keep
`TRACE_MODE=demo` and `STARTER_DATA_MODE=fixture`. Add **your own isolated local
Postgres URL** to `DATABASE_URL`; do not use a Trace production database. The
file contains clearly fictional local-only credentials. Never commit it.

```sh
# Run these commands inside examples/nextjs-tracking.
npm run starter:setup
npm run fixture:seed
```

Start `npm run dev` from the repository root. Open
http://localhost:3000/sign-in, and sign in with the customer handle/password in
`.env.local`. The supplied fixture handle is `demo-customer`. The private page
contains fictional order #1042 and two separately tracked parcels.

In another terminal, inside the example directory:

```sh
npm run fixture:emit -- in-transit
npm run worker -- --once
npm run starter:status
```

Select **Refresh saved updates** on `/orders`. One parcel has an explicitly
unknown timezone. Refresh only reads the saved projection; it cannot trigger a
carrier request, reveal an API key or consume a tracking allowance.

The scenario command signs the original bytes and posts them to the real local
`/api/webhooks/trace` route. The receiver acknowledges only after its Postgres
insert succeeds. The worker runs separately; closing the page does not lose an
accepted event. For continuous processing, run `npm run worker`.

### Replay, older deliveries, failure states and restart

Run the following in order on a newly seeded fixture database:

```sh
# Revision 3 arrives before revision 2. The saved result stays at revision 3.
npm run fixture:emit -- out-of-order
npm run worker -- --once

# The same event ID/body is accepted as a duplicate; no effect runs twice.
npm run fixture:emit -- duplicate
npm run worker -- --once

# One parcel is delivered while the other continues its own journey.
npm run fixture:emit -- delivered
npm run worker -- --once

# Preserve a last-known scan when its latest acquisition failed.
npm run fixture:emit -- stale
npm run worker -- --once

# A parcel with no verified scan becomes unavailable, not fabricated pending.
npm run fixture:emit -- unavailable
npm run worker -- --once

# Claim an event, exit before projection, then recover in a new worker process.
# The supplied fixture lease is 1 second; live leases are always 60 seconds.
npm run fixture:emit -- restart
npm run worker -- --crash-after-claim
# Wait at least 2 seconds. The intentional crash command exits with code 70.
npm run worker -- --once
npm run starter:status
```

Refresh `/orders` after each step. Raw accepted events remain in
`trace_webhook_inbox`, including older deliveries and failed processing. The
scenario payloads are deterministic: rerunning an earlier scenario will not
reset a newer revision. Use a fresh local database to repeat the entire journey.

## 3. Identity and authorization

The root sandbox/live preview uses Basic authentication as username `trace`.
That password **does not grant access to customer orders**.

The order example provisions a customer password through a server-side CLI,
stores a scrypt hash, creates an opaque eight-hour HttpOnly session, and filters
every order query by the configured tenant **and authenticated customer**. Its
API never trusts customer, tenant or order ownership from a query string.
Sessions are revocable and sign-in has shared Postgres attempt limits. Cookie
writes require the exact configured Origin and use SameSite=Strict; HTTPS live
sessions also use Secure. Private responses are `private, no-store` and have a
no-referrer policy. Tracking numbers and credentials are not placed in URLs or
rendered into the order-page client data.

This is a deliberately small, offline-provisioned identity example, not a
self-service identity provider. For a merchant deployment, connect its existing
identity system and retain the same server-side ownership checks. Add your
normal edge abuse controls, account recovery, customer lifecycle and retention
policy. Deploy one merchant tenant per configured starter instance; never accept
a tenant identity from an unverified webhook field or browser header.

## 4. Connect an explicit live order

Use a separate deployment and preferably a separate application database.
Configure these server-only variables in its environment:

- `STARTER_DATA_MODE=live`, `STARTER_TENANT_ID` and your HTTPS `STARTER_ORIGIN`.
- A newly generated `STARTER_AUTH_SECRET` of at least 32 characters. Public
  fixture/example secrets are rejected in live mode.
- A real `TRACE_API_KEY` and `TRACE_WEBHOOK_SECRET` from your own Trace account.
  Keep keys in server environment variables, never `NEXT_PUBLIC_` variables.
- `DATABASE_URL` for this application, preserving TLS certificate verification.

Register `https://YOUR_HOST/api/webhooks/trace` in the Trace webhook dashboard
and subscribe to `shipment.updated`, `shipment.delivered` and `shipment.alert`.
Store its signing secret on the server. Provision a customer and order from a
trusted operator terminal:

```sh
npm run starter:setup
# Set STARTER_CUSTOMER_HANDLE and a strong STARTER_CUSTOMER_PASSWORD first.
npm run customer:create
# Set STARTER_CUSTOMER_ID to the returned opaque customer ID.
# Set an opaque STARTER_ORDER_ID, a STARTER_ORDER_REFERENCE, and
# TRACE_TRACKING_NUMBERS as a JSON array of shipment numbers you may access.
# Optionally set TRACE_CARRIER. Nothing below prints the shipment numbers.
npm run order:connect -- --confirm-live
npm run worker
```

The connect command creates persistent Trace shipment records with stable
bounded hashed idempotency keys and attaches returned snapshots to the existing customer-owned
order. Creation is not proof of a successful carrier lookup. Background
monitoring follows your Trace plan/monitoring window and may consume allowance.
Configure tenant budgets and source expectations before using actual customers.
The CLI rejects API-base overrides in live mode. Reuse the same order ID,
customer and parcel sequence for an interrupted connect retry; a changed request
with the same idempotency key must fail rather than silently create duplicates.
The order stores its expected parcel count before connecting the first parcel.
If registration is interrupted, missing parcels remain explicitly unconnected
and unavailable. A successfully connected parcel cannot make the entire order
appear delivered while another parcel is missing.

The customer signs in at `/sign-in`; the page renders saved data without
triggering live acquisition. Run the inbox worker as a separate persistent
process. A failed database write returns 503 for delivery retry; a database
outage never renders fictional sample success. Fixture events cannot enter a
live order projection, and live events cannot enter fixture projections.

### Original server-side sandbox/live preview

The root page can still exercise the server SDK separately from the order flow.
Set `TRACE_MODE=sandbox`, `TRACE_API_KEY`, a strong separate
`STARTER_ACCESS_TOKEN` (24+ characters), and optionally
`TRACE_SANDBOX_SCENARIO=unknown_timezone`. Sign in through the browser Basic
prompt as `trace`. Sandbox uses normal auth/RPM but no monthly carrier-lookup
allowance; it does not qualify source reliability.

For the one-number private lookup preview, set `TRACE_MODE=live`,
`TRACE_TRACKING_NUMBER`, and optionally `TRACE_CARRIER`. This makes a request on
each reload and may consume allowance. Only the server-configured number is
fetched; there is no anonymous tracking proxy. Source errors remain unavailable
and stale fallback remains labelled. Use HTTPS outside localhost.

## 5. Durable processing contract and operation

The canonical Trace envelope is
`{event_id,event_type,created_at,shipment_revision,shipment,tracking,...}`.
`shipment.revision` is the authoritative positive integer revision and must
match `shipment_revision`. It advances with each public shipment snapshot
mutation; it is not a scan timestamp. The processor uses the nested
`shipment.tracking` snapshot, not an unrelated top-level payload.

- Raw-body HMAC verification accepts a five-minute signature window, rejects
  oversized bodies (512 KB), and checks the optional event-ID header.
- `(tenant_id,event_id)` uniquely identifies acceptance. Exact retries dedupe;
  reuse with a different body is rejected without overwriting raw evidence.
- Workers use `FOR UPDATE SKIP LOCKED`, expiring token claims and bounded retry.
  The projection change and processed marker commit in the same transaction.
  An expired worker cannot commit after another claim has taken over.
- Only previously registered tenant-owned shipment/order pairs can change.
  Unknown pairs retry to allow the initial registration race, then dead-letter.
- Greater revisions replace the snapshot. Smaller/equal identical snapshots
  are obsolete; conflicting equal revisions dead-letter. Arrival time, body
  `created_at` and unknown-timezone scan dates never decide ordering.
- Six attempts are allowed with bounded exponential backoff. Permanent schema,
  revision, simulation or ownership errors dead-letter immediately. Inspect
  `status`, `attempts`, `result`, `last_error` and `processed_at` to investigate.
  Keep failed observations. Do not blindly clear dead letters or rewrite raw
  bodies: fix the mapping/configuration and use a reviewed operator recovery.
- A pre-revision shipment snapshot is retained as `needs_reconciliation`, not
  applied or sorted by its scan dates. No automatic API request, quota spend or
  background credential-dependent fetch is hidden in the receiver. Obtain a
  current revisioned snapshot through an explicit authenticated reconciliation
  flow before resolving an old observation; never invent revision 1 for it.
- Existing inbox-only installations upgrade without deleting raw events. Old
  rows remain in the `legacy` tenant and are not attached to a customer order.
  Apply the migration while the original receiver/worker is stopped.
- The page treats a failed/latest unavailable acquisition or a successful check
  older than six hours as stale. This is the starter's display policy, not a
  refresh SLA or a prediction of the parcel's physical state.
  Fixed fictional sample dates do not age the local demo into failure; fixture
  scenarios show stale state only when that condition is explicitly simulated.
  A live record with no first observation says it is waiting for a verified
  update; it does not imply a carrier label was created. A failed first lookup
  has its own unavailable notice. Actual carrier-supplied pending remains
  distinct from both conditions.

For signing-secret rotation, set the new `TRACE_WEBHOOK_SECRET`, optionally
`TRACE_WEBHOOK_PREVIOUS_SECRET`, and a finite explicit UTC
`TRACE_WEBHOOK_PREVIOUS_SECRET_UNTIL` matching the provider's overlap window
(at most 24 hours into the future).
Previous signatures stop working at expiry. Remove the old secret afterwards.
Invalid expiry configuration fails closed. Raw payloads can contain personal
information; define retention, deletion, backups and restore procedures for
this application before taking customer data.

```sql
SELECT status, result, count(*) FROM trace_webhook_inbox
GROUP BY status, result;
```

## Verification

Node 22+, Next.js 16 and React 18/19 consumer UI support. The included starter
uses React 19. Its reviewed local SDK archive is bundled with the repository,
so a clean install does not depend on an unpublished registry version.

From the repository root:

```sh
npm test
npm run typecheck
npm run build
```

Set `TRACE_STARTER_TEST_DATABASE_URL` to an explicitly isolated test Postgres
instance to run the database suite. It creates and drops random test schemas;
it never falls back to `DATABASE_URL`. Without the variable, database tests are
explicitly skipped. After building:

```sh
npm run test:http -w trace-nextjs-starter
npm run test:orders:http -w trace-nextjs-starter
```

The HTTP suites start real Next servers against local fixtures. They cover the
separate preview/customer gates, no-secret rendering, customer/tenant isolation,
signed persisted updates, duplicates, out-of-order revisions, stale/unavailable
rendering and sign-out. Postgres tests also exercise concurrent claims,
transaction rollback, lease recovery and an actual worker process crash/restart.
No suite proves live carrier reliability or makes actual carrier requests.
