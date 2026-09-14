# Open Source mini-challenge

**Target:** `modelcontextprotocol/typescript-sdk` (13.4k stars), branch `v1.x`

**Contribution:** make the `Transport` interface safe for consumers compiling with
`exactOptionalPropertyTypes: true`.

```ts
onclose?: (() => void) | undefined;
onerror?: ((error: Error) => void) | undefined;
onmessage?: (<T extends JSONRPCMessage>(message: T, extra?: MessageExtraInfo) => void) | undefined;
sessionId?: string | undefined;
```

**Why it matters:** under that flag, `onclose?: () => void` means the property may be
absent but never explicitly `undefined`. The concrete transports declare these as
accessors typed `(() => void) | undefined`, so the SDK's own transports are not
assignable to the SDK's own `Transport` interface —
`server.connect(new StreamableHTTPServerTransport(...))` fails with TS2379. Every
consumer on TypeScript's strictest settings has to cast at the call site or turn the
flag off for their whole project, which is what this repo did (see FL-004).

**Provenance:** hit while building this server, not gone looking for. It turned out
to be open upstream issue
[#2083](https://github.com/modelcontextprotocol/typescript-sdk/issues/2083), fixed on
`main` by [#1766](https://github.com/modelcontextprotocol/typescript-sdk/pull/1766) in
March but never backported — which is why 1.30.0 still ships it. The issue thread says
a backport is what is needed.

**Verification**

- [x] Fork: `kishormorol/typescript-sdk`, branch `fix/v1-transport-exact-optional-property-types`
- [x] Upstream typecheck clean (`tsgo --noEmit`)
- [x] Upstream test suite: **1647 tests, 52 files, all passing**
- [x] Changeset added, matching what #1766 did on `main`
- [x] Proved it resolves the real failure: built the patched SDK, installed it into
      this project, re-enabled `exactOptionalPropertyTypes: true`, and typechecked
      clean — then restored the published 1.30.0
- [ ] PR opened against `v1.x`
- [ ] Record PR URL here

**Submission fields**

| Field | Value |
| --- | --- |
| Contribution URL | _pending PR_ |
| Project repository URL | https://github.com/modelcontextprotocol/typescript-sdk |
| GitHub username | kishormorol |
| Description | Backport of an accepted upstream type fix to the v1 maintenance line, unblocking every v1 consumer on TypeScript's strictest settings. Closes an open issue. |
