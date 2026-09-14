# Product Feedback

Written while building **Alexa Language Bridge** for the Alexa+ track. Every claim
below is traceable to a dated entry in [FRICTION.md](FRICTION.md).

---

## Alexa AI CLI (`@alexa-ai/cli`)

- **What I used it for:** intended to scaffold, deploy and certify an Alexa+ MCP
  add-on. Never got it installed.
- **What worked well:** the documented command surface reads well — `configure`,
  `new mcp`, `deploy`, `submit` is the right shape, and naming an AI coding agent as
  the primary onboarding path is genuinely forward-looking.
- **What needs work:**
  - The documented install, `npm install -g @alexa-ai/cli`, fails with `E404` for
    anyone outside Amazon's allowlist. The package is served from a private
    CodeArtifact domain (`alexa-ai` / `npm-packages`, owner `372468808636`,
    `us-west-2`) reachable only by assuming
    `arn:aws:iam::372468808636:role/AddOn3PDeveloperToolsRead`. That prerequisite
    is not sequenced before the install command. **(FL-001)**
  - The role refuses assumption from a new AWS account with `AdministratorAccess`.
    The setup page's only hint is a passing line — *"Log in to the AWS account that
    you provided to the Alexa Solutions Architect"* — which implies an onboarding
    relationship most hackathon entrants do not have. There is no documented way to
    request access, and the failure is a bare `AccessDenied`. **(FL-003)**
  - The tool is called the "Alexa AI CLI" throughout the prose and its binary is
    `alexa-ai`, but the package is `@alexa-ai/cli`. The unscoped name `alexa-ai` on
    public npm belongs to an unrelated third-party WhatsApp chatbot. A developer
    searching npm by the name in the docs can install a stranger's package
    globally. **(FL-002)**
- **Onboarding (zero to hello world):** never reached hello world. Roughly two hours
  from starting the documented steps to establishing that the path was closed.
- **Would you build with this again?** **Yes, if access becomes self-serve.** The
  design is right; the gate is the problem. As it stands the flagship Alexa+
  integration is unreachable for an independent developer, which for a hackathon
  with 6,000+ participants is the difference between the feature being adopted and
  being invisible.

---

## Alexa+ MCP Toolkit

- **What I used it for:** the intended deployment target. Not reachable — see above.
- **What worked well:** choosing MCP rather than a proprietary skill format is the
  single best decision in this stack. It meant the work was not wasted: the same
  server that would have been an add-on runs today against any MCP host.
- **What needs work:** the docs present the toolkit as self-serve until a passing
  reference to a Solutions Architect reveals it is not. State the prerequisite in the
  first paragraph, and publish a request path.
- **Onboarding:** blocked at account allowlisting.
- **Would you build with this again?** **Yes.** The `2025-11-25` + Streamable HTTP +
  OAuth 2.1 choice is exactly right, and building against the open spec meant the
  gate cost me the deployment but not the project.

---

## MCP TypeScript SDK (`@modelcontextprotocol/sdk` 1.30.0)

- **What I used it for:** the whole server — Streamable HTTP transport, tool and
  resource registration, and the entire OAuth 2.1 surface (`mcpAuthRouter`,
  `requireBearerAuth`, `OAuthServerProvider`).
- **What worked well:** this is the strongest piece of the stack. `LATEST_PROTOCOL_VERSION`
  is already `2025-11-25`. The OAuth helpers are the standout — dynamic client
  registration, both metadata documents, PKCE verification and resource indicators
  are handled, leaving only genuine product decisions to implement. Getting a
  spec-correct OAuth 2.1 resource server took hours, not days.
