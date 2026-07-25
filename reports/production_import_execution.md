# Production Import Execution

- Project: `baukcqccetzzwzgpbnoj`
- Batch: `LM-ACTUAL-JUNE-2026-FULL-ASSETS-V2`
- Import SQL SHA-256:
  `9024D2727A4824900BE24D020DDE045BB45C59495974F5093DD7B2DAA7F4FA1B`
- Final result: **PASSED**

## Atomic failure and correction

The first production attempt stopped on an untyped `NULL` pair in an
`INSERT ... SELECT DISTINCT` expression for purchase invoices. PostgreSQL
could not infer a common type. The entire transaction rolled back before
commit, including the transient batch status.

The source was corrected by explicitly typing audit-null values as
`timestamptz` and `uuid`. No source facts, approved classifications, or
expected totals were changed.

## Successful executions and idempotency

After the type correction, the exact production import completed twice.
Both executions ran in one transaction under a batch advisory lock, passed
the same-transaction acceptance checks, and committed. The second execution
produced the same cardinalities and totals; the persisted successful attempt
counter is `2`.

| Production object           | Active rows |
| --------------------------- | ----------: |
| Data coverage               |           7 |
| Daily sales                 |          30 |
| Customer traffic            |          30 |
| Historical products         |          61 |
| Historical aliases          |          68 |
| Historical daily quantities |         656 |
| Suppliers                   |           9 |
| Supplier items              |          20 |
| Purchase invoices           |         343 |
| Purchase items              |         344 |
| Asset categories            |           3 |
| Assets                      |          21 |

## Financial controls

| Metric                  |       Actual |
| ----------------------- | -----------: |
| Revenue                 | Rp30,011,000 |
| Purchases               | Rp11,535,298 |
| HPP                     | Rp10,488,538 |
| Operating expense       |  Rp1,046,760 |
| Gross profit            | Rp19,522,462 |
| EBITDA                  | Rp18,475,702 |
| Depreciation            |          Rp0 |
| EBIT / operating profit | Rp18,475,702 |
| Asset register          |    Rp870,145 |

No tax entry, owner distribution, or depreciation entry was fabricated.
All nine protected legacy-table counts and checksums remained unchanged.
The independent production reconciliation passed **72/72** assertions; see
`phase12_production_reconciliation.md` and its JSON companion.
