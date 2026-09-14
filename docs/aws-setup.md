# AWS setup

This project uses a **dedicated AWS account**, separate from any other account.
Promotional and prize credits are applied to one specific account ID, and hackathon
spend stays isolated from unrelated work.

## Order of operations

The credits form asks for an account ID, so the account must exist first.

### 1. Create the account

- Needs a unique email address and a payment method, even on free tier.
- Set the account alias to something recognisable so the profile is unambiguous.
- Record the 12-digit account ID — the credits form needs it.

### 2. Enable Bedrock model access — do this early

New accounts do not have Bedrock models enabled by default. Access is requested
per model in the console, and approval is not always instant. This is on the
critical path for the language layer, so request it the same day the account opens
rather than in week three.

Region: `us-west-2` — matches the CodeArtifact region and avoids a second region to
reason about.

### 3. Request the hackathon credits

$150 in AWS promotional credits, via the form linked from the hackathon rules.

- Deadline **21 Oct 2026, 12:00 PT**, but issued **while supplies last** — submit as
  soon as the account ID exists, not near the deadline.
- Only registered hackathon participants may request them.
- Not redeemable for cash. Any overage beyond the credits is billed to the account.

### 4. Set a billing alarm

Credits are finite and the account is new. A zero-spend budget alert avoids a
surprise while iterating on model calls.

### 5. Configure the local profiles

Two profiles: one for the hackathon account, one that assumes Amazon's read role for
the CodeArtifact registry.

```ini
# ~/.aws/config

[profile alexa-hackathon]
region = us-west-2

[profile alexa-ai]
role_arn = arn:aws:iam::372468808636:role/AddOn3PDeveloperToolsRead
source_profile = alexa-hackathon
region = us-west-2
```

Verify the gate:

```bash
aws sts get-caller-identity --profile alexa-hackathon
aws sts assume-role \
    --role-arn arn:aws:iam::372468808636:role/AddOn3PDeveloperToolsRead \
    --role-session-name alexa-ai-check \
    --profile alexa-hackathon
```

If the second command returns credentials, continue with the CodeArtifact login in
[install-chain.md](install-chain.md). If it returns `AccessDenied`, the MCP Toolkit
needs enrollment this account does not have — see the fallback in `PLAN.md`.

## Cost watch

The <500 ms latency budget pushes toward a small fast model and aggressive caching,
which also happens to be the cheap option. Keep an eye on per-call cost during the
week-4 latency pass, when call volume goes up.
