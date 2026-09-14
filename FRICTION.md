# Friction Log

Running log of every rough edge hit while building. Append the moment it happens —
this is not reconstructable from memory later.

Each entry needs all six fields. Severity: Blocker / Major / Minor.

---

## Template

### FL-000 — <one-line title>

- **Date:** YYYY-MM-DD
- **Tool / SDK / API:** 
- **Task attempted:** what I was actually trying to do
- **Steps taken:** the exact sequence
- **Expected result:** 
- **Actual result:** verbatim error text where there is one
- **Severity:** Blocker | Major | Minor
- **Workaround used:** or "none found"
- **Actionable suggestion:** what would have prevented this

---

## Entries

<!-- newest first -->
### FL-006 — Bedrock model ids need an inference-profile prefix, and the error does not say which

- **Date:** 2026-09-14
- **Tool / SDK / API:** Amazon Bedrock (`bedrock-runtime`)
- **Task attempted:** Invoke a Claude model on a new AWS account, using the model id exactly as `aws bedrock list-foundation-models` returns it.
- **Steps taken:** `aws bedrock-runtime converse --model-id anthropic.claude-haiku-4-5-20251001-v1:0 ...`, taking the id verbatim from the catalog listing.
- **Expected result:** Either a response, or an error naming the correct id.
- **Actual result:** Three different errors in sequence, each hiding the next: (1) `AccessDeniedException: Your account is currently being verified` — new-account verification, roughly two hours, no way to check progress; (2) `ValidationException: Invocation of model ID ... with on-demand throughput isn't supported. Retry your request with the ID or ARN of an inference profile that contains this model.` — the catalog returns bare ids, but on-demand requires the `us.`/`global.` inference-profile id, and the error names no candidate; (3) `ResourceNotFoundException: Model use case details have not been submitted for this account.` One invocation succeeded between (2) and (3) before the form check began enforcing, so the gate is not immediately consistent. Separately, `us.anthropic.claude-opus-5` returns `AccessDeniedException: not available for this account`, while `us.anthropic.claude-haiku-4-5-...` reaches the use-case-form error — so availability differs per model with no way to list which are actually usable.
- **Severity:** Major
- **Workaround used:** `aws bedrock list-inference-profiles` to find the real id; the use-case form still has to be submitted through the console.
- **Actionable suggestion:** Three fixes. Have `list-foundation-models` mark which ids are invocable on-demand, or return the inference-profile id alongside — the catalog currently hands you an id that cannot be used. Have the validation error name the inference profile it wants, since the service already knows it. And surface all applicable gates at once rather than one per attempt: a developer on a new account hits verification, then profile ids, then the use-case form, then per-model availability, discovering each only after clearing the last. For a hackathon, that is four separate multi-hour stalls where one message would do.

### FL-005 — MCP Apps package is unusable from the SDK line that has Streamable HTTP

- **Date:** 2026-09-14
- **Tool / SDK / API:** `@modelcontextprotocol/ext-apps` 2.0.0 · `@modelcontextprotocol/sdk` 1.30.0
- **Task attempted:** Add an MCP Apps UI to a server built on `@modelcontextprotocol/sdk@1.30.0` with the Streamable HTTP transport that Alexa+ requires.
- **Steps taken:** `npm install @modelcontextprotocol/ext-apps@2.0.0`.
- **Actual result:** `npm error ERESOLVE ... peer zod@"^4.2.0" from @modelcontextprotocol/ext-apps@2.0.0`, against `zod@3.25.76` held by `sdk@1.30.0` (which allows `^3.25 || ^4.0`). Its peers also require `@modelcontextprotocol/{core,client,server}@^2.0.0` — the separate v2 package line, not `sdk@1.x`. So MCP Apps cannot be added to a 1.x server at all; it requires migrating to v2 and to zod 4.
- **Severity:** Major
- **Workaround used:** Implemented the Apps contract directly — `text/html;profile=mcp-app`, a `ui://` resource, and `_meta.ui.resourceUri` plus the legacy `ui/resourceUri` key — against `registerResource`/`registerTool`, which 1.x already provides. The official helpers turn out to be thin wrappers over exactly those two calls, so this conforms without the dependency.
- **Actionable suggestion:** Two things would have saved a day. State plainly at the top of the MCP Apps docs which SDK line it targets — nothing on the landing page says it is v2-only, and the first signal is an ERESOLVE error about zod. Second, either publish a 1.x-compatible release or document the hand-rolled contract as a supported path, since 1.x is still where Streamable HTTP lives and Alexa+ mandates that transport. As it stands the two features Alexa+ asks for — Streamable HTTP and MCP Apps — cannot both be had from one supported package.

### FL-004 — SDK `Transport` interface is not `exactOptionalPropertyTypes`-safe

