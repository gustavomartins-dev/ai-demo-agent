# Social draft quality and operations

## Product outcome

X and LinkedIn drafts are treated as untrusted model output until deterministic
checks confirm their format, language, links, mentions, and evidence provenance.
A successful Hermes command is not, by itself, a quality result.

## Quality gates

`evaluateSocialDraftBundle` reports five checks:

| Check | What it protects |
| --- | --- |
| `schema` | Required fields, English language marker, X's 280-character limit, and LinkedIn's 3,000-character limit |
| `english_only` | Multiple deterministic Portuguese-language signals in post content |
| `required_links` | Missing repository URL when the project is open source |
| `supported_mentions` | Invented identities or mention reasons not present in verified candidates |
| `grounded_claims` | Claim IDs without a passed Playwright step and stored screenshot |

The language check is intentionally deterministic, so CI produces the same
answer every time. It catches the Portuguese adversarial fixture but is not a
general-purpose language classifier. Human review remains required for tone,
grammar, and subtle unsupported implications.

Run all eval fixtures and product tests with:

```bash
npm test -- --run
```

Fixtures live in `tests/fixtures/social-drafts/` and include a passing bundle,
Portuguese content mislabeled as English, and hallucinated claims/mentions.
When changing prompts or models, add real failure examples as fixtures before
accepting the change.

## Generation settings

Hermes uses the same settings for planning and social drafting:

| Variable | Default | Operational effect |
| --- | --- | --- |
| `AI_DEMO_HERMES_COMMAND` | `hermes` | Executable invoked without a shell |
| `AI_DEMO_HERMES_MODEL` | active Hermes model | Model quality, latency, and price |
| `AI_DEMO_HERMES_PROVIDER` | active Hermes provider | Authentication, availability, and billing source |
| `AI_DEMO_HERMES_TIMEOUT_MS` | `120000` | Maximum duration for each Hermes call |

Pin model and provider in production so output changes are deliberate. Run the
fixture suite before changing either value. The application currently does not
persist token usage because the Hermes CLI contract returns only generated
text; use the configured provider's usage dashboard to measure input tokens,
output tokens, and billed cost for planning and drafting calls. Record the
model name and average cost per completed run in release notes until usage
metadata is available from Hermes.

## Failure diagnosis

| Failure | Meaning | Action |
| --- | --- | --- |
| `Hermes did not return valid JSON` | Output could not be parsed | Inspect `run.failed`; verify the selected model follows structured-output instructions |
| `drafts that violate the verified social contract` | Length, link, claim, or mention validation failed | Reproduce with the same verified context and add the response as an adversarial fixture |
| `A passed Playwright execution report is required` | Recording evidence is missing or failed | Restore the artifact volume or rerun recording after fixing Playwright |
| `Generation run lease was lost` | Another worker recovered the job or PostgreSQL connectivity failed | Check worker clocks, lease duration, and database connectivity |
| Repeated `DRAFTING` failures | Model/configuration cannot satisfy the contract | Review the saved error, model selection, repository URL length, and attempt budget |

Worker logs are JSON and can be filtered by `runId`. Never paste prompts or
provider diagnostics containing credentials into GitHub issues.

## Reruns and cost control

A drafting failure returns the run to `DRAFTING`. The next automatic attempt
reuses the validated plan, video, execution report, and screenshots, so it does
not pay the browser-recording cost again. Retry delay follows the worker's
exponential policy and stops at `maxAttempts`.

After attempts are exhausted, use **Retry generation** only after correcting
the failure. The current manual retry preserves the plan but restarts at
`PLANNED`; therefore it records a new video. A drafting-only manual retry should
be added before using manual retries primarily to tune social copy.

## Release evidence

Before merging a prompt, contract, or model-setting change, require:

- passing success and adversarial eval fixtures;
- clean TypeScript and ESLint checks;
- a production Next.js build;
- clean PostgreSQL migrations;
- a production dependency audit;
- human review of both platform drafts from at least one real completed run.

Publishing remains out of scope. No eval result authorizes an external post;
the owner must review and explicitly approve content in a later publishing
workflow.