- **What needs work:**
  - The `Transport` interface declares `onclose?: () => void` while the concrete
    transports implement it as `(() => void) | undefined`, so under
    `exactOptionalPropertyTypes: true` the SDK's own transport is not assignable to
    the SDK's own interface (TS2379). Every consumer on TypeScript's strictest
    settings must cast or weaken their config. Already fixed on `main` by #1766 and
    never backported — 1.30.0 still ships it. **(FL-004)** I filed the backport:
    [typescript-sdk#2814](https://github.com/modelcontextprotocol/typescript-sdk/pull/2814).
  - One real trap: `verifyAccessToken` throwing `InvalidGrantError` for an unknown
    token produces a `400`, when RFC 6750 requires `401` with a `WWW-Authenticate`
    challenge. `InvalidTokenError` is correct. The naming makes the wrong choice
    the natural one, and the symptom — a client that cannot tell it should
    re-authenticate — is invisible until something tests with a stale token.
    A note in the provider docs would prevent it.
- **Onboarding:** hello-world MCP server answering over Streamable HTTP inside an
  hour, including tests.
- **Would you build with this again?** **Yes, without hesitation.**

---

## MCP Apps (`@modelcontextprotocol/ext-apps` 2.0.0)

- **What I used it for:** the on-screen card showing what was said beside what the
  other person hears. Implemented the contract directly; could not use the package.
- **What worked well:** the contract itself is clean and easy to conform to by hand —
  a `ui://` resource served as `text/html;profile=mcp-app`, plus
  `_meta.ui.resourceUri` on the tool. Emitting both the modern and legacy metadata
  keys is well documented.
- **What needs work:** the package peers on `zod@^4.2.0` and on
  `@modelcontextprotocol/{core,client,server}@^2.0.0` — the v2 package line — while
  Streamable HTTP lives on `sdk@1.x`. **So the two capabilities Alexa+ asks for,
  Streamable HTTP and MCP Apps, cannot both come from one supported package.** The
  first signal is an `ERESOLVE` error about zod; nothing on the landing page says
  which SDK line it targets. **(FL-005)**
- **Onboarding:** failed as documented; ~40 minutes to establish why, then
  implemented the contract by hand from the spec.
- **Would you build with this again?** **Yes** — the idea is the most compelling part
  of the Alexa+ story, and worth the workaround.

---

## AWS

- **What I used it for:** IAM and STS for the CodeArtifact gate; Amazon Bedrock as
  the language layer behind the `LanguageProvider` interface.
- **What worked well:** account setup, IAM and the CLI were unremarkable in the best
  sense. The Anthropic Bedrock **Mantle** client is a much better developer
  experience than the legacy `InvokeModel` path — same `messages.create` surface as
  the first-party SDK, so the provider is a thin adapter.
- **What needs work:** new accounts have no Bedrock models enabled and approval is
  not instant. Nothing in the hackathon onboarding flags this, and it sits on the
  critical path for any entrant whose project uses a model. A line in the getting-
  started materials saying "request model access on day one" would save people a
  week.
- **Onboarding:** account to authenticated CLI in under an hour. Bedrock model
  access still pending at the time of writing.
- **Would you build with this again?** **Yes.**

---

## Alexa+ web simulator

Never reachable — it requires a deployed add-on, which requires the CLI (FL-003).
No feedback to give, which is itself the feedback: the testing surface is behind the
same gate as everything else.

---

## Feature requests

| Request | Why it matters to this project | Priority |
| --- | --- | --- |
| A self-serve path to the MCP Toolkit, or a documented way to request it | Without it the flagship Alexa+ integration is unreachable to independent developers. This alone decided the project's architecture. | **Critical** |
| An MCP Apps release compatible with the SDK line that carries Streamable HTTP | Alexa+ asks for both and no single supported package provides both. | **Critical** |
| Make `AccessDenied` on `AddOn3PDeveloperToolsRead` point at a request page | The current failure is a dead end with no next step. | **Important** |
| Publish a pointer package at the unscoped npm name `alexa-ai` | Closes a path where a developer following your docs installs a third party's code globally. | **Important** |
| Say "request Bedrock model access on day one" in hackathon onboarding | It is the longest-lead item for any entrant using a model, and it is invisible until you hit it. | **Important** |
| A locale story for households that are not monolingual | Alexa+ is `en-US`-locked. The people this project serves live in homes where that is not the only language spoken. | Nice-to-have |
