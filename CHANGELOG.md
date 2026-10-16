# Changelog

## Timeline 0.2.0 / order starter 0.2.0 / clients 0.3.0 — 16 October 2026

- Composable shipment summary, progress, history, freshness and exception views;
  multi-parcel orders, four interface dictionaries, RTL, density/layout options
  and configurable progress paths. Existing ShipmentTimeline usage still works.
- Explicit latest-event evidence, resilient locale/timezone formatting, honest
  stale/unknown-time rendering and pickup/return/handoff/cancellation fixtures.
- Free local visual builder, JSON structural validation, scenario replay and
  React export at https://traceapi.dev/timeline-builder.
- Durable Next.js private order example: customer ownership, signed persistent
  inbox, revision-ordered projection, retries, lease recovery and local scenarios.
  Missing parcel connections cannot imply that a whole order was delivered.
- Revision-less historic payloads remain visible for explicit reconciliation.
  The starter never invents a revision or silently contacts a provider.
- Reusable order/support/read-only-return templates and an offline webhook doctor.
- TypeScript/Python helpers for durable tracking jobs, measured lookup outcomes
  and alert ownership/resolution/history; generated versioned API contracts.
- Starter SDK archive is vendored for a reproducible checkout. Registry
  publication remains pending maintainer accounts; pinned downloads work.

Component, template, SDK, isolated Postgres, real Next HTTP and automated browser
checks use fictional data. They do not establish live source coverage, a carrier
SLA or accessibility certification. No hidden telemetry or required branding is
added to the provider-neutral components.

## Timeline 0.1.0 / clients 0.2.1 — 14 October 2026

Initial React shipment timeline, local scenarios, private Next.js preview and
signed persistent webhook inbox, plus downloadable public client source.
