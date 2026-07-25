# Staging Import Execution

- Project: `baukcqccetzzwzgpbnoj`
- Batch: `LM-ACTUAL-JUNE-2026-FULL-ASSETS-V2`
- Successful execution: `2026-07-25T13:40:25+07:00`
- Credential handling: the temporary linked-database credential was assembled
  only in process memory and was neither printed nor persisted.
- Final result: **PASSED**

## Execution history

The first three controlled attempts were retained as audit evidence:

1. `13:38:14` — PowerShell log-output parameter incompatibility; no staging
   transaction was committed.
2. `13:38:50` — the linked temporary login required an explicit `postgres`
   role switch; no staging transaction was committed.
3. `13:39:29` — staging COPY committed, but the post-commit reporting query
   lacked access after `SET LOCAL ROLE` reverted.
4. `13:40:25` — rerun with `SET ROLE postgres`; batch-scoped cleanup and COPY
   committed, and the reporting query completed.

No attempt removed or modified data outside the approved batch.

## Final staging cardinalities

| Dataset                     | Rows |
| --------------------------- | ---: |
| Data coverage               |    7 |
| Daily sales                 |   30 |
| Customer traffic            |   30 |
| Historical products         |   61 |
| Historical aliases          |   68 |
| Historical daily quantities |  656 |
| Suppliers                   |    9 |
| Supplier items              |   20 |
| Purchase lines              |  344 |
| Asset categories            |    3 |
| Assets                      |   21 |
| Finance control             |    1 |

The independent staging reconciliation passed **68/68** assertions. See
`phase10_staging_reconciliation.md` and its machine-readable JSON companion.
