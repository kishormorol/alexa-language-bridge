# Friction Log

Running log of every rough edge hit while building. Append the moment it happens —
this is not reconstructable from memory later.

Each entry needs all six fields. Severity: Blocker / Major / Minor.

---

## Template

### FL-000 — <one-line title>

- **Date:** YYYY-MM-DD
- **Tool / SDK / API:** 
- **Task attempted:** what I was actually trying to do
- **Steps taken:** the exact sequence
- **Expected result:** 
- **Actual result:** verbatim error text where there is one
- **Severity:** Blocker | Major | Minor
- **Workaround used:** or "none found"
- **Actionable suggestion:** what would have prevented this

---

## Entries

<!-- newest first -->
### FL-003 — MCP Toolkit onboarding requires an Alexa Solutions Architect; no self-serve path documented

- **Date:** 2026-09-14
- **Tool / SDK / API:** Alexa+ MCP Toolkit · Alexa AI CLI · AWS CodeArtifact
- **Task attempted:** Obtain the CodeArtifact credentials needed to install `@alexa-ai/cli`, as a hackathon participant with a new AWS account.
- **Steps taken:** Created a dedicated AWS account, created an IAM user with `AdministratorAccess`, confirmed identity with `aws sts get-caller-identity`, then ran the documented `aws sts assume-role` against `arn:aws:iam::372468808636:role/AddOn3PDeveloperToolsRead`.
- **Expected result:** Temporary credentials, or an error explaining how to request access.
- **Actual result:** `AccessDenied ... is not authorized to perform: sts:AssumeRole on resource: arn:aws:iam::372468808636:role/AddOn3PDeveloperToolsRead`. Confirmed `AdministratorAccess` is attached, so `sts:AssumeRole` is permitted locally — the refusal is the target role's trust policy. The setup docs say to "Log in to the AWS account that you provided to the Alexa Solutions Architect", which implies the account ID must be allowlisted by Amazon in advance.
- **Severity:** Blocker
- **Workaround used:** None available for the toolkit path. Proceeding with a self-hosted MCP server on the open spec, which the hackathon rules accept and which requires no Amazon onboarding.
- **Actionable suggestion:** Two gaps. First, the setup docs present the toolkit as self-serve but depend on a Solutions Architect relationship never mentioned until a passing reference mid-page — state the prerequisite in the first paragraph. Second, there is no documented way to request access; a developer outside an existing Amazon partnership hits `AccessDenied` with no next step. Publish a request path, and have the failure message point at it. For a hackathon with thousands of participants this is the difference between the flagship integration being usable and being invisible.

### FL-002 — `alexa-ai` on public npm is an unrelated third-party package

- **Date:** 2026-09-14
- **Tool / SDK / API:** Alexa AI CLI · npm
- **Task attempted:** Install the CLI the docs call the "Alexa AI CLI", whose binary is `alexa-ai`.
- **Steps taken:** Searched npm for the CLI by the name used throughout the prose and by the binary name: `npm view alexa-ai`.
- **Expected result:** Either Amazon's package, or nothing.
- **Actual result:** `alexa-ai@2.5.0` exists on the public registry and is an unrelated third-party WhatsApp chatbot ("AI engine for the Alexa WhatsApp bot"), published by a third-party maintainer, last published 2026-09-07. The real package is `@alexa-ai/cli` on a private CodeArtifact registry.
- **Severity:** Major
- **Workaround used:** Verified the scoped name `@alexa-ai/cli` against the setup docs before installing anything.
- **Actionable suggestion:** The docs refer to the tool as the "Alexa AI CLI" and its binary is `alexa-ai`, but the package is `@alexa-ai/cli`. A developer who searches npm by the name in the prose lands on someone else's package and may install it globally. Amazon should either publish a placeholder/pointer package at the unscoped `alexa-ai` name, or state explicitly in the setup docs that the unscoped name is not Amazon's and must not be installed.

---

### FL-001 — Documented install command 404s; CodeArtifact prerequisite not sequenced

- **Date:** 2026-09-14
- **Tool / SDK / API:** Alexa AI CLI · AWS CodeArtifact
- **Task attempted:** Install the CLI, following "Set Up Your Development Environment".
- **Steps taken:** Ran the install command exactly as documented: `npm install -g @alexa-ai/cli`.
- **Expected result:** CLI installs, `alexa-ai --version` works.
- **Actual result:** `npm error code E404 / 404 Not Found - GET https://registry.npmjs.org/@alexa-ai%2fcli`. The package is not on the public registry — it lives in a private CodeArtifact domain (`alexa-ai` / `npm-packages`, owner `372468808636`, `us-west-2`) that requires an AWS profile assuming `arn:aws:iam::372468808636:role/AddOn3PDeveloperToolsRead`, plus a 12-hour auth token from `aws codeartifact login`.
- **Severity:** Blocker
- **Workaround used:** None yet — the role assumption is an access gate, not a config step.
- **Actionable suggestion:** Present the install as an ordered sequence, with the CodeArtifact login as step 1 and `npm install` as step 2, and state the required AWS role and how a new developer obtains access to it *before* showing a bare `npm install` line. As written, the first command a developer runs fails, and the error gives no hint that a private registry is involved.

