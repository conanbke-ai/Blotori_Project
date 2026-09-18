# Development rules for AI/code agents

This repository uses the common TORI policy baseline from `conanbke-ai/Tori_Common_Project@aefeefd5d2871194daeba39dbd6273bead5ef38a`.

## Common entrypoint
- Read the latest `main`, this file, `ACTIVE_WORK.md`, relevant product docs/contracts, open PRs/branches, and actual code before changing behavior.
- Common routing: `policies/TORI_AI_DEVELOPMENT_ROUTER.md`.
- Common credit guard: `policies/TORI_AGENT_CREDIT_GUARD.md`.
- Common orchestration: `policies/TORI_AGENT_ORCHESTRATION_STANDARD.md`.
- Specialist definitions are logical ChatGPT roles under common `policies/agent_roles/`; no Cursor/plugin installation is required.

## Runtime routing
- Chat/connector first for requirements, RAG/content design, repo inspection, docs, diff/log review, and static UI review.
- Codex only when repository-local source changes plus build/lint/test are actually required.
- Work only when real browser/app interaction or final visual acceptance is required.
- Do not duplicate the same objective across Chat/Codex/Work.
- Use the smallest relevant logical role set.

## Product contracts
- Preserve the V1 default of one text-generation request per article unless a deliberate product decision changes it.
- RAG/source-grounded health content uses the Blotori Content Grounding Reviewer.
- Provider/context/retry/cache/call-volume changes use AI Cost & Ops review.
- Account/upload/share/PII/provider-payload changes use Security & Privacy review.
- Paid/entitlement/release behavior uses Commercial & Release review.
- Keep licensed/commercial knowledge allowlists authoritative; do not silently index unapproved sources.
- Do not treat medical Rule Engine checks as medical/legal approval.
- Preserve canonical Blotori/TORI-family character and paw contracts.

## Architecture
`Controller/Web -> Application/Service -> Domain -> Infrastructure/Adapter`.
Add Repository only when persistence is introduced; do not create one merely for symmetry.

## Validation
- Run targeted TypeScript/build/tests appropriate to the changed path.
- UI code completion is not visual acceptance; use actual rendered QA when interaction/responsive behavior is part of acceptance.
- Record material design/RAG/provider decisions in docs, and use Portfolio Guardian when they affect portfolio/history claims.
- Role triggers/regression baseline: common `docs/TORI_AGENT_TRIGGER_MATRIX.md` and `docs/TORI_ORCHESTRATION_REGRESSION_SCENARIOS.md`.
- Runtime recovery/retry/reconnect/checkpoint changes use Runtime Reliability review; prompt/model/provider/context changes affecting generative output use AI Output Evaluation review.
- Common routing regression result: `ORCHESTRATION_REGRESSION_PASS` (15/15 representative scenarios; first-pass routing gaps fixed in common policy).
