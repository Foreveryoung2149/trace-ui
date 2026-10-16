# Tracking experiences you can own

Three small, working React templates built from `@traceapi/timeline` 0.2.0.
Copy the TSX files into your application and adapt their layout, labels and data.
MIT licensed under the repository's LICENSE. No required logo or attribution.

They perform no networking, browser storage, authentication or telemetry. Render
from server or client components. Import `@traceapi/timeline/styles.css` once in
your application layout. Install from the pinned download while npm publication
is pending:

```sh
npm install https://traceapi.dev/downloads/traceapi-timeline-0.2.0.tgz
```

| Template | Use it for | Supplied data |
| --- | --- | --- |
| [OrderTrackingPage](./OrderTrackingPage.tsx) | A storefront order page with separate parcel histories | `TimelineOrder` with `shipments`; optional order reference |
| [SupportShipmentPanel](./SupportShipmentPanel.tsx) | A read-only shipment panel inside your merchant support tool | `TimelineShipment`, optional internal support note |
| [ReadOnlyReturnTimeline](./ReadOnlyReturnTimeline.tsx) | An existing return's reported progress | `TimelineShipment` with actual `return_in_transit` / `returned` evidence |

## Try fictional data first

```tsx
import {sampleOrders, sampleShipments} from '@traceapi/timeline/samples';
import '@traceapi/timeline/styles.css';
import {OrderTrackingPage} from './OrderTrackingPage';
import {SupportShipmentPanel} from './SupportShipmentPanel';
import {ReadOnlyReturnTimeline} from './ReadOnlyReturnTimeline';

export function StorefrontExample() {
  return <OrderTrackingPage order={sampleOrders.split} theme="light" />;
}

export function SupportExample() {
  return <SupportShipmentPanel shipment={sampleShipments.exception}
    supportNote="Example only: contact the recipient to confirm the address." />;
}

export function ReturnExample() {
  return <ReadOnlyReturnTimeline shipment={sampleShipments.returning} theme="light" />;
}
```

Replace fictional samples with your authorized, provider-normalized display data.
The types and components do not authorize customer access: query an order through
your own session/tenant relationship before rendering it. Do not turn an arbitrary
tracking number or order ID from a URL into public access. Keep provider API keys
on your server. The Next.js starter includes an authorization example.

## Evidence stays honest

- Split parcels keep separate statuses; one delivered parcel does not complete
  the other. Stale/unknown freshness suppresses an all-delivered aggregate.
- `freshness`, `lastCheckedAt`, unknown-timezone metadata and the raw carrier
  description must come from the supplied data policy. No date or ETA is invented.
- A return template is **read-only**. A delivery exception, cancelled label or
  support note is not proof that a parcel is returning or that money was refunded.
  No return label, refund, pickup booking or carrier action is performed.
- Template headings and explanatory text are examples in English. Translate
  those alongside your app; the underlying component supports dictionaries/RTL.
- Put internal support notes only behind merchant authorization. React escapes
  text, but escaping does not make private information safe to publish.

The templates share the same provider-neutral model as the
[visual builder](https://traceapi.dev/timeline-builder). Any tracking backend can
supply it. There is no requirement to use Trace API.

From the toolkit root, run `node --test templates/templates.test.mjs`. The test
compiles all three templates with strict TypeScript and checks their server HTML
with fictional states, without external requests. Build the timeline package first.
