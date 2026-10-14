# @traceapi/timeline · 0.1.0

Provider-independent React shipment timeline. React 18.2 or 19. Plain CSS,
SSR-compatible rendering, no Tailwind requirement, fetches, telemetry or API key.
Supports light and dark themes, keyboard-independent semantic scan lists,
delivery stages, carrier exceptions, stale observations and unverified local times.

## Install

Pinned direct download (available before registry publication):

```sh
npm install https://traceapi.dev/downloads/traceapi-timeline-0.1.0.tgz
```

After the registry release is confirmed, the equivalent package will be
`npm install @traceapi/timeline@0.1.0`. Do not assume it is published yet.

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
  return <ShipmentTimeline shipment={shipment} theme="light" />;
}
```

For Next.js, import the stylesheet in your root layout. Import the component
from either server or client components; it has no browser-only dependencies.

## Optional Trace adapter

Call Trace on your **server**, then pass the adapted data to the component:

```ts
import { Trace } from '@traceapi/sdk';
import { fromTraceTracking } from '@traceapi/timeline';
const trace = new Trace(process.env.TRACE_API_KEY!);
const result = await trace.track({ tracking_number: 'YOUR_NUMBER', carrier: 'ups' });
const shipment = fromTraceTracking(result);
```

The adapter accepts a structural object; it does not import or require the SDK.
You can instead map any provider into `TimelineShipment` yourself.

## Props and data rules

| Prop | Default | Meaning |
| --- | --- | --- |
| `shipment` | Required | `TimelineShipment`, including status and supplied-order events |
| `theme` | `dark` | `dark` or `light` |
| `title` | `Shipment journey` | Visible heading and accessible section label |
| `locale` | `en` | Intl date formatting locale; UI labels are English in 0.1 |
| `timeZone` | `UTC` | IANA zone for verified instants only |
| `className`, `style` | None | Container styling; customize the `--tt-*` CSS variables |

Statuses: pending, in_transit, out_for_delivery, customs, delivered, exception,
unknown. Freshness: live, cached, stale, simulated, unknown. Use unknown when
your provider cannot establish a status; it is distinct from pending.

An event has description, `timestamp: string | null`, optional location/status/id,
localTime and `timezone: 'unknown'`. `timestamp` must have an explicit Z/offset.
Offset-less or invalid timestamps do not become UTC. Unknown local times are
displayed unchanged and never used to sort or infer progress. Supply events in
your intended order, normally newest first. The component preserves that order.

`lastCheckedAt` is shown only with an explicit offset. `estimatedDelivery` is
labelled as the carrier's estimate, never as a guarantee. Validate your provider
data and supply valid locale/timeZone options. No automated age inference is
performed; the owner must set freshness based on their source/cache policy.

## Local examples

```ts
import { sampleShipments } from '@traceapi/timeline/samples';
```

These are fictional fixtures. No API calls, real shipment numbers or credentials.
MIT license. No required logo, attribution or dependency on the Trace service.
