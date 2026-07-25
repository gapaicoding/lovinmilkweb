# Codex Package Validation

- Status: **PASSED_WITH_DOCUMENTED_WARNINGS**
- Batch: `LM-ACTUAL-JUNE-2026-FULL-ASSETS-V2`
- Checks: 108
- Failed: 0
- Documented warnings: 5

## Counts

- daily_sales_summaries: 30
- historical_product_daily_quantities: 656
- historical_products: 61
- historical_product_aliases: 68
- purchase_items: 344
- purchase_invoices: 343
- suppliers: 9
- supplier_items: 20
- customer_traffic_daily: 30
- assets: 21
- asset_categories: 3

## Totals

- revenue: 30011000.0
- bill_count: 342.0
- adult_visitors: 421
- child_visitors: 406
- visitor_total: 827
- product_quantity: 1358.0
- purchase_total: 11535298.00
- hpp: 10488538.00
- operating_expense: 1046760.00
- asset_register_total: 870145.00
- depreciation_june_2026: 0.00
- gross_profit: 19522462.00
- ebitda: 18475702.00
- ebit_operating_profit: 18475702.00

## Errors

- None

## Documented Warnings

- purchases.optional_supplier: supplier source is unavailable; supplier_id must remain NULL and no dummy supplier may be created (observed {'rows': 323, 'invoices': 322})
- purchases.source_amount_difference: source total_amount intentionally differs from quantity × unit_price; preserve total_amount and amount_difference (observed {'rows': 5})
- assets.documented_source_unit_adjustment: owner-delegated unit interpretation is documented in adjustment_note (observed {'rows': 4})
- daily_sales.integer_lexemes: stage as numeric, assert integral values, then cast to integer (observed {'bill_count': 29, 'adult_visitors': 30, 'child_visitors': 29, 'visitor_total': 30})
- traffic.bill_count_null_to_zero: traffic CSV records zero where daily sales source is blank; preserve approved value but treat lineage as documented limitation (observed ['2026-06-09'])
