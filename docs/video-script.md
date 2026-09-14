# Demo video

**Hard limit: 3:00.** Judges are not required to watch past it. Target **2:40** so
nothing important lands in the part nobody sees.

**Must show:** the project functioning. Under the simulated Alexa+ path that means
the simulator, captured live — not slides, not a screen-recording of the README.

**Structure follows the rubric.** Impact and Quality of Idea are established in the
first 25 seconds, because that is how far a judge scrolling a gallery gets. Tech
Implementation comes after they already care.

---

## 0:00 – 0:22 · The problem

> *Screen: the simulator, idle. No narration over the first beat — let the empty
> screen sit for a second.*

**VO:** "My grandmother has lived in the same house as a smart speaker for two years.
She has never once used it. Not because she can't hear it, or doesn't understand what
it does — because it only listens in English."

> *Beat.*

**VO:** "Everyone else in that house talks to it a dozen times a day. She asks them to
do it for her."

**On screen (lower third):** `Alexa Language Bridge — Alexa+ track`

---

## 0:22 – 1:35 · The demo

> *No cuts inside this section if you can manage it. One continuous take is worth
> more than four polished ones — it reads as real.*

**Beat 1 — she does something herself (0:22)**
Speaker set to **Ma**. Type `chal add koro`.

**VO:** "She adds rice to the shopping list. In Bangla. Nobody translated for her."

**Beat 2 — it arrives in his language (0:38)**
Switch to **Rafi**. Type `what's on the list`.
*The card renders. Hold on it for two full seconds — this is the money shot.*

**VO:** "Her son opens the same list and reads it in English. It's not two lists. It's
one house."

**Beat 3 — it goes both ways (0:52)**
As **Rafi**, `add milk to the list`. Switch to **Ma**, `milk hoye geche`.

**VO:** "She ticks off the milk he added — in a language she doesn't read."

**Beat 4 — she runs the house (1:08)**
As **Ma**, `bati nibhiye dao`.

**VO:** "And the lamp her son named 'lamp' when he set it up — she turns it off by
calling it what she calls it."

**Beat 5 — they talk to each other (1:20)**
As **Ma**, `tell Rafi that dinner is ready`. Switch to **Rafi**, `my messages`.

**VO:** "She leaves him a message. He gets it in English, whenever he next asks."

---

## 1:35 – 2:15 · How it works

> *Screen: split or cut to the terminal. Show `npm test` running green, then the
> repo tree briefly. Do not read the code aloud.*

**VO:** "Underneath, this is a self-hosted MCP server on spec 2025-11-25, over
Streamable HTTP, behind OAuth 2.1 with PKCE and resource-bound tokens."

**VO:** "Nothing in the house is stored in English and translated for her. Everything
is stored exactly as it was said, and rendered for whoever is asking. That's the whole
design, and it's why she isn't a second-class user of her own home."

**VO:** "The card is an MCP App — a `ui://` resource the tool declares, rendered by the
host. Language identity persists across sessions, so the device remembers who speaks
what."

**On screen:** `70 tests · MCP 2025-11-25 · OAuth 2.1 + PKCE · MCP Apps`

---

## 2:15 – 2:40 · Why it matters

> *Screen: back to the card, held.*

**VO:** "There are millions of households where somebody is locked out of the device
in their own living room. They're not an edge case — they're the grandparents,
the in-laws, the parent who moved in last year."

**VO:** "This doesn't translate for them. It gives them the house back."

**On screen (final card):**
`github.com/kishormorol/alexa-language-bridge`

---

## Recording checklist

- [ ] `rm -f .state/sim.json` first — a clean household, no leftovers from testing
- [ ] `LANGUAGE_PROVIDER=bedrock` — **the demo is not shootable on `echo`**; beats 2–4
      show `[en-US] chal` instead of `rice` and beat 4 fails outright
- [ ] Browser at ~1280×800, zoomed so text is legible at 720p
- [ ] Hide bookmarks bar, close other tabs, clean desktop
- [ ] Type at a human speed — do not paste
- [ ] Hold two seconds on every card render; the eye needs it
- [ ] Record audio separately and lay it over; live narration while typing sounds rushed
- [ ] No copyrighted music. Silence is fine. An unlicensed track can disqualify the entry.
- [ ] Export 1080p, upload **public** to YouTube or Vimeo — unlisted is fine, private is not
- [ ] Watch it once at 2× with the sound off. If the story survives, it's clear enough.

## What to cut if it runs long

In order: beat 5, then the second half of "How it works", then beat 3. Never cut the
opening 22 seconds or beat 2 — those are the two that decide the score.
