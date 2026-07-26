# Hardcoded June Audit

## Historical-specific and retained

Import/reconciliation SQL, package validation, historical tests, batch reports,
and the protected key `LM-ACTUAL-JUNE-2026-FULL-ASSETS-V2` remain explicitly
June-scoped because they prove the immutable baseline.

## Global UI/query hardcodes found and resolved

- `src/routes/_authenticated/laporan-keuangan.tsx`: now defaults to the current
  Jakarta month and reads canonical range RPCs.
- `src/routes/_authenticated/asset-peralatan.tsx`: register is all-time while
  depreciation has its own dynamic reporting month.
- `src/routes/_authenticated/data-pembelian.tsx`: operational writes no longer
  borrow the June import batch.
- Purchase breakdown no longer depends on the batch-bound composite relation.

`src/lib/juneFinance.ts` retains neutral formatting and aggregation helpers for
compatibility; the live page does not use its June-specific fetch functions.

## Remaining historical literals

The protected batch key and June dates remain only in migrations,
reconciliation assertions, historical baseline tests/reports, and legacy
compatibility code. They are not global UI defaults or live transaction scope.
