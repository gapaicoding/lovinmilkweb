# June 2026 Release Rollback Plan

Scope:

- Supabase project `baukcqccetzzwzgpbnoj`
- Import batch `LM-ACTUAL-JUNE-2026-FULL-ASSETS-V2`
- Additive June finance, purchase, supplier, and asset schema

## Preconditions

1. Confirm an application rollback is insufficient before changing production
   data.
2. Use the successful logical backup at
   `E:\lovin_milk_fase_1_8_juni_2026\backup_output\20260725_130331` and its
   private second copy as recovery evidence.
3. Re-run the protected legacy-table snapshot comparison.
4. Obtain explicit approval for a production data rollback.
5. Use an interactive Supabase login; never put a database credential in a
   command file, report, screenshot, or repository.

## Application rollback

Preferred first response:

1. Revert the release merge commit with a new Git commit. Do not reset, rebase,
   amend, or force-push published Lovable history.
2. Push the revert through the normal protected-branch pull-request workflow.
3. Allow the existing deployment provider to deploy the reverted application.
4. Verify the previous production version.

An application rollback does not delete the June production rows or additive
schema.

## Import rollback

Only if the imported data itself must be withdrawn:

1. Resolve the batch ID from the exact batch key inside a transaction and
   require exactly one match.
2. Acquire a batch-scoped advisory transaction lock.
3. Confirm no rows owned by another batch reference a batch-owned master row.
4. Delete child rows before parents, restricted by the resolved
   `import_batch_id`. This includes reconciliation results, depreciation/tax/
   distribution rows, purchase items and invoices, supplier items, historical
   quantities and aliases, operational facts, assets, suppliers, historical
   products, coverage, and finally the batch row.
5. Abort if any target relation contains a row outside the resolved batch
   scope or if any expected dependency is ambiguous.
6. Re-run all nine protected legacy-table counts and checksums before commit.
7. Commit only after an independent review of the transaction output.

Never use `TRUNCATE`, an unscoped `DELETE`, `supabase db reset`, or deletion of
the legacy `sales`, `expenses`, `visitors`, `visitor_visits`, `products`, or
expense-master data.

## Schema rollback

Do not automatically drop the new tables, views, functions, staging schema, or
RLS policies after production use. Keep the additive schema in place when
rolling back the UI or import.

If schema removal later becomes necessary, create a separate reviewed migration
after dependency analysis and explicit approval. Do not edit or rewrite the
already-published migration history.

## Verification after any rollback

- Production application returns the intended version.
- No unhandled console/network errors.
- June batch state matches the chosen rollback scope.
- All nine legacy-table counts and checksums match snapshot
  `LM-PRE-JUNE-FOUNDATION-20260725-130419425`.
- Backup files remain outside Git and unchanged.
