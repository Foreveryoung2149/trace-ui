# Contributing

Open an issue describing the problem, then a focused pull request with an
illustrative fixture and relevant tests. Keep dependencies small and the UI
usable with providers other than Trace. Do not add required attribution,
telemetry or API calls to the component.

Use Node 22+, `npm ci`, `npm test`, `npm run typecheck` and `npm run build`.
Check keyboard operation, mobile width, both themes, long text, stale states and
unknown timestamps. Keep backend secrets out of client imports.

The MIT license covers contributions to this repository. Brand assets and the
hosted service remain separate. Versions are 0.x: pin versions and document
breaking changes. The adapter must retain unverified-time and freshness metadata.
