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
  raw-body signed-webhook receiver backed by a Postgres inbox.
- `clients/typescript` and `clients/python`: Trace server-side SDK source in the
  public release repository. These clients are Trace-specific; the UI is not.

Scans keep their supplied order. Unknown local times remain local, stale results
remain labelled, and an unavailable response never becomes a pending parcel.
The component does not poll providers, store data or predict delivery dates.

## Connect real data

Follow the [starter guide](examples/nextjs-tracking/README.md). Use sandbox first;
it exercises API authentication without carrier lookups. Live tracking depends
on source availability and uses your account's lookup allowance.

The starter is a private integration preview, not a public customer-tracking
portal. Replace its Basic access gate with your own tenant/order authentication,
refresh scheduling, rate limits and privacy policy before building a storefront.

## Development

```sh
npm test
npm run typecheck
npm run build
```

Unit tests use fixtures; they do not prove carrier-source reliability. The
optional Postgres test needs an isolated `TRACE_STARTER_TEST_DATABASE_URL`.

## Distribution

The source and pinned download artifacts work now. npm/PyPI registry publication
is a separate release step and requires maintainers' registry accounts. Until
published, use the installation URL in the component/client README.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). Report security concerns using
[SECURITY.md](SECURITY.md). Please never include real tracking numbers, customer
data, signing secrets or API keys in issues or examples.
