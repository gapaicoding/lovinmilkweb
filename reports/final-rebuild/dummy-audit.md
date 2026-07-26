# Dummy Data Audit

Code search found category seed inserts in the initial schema migration, but no
deterministic dummy marker for legacy `sales`, `expenses`, `visitors`, or
`visitor_visits`. Those tables lack a documented synthetic origin, dummy batch,
fixture UUID set, or seed note that can prove individual rows are dummy.

| Table | Deterministic marker | Proven dummy rows | Decision |
|---|---|---:|---|
| sales | none | 0 | Do not delete |
| expenses | none | 0 | Do not delete |
| visitors | none | 0 | Do not delete |
| visitor_visits | none | 0 | Do not delete |

The actual batch `LM-ACTUAL-JUNE-2026-FULL-ASSETS-V2` is explicitly protected.
Because classification is ambiguous, no cleanup migration was created or run.
