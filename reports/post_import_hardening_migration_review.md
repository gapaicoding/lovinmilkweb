# Post-Import Hardening Migration Review

Target project: `baukcqccetzzwzgpbnoj`

Pending migrations:

| Version | Purpose | SHA-256 |
|---|---|---|
| `20260725002000` | Atomic purchase write RPC and paginated invoice read view | `77A1449E9385CF1FD724EC8884A0D9500B8F5541A6FF75BFB5C0B583D4F0E61E` |
| `20260725002500` | Generic stale-batch invalidation for reconciled source mutations | `DB108BB1B3055F7D545404C5407447F0D5AD087B191452983AFC5345E332D38F` |
| `20260725003000` | Batch-scoped Staff operational-dashboard aggregate RPC | `2A06D299936636860E4E83F9E47327909F43F200DE01F030461C7765C49FFADF` |

## Static review

- All migrations are additive and transaction-wrapped.
- No legacy table is dropped, truncated, or mass-deleted.
- Both write and aggregate RPCs are `SECURITY DEFINER` with fixed safe
  `search_path` and explicit active-role checks.
- Anonymous execution/select access is revoked.
- The purchase index view is `security_invoker`.
- Atomic purchase writes derive the audit actor from `auth.uid()`, validate
  batch/date/supplier/item ownership, and cannot move rows across batches.
- Any mutation to a batch-scoped reconciled source changes the batch back to
  `imported`, clears `completed_at`, and records a failed manual-mutation
  control. Historical reconciliation evidence is retained.
- The Staff dashboard RPC returns only five aggregate measures and selects the
  explicitly named reconciled batch; it does not expose import governance,
  purchase detail, HPP, expense, supplier, asset, tax, or distribution rows.

## Execution state

The first dry-run attempt on 2026-07-25 could not start because the sandbox
blocked Supabase CLI from writing its local telemetry/state file under the
Windows user profile. The required escalation was then rejected by the
environment approval service because its usage quota was exhausted.

No pending migration was applied by that attempt. Remote application and
execution-level verification remain gated until explicit tool approval is
available. The failure was environmental, not a PostgreSQL parser or migration
response.
