# Registry release checklist

Source and pinned downloads can be used before registry publication. The first
npm and PyPI releases require the owner's accounts. Do not paste tokens into chat
or commit credentials. Use the registries' official account setup and sign in
directly. Own the `@traceapi` npm organization before using that scope.

## Verify source and archives

From the public repository: `npm ci`, `npm test`, `npm run typecheck`, `npm run build`.
From clients/typescript: `npm run build`, `npm test`, `npm pack --dry-run`.
For Python: `python -m build clients/python`, then `python -m twine check clients/python/dist/*`.
Review the archive contents and licenses, then install the archives into a clean
consumer project. Compare versions with package metadata and commit/tag the
release source. This release uses timeline 0.2.0 and clients 0.3.0.

## npm — after account and organization ownership exist

```sh
npm login
npm whoami
npm publish ./packages/timeline --access public
npm publish ./clients/typescript --access public
npm view @traceapi/timeline@0.2.0 version
npm view @traceapi/sdk@0.3.0 version
```

Complete any required 2FA yourself. Do not substitute another organization's
scope, republish an existing version or bypass registry checks. For later CI
releases, configure a trusted publisher on the existing packages rather than
storing a long-lived publishing token in this repository.

## PyPI — after account and project ownership exist

Check https://pypi.org/project/traceapi-sdk/ for name availability before the first
upload. Publish only the reviewed 0.3.0 wheel and source archive using Twine, or
configure a pending trusted publisher for this public repository and a dedicated
release workflow. Use a project-scoped token if performing a manual upload; enter
it directly into the tool, never a command saved in shell history or chat.

```sh
python -m twine upload clients/python/dist/traceapi_sdk-0.3.0*
python -m pip index versions traceapi-sdk
```

Official setup: https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/
and https://docs.pypi.org/trusted-publishers/creating-a-project-through-oidc/.

## After publication

Install each registry package in a new environment and run the fixture smoke
tests. Only after successful readback change website/readme installation examples
from downloads to registry commands. Publish release notes and keep prior pinned
downloads working. Do not claim registry availability before verification.
