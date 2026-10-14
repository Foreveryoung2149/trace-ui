# Security

Report vulnerabilities privately through https://traceapi.dev/contact rather
than including credentials or customer data in a public issue. Maintainers can
enable GitHub private vulnerability reporting after repository creation.

The demo has no credentials or live data. Sandbox/live preview requires its own
access password and keeps the Trace API key server-side. Webhooks verify raw
bytes, reject expired signatures, and acknowledge only after database persistence.
The starter intentionally does not send emails or perform merchant actions.

Use HTTPS outside local development. Keep database certificate verification
enabled, rotate credentials, set retention for stored payloads, and use your own
authenticated merchant/order access model before exposing private shipments.
