# Build Plan

**Goal:** ship an Alexa+ MCP add-on that scores top-of-field on all four
equally-weighted judging criteria, not just Tech Implementation.

**Deadline:** Fri 23 Oct 2026, 12:00 PDT. Submit 22 Oct.

**Done when:** add-on deployed and demonstrated in the Alexa+ web simulator; public
repo with a detectable OSS license and the MCP stack actually called at runtime;
demo video under 3 minutes; friction log and product feedback written; entered into
the Alexa+ track plus the Open Source and AWS Builder mini-challenges.

## Scoring model

Four criteria, equal weight: Tech Implementation, Design, Potential Impact, Quality
of the Idea. Most of the field will max the first and hand in a thin video — which
leaves three-quarters of the score resting on a 3-minute film and a README. Plus up
to a 10% friction-log bonus applied to the final score.

Budget: roughly 60% build, 25% submission artifacts, 15% friction log and feedback.

## Decisions

| # | Decision | Pick | Tradeoff |
| --- | --- | --- | --- |
| 1 | Language | TypeScript | MCP Apps UIs are web, so one language covers server + UI; the TS SDK tracks `2025-11-25` most closely. ML comfort is Python, but the language work happens in Bedrock over HTTP. |
| 2 | Concept | Household **agency**, not translation | Sharpened 14 Sep. "Translation" invites the fatal judge question — *Alexa+ is already an LLM, why isn't this a system prompt?* Agency answers it: a prompt cannot hold per-person language identity across sessions, route an async message to another member, or let someone operate lists, reminders and devices the household registered in a language they do not read. |
| 3a | Integration path | **Self-hosted MCP server**, not the Alexa+ MCP Toolkit | Toolkit access is gated behind Amazon SA onboarding (FL-003) and was never required: the rules accept "a working Agent Skill or a self-hosted MCP server" on the open spec. Removes the only hard external dependency. |
| 3 | Hosting | AWS (Lambda Function URL or App Runner) + Bedrock, on a **dedicated account** | Buys the <500ms budget, a stable HTTPS URL for judges, and the AWS Builder entry in one move. Dedicated account because credits attach to one account ID and spend stays isolated. `cloudflared` for local iteration only. See [docs/aws-setup.md](docs/aws-setup.md). |
| 4 | Open-source PR | Chosen from the friction log in weeks 2–3 | Authentic beats manufactured; the rubric rewards a real integration pattern over a new empty repo. |

## Hard constraints

- MCP spec `2025-11-25` over Streamable HTTP. No stdio, no SSE.
- OAuth 2.1 authorization code + PKCE (S256). Server returns `401` unauthenticated,
  hosts `/.well-known/oauth-authorization-server`, and requires the `resource`
  parameter on both authorize and token requests.
- Round-trip latency under 500 ms.
- Repo public, OSS license detectable in the GitHub About panel.
- The MCP stack must be imported and called at runtime — named in the README is a
  Stage 1 fail.
- Alexa+ MCP Toolkit is US-only.

## Milestones

### 1. De-risk (14–20 Sep) — RESOLVED 14 Sep
Dedicated AWS account created and profiles configured. MCP Toolkit access tested and
**refused** — see FL-003. Consequence: build a self-hosted MCP server on the open
spec and demonstrate it through a simulated Alexa+ experience, both of which the
rules accept. No Amazon onboarding on the critical path.

Still open in this milestone: nothing — Bedrock model access granted 14 Sep, and the
$150 promotional credits were approved and redeemed the same day. Install
`alexa-ai`, `configure`, `new mcp`, deploy a two-tool hello-world, confirm it answers
in the web simulator. Confirm how a non-English utterance reaches the server. `FRICTION.md` opens on line one.

### 2. Core MCP server — DONE 14 Sep
Streamable HTTP on `@modelcontextprotocol/sdk` 1.30.0, which ships
`LATEST_PROTOCOL_VERSION = '2025-11-25'`. Five tools, file-backed household state,
pluggable language provider. 11 tests green, including an end-to-end client/server
round trip asserting state survives a session teardown.

### 3. OAuth 2.1 + PKCE — DONE 14 Sep
`src/auth/`. Authorization code + PKCE (S256), dynamic client registration, both
metadata documents, RFC 8707 resource indicators with audience-bound tokens,
single-use 60-second codes. Eight conformance tests, one of which caught a real
spec violation: an invalid bearer token was returning 400 instead of the 401 that
RFC 6750 requires, leaving a client no way to know it should re-authenticate.

With this, every Stage 1 eligibility item is met.

### 4. Cross-session state — DONE 14 Sep
Per-household members, languages and message history, persisted and proven across
sessions by test. Swap the file store for DynamoDB behind `HouseholdStore` if the
demo needs it; nothing above that interface changes.

### 5. MCP Apps visual layer — DONE 14 Sep
`src/apps/`. The household card ships as a `ui://` resource with the MCP Apps MIME
type, referenced from `interpret_for_household` and `read_list` in both the modern
and legacy metadata formats, with structured content for the view to render. The
official package could not be used (FL-005), so the contract is implemented
directly. Four conformance tests cover it.

### 6. Bedrock + deploy + latency pass — provider written 14 Sep
`src/lang/bedrock.ts` is written and unit-tested against an injected client: Claude
on Bedrock through the Mantle client, frozen cached system prompt, `effort: low`.
It activates with `LANGUAGE_PROVIDER=bedrock` and nothing else changes.

A content-addressed translation cache (`src/lang/cache.ts`) fronts any provider,
with shared in-flight calls and no disk write on a hit. `npm run bench` measures
cold vs warm against the budget; server overhead is **1–3 ms**, so the whole budget
belongs to the model.

