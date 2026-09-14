# Deployment

## Why a container and not a Lambda

The original plan said "Lambda Function URL or App Runner". Building it settled the
question: **App Runner**, or any long-running container.

Streamable HTTP on spec `2025-11-25` keeps a session per connection — the transport
holds `mcp-session-id` state in memory and serves an SSE stream for server-initiated
messages. On Lambda that means sticky routing and a session store on every request,
plus SSE against a function whose execution model fights long-lived responses. The
OAuth authorization server holds issued tokens in memory for the same reason.

A container is the honest unit of deployment for this server. Lambda would be the
right answer for a stateless tool endpoint; this is not one.

## Build and run locally

```bash
docker build -t alexa-language-bridge .
docker run --rm -p 3000:3000 \
  -e PUBLIC_URL=http://127.0.0.1:3000 \
  -e LANGUAGE_PROVIDER=echo \
  -v alb-state:/app/.state \
  alexa-language-bridge
```

`/healthz` reports liveness, session count, and whether OAuth is enforced.

## App Runner

```bash
aws ecr create-repository --repository-name alexa-language-bridge \
  --region us-west-2 --profile alexa-hackathon

ACCOUNT=$(aws sts get-caller-identity --query Account --output text --profile alexa-hackathon)
REPO="$ACCOUNT.dkr.ecr.us-west-2.amazonaws.com/alexa-language-bridge"

aws ecr get-login-password --region us-west-2 --profile alexa-hackathon \
  | docker login --username AWS --password-stdin "$ACCOUNT.dkr.ecr.us-west-2.amazonaws.com"

docker build --platform linux/amd64 -t "$REPO:latest" .
docker push "$REPO:latest"
```

Then create the service with:

| Setting | Value |
| --- | --- |
| Port | `3000` |
| Health check | `/healthz` |
| Instance role | must allow `bedrock:InvokeModel` |
| `PUBLIC_URL` | the App Runner HTTPS URL — **must match exactly** |
| `LANGUAGE_PROVIDER` | `bedrock` |
| `AWS_REGION` | `us-west-2` — same region as Bedrock, for latency |

### `PUBLIC_URL` is not cosmetic

It is the canonical resource URI. OAuth 2.1 resource indicators (RFC 8707) bind every
issued token to it, the protected-resource metadata advertises it, and a mismatch
means every token is rejected as issued for a different audience. Set it to the exact
external HTTPS URL, no trailing slash.

## Region

Run the container in the same region as Bedrock. The whole latency strategy assumes
the model call is the only meaningful cost in the budget — a cross-region hop adds
tens of milliseconds to something already being measured against 500.

Measured on this machine, the server's own overhead is **1–3 ms** per tool round trip
(`npm run bench`), so effectively the entire budget is available to the model.

## State

`/app/.state` holds the household JSON and the translation cache. Mount a volume so
the cache survives deploys — a cold cache is a latency cliff, not a correctness
problem. Households and messages live there too; for anything beyond a demo that
belongs behind `HouseholdStore` in DynamoDB.

The OAuth provider keeps clients and tokens in memory, so a restart forces hosts to
re-register and re-authorize. Fine for a demo, and the first thing to move if this
ever ran for real.
