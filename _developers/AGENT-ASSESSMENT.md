Title: Deep Repo Assessment + Next-Best Changes (Parallel, Competitive, Evidence-Based)

Context:
- Repository: https://github.com/antonycc/submit.diyaccounting.co.uk/
- Branch/commit: main
- Primary goals: MTD VAT submission (and supporting operations) for Google authenticed UK tax payers.
- Constraints (tech, infra, compliance, budget, SLA): AWS via CDK for Java, with Node JS 22 with ESM, near zero cost at rest, 0 downtime, No JS client frameworks.
- Environments: Proxy, CI, Prod.
- Tooling you may use (if available): code search, AST parsers, linters, SCA/SAST/DAST, test runners, container runners, package managers, CI logs, IaC validators, SBOM generators, HTTP clients, headless browsers, cloud CLIs, vector stores, scratch storage.

Directive:
Perform a deep assessment of the repository’s intended purpose and produce a concrete, high-leverage plan for the next set of changes that push the code toward the stated goals. Maximise work by parallelising and pitting competing approaches. Do private reasoning; return only results, evidence, and citations (no chain-of-thought).

Method (run these in parallel where possible):
1) Map + Intent Inference
    - Crawl all code, docs, configs, IaC, CI/CD, scripts, Dockerfiles, env templates.
    - Build a system map: services, entry points, data flows, auth, persistence, queues, external APIs, secrets paths.
    - Infer intended purpose from executable artefacts, routes, domain models, and user journeys.
    - Output an “Intent Evidence Map” with file:line citations.

2) Build + Test Matrix
    - Try clean build and test across declared toolchains (e.g. Node versions, JVM, Python).
    - If execution is not possible, simulate and state exactly what blocked you and which commands would have run.
    - Produce logs, failure triage, and flakiness report.

3) Static + Supply Chain
    - Lint, type-check, SAST, license and CVE scan, secret scan, unused deps, size/treeshake, circular deps.
    - Build SBOM. Flag criticals with fix versions or patches.

4) Runtime Probes (safe)
    - If feasible, run local services with mocks/sandboxes. Exercise key endpoints and flows.
    - Capture latencies, error rates, unhandled rejections, hot paths.

5) Architecture + Infra
    - Parse IaC. Check idempotence, drift risks, blast radius, least-privilege, cost hotspots, logging/metrics/tracing.
    - Validate domain boundaries and DDD aggregates if present.

6) CI/CD + DevEx
    - Read workflows. Identify cache misses, redundant jobs, missing gates, secret handling, prod safety nets, deploy rollback.
    - Suggest concrete optimisations with expected time/cost deltas.

7) Competitive Hypotheses
    - Spawn at least 3 competing plans for “next best changes” targeting different levers: reliability, security, speed, cost, developer velocity.
    - For each plan, design a 1–2 week slice with measurable outcomes and crisp acceptance tests.

8) Red-Team Review
    - Attack the top plan: auth misconfig, SSRF, IDOR, policy gaps, dependency risks. Provide mitigations.

9) Validation Plan
    - For the chosen plan, define test additions, canaries, metrics, runbooks, rollout/rollback, and KPIs.

Output format (strict):
A) Repository Synopsis
- One-paragraph purpose statement.
- System diagram (ASCII) and key components list with file:line cites.

B) Intent Evidence Map
- Bullet list: ‘evidence → inference’ with precise paths and line ranges.

C) Findings
- Critical bugs
- Security issues
- Build/test failures
- Config/IaC issues
- DX/CI problems
  Each item: severity, evidence, minimal repro, proposed fix.

D) Next-Best Changes (ranked backlog)
- For each item: goal, user impact, risk, effort, dependencies, acceptance criteria, owner.
- Include expected metrics deltas.

E) Proposed Diffs
- For top 3 items, provide patch-ready diffs (unified format) or exact file edits with insertion points.
- Include updated env/secret keys and where they are read.

F) Commands + Automation
- Copy-pasteable commands to build, test, run, and deploy locally and in CI.
- CI job snippets to integrate the changes.

G) Rollout + Observability
- Dashboards/alerts to add, SLOs/SLIs, canary plan, rollback triggers.

H) Open Questions
- Assumptions you had to make. Exact files or owners needed to answer them.

I) Appendix
- SBOM summary, CVE list with fixes, license notes.
- SBP (smallest beneficial PRs) list: 3–7 PRs with scope, reviewer, and test plan.

Parallelisation + Rigor:
- Fan out workers for: file crawl, AST indexing, dependency graph, secrets scan, CVE resolution search, CI analysis, IaC validation, test synthesis.
- Use multiple strategies in competition (e.g. 3 different refactor plans). Select the winner via a decision table with weighted criteria (risk, impact, effort).
- Cross-verify every claim with file paths and line ranges or runtime logs. If a tool is unavailable, state the missing tool and provide an emulated result plus how to verify for real.

Constraints:
- No guesses without flags. Mark uncertainties with ‘confidence: low/med/high’.
- Prefer minimal, high-leverage changes first.
- Avoid API-breaking changes unless payoff is clear and migration is scripted.

Deliverables:
- Full report per the output format.
- A machine-readable JSON summary of sections C, D, E, F (keys: findings, backlog, diffs, commands).
- Zero noise. No chain-of-thought. Only evidence, decisions, and diffs.

Run:
- Start now on https://github.com/antonycc/submit.diyaccounting.co.uk/. If cloning or execution is blocked, continue with static analysis and clearly list missing capabilities and how to unblock.
