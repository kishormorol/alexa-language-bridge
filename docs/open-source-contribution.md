# Open Source mini-challenge

**Target:** `modelcontextprotocol/typescript-sdk`

**Contribution:** make the `Transport` interface safe for consumers compiling with
`exactOptionalPropertyTypes: true`.

Declare the optional members as explicitly `| undefined`:

```ts
onclose?: (() => void) | undefined;
onerror?: ((error: Error) => void) | undefined;
onmessage?: ((message: JSONRPCMessage, extra?: MessageExtraInfo) => void) | undefined;
sessionId?: string | undefined;
```

**Why it matters:** today the SDK's own `StreamableHTTPServerTransport` does not
satisfy the SDK's own `Transport` interface under TypeScript's strictest settings,
so any project on that flag must weaken its compiler settings to use the SDK. The
change is source-compatible for every existing consumer.

**Provenance:** found by building this project, not by going looking. See FL-004.

**Status:** not yet filed.

- [ ] Fork and reproduce against the SDK's own test suite
- [ ] Add `exactOptionalPropertyTypes: true` to the SDK tsconfig to prevent regression
- [ ] Open PR, record the URL here
- [ ] Submission fields: contribution URL, repo URL, GitHub username, description
