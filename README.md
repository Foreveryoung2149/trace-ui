# Trace UI

A beautiful shipment timeline for React, with a runnable Next.js starter.
Provider-independent. MIT licensed. No account required for the local demo.

[Interactive preview](https://traceapi.dev/tracking-timeline) ·
[Trace API docs](https://traceapi.dev/docs) · [Component reference](packages/timeline/README.md)

## Start now

Node 22+ and npm are required.

```sh
git clone https://github.com/Foreveryoung2149/trace-ui.git
cd trace-ui
npm ci
npm run dev
```

Open http://localhost:3000. Select a delivery state and switch between light and
dark themes. This uses local fixtures, makes no API calls and does not track visitors.

## What is included

- `packages/timeline`: a typed, SSR-compatible React component and plain CSS.
- `examples/nextjs-tracking`: demo, private server-side Trace connection, and a
  customer-scoped order example with signed persistence, revisioned processing
  and a durable Postgres inbox. Fictional two-parcel scenarios work locally.
- `templates`: reusable order page, merchant support panel and read-only return
  timeline. All accept supplied provider-neutral data.
- `tools/webhook-doctor.mjs`: offline raw-signature and receiver-status diagnostics.
- `clients/typescript` and `clients/python`: Trace server-side SDK source in the
  public release repository. These clients are Trace-specific; the UI is not.

Scans keep their supplied order. Unknown local times remain local, stale results
remain labelled, and an unavailable response never becomes a pending parcel.
The component does not poll providers, store data or predict delivery dates.

## Connect real data

Follow the [starter guide](examples/nextjs-tracking/README.md). Use sandbox first;
it exercises API authentication without carrier lookups. Live tracking depends
on source availability and uses your account's lookup allowance.

The root Trace connection retains its private preview gate. The separate order
example authorizes every read through a server-configured tenant and customer
session; a preview password never authorizes customer orders. Follow the starter
guide to provision identities, run the processor and configure live access.
Adapt identity, operational limits and privacy policy to your deployment.

## Development

```sh
npm test
npm run typecheck
npm run build
```

Unit tests use fixtures; they do not prove carrier-source reliability. The
optional Postgres test needs an isolated `TRACE_STARTER_TEST_DATABASE_URL`.

Explore the [visual builder](https://traceapi.dev/timeline-builder),
[free tools](https://traceapi.dev/tracking-tools) and [template gallery](templates/README.md).
The builder validates structure and formats evidence; it does not verify a
parcel's physical movement. Pasted JSON remains local to the page.

## Distribution

The source and pinned download artifacts work now. npm/PyPI registry publication
is a separate release step and requires maintainers' registry accounts. Until
published, use the installation URL in the component/client README.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). Report security concerns using
[SECURITY.md](SECURITY.md). Please never include real tracking numbers, customer
data, signing secrets or API keys in issues or examples.
