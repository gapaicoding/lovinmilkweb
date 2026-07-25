# June 2026 Data Quality Decisions

Batch: `LM-ACTUAL-JUNE-2026-FULL-ASSETS-V2`

This record documents source limitations found during the independent package
audit. No approved CSV, source workbook, expected count, or expected financial
total was changed.

## Accepted source limitations

### Purchases without a supplier mapping

- 323 of 344 purchase lines, representing 322 of 343 invoices, have no
  `supplier_key`.
- All 21 populated supplier references resolve to the nine approved suppliers.
- Production `purchase_invoices.supplier_id` must remain `NULL` when the source
  key is blank.
- No placeholder or dummy supplier may be created.
- Reconciliation must assert that every *populated* supplier key resolves and
  report the nullable count separately.

### Purchase source amount differences

- Five lines have a source `total_amount` that differs from
  `quantity × unit_price`.
- The supplied `calculated_total` and `amount_difference` fields preserve the
  discrepancy.
- Import uses `total_amount`, because this is the approved source amount used
  by the locked financial totals. It must not be silently recalculated.

### Asset source-unit interpretation

- Four assets contain an owner-delegated unit interpretation in
  `adjustment_note`.
- `original_source_cost`, adjusted acquisition cost, and the note are retained
  for traceability.
- The resulting 21-asset register and Rp870,145 total match the locked
  acceptance metrics.

### Decimal lexical form for integer facts

- Daily-sales integer facts are serialized as integral decimals such as
  `18.0`.
- Staging columns must accept numeric input, assert the values are integral,
  and cast them explicitly when loading integer production columns.

### Traffic bill-count lineage on 9 June

- Daily sales has a blank `bill_count` on `2026-06-09`; the approved traffic
  CSV records `0`.
- The approved value is preserved because the package is the locked import
  source, but the lineage limitation remains explicit.
- Financial bill-count reporting uses `daily_sales_summaries`, where the blank
  value is nullable and aggregate calculations use the package's locked total
  of 342.

## Validation result

The strengthened validator completed 108 checks with zero failures and five
documented warnings. Counts, totals, formulas, periods, keys, populated
relationships, asset policy, tax/dividend absence, and allowed data origins all
match `reports/expected_metrics_june_2026.json`.
