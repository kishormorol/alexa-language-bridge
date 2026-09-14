# Devpost submission text

Paste-ready. Track: **Alexa+**. Mini-challenges: **Open Source** and **AWS Builder**.

---

## Inspiration

There are households where a smart speaker sits in the kitchen for years and one
person in the family has never used it. Not because they can't hear it or don't
understand what it does — because it only listens in English.

Everyone else in that house talks to it a dozen times a day. They ask someone else
to do it for them.

That person is usually a grandparent, a parent who moved in, an in-law. They are not
an edge case. They are millions of people who live with a device that treats them as
someone to be translated *for* rather than someone who can use it.

## What it does

Alexa Language Bridge is a self-hosted MCP server that gives every member of a
household the run of the house in the language they speak.

It is not a translator bolted onto a speaker. Ma adds rice to the shopping list in
Bangla and her son reads it in English. She ticks off the milk *he* added. She turns
off the lamp he registered as "lamp" by calling it "bati". She leaves him a message
that arrives in English whenever he next asks.

The design rule underneath: **nothing in the house is stored in English and
translated for her.** Everything is stored exactly as it was said, and rendered for
whoever is asking. There is no primary language and no second-class user.

Script is part of it too. Plenty of people speak Bangla or Hindi and read it in
Latin letters — "bati", not "বাতি". So script is a property of the person, not
something guessed per message. Get it wrong and the reply is one they cannot read,
or match against what they just said.

## How I built it

A **self-hosted MCP server** on spec `2025-11-25` over **Streamable HTTP**, built on
`@modelcontextprotocol/sdk`, behind **OAuth 2.1** with PKCE (S256) and RFC 8707
resource indicators, so tokens are bound to this server as their audience.

Twelve tools across three groups — people, getting things done (lists, reminders,
device control), and talking to each other (messages, live interpretation). Household
members, their languages, their scripts and every item persist across sessions.

Two tools carry an **MCP App**: a `ui://` resource served as
`text/html;profile=mcp-app`, showing what was said beside what the other person
hears — never one translated into the other.

The language layer is **Claude Haiku 4.5 on Amazon Bedrock**, behind a provider
interface with a content-addressed cache in front of it.

The Alexa+ MCP Toolkit turned out to be gated behind Amazon Solutions Architect
onboarding not available to an independent developer, so the demo runs on a
**simulated Alexa+ experience**, which the rules permit. It is a real MCP host: it
completes the full OAuth flow, connects over Streamable HTTP, reads `tools/list`,
honours `_meta.ui.resourceUri`, and fetches the `ui://` resource to render. Nothing
between the screen and the server is stubbed.

## Challenges

**The flagship integration was closed.** Role assumption into Amazon's CodeArtifact
account is refused with a bare `AccessDenied`, and the docs mention a Solutions
Architect relationship only in passing. Discovering that on day one, rather than in
October, is why the project is built on the open spec and never depended on it.

**MCP Apps and Streamable HTTP cannot both come from one supported package.** The
`ext-apps` package targets the v2 SDK line and zod 4; Streamable HTTP lives on 1.x.
I implemented the Apps contract directly — the official helpers turn out to wrap
`registerTool` and `registerResource`.

**Putting a real model behind the interface broke things a fake one had hidden.**
"chal" came back as "come on" instead of "rice"; renderings arrived in Bangla script
for a reader who types romanised; a message typed in English but labelled Bangla got
translated backwards. Each needed a design change, not a prompt tweak: tools now say
what kind of thing they are translating, script moved into the data model, and the
model is told the source label is a guess.

**A literal `</script>` inside an inline script killed the demo page** while every
test stayed green — because nothing exercised the page in a browser.

## Accomplishments

Every Stage 1 requirement is met and tested rather than asserted: spec version,
transport, OAuth flow, and the MCP stack actually called at runtime. 76 tests,
including OAuth failure paths — wrong verifier, wrong resource, replayed code, bogus
token — and an end-to-end client/server round trip proving state survives a session.

The upstream contribution is real: a backport of an accepted type fix to the MCP
TypeScript SDK's `v1.x` line, closing an open issue, with all CI green.

## What I learned

Build the fake implementation *and then insist on the real one*. Every serious bug in
this project was invisible until a real model and a real browser were involved. A
green test suite told me nothing about either.

## What's next

Cross-language voice in the household is the start; the harder problem is the one
underneath it — a device that knows who is in the room and what each of them can
understand. Persisted per-person language identity is the first step toward that.

---

## Product feedback

See `PRODUCT-FEEDBACK.md` — per-tool answers with five friction log entries behind
them.

## Try it

```bash
git clone https://github.com/kishormorol/alexa-language-bridge.git
cd alexa-language-bridge && npm install
npm test          # 76 tests, no cloud account needed
npm run sim       # open http://localhost:4000
```

Runs offline on the default provider. Set `LANGUAGE_PROVIDER=bedrock` for real
translation.

## Built with

`typescript` · `node` · `model-context-protocol` · `streamable-http` · `oauth2` ·
`mcp-apps` · `amazon-bedrock` · `claude` · `express` · `vitest` · `docker`
