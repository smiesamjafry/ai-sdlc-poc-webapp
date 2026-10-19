# TODOS

Deferred work collected by /autoplan (2026-10-20) for the e-commerce store PRD
(docs/specs/ecommerce-store-prd.md). Each item names why it was deferred.

## ASDLC integration (owner: smiesamjafry/ai-sdlc maintainers)
- **What:** Make `asdlc-run.yml` fail the agent job when Claude Code exits non-zero, returns malformed JSON or reports `is_error: true`.
  **Why:** today a failed agent run becomes a warning and the job can succeed (failure signalled as success).
  **Context:** `.github/workflows/asdlc-run.yml` "Run Claude Code" step. The orchestrator contract lives in smiesamjafry/ai-sdlc. **Effort:** human S / CC S. **Priority:** P1. **Depends on:** orchestrator owner agreement.
- **What:** Give the `agent` and `check` jobs Postgres 16 + Redis 7 service containers and run `npm run setup`-equivalent bootstrap.
  **Why:** backend tickets cannot be reproduced or checked without a database. **Priority:** P1.
- **What:** Integration milestone: one real Slack request produces a backend-changing PR validated by the trusted harness against fresh Postgres and Redis.
  **Why:** G4 cannot be claimed by deploying the store alone. **Priority:** P1.

## Product / platform
- **What:** OpenAPI generation from Zod schemas served at `/api/v1/openapi.json`. **Why deferred:** new dependency; hand-written docs/api.md covers the demo. **Priority:** P3.
- **What:** Live admin order feed (SSE). **Why deferred:** new infra, not P0. **Priority:** P3.
- **What:** Preview environment for every PR (not only `[render preview]`). **Why deferred:** per-PR Render cost. **Priority:** P3.
- **What:** CI check that the previous API commit still passes its smoke against the newly migrated schema. **Why deferred:** additive-only migrations cover the demo. **Priority:** P2.
- **What:** Reserve-stock-then-charge checkout for a real (async) payment provider. **Why deferred:** mock payment is synchronous and in-process; holding row locks across a real network call would not be acceptable. **Priority:** P2 (before any Stripe work).
- **What:** `pg_trgm` search index. **Why deferred:** ILIKE is fine at ~40 products. **Priority:** P3.

## Evaluation
- **What:** Brownfield evaluation track (requests against deliberately awkward code, or a sandboxed real repo). **Why deferred:** separate initiative from the store build. **Priority:** P2.
- **What:** Name a maintenance owner and retirement criteria for the demo store. **Why deferred:** stakeholder decision. **Priority:** P2.
