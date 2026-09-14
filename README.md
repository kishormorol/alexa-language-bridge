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

> To be completed. Judges must be able to clone, configure, and run from these
> instructions alone.

```bash
git clone https://github.com/kishormorol/alexa-language-bridge.git
cd alexa-language-bridge
npm install
cp .env.example .env    # fill in credentials
npm run dev
```

## Running the add-on

```bash
alexa-ai configure      # one-time
alexa-ai deploy         # deploy to the development stage
```

Then test in the Alexa+ web simulator.

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