- **Date:** 2026-09-14
- **Tool / SDK / API:** `@modelcontextprotocol/sdk` 1.30.0 (TypeScript)
- **Task attempted:** Build a Streamable HTTP MCP server in a project compiled with TypeScript `strict` plus `exactOptionalPropertyTypes: true`.
- **Steps taken:** Constructed a `StreamableHTTPServerTransport` and passed it to `McpServer.connect()`.
- **Expected result:** Type-checks — the SDK's own transport should satisfy the SDK's own `Transport` interface.
- **Actual result:** `TS2379: Argument of type 'StreamableHTTPServerTransport' is not assignable to parameter of type 'Transport' with 'exactOptionalPropertyTypes: true'. Types of property 'onclose' are incompatible. Type '(() => void) | undefined' is not assignable to type '() => void'.` `shared/transport.d.ts` declares `onclose?: () => void`, `onerror?: (error: Error) => void`, `onmessage?: ...` and `sessionId?: string`, while `server/streamableHttp.d.ts` implements them as accessors typed `... | undefined`. Under this flag an optional property may be absent but not explicitly `undefined`, so the two are incompatible.
- **Severity:** Major
- **Workaround used:** Set `exactOptionalPropertyTypes: false` in `tsconfig.json`, weakening type safety across the whole project to accommodate one dependency.
- **Actionable suggestion:** Declare the optional members of `Transport` as `onclose?: (() => void) | undefined` (and likewise `onerror`, `onmessage`, `sessionId`). That is source-compatible for every existing consumer and makes the SDK usable from projects on TypeScript's strictest settings. Adding `exactOptionalPropertyTypes: true` to the SDK's own tsconfig would keep it from regressing.

### FL-003 — MCP Toolkit onboarding requires an Alexa Solutions Architect; no self-serve path documented

- **Date:** 2026-09-14
- **Tool / SDK / API:** Alexa+ MCP Toolkit · Alexa AI CLI · AWS CodeArtifact
- **Task attempted:** Obtain the CodeArtifact credentials needed to install `@alexa-ai/cli`, as a hackathon participant with a new AWS account.
- **Steps taken:** Created a dedicated AWS account, created an IAM user with `AdministratorAccess`, confirmed identity with `aws sts get-caller-identity`, then ran the documented `aws sts assume-role` against `arn:aws:iam::372468808636:role/AddOn3PDeveloperToolsRead`.
- **Expected result:** Temporary credentials, or an error explaining how to request access.
- **Actual result:** `AccessDenied ... is not authorized to perform: sts:AssumeRole on resource: arn:aws:iam::372468808636:role/AddOn3PDeveloperToolsRead`. Confirmed `AdministratorAccess` is attached, so `sts:AssumeRole` is permitted locally — the refusal is the target role's trust policy. The setup docs say to "Log in to the AWS account that you provided to the Alexa Solutions Architect", which implies the account ID must be allowlisted by Amazon in advance.
- **Severity:** Blocker
- **Workaround used:** None available for the toolkit path. Proceeding with a self-hosted MCP server on the open spec, which the hackathon rules accept and which requires no Amazon onboarding.
- **Actionable suggestion:** Two gaps. First, the setup docs present the toolkit as self-serve but depend on a Solutions Architect relationship never mentioned until a passing reference mid-page — state the prerequisite in the first paragraph. Second, there is no documented way to request access; a developer outside an existing Amazon partnership hits `AccessDenied` with no next step. Publish a request path, and have the failure message point at it. For a hackathon with thousands of participants this is the difference between the flagship integration being usable and being invisible.

### FL-002 — `alexa-ai` on public npm is an unrelated third-party package

- **Date:** 2026-09-14
- **Tool / SDK / API:** Alexa AI CLI · npm
- **Task attempted:** Install the CLI the docs call the "Alexa AI CLI", whose binary is `alexa-ai`.
- **Steps taken:** Searched npm for the CLI by the name used throughout the prose and by the binary name: `npm view alexa-ai`.
- **Expected result:** Either Amazon's package, or nothing.
- **Actual result:** `alexa-ai@2.5.0` exists on the public registry and is an unrelated third-party WhatsApp chatbot ("AI engine for the Alexa WhatsApp bot"), published by a third-party maintainer, last published 2026-09-07. The real package is `@alexa-ai/cli` on a private CodeArtifact registry.
- **Severity:** Major
- **Workaround used:** Verified the scoped name `@alexa-ai/cli` against the setup docs before installing anything.
- **Actionable suggestion:** The docs refer to the tool as the "Alexa AI CLI" and its binary is `alexa-ai`, but the package is `@alexa-ai/cli`. A developer who searches npm by the name in the prose lands on someone else's package and may install it globally. Amazon should either publish a placeholder/pointer package at the unscoped `alexa-ai` name, or state explicitly in the setup docs that the unscoped name is not Amazon's and must not be installed.

---

### FL-001 — Documented install command 404s; CodeArtifact prerequisite not sequenced

- **Date:** 2026-09-14
- **Tool / SDK / API:** Alexa AI CLI · AWS CodeArtifact
- **Task attempted:** Install the CLI, following "Set Up Your Development Environment".
- **Steps taken:** Ran the install command exactly as documented: `npm install -g @alexa-ai/cli`.
- **Expected result:** CLI installs, `alexa-ai --version` works.
- **Actual result:** `npm error code E404 / 404 Not Found - GET https://registry.npmjs.org/@alexa-ai%2fcli`. The package is not on the public registry — it lives in a private CodeArtifact domain (`alexa-ai` / `npm-packages`, owner `372468808636`, `us-west-2`) that requires an AWS profile assuming `arn:aws:iam::372468808636:role/AddOn3PDeveloperToolsRead`, plus a 12-hour auth token from `aws codeartifact login`.
- **Severity:** Blocker
- **Workaround used:** None yet — the role assumption is an access gate, not a config step.
- **Actionable suggestion:** Present the install as an ordered sequence, with the CodeArtifact login as step 1 and `npm install` as step 2, and state the required AWS role and how a new developer obtains access to it *before* showing a bare `npm install` line. As written, the first command a developer runs fails, and the error gives no hint that a private registry is involved.

