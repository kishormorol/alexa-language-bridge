# Alexa Language Bridge

An Alexa+ MCP add-on that lets a household member who does not speak English use
an Alexa+ device in their own language, while the rest of the room follows along.

Speech in a non-English language is understood, the real task is carried out, and
the result is rendered bilingually as an MCP App card on the device screen.

> Status: early development. Built for the Build, Ship, Shape: Amazon Developer
> Hackathon (Alexa+ track), submission window 31 Aug – 23 Oct 2026.

## How it works

| Piece | What it does |
| --- | --- |
| MCP server | Streamable HTTP, MCP spec `2025-11-25` |
| Auth | OAuth 2.1 authorization code + PKCE (S256) |
| Language layer | Translation and intent grounding |
| State | Per-household language preference, carried across sessions |
| Surface | MCP App card rendering both languages side by side |

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

## Tools

| Tool | What it does |
| --- | --- |
| `register_household_member` | Record a person and the language they speak |
| `list_household_members` | Who is in the household, and in what language |
| `leave_message` | Store a spoken message, delivered in the recipient's language |
| `get_messages` | Read back waiting messages in the reader's own language |
| `interpret_for_household` | Carry a live utterance from one person's language to another's |

## Language provider

`LANGUAGE_PROVIDER=echo` is the default. It does not translate — it prefixes text
with the target tag so a wrong-language rendering is obvious in tests and demos
rather than silently plausible. The Bedrock provider replaces it once model access
is granted; nothing outside `src/lang/` changes.

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
