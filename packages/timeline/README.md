# @traceapi/timeline · 0.2.0

Provider-independent React shipment experiences. React 18.2 or 19. Plain CSS,
SSR-compatible rendering, no Tailwind requirement, requests, telemetry or API key.
MIT licensed. No required Trace logo or attribution. Use your own tracking backend.

## Install

Pinned direct download (available before registry publication):

```sh
npm install https://traceapi.dev/downloads/traceapi-timeline-0.2.0.tgz
```

After the registry release is confirmed, the equivalent will be
`npm install @traceapi/timeline@0.2.0`. Do not assume it is published yet.

Try the local-first visual builder at https://traceapi.dev/timeline-builder.
It includes scenario replay, split-order previews, JSON validation and React export.
Data stays in page memory; it is not sent to a service, stored or put in share URLs.

## Render with your own data

```tsx
import { ShipmentTimeline, type TimelineShipment } from '@traceapi/timeline';
import '@traceapi/timeline/styles.css';

const shipment: TimelineShipment = {
  reference: 'Order #1042',
  carrier: 'Your carrier',
  status: 'in_transit',
  freshness: 'cached',
  events: [{
    description: 'Arrived at sorting facility',
    location: 'Example hub',
    timestamp: null,
    localTime: '2026-03-17T19:35:00',
    timezone: 'unknown',
  }],
};
export default function Tracking() {
  return <ShipmentTimeline shipment={shipment} theme="light" density="compact" />;
}
```

For Next.js, import the stylesheet in your root layout. The components render
from server or client components; the library has no browser-only dependencies.

## Compose your own experience

`ShipmentTimeline` is a convenience composition of these exported primitives:

- `TimelineFrame`: theme, density, direction and CSS boundary.
- `ShipmentSummary`: carrier, reference and reported status.
- `ShipmentProgress`: configurable, evidence-based progress path.
- `ShipmentHistory`: semantic scan list in supplied order.
- `FreshnessNotice`: prominent simulated/stale disclosure.
- `ExceptionNotice`: exception/unavailable explanation, optional custom children.
- `ShipmentFreshness`: cache/lookup metadata and estimate disclaimer.
- `OrderTracking`: multiple parcel journeys under one order reference.

```tsx
import {
  TimelineFrame, ShipmentSummary, ShipmentHistory,
  FreshnessNotice, ShipmentFreshness,
} from '@traceapi/timeline';

<TimelineFrame theme="light" density="compact" locale="fr" title="My order">
  <ShipmentSummary shipment={shipment} locale="fr" />
  <FreshnessNotice shipment={shipment} locale="fr" />
  <ShipmentHistory shipment={shipment} locale="fr" timeZone="Europe/Paris" />
  <ShipmentFreshness shipment={shipment} locale="fr" timeZone="Europe/Paris" />
</TimelineFrame>
```

Options are explicit props, not implicit context. When composing primitives,
pass locale/timeZone/messages to each primitive that should use them.
Pass theme/density/direction/style to the frame.

```tsx
import { OrderTracking, type TimelineOrder } from '@traceapi/timeline';
const order: TimelineOrder = {reference: 'Order #1042', shipments: [parcelOne, parcelTwo]};
<OrderTracking order={order} theme="dark" locale="en" />;
```

Each parcel retains its own carrier, status, freshness and history. No aggregate
ETA, invented delivery percentage or inferred carrier relationship is created.

## Props and data rules

| Prop | Default | Meaning |
| --- | --- | --- |
| `shipment` | Required | Status and supplied-order events |
| `theme` | `dark` | `dark` or `light` |
| `density` | `comfortable` | `comfortable` or `compact` spacing |
| `layout` | `full` | `compact` omits progress, retaining history and disclosures |
| `title` | Localized shipment journey | Visible heading/accessibility label |
| `locale` | `en` | English, Spanish, French or Arabic UI; supported Intl locale for dates |
| `timeZone` | `UTC` | IANA zone for verified instants only |
| `direction` | Derived from locale | Override with `ltr` or `rtl` |
| `messages` | Built-in dictionary | Override labels and/or `statuses` per status |
| `stages` | Four forward-delivery stages | `{id,label,statuses}[]`; no match means no active stage |
| `className`, `style` | None | Customize the `--tt-*` CSS variables |

