# Dashboard Baseline

- Commit: `b6e9982`
- Description: merged main after the dashboard period persistence fixes
- Relevant commits included: `1c5754a`, `2ff7e9f`
- Restored file: `src/routes/_authenticated/dashboard.tsx`

The baseline contains the original operational cards, sales/expense/profit
trend, category rankings, product analytics preview, business insights, period
summary, recent transactions, responsive grids, and URL-backed presets:
today, yesterday, 7/30 days, this/last week, this/last month, three months,
this/last year, and custom range.

Only the Dashboard route was restored. Finance, Supplier, Purchases, Assets,
permissions, generated types, migrations, and current routing were retained.
