# Trace UI 0.2: a 75-second product demo

Use the real [timeline builder](https://traceapi.dev/timeline-builder). No account,
tracking number or API key is needed. Every scenario below is fictional.
Record the interface itself; do not replace it with a mockup or paste a customer
payload. Keep the simulation labels visible.

## Shot list and narration

| Time | Show | Say |
| --- | --- | --- |
| 0–10s | Open the builder with the delivered sample | “Trace UI is an open-source shipment UI toolkit for React. Bring your own tracking backend.” |
| 10–20s | Change Theme to Light, then Density to Compact | “Start with the complete timeline, or compose smaller pieces to fit your app.” |
| 20–32s | Choose the Unknown timezone scenario | “A scan without a verified timezone keeps its local time. We do not pretend it is UTC.” |
| 32–42s | Choose Stale data, then Source unavailable | “Last-known data stays labelled. An unavailable result does not become a pending parcel.” |
| 42–53s | Change Experience to Split order · two parcels | “An order can have separate parcel journeys. One delivered parcel does not complete the other.” |
| 53–63s | Switch Interface language to Arabic, then back to English | “English, Spanish, French and Arabic UI are included, with right-to-left layout. Carrier text stays as supplied.” |
| 63–75s | Return to Single shipment and use Copy React code | “Preview, copy working React, and connect your data. The components are MIT licensed and do not require Trace API.” |

Finish on the builder URL or repository URL. A small optional secondary message
can introduce Trace API as the managed backend. Do not interrupt the free UI
demo with account creation.

## Suggested post accompanying the recording

> We built Trace UI for the difficult parts of shipment tracking: split orders,
> stale updates, missing timezones and failed retrievals.
>
> It is an MIT-licensed React toolkit with a visual builder, templates and a
> Next.js starter. Use your own backend. No signup is needed to try the builder.
>
> Try it: https://traceapi.dev/timeline-builder
>
> Source: https://github.com/Foreveryoung2149/trace-ui
>
> Which tracking state is hardest to explain in your product?

This is draft launch copy, not a posted message. Use it for the approved GitHub
release/blog launch; sharing elsewhere remains a separate action.

## Optional deeper demonstration: saved signed updates

For a longer technical recording, follow the
[private order starter](../examples/nextjs-tracking/README.md). Provision an
isolated local Postgres database and use only its fixture configuration.

1. Open the fictional two-parcel order at `/orders` after signing in locally.
2. Run `npm run fixture:emit -- in-transit`, then `npm run worker -- --once`.
3. Refresh saved updates and show the unknown-timezone scan.
4. Emit `out-of-order`, process it, and show that the lower revision cannot undo
   a newer snapshot. Repeat `duplicate` to demonstrate deduplication.
5. Run the documented crash-after-claim demonstration, wait for the fixture
   lease to expire, and recover in a new worker process.

Do not show a terminal containing environment variables, credentials or database
connection strings. The five-minute local UI render and the optional persistent
workflow are different setup milestones. None of these fixtures proves live
carrier availability, physical delivery or a production refresh SLA.