Statuses: `pending`, `in_transit`, `out_for_delivery`, `customs`, `delivered`,
`exception`, `unknown`, `pickup_available`, `return_in_transit`, `returned`,
`cancelled`. The default forward-delivery path does not imply that a pickup,
return or cancellation completed a normal delivery. Supply a custom stage path
for those experiences; labels in a custom path are your responsibility.

Freshness: `live`, `cached`, `stale`, `simulated`, `unknown`. This is supplied
evidence, not a freshness calculation. Set it from your source/cache policy.
`unknown` status is distinct from a pending parcel; stale status is last-known,
not proof of the current location. Provider text is never automatically translated.

`timestamp: string | null` must have an explicit Z/offset to be converted.
Offset-less, invalid or `timezone: 'unknown'` timestamps are not interpreted as
UTC or in the viewer's timezone. `localTime` is displayed unchanged. Date-only
estimates remain date-only and are labelled as carrier estimates, not guarantees.
`lastCheckedAt` is displayed only with a verified offset. Invalid Intl locale
and timezone options fall back to English and UTC instead of crashing SSR.

Events are never silently sorted. Latest-event highlighting uses, in order:

1. An explicit `latestEventId` matching a supplied event.
2. Explicit `eventOrder: 'newest_first' | 'oldest_first'`.
3. The latest timestamp, only when every event has a verified comparable instant.

Otherwise no latest event is guessed. `eventOrder: 'supplied'` is the default.
An unknown `latestEventId` suppresses a guessed fallback. Provide unique IDs.

Optional event `kind: 'handoff'` and `carrier` disclose a provider-reported carrier
handoff; the library does not infer it from a change in locations or domains.

## Localization and accessibility

Built-in dictionaries: `en`, `es`, `fr`, `ar`. Regional locales use their language
dictionary. Other languages use English UI until you provide `messages`.
Arabic selects RTL automatically; override `direction` for your layout. CSS uses
logical alignment and timeline positioning. UI labels, statuses and disclosures
are localizable; event descriptions remain supplied text.

```tsx
<ShipmentTimeline shipment={shipment} locale="es" messages={{
  history: 'Movimientos', statuses: {delivered: 'Recibido'},
}} />
```

Semantic sections, ordered scan lists, `time` elements for verified instants,
visible textual states and a current-step label avoid relying on color alone.
There are no animations or required pointer interactions in the library.

## Validate untyped JSON and adapt Trace

```ts
import { validateShipment, parseShipmentJson, fromTraceTracking } from '@traceapi/timeline';
const checked = validateShipment(providerNormalizedObject);
if (!checked.ok) console.error(checked.errors);
const parsed = parseShipmentJson(jsonString, 'canonical'); // or 'trace'
```

Validation caps previews at 500 events and JSON at 100 KB, copies supported
fields only, and reports unverified timestamp warnings. It does not validate
that a provider's factual claim is true. Use sanitized examples, not customer
information, in public playgrounds. Extra fields do not enter the exported model.

Call Trace on your **server**, then pass data to the optional structural adapter:

```ts
import { Trace } from '@traceapi/sdk';
import { fromTraceTracking } from '@traceapi/timeline';
const trace = new Trace(process.env.TRACE_API_KEY!);
const result = await trace.track({ tracking_number: 'YOUR_NUMBER', carrier: 'ups' });
const shipment = fromTraceTracking(result);
```

The adapter imports no SDK and makes no requests. For untrusted Trace-shaped
JSON use `validateTraceTracking` or `parseShipmentJson(json, 'trace')`; unwrap
`data` if your HTTP response has an envelope. Any provider can map to the same
`TimelineShipment` type.

## Fixtures and replay

```ts
import { sampleShipments, sampleOrders, simulateJourney } from '@traceapi/timeline/samples';
```

Fictional fixtures cover delivery, exceptions, stale/unavailable, unknown timezone,
customs, pickup, return, cancellation, carrier handoff and split orders. Replay
snapshots are always marked simulated and never make live calls. The fixtures
are examples of UI behavior, not evidence of carrier coverage or reliability.

`timelineReactExample(shipment, config)` exports valid TSX with the explicit
presentation settings. No customer data, URLs or keys are added automatically.
Existing 0.1.0 `ShipmentTimeline` and `fromTraceTracking` call sites remain valid.
