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
| 2 | Concept | Household language bridge | Maxes Impact and Quality-of-Idea together. Revisit only if the `en-US` locale lock blocks non-English input at the Alexa layer. |
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

Still open in this milestone: Bedrock model access, credits form. Install `alexa-ai`, `configure`, `new mcp`, deploy a
two-tool hello-world, confirm it answers in the web simulator. Confirm how a
non-English utterance reaches the server. `FRICTION.md` opens on line one.

### 2. Core MCP server — DONE 14 Sep
Streamable HTTP on `@modelcontextprotocol/sdk` 1.30.0, which ships
`LATEST_PROTOCOL_VERSION = '2025-11-25'`. Five tools, file-backed household state,
pluggable language provider. 11 tests green, including an end-to-end client/server
round trip asserting state survives a session teardown.

### 3. OAuth 2.1 + PKCE (21 Sep – 4 Oct)
`src/auth/`. Well-known metadata, 401 path, `resource` on authorize and token.
Fiddliest part of the build — isolate so it cannot block milestone 4.

### 4. Cross-session state — DONE 14 Sep
Per-household members, languages and message history, persisted and proven across
sessions by test. Swap the file store for DynamoDB behind `HouseholdStore` if the
demo needs it; nothing above that interface changes.

### 5. MCP Apps visual layer (5–14 Oct)
`src/apps/`. The bilingual card. Highest score-per-hour available — judges named
MCP Apps and media support explicitly as the creative case.

### 6. Deploy + latency pass (5–14 Oct)
Onto AWS, then get under 500 ms. Cache aggressively; a cold model call will blow
the budget on its own.

### 7. Upstream PR (5–14 Oct)
Target picked from `FRICTION.md`. Does not need to be merged.

### 8. Submission artifacts (15–20 Oct)
Demo video (<3 min, shot in the simulator or on a device), README setup and run
instructions, `PRODUCT-FEEDBACK.md`, `FRICTION.md` tidied. The video gets its own
two days — it carries Design and Impact almost by itself.

### 9. Submit
- **21 Oct** — AWS promotional credits form closes (request regardless).
- **22 Oct** — submit. Do not touch the 23 Oct noon deadline.

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| ~~Add-on certification gates simulator access~~ | ~~Schedule-breaking~~ | **Materialised 14 Sep** (FL-003) and routed around: self-hosted MCP server + simulated Alexa+ demo, no Amazon gate |
| ~~`en-US` locale lock blocks non-English input~~ | ~~Kills decision 2~~ | Moot — the simulated path owns its own speech input, so locale is ours to choose |
| <500 ms vs an LLM round-trip | Forces a week-4 redesign | Cache, small fast model, stream early |
| MCP Apps docs sparse or extension immature | Loses the visual differentiator | Fall back to plain cards — still beats tools-only |
| Sole maintainer, fixed date | Everything | Milestones 2–4 are parallel-safe; cut 7 before 5 |
| Bedrock model access not granted on a new account | Blocks the language layer | Request the same day the account opens, not in week three |
| Promo credits run out before request | Out-of-pocket spend | "While supplies last" — submit the form the day the account ID exists |

## Tests

11 green: store persistence and isolation, render caching, and an end-to-end MCP
client/server round trip over Streamable HTTP. The OAuth flow still needs coverage —
it is pass/fail for Stage 1 eligibility. Skip broad coverage beyond that; this ships
in five weeks.

## Open questions

Both original questions are answered: toolkit access is refused (FL-003), and the
locale question is moot on the self-hosted path.

Remaining: whether toolkit access can still be requested through the hackathon's
support channels. Worth asking in parallel — if granted, the demo gains real-device
footage. Nothing depends on it.
