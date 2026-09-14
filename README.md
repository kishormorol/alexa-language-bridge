# Alexa Language Bridge

An Alexa+ MCP add-on that gives a household member who does not speak English the
run of the house.

Not a translator. Ma adds rice to the shopping list in Bangla and her son reads it
in English. She ticks off the milk he added. She sets him a reminder, turns off the
kitchen light, leaves him a message that arrives in his language when he next asks.
The device stops being an English appliance the family operates on her behalf and
becomes one she uses herself.

Nothing in the house is stored in English and translated for her. Everything is
stored as spoken, and rendered for whoever is asking.

Script is part of who a person is, not something to guess per message. Plenty of
people speak Bangla or Hindi and read it in Latin letters — `bati`, not `বাতি`. Get
that wrong and the reply is one they cannot read, or match against what they said.

> Status: early development. Built for the Build, Ship, Shape: Amazon Developer
> Hackathon (Alexa+ track), submission window 31 Aug – 23 Oct 2026.

## How it works

| Piece | What it does |
| --- | --- |
| MCP server | Streamable HTTP, MCP spec `2025-11-25` |
| Auth | OAuth 2.1 authorization code + PKCE (S256) |
| Language layer | Renders any stored utterance into the asker's language, cached |
| State | Members, languages, lists, reminders, devices and messages, across sessions |
| Surface | MCP App card showing both languages side by side |

## Setup

Requires Node 24 or newer. No cloud account is needed to run or test this — the
default language provider runs offline.

```bash
git clone https://github.com/kishormorol/alexa-language-bridge.git
cd alexa-language-bridge
npm install
cp .env.example .env
npm run dev
```

The MCP endpoint is then at `http://127.0.0.1:3000/mcp`, with a liveness probe at
`/healthz`.

```bash
npm test         # unit tests plus an end-to-end MCP client/server round trip
npm run build    # compile to dist/
npm start        # run the compiled server
```

## The simulator

The hackathon rules accept a simulated Alexa+ experience, and the real MCP Toolkit
is gated behind Amazon onboarding this project does not have (FL-003). So the demo
surface is our own host:

```bash
npm run sim     # then open http://localhost:4000
```

One command boots the MCP server with OAuth enforced, walks the full authorization
code + PKCE flow as a real client would, connects over Streamable HTTP, and serves a
screen. Pick who is speaking, say something, watch the tool call and the card.

It is a genuine MCP host — it authenticates properly, reads `tools/list`, honours the
`_meta.ui.resourceUri` a tool declares, and fetches the `ui://` resource to render.
Nothing is stubbed between the UI and the server.

Intent routing stands in for what Alexa+ would do. `ROUTER=rules` is deterministic
and offline; a Bedrock-backed router replaces it once model access lands.

## Authentication

OAuth 2.1 authorization code with PKCE (S256), enforced by default.

| | |
| --- | --- |
| Unauthenticated `POST /mcp` | `401` with a `WWW-Authenticate` challenge naming the resource metadata |
| Authorization server metadata | `/.well-known/oauth-authorization-server` |
| Protected resource metadata | `/.well-known/oauth-protected-resource/mcp` |
| Client registration | Dynamic (RFC 7591) at `/register` |
| Resource indicators | RFC 8707 — `resource` required on authorize and token, and tokens are bound to it |

Authorization codes are single-use and expire in 60 seconds; access tokens last an
hour and carry the resource they were issued for. There is no consent screen —
`authorize` approves immediately, which is the one piece a real deployment would
replace.

Set `AUTH_ENABLED=false` for local iteration only.

## Tools

**People**

| Tool | What it does |
| --- | --- |
| `register_household_member` | Record a person, the language they speak, and the script they write it in |
| `list_household_members` | Who is in the household, and in what language |

**Getting things done**

| Tool | What it does |
| --- | --- |
| `add_to_list` | Add to a shared list, in your own words |
| `read_list` | Read the list back in the asker's language |
| `complete_list_item` | Tick off an item, matched in any language it is held in |
| `set_reminder` | Set a reminder for yourself or someone else |
| `get_reminders` | What is waiting, in your own language |
| `register_device` | Name something controllable, in your own words |
| `set_device_state` | Turn it on or off, by whatever you call it |

**Talking to each other**

| Tool | What it does |
| --- | --- |
| `leave_message` | Store a spoken message, delivered in the recipient's language |
| `get_messages` | Read back waiting messages in the reader's own language |
| `interpret_for_household` | Carry a live utterance from one person's language to another's |

## The card

`interpret_for_household` and `read_list` carry an MCP Apps UI: a `ui://` resource
served as `text/html;profile=mcp-app`, showing what was said and what the other
person hears side by side, never one translated into the other.

The official `@modelcontextprotocol/ext-apps` package targets the v2 SDK line and
zod 4, which is incompatible with the 1.x line where the Streamable HTTP transport
lives — so the contract is implemented directly. See FL-005.

## Language provider

Two implementations behind one interface:

| `LANGUAGE_PROVIDER` | Behaviour |
| --- | --- |
| `echo` (default) | Offline. Does not translate — prefixes text with the target tag, so a wrong-language rendering is obvious rather than silently plausible. |
| `bedrock` | Claude on Amazon Bedrock via the Mantle client. Frozen, cached system prompt and `effort: low`, both for the 500 ms round-trip budget. |

Switching is one environment variable; nothing outside `src/lang/` changes.

```bash
LANGUAGE_PROVIDER=bedrock AWS_PROFILE=alexa-hackathon npm run sim
```

A content-addressed cache sits in front of whichever provider is active. A household
repeats itself — the same groceries, the same reminders — so most turns never reach
the model. Identical concurrent misses share one in-flight call, and a cache hit does
no disk write, because that is the hot path of a 500 ms budget.

```bash
npm run bench    # cold vs warm round-trip latency against the 500 ms budget
```

Server overhead measured at 1–3 ms per tool round trip, so effectively the whole
budget is available to the model. Deployment notes: [docs/deployment.md](docs/deployment.md).

## Repository layout

```
src/          MCP server, tools, auth, MCP App UI
docs/         design notes and decisions
PLAN.md       build plan and milestones
FRICTION.md   running friction log
PRODUCT-FEEDBACK.md   submission feedback answers
```

## License

MIT — see [LICENSE](LICENSE).
