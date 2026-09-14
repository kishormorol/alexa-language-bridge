# Submission checklist

**Submit Mon 22 Oct.** The deadline is Fri 23 Oct 12:00 PDT — do not touch it.

## Stage 1 — eligibility (pass/fail, nothing else is scored if this fails)

| Requirement | State |
| --- | --- |
| Self-hosted MCP server or Agent Skill | ✅ self-hosted MCP server |
| MCP spec `2025-11-25` or later | ✅ asserted in `tests/mcp.e2e.test.ts` |
| Streamable HTTP transport | ✅ |
| Track tech imported and **called at runtime**, not just named in the README | ✅ end-to-end client→server round trips in tests |
| Public code repository | ⚠️ **repo is private — flip before submitting** |
| OSS license detectable in the GitHub About panel | ⚠️ **verify after flipping to public** |
| Setup and run instructions a judge can follow | ✅ `README.md` |
| Demo video under 3:00 | ⬜ not shot |
| Video public on YouTube or Vimeo | ⬜ |
| Video shows the project functioning on its platform | ⬜ simulator capture (permitted under the simulated Alexa+ path) |
| Latency claim stated honestly | ✅ ~5 ms repeats, ~650 ms novel — `PLAN.md` says both |
| All materials in English | ✅ |
| Free to test, no restriction, through the judging period | ✅ runs locally, no account needed on `echo` |

```bash
gh repo edit kishormorol/alexa-language-bridge --visibility public
gh repo view kishormorol/alexa-language-bridge --json licenseInfo
```

## Stage 2 — scored fields

| Field | State |
| --- | --- |
| Text description of features and functionality | ✅ `docs/devpost-description.md` |
| Primary track identified | ✅ **Alexa+** |
| Mini challenges identified | ✅ **Open Source** and **AWS Builder** (enter both; only one can be won) |
| Product feedback, per tool | ✅ `PRODUCT-FEEDBACK.md` |
| AWS Builder: which services and how | ✅ Bedrock running; see `PRODUCT-FEEDBACK.md` |
| Open Source: contribution URL | ✅ https://github.com/modelcontextprotocol/typescript-sdk/pull/2814 |
| Open Source: project repo URL | ✅ https://github.com/modelcontextprotocol/typescript-sdk |
| Open Source: GitHub username | ✅ `kishormorol` |
| Open Source: what / how / why | ✅ `docs/open-source-contribution.md` |
| Feature requests (optional, scored) | ✅ six, in `PRODUCT-FEEDBACK.md` |
| **Friction logs (optional, up to 10% bonus)** | ✅ five entries, `FRICTION.md` |

## Still blocked

| Item | Owner | Why it matters |
| --- | --- | --- |
| ~~Bedrock model access~~ | — | **Done 14 Sep.** Haiku 4.5 live; every demo beat works on real translation |
| **Join the hackathon on Devpost** | Kishor | Gates the credits form and the submission itself |
| **AWS promotional credits form** | Kishor | Needs Devpost registration first. "While supplies last" against 6,000+ entrants |
| **Make the repo public** | Kishor | Stage 1 pass/fail. `gh repo edit --visibility public` |
| **Record the demo video** | Kishor | Three of four scoring criteria. Script in `docs/video-script.md`; shootable today |

## Day-of

- [ ] `npm test` green
- [ ] Fresh clone into a temp directory, follow the README exactly, confirm it runs
- [ ] Repo public, license visible in About
- [ ] Video public, under 3:00, plays in an incognito window
- [ ] Every submission field filled — an empty required field is a decline
- [ ] Submit, then reopen the submission and read it back once