Deployment settled on a container, not Lambda: Streamable HTTP holds per-session
state and an SSE stream, and the OAuth server holds tokens in memory. `Dockerfile`
builds and runs green with OAuth enforced. See `docs/deployment.md`.

**Bedrock is live as of 14 Sep.** Account verified, Anthropic use-case form submitted
via `put-use-case-for-model-access`, and `anthropic.claude-haiku-4-5-20251001-v1:0`
reachable through the `bedrock-runtime` endpoint. Opus 5 and Sonnet 4.5 report
`NOT_AVAILABLE` on this account; Mantle returns 403 — it needs its own entitlement.

**Measured latency** (`npm run bench`, real Bedrock):

| | p50 | p95 |
| --- | --- | --- |
| Cold (model call) | 635 ms | 987 ms |
| Warm (cache hit) | 1 ms | 4 ms |
| Local (no model) | 1 ms | 2 ms |

Cold is over the 500 ms budget; warm is nowhere near it.

Pre-warming (`src/lang/prewarm.ts`, `PREWARM=true`) translates ~20 common household
phrases in both directions at startup — 80 cache entries, ~23 s in the background,
without blocking the server. It has to warm the round trip: the phrase list is in
English, and warming only English-to-Bangla would help the English speaker and
nobody else.

**What that does and does not fix, honestly.** A phrase the household has said
before is ~5 ms. A phrase nobody has said before still costs ~650 ms, and no amount
of warming changes that — the list cannot contain every sentence. So the 500 ms
budget is met for repeats and missed for novel utterances. Since a kitchen repeats
itself constantly, that is the right trade, but the submission should say it plainly
rather than quote the warm number alone.

Bedrock on a new account rate-limits: 40 rapid calls returned `429 Too many
requests` even though 8 concurrent succeed. The limit is per minute, not
concurrency. Warming now runs two at a time with backoff, in the background.

**Three real bugs surfaced only once a real model was behind the interface** — none
were visible with the echo provider:
1. `chal` translated as "come on" rather than "rice". Fixed by passing what kind of
   thing is being translated (list item, device name, message).
2. Renderings came back in Bangla script for a reader who types romanised. Fixed by
   making script a property of the member, not a guess per message.
3. A message Ma typed in English, stored under her `bn-BD` label, was translated
   *into* Bangla for an English reader. Fixed by telling the model the source label
   is a guess and to trust the text.

### 7. Upstream PR — DONE 14 Sep
`modelcontextprotocol/typescript-sdk`, backporting the accepted `Transport` type
fix to `v1.x`. Fork pushed, 1647 upstream tests green, verified against this
project. See `docs/open-source-contribution.md`.
PR: https://github.com/modelcontextprotocol/typescript-sdk/pull/2814

### 5b. Simulated Alexa+ host — DONE 14 Sep
`src/sim/`. `npm run sim` boots the MCP server with OAuth enforced, completes the
authorization code + PKCE flow headlessly, connects over Streamable HTTP, and serves
a screen that renders the MCP App card. Rule-based intent routing behind a `Router`
interface, swapping to Bedrock later. This is the surface the demo video is shot on.

### 8. Submission artifacts (15–20 Oct)
Demo video (<3 min, shot in the simulator or on a device), README setup and run
instructions, `PRODUCT-FEEDBACK.md`, `FRICTION.md` tidied. The video gets its own
two days — it carries Design and Impact almost by itself.

### 9. Submit
- ~~**21 Oct** — AWS promotional credits form closes (request regardless).~~ Requested
  and **approved 14 Sep**: $150, redeemed the same day, valid through 31 Aug 2028.
  The code lives outside this repo.
- **22 Oct** — submit. Do not touch the 23 Oct noon deadline.

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| ~~Add-on certification gates simulator access~~ | ~~Schedule-breaking~~ | **Materialised 14 Sep** (FL-003) and routed around: self-hosted MCP server + simulated Alexa+ demo, no Amazon gate |
| ~~`en-US` locale lock blocks non-English input~~ | ~~Kills decision 2~~ | Moot — the simulated path owns its own speech input, so locale is ours to choose |
| <500 ms vs an LLM round-trip | Forces a week-4 redesign | Cache, small fast model, stream early |
| ~~MCP Apps docs sparse or extension immature~~ | ~~Loses the visual differentiator~~ | **Materialised 14 Sep** (FL-005): the package is v2-only. Contract implemented directly against 1.x instead |
| Sole maintainer, fixed date | Everything | Milestones 2–4 are parallel-safe; cut 7 before 5 |
| Bedrock model access not granted on a new account | Blocks the language layer | Request the same day the account opens, not in week three |
| ~~Promo credits run out before request~~ | ~~Out-of-pocket spend~~ | **Did not materialise** — requested on day one, $150 approved 14 Sep |

## Tests

76 green: store persistence and isolation, render caching, an end-to-end MCP
client/server round trip over Streamable HTTP, and the cross-language household
scenarios — Ma ticking off an item her son added in English, a reminder crossing
languages, a device matched by whatever she calls it, and an ambiguous name asking
rather than guessing. The OAuth flow is covered end to end, including the failure
paths that matter: wrong verifier, wrong resource, replayed code, bogus token.
Skip broad coverage beyond that.

## Open questions

Both original questions are answered: toolkit access is refused (FL-003), and the
locale question is moot on the self-hosted path.

Remaining: whether toolkit access can still be requested through the hackathon's
support channels. Worth asking in parallel — if granted, the demo gains real-device
footage. Nothing depends on it.
