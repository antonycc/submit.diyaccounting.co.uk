# PLAN: Issue #572 — Slack alerting and agents raising/assigning issues

> Source issue: https://github.com/antonycc/submit.diyaccounting.co.uk/issues/572
> Original body: (empty) — title "Alerting and monitoring in Slack with issue notifications and agents raising and assigning issues"
> Existing plans:
> - `_developers/backlog/SLACK_INTEGRATION_PLAN.md` (281 lines — Slack wiring design)
> - `_developers/backlog/ALARM_VALIDATION_STRATEGY.md` (1905 lines — what we alarm on)
> - `_developers/archive/PLAN_TELEGRAM_ALERTING.md`, `PLAN_WHATSAPP_ALERTING.md` (prior channels)

## Elaboration

Three related features in one issue:

1. **Slack as a first-class alerting channel** — sit alongside the existing Telegram channel so ops alerts reach a multi-person workspace rather than a personal Telegram feed. Already scoped in `SLACK_INTEGRATION_PLAN.md`.
2. **Issue notifications in Slack** — when a GitHub issue is opened/assigned/commented, post to Slack. Native GitHub ↔ Slack integration covers this (GitHub's official Slack app). Zero custom code needed.
3. **Agents raising and assigning issues** — when an alarm/anomaly fires (from #720/#719 or existing ops alarms), an "agent" opens a GitHub issue with a triage label and optionally assigns it. This needs custom code: a Lambda subscribed to the alarm SNS topic that calls the GitHub REST API (`POST /repos/{owner}/{repo}/issues`).

## Likely source files to change

- New `app/functions/ops/gitHubIssueRaiser.js` — Lambda that consumes SNS alarm messages, opens a GitHub issue with a `triage` label, optionally assigns per a routing rule (e.g. payment alarms → @antonycc, bundle alarms → @antonycc, synthetic-test alarms → unassigned), and comments on a duplicate detection link.
- New `app/functions/ops/slackForwarder.js` — Slack equivalent of `activityTelegramForwarder.js`; subscribes to the same activity bus, posts via an incoming webhook or the Slack Web API.
- `infra/main/java/.../stacks/OpsStack.java` — wire both Lambdas into EventBridge (slackForwarder) and SNS (gitHubIssueRaiser).
- `infra/main/java/.../stacks/AlertingStack.java` (if it exists, else embed in OpsStack) — centralise SNS topics, ensure alarms publish to a "alarms-to-slack" SNS topic and a "alarms-to-github" SNS topic.
- Secrets: Slack webhook URL + a GitHub fine-scoped PAT (or a GitHub App preferred) stored in Secrets Manager.
- `_developers/backlog/SLACK_INTEGRATION_PLAN.md` — mark as delivery-in-progress under this issue.

## Likely tests to change/add

- Unit test `app/unit-tests/functions/slackForwarder.test.js` — formatting + webhook call, mocked `fetch`.
- Unit test `app/unit-tests/functions/gitHubIssueRaiser.test.js` — issue body templating + duplicate detection (don't raise a second issue if an open one with the same title exists in the last 24h).
- System test: trigger a test SNS message, assert the GitHub REST mock was called once with the expected body.
- Do NOT test against the real GitHub API or Slack workspace in unit/system tier.
- Behaviour: manually confirm one real alarm → one real Slack message + one real GitHub issue in the `antonycc/submit.diyaccounting.co.uk` repo.

## Likely docs to change

- `_developers/backlog/SLACK_INTEGRATION_PLAN.md` — update delivery section.
- `_developers/backlog/ALARM_VALIDATION_STRATEGY.md` — add the "what raises a GitHub issue vs what only pings Slack" matrix.
- New `RUNBOOK_OPS_ALERTS.md` at project root — per-alarm response cheatsheet including which alarm raises an auto-issue.

## Acceptance criteria

1. A CloudWatch alarm firing publishes to the `alarms` SNS topic, which fans out to: Slack (always), GitHub issue (for pre-tagged "raise-issue" alarms only).
2. Slack posts include alarm name, severity, timestamp, link to CloudWatch, link to the runbook row for that alarm.
3. GitHub issue body includes the same info plus the CloudWatch query that produced it, labels `triage` + `auto-raised`, and assignee per routing rule (defaulting to the on-call login).
4. Duplicate protection: a second alarm of the same name within 24 h comments on the existing open issue instead of opening a new one.
5. Slack ↔ GitHub bidirectional bot: assigning an issue from Slack closes the loop (this is from the native GitHub Slack app; no custom code needed).
6. Secrets stored in Secrets Manager; no PAT or webhook URL in env files.

## Implementation approach

**Recommended — three Lambdas, one topic, one human runbook.**

1. Set up the Slack app + webhook (Incoming Webhooks app or a proper Slack bot).
2. Install the official **GitHub for Slack** app in the Slack workspace; configure `#dev-notifications` channel to receive issue/PR events from this repo. (Covers feature 2 — zero custom code.)
3. Build `slackForwarder.js` for activity events → Slack.
4. Build `gitHubIssueRaiser.js` for alarms → GitHub issues, preferably as a **GitHub App** (richer permissions, revocable) not a PAT. Store app private key in Secrets Manager.
5. Alarm routing: a DynamoDB table or simple hardcoded map in the Lambda decides "this alarm raises an issue" vs "Slack only".

### Alternative A — just use SNS → Slack without the GitHub issue raiser
Defer the agent-raising-issues feature. Fastest path to "Slack alerting" but leaves the "agents raise issues" request unmet.

### Alternative B — GitHub Actions workflow_dispatch fired by SNS
Instead of a Lambda calling the GitHub API, have CloudWatch alarms trigger a `workflow_dispatch` via an AWS Lambda → GitHub API → Actions, and the Action opens the issue. Cleaner separation of concerns, but adds 20–40 s latency.

## Questions (for QUESTIONS.md)

- Q572.1: Which Slack workspace? (Existing "DIY Accounting" workspace, or a new one for ops alerts?) Admin needed to install apps.
- Q572.2: GitHub PAT vs GitHub App for the issue-raiser? (Recommendation: App — revocable, scoped, no human account dependency.)
- Q572.3: Routing rules for which alarms auto-raise issues — draft the initial matrix and confirm which assignee(s) should own which alarms.
- Q572.4: Retire Telegram alerting entirely, or run both? (Recommendation: run both for 30 days, then retire Telegram for non-critical alerts but keep for the "something's really wrong" class.)

## Good fit for Copilot?

Partial. The Slack + GitHub-issue Lambdas are bounded and scriptable — good for Copilot. The routing rules and runbook are opinionated — human.
