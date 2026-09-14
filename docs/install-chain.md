# Alexa AI CLI install chain

The setup docs show `npm install -g @alexa-ai/cli`, but that package is not on the
public npm registry. The real sequence, in order:

1. **Alexa developer account** — free, can reuse an existing Amazon account.
   Complete the profile in the Alexa app: phone number, address, and a preferred
   marketplace that is an Alexa+ supported marketplace. Device language must match
   a supported locale.
2. **AWS account** with working credentials.
3. **AWS profile `alexa-ai`** that assumes
   `arn:aws:iam::372468808636:role/AddOn3PDeveloperToolsRead`.
   This is the real access gate.
4. **CodeArtifact login** — token is valid 12 hours, so this recurs:

   ```bash
   aws codeartifact login \
       --tool npm \
       --domain alexa-ai \
       --repository npm-packages \
       --domain-owner 372468808636 \
       --region us-west-2 \
       --namespace @alexa-ai \
       --profile alexa-ai
   ```

5. **Install and verify:**

   ```bash
   npm install -g @alexa-ai/cli   # requires Node 24+
   alexa-ai --version
   alexa-ai configure             # browser LWA OAuth; creds at ~/.alexa-ai/credentials
   ```

## Warning

The unscoped name `alexa-ai` on public npm is an **unrelated third-party package**
(a WhatsApp chatbot). Do not install it. The Amazon package is the scoped
`@alexa-ai/cli`. See FL-002.

## Open

Whether step 3 requires enrollment in a preview or allowlist is not stated in the
docs. If the role assumption is refused, that is the answer, and it is the single
biggest schedule risk in `PLAN.md`.
