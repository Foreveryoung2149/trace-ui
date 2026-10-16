# Product screenshots

These images show the actual Trace UI 0.2 builder with fictional samples. They
are product captures, not generated mockups or evidence of live carrier success.
No customer account, real tracking number or credential is used.

- `timeline-builder.png`: the builder controls, shipment preview and React-export entry.
- `split-order.png`: two independent parcel timelines rendered by `OrderTracking`.
- `trace-ui-social.png`: an unmodified 1200×630 browser viewport, prepared for a
  maintainer to review before choosing a repository/social preview.
- `capture-provenance.json`: source URL, capture date and image descriptions.

Reproduce with `docs/capture-launch-assets.mjs`. It uses a fresh headless browser
and only permits the public builder or a local `/timeline-builder` equivalent.
Install Puppeteer in your development tools first; the component does not depend
on it. Optionally set `PUPPETEER_EXECUTABLE_PATH` to your local Chrome executable.
The script makes no changes to GitHub settings and posts nothing externally.
