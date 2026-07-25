#!/usr/bin/env python3
"""Validate the locked June 2026 Lovin Milk data package without modifying it."""

from __future__ import annotations

import csv
import json
import sys
from collections import Counter
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path

BATCH = "LM-ACTUAL-JUNE-2026-FULL-ASSETS-V2"
JUNE_START = date(2026, 6, 1)
JUNE_END = date(2026, 6, 30)
ALLOWED_ORIGINS = {"actual", "adjusted"}
EXPECTED_FILES = {
    "asset_categories_full.csv",
    "assets_full.csv",
    "customer_traffic_daily_june_2026.csv",
    "daily_sales_summaries_june_2026.csv",
    "data_coverage_june_2026.csv",
    "finance_summary_june_2026.csv",
    "historical_product_aliases_june_2026.csv",
    "historical_product_daily_quantities_june_2026.csv",
    "historical_products_june_2026.csv",
    "purchases_june_2026.csv",
    "supplier_items_june_2026.csv",
    "suppliers_june_2026.csv",
}
EXPECTED_HEADERS = {
    "asset_categories_full.csv": [
        "category_name",
        "default_useful_life_months",
        "description",
        "import_batch_key",
    ],
    "assets_full.csv": [
        "asset_source_key",
        "asset_code",
        "asset_name",
        "asset_name_normalized",
        "asset_category",
        "acquisition_date",
        "acquisition_cost",
        "original_source_cost",
        "capitalization_threshold",
        "capitalization_status",
        "useful_life_months",
        "residual_value",
        "depreciation_method",
        "monthly_depreciation",
        "depreciation_start_date",
        "asset_status",
        "brand",
        "size",
        "supplier_name_raw",
        "source_file",
        "source_sheet",
        "source_row",
        "adjustment_note",
        "data_origin",
        "import_batch_key",
    ],
    "customer_traffic_daily_june_2026.csv": [
        "traffic_date",
        "adult_visitors",
        "child_visitors",
        "total_visitors",
        "bill_count",
        "source_key",
        "source_file",
        "source_sheet",
        "source_row",
        "data_origin",
        "import_batch_key",
    ],
    "daily_sales_summaries_june_2026.csv": [
        "date",
        "date_raw",
        "day_name_raw",
        "source_file",
        "source_sheet",
        "source_row",
        "bill_count",
        "membership_count",
        "coupon_count",
        "cashier",
        "adult_visitors",
        "child_visitors",
        "qris_dretail",
        "qris_dynamic_bca",
        "qris_static_bca",
        "debit_edc_bca",
        "qris_static_bri",
        "cash",
        "total_sales",
        "dine_in",
        "takeaway",
        "reservation",
        "opening_cash",
        "deposited_cash",
        "deposit_method",
        "closing_cash",
        "payment_sum",
        "total_sales_difference",
        "visitor_total",
        "data_entry_status",
        "total_sales_arayya",
        "total_sales_lovin",
        "source_key",
        "data_origin",
        "import_batch_key",
    ],
    "data_coverage_june_2026.csv": [
        "domain",
        "period_start",
        "period_end",
        "availability_status",
        "row_count",
        "notes",
        "import_batch_key",
    ],
    "finance_summary_june_2026.csv": [
        "period_start",
        "period_end",
        "revenue",
        "hpp",
        "gross_profit",
        "operating_expense",
        "ebitda",
        "depreciation",
        "ebit_operating_profit",
        "tax_amount",
        "tax_status",
        "net_income_provisional",
        "net_income_status",
        "dividend_amount",
        "dividend_status",
        "retained_earnings_provisional",
        "data_origin",
        "import_batch_key",
    ],
    "historical_product_aliases_june_2026.csv": [
        "alias_key",
        "historical_product_key",
        "alias_name",
        "normalized_alias",
        "spelling_normalized_alias",
        "mapping_status",
        "similarity_to_latest_menu",
        "occurrence_count",
        "import_batch_key",
    ],
    "historical_product_daily_quantities_june_2026.csv": [
        "source_key",
        "sale_date",
        "historical_product_key",
        "canonical_product_name",
        "category_name",
        "quantity",
        "is_free_menu",
        "raw_variants",
        "category_raw_variants",
        "source_file",
        "source_references",
        "data_origin",
        "import_batch_key",
    ],
    "historical_products_june_2026.csv": [
        "historical_product_key",
        "canonical_name",
        "category_name",
        "mapping_status",
        "current_product_match_strategy",
        "import_batch_key",
    ],
    "purchases_june_2026.csv": [
        "line_source_key",
        "invoice_source_key",
        "purchase_date",
        "supplier_key",
        "supplier_name_raw",
        "receipt_reference",
        "item_name_raw",
        "item_name_normalized",
        "quantity",
        "unit",
        "unit_price",
        "total_amount",
        "calculated_total",
        "amount_difference",
        "source_category",
        "financial_class_final",
        "classification_policy",
        "asset_tracking",
        "source_file",
        "source_sheet",
        "source_row",
        "data_origin",
        "import_batch_key",
    ],
    "supplier_items_june_2026.csv": [
        "supplier_item_key",
        "supplier_key",
        "catalog_no",
        "item_name_raw",
        "item_name_normalized",
        "brand_raw",
        "size_raw",
        "price_raw",
        "reference_price",
        "price_parse_status",
        "financial_class_final",
        "classification_policy",
        "source_file",
        "source_sheet",
        "source_row",
        "import_batch_key",
    ],
    "suppliers_june_2026.csv": [
        "supplier_key",
        "supplier_name",
        "normalized_name",
        "phone",
        "address",
        "link",
        "contact_person",
        "source_type",
        "source_references",
        "import_batch_key",
    ],
}


def decimal(value: str, label: str) -> Decimal:
    try:
        return Decimal(value or "0")
    except InvalidOperation as exc:
        raise ValueError(f"{label}: invalid decimal {value!r}") from exc


def parse_date(value: str, label: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError(f"{label}: invalid ISO date {value!r}") from exc


def load_csv(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames:
            raise ValueError(f"{path.name}: missing header")
        rows = list(reader)
        if any(None in row for row in rows):
            raise ValueError(f"{path.name}: row has more values than headers")
        return list(reader.fieldnames), rows


def main() -> int:
    package_root = (
        Path(sys.argv[1])
        if len(sys.argv) > 1
        else Path(r"E:\lovin_milk_fase_1_8_juni_2026")
    )
    csv_root = package_root / "approved_csv"
    report_root = package_root / "reports"
    expected = json.loads(
        (report_root / "expected_metrics_june_2026.json").read_text(encoding="utf-8-sig")
    )
    errors: list[str] = []
    warnings: list[str] = []
    checks: list[dict[str, object]] = []
    observed: dict[str, object] = {"counts": {}, "totals": {}, "headers": {}}

    def check(key: str, passed: bool, actual: object, expected_value: object) -> None:
        checks.append(
            {"key": key, "passed": passed, "actual": actual, "expected": expected_value}
        )
        if not passed:
            errors.append(f"{key}: expected {expected_value!r}, got {actual!r}")

    def warn(key: str, message: str, actual: object) -> None:
        warnings.append(f"{key}: {message} (observed {actual!r})")

    actual_files = {path.name for path in csv_root.glob("*.csv")}
    check("approved_csv.file_set", actual_files == EXPECTED_FILES, sorted(actual_files), sorted(EXPECTED_FILES))
    data: dict[str, list[dict[str, str]]] = {}
    for name in sorted(EXPECTED_FILES):
        path = csv_root / name
        if not path.is_file():
            continue
        try:
            headers, rows = load_csv(path)
            observed["headers"][name] = headers
            data[name] = rows
            check(
                f"{name}.headers",
                headers == EXPECTED_HEADERS[name],
                headers,
                EXPECTED_HEADERS[name],
            )
            check(
                f"{name}.batch",
                bool(rows) and all(row.get("import_batch_key") == BATCH for row in rows),
                sorted({row.get("import_batch_key") for row in rows}),
                [BATCH],
            )
        except (OSError, UnicodeError, ValueError) as exc:
            errors.append(str(exc))

    aliases = data.get("historical_product_aliases_june_2026.csv", [])
    assets = data.get("assets_full.csv", [])
    categories = data.get("asset_categories_full.csv", [])
    coverage = data.get("data_coverage_june_2026.csv", [])
    finance = data.get("finance_summary_june_2026.csv", [])
    products = data.get("historical_products_june_2026.csv", [])
    quantities = data.get("historical_product_daily_quantities_june_2026.csv", [])
    purchases = data.get("purchases_june_2026.csv", [])
    sales = data.get("daily_sales_summaries_june_2026.csv", [])
    supplier_items = data.get("supplier_items_june_2026.csv", [])
    suppliers = data.get("suppliers_june_2026.csv", [])
    traffic = data.get("customer_traffic_daily_june_2026.csv", [])

    counts = {
        "daily_sales_summaries": len(sales),
        "historical_product_daily_quantities": len(quantities),
        "historical_products": len(products),
        "historical_product_aliases": len(aliases),
        "purchase_items": len(purchases),
        "purchase_invoices": len({row["invoice_source_key"] for row in purchases}),
        "suppliers": len(suppliers),
        "supplier_items": len(supplier_items),
        "customer_traffic_daily": len(traffic),
        "assets": len(assets),
        "asset_categories": len(categories),
    }
    observed["counts"] = counts
    for key, expected_value in expected["counts"].items():
        check(f"count.{key}", counts.get(key) == expected_value, counts.get(key), expected_value)

    totals = {
        "revenue": sum(decimal(row["total_sales"], "sales.total_sales") for row in sales),
        "bill_count": sum(decimal(row["bill_count"], "sales.bill_count") for row in sales),
        "adult_visitors": sum(decimal(row["adult_visitors"], "traffic.adult") for row in traffic),
        "child_visitors": sum(decimal(row["child_visitors"], "traffic.child") for row in traffic),
        "visitor_total": sum(decimal(row["total_visitors"], "traffic.total") for row in traffic),
        "product_quantity": sum(decimal(row["quantity"], "quantity.quantity") for row in quantities),
        "purchase_total": sum(decimal(row["total_amount"], "purchase.total") for row in purchases),
        "hpp": sum(decimal(row["total_amount"], "purchase.hpp") for row in purchases if row["financial_class_final"] == "hpp"),
        "operating_expense": sum(decimal(row["total_amount"], "purchase.opex") for row in purchases if row["financial_class_final"] == "operating_expense"),
        "asset_register_total": sum(decimal(row["acquisition_cost"], "asset.cost") for row in assets),
        "depreciation_june_2026": sum(decimal(row["monthly_depreciation"], "asset.depreciation") for row in assets),
    }
    totals["gross_profit"] = totals["revenue"] - totals["hpp"]
    totals["ebitda"] = totals["gross_profit"] - totals["operating_expense"]
    totals["ebit_operating_profit"] = totals["ebitda"] - totals["depreciation_june_2026"]
    observed["totals"] = {key: str(value) for key, value in totals.items()}
    for key, expected_value in expected["totals"].items():
        expected_decimal = decimal(str(expected_value), f"expected.{key}")
        check(f"total.{key}", totals.get(key) == expected_decimal, str(totals.get(key)), str(expected_decimal))

    june_fields = [
        ("sales.date", sales, "date"),
        ("quantity.sale_date", quantities, "sale_date"),
        ("purchases.purchase_date", purchases, "purchase_date"),
        ("traffic.traffic_date", traffic, "traffic_date"),
    ]
    for key, rows, field in june_fields:
        invalid = [row[field] for row in rows if not JUNE_START <= parse_date(row[field], key) <= JUNE_END]
        check(f"date.{key}", not invalid, invalid, "all within June 2026")
    for row in coverage:
        if row["domain"] != "assets":
            check(
                f"coverage.{row['domain']}.date",
                parse_date(row["period_start"], "coverage.start") >= JUNE_START
                and parse_date(row["period_end"], "coverage.end") <= JUNE_END,
                [row["period_start"], row["period_end"]],
                "within June 2026",
            )
    check("finance.single_row", len(finance) == 1, len(finance), 1)
    if finance:
        check("finance.period", finance[0]["period_start"] == "2026-06-01" and finance[0]["period_end"] == "2026-06-30", [finance[0]["period_start"], finance[0]["period_end"]], ["2026-06-01", "2026-06-30"])

    unique_fields = [
        ("sales.source_key", sales, "source_key"),
        ("products.historical_product_key", products, "historical_product_key"),
        ("aliases.alias_key", aliases, "alias_key"),
        ("quantities.source_key", quantities, "source_key"),
        ("purchases.line_source_key", purchases, "line_source_key"),
        ("suppliers.supplier_key", suppliers, "supplier_key"),
        ("supplier_items.supplier_item_key", supplier_items, "supplier_item_key"),
        ("traffic.source_key", traffic, "source_key"),
        ("assets.asset_source_key", assets, "asset_source_key"),
        ("assets.asset_code", assets, "asset_code"),
    ]
    for key, rows, field in unique_fields:
        blank = [index + 2 for index, row in enumerate(rows) if not row[field].strip()]
        check(f"required.{key}", not blank, blank, "no blank keys")
        duplicates = [value for value, count in Counter(row[field] for row in rows).items() if count > 1]
        check(f"unique.{key}", not duplicates, duplicates, "no duplicates")

    invoice_groups: dict[str, list[dict[str, str]]] = {}
    for row in purchases:
        invoice_groups.setdefault(row["invoice_source_key"], []).append(row)
    inconsistent_invoice_headers = []
    for invoice_key, rows in invoice_groups.items():
        header_values = {
            (
                row["purchase_date"],
                row["supplier_key"],
                row["supplier_name_raw"],
                row["receipt_reference"],
            )
            for row in rows
        }
        if len(header_values) != 1:
            inconsistent_invoice_headers.append(invoice_key)
    check(
        "purchases.invoice_header_consistency",
        not inconsistent_invoice_headers,
        inconsistent_invoice_headers,
        "one consistent header per invoice_source_key",
    )

    product_keys = {row["historical_product_key"] for row in products}
    supplier_keys = {row["supplier_key"] for row in suppliers}
    category_names = {row["category_name"] for row in categories}
    relations = {
        "aliases.product": {row["historical_product_key"] for row in aliases} - product_keys,
        "quantities.product": {row["historical_product_key"] for row in quantities} - product_keys,
        "purchases.supplier": {
            row["supplier_key"] for row in purchases if row["supplier_key"].strip()
        }
        - supplier_keys,
        "supplier_items.supplier": {row["supplier_key"] for row in supplier_items} - supplier_keys,
        "assets.category": {row["asset_category"] for row in assets} - category_names,
    }
    for key, missing in relations.items():
        check(f"relationship.{key}", not missing, sorted(missing), "no missing parents")
    blank_supplier_rows = sum(not row["supplier_key"].strip() for row in purchases)
    blank_supplier_invoices = len(
        {
            row["invoice_source_key"]
            for row in purchases
            if not row["supplier_key"].strip()
        }
    )
    if blank_supplier_rows:
        warn(
            "purchases.optional_supplier",
            "supplier source is unavailable; supplier_id must remain NULL and no dummy supplier may be created",
            {
                "rows": blank_supplier_rows,
                "invoices": blank_supplier_invoices,
            },
        )

    check("traffic.row_formula", all(decimal(row["adult_visitors"], "adult") + decimal(row["child_visitors"], "child") == decimal(row["total_visitors"], "total") for row in traffic), "evaluated", True)
    check("purchases.class", {row["financial_class_final"] for row in purchases} <= {"hpp", "operating_expense"}, sorted({row["financial_class_final"] for row in purchases}), ["hpp", "operating_expense"])
    check("purchases.nonnegative", all(decimal(row["quantity"], "quantity") > 0 and decimal(row["unit_price"], "unit_price") >= 0 and decimal(row["total_amount"], "amount") >= 0 for row in purchases), "evaluated", True)
    check("assets.tracking_only", all(row["capitalization_status"] == "tracking_only_expensed" for row in assets), sorted({row["capitalization_status"] for row in assets}), ["tracking_only_expensed"])
    check(
        "assets.valid_status",
        {row["asset_status"] for row in assets} <= {"active", "inactive", "disposed"},
        sorted({row["asset_status"] for row in assets}),
        ["active", "inactive", "disposed"],
    )
    check("assets.useful_life_positive", all(decimal(row["useful_life_months"], "useful_life") > 0 for row in assets), "evaluated", True)

    rows_with_origin = sales + traffic + quantities + purchases + assets + finance
    origins = {row["data_origin"] for row in rows_with_origin}
    check("origin.allowed", origins <= ALLOWED_ORIGINS, sorted(origins), sorted(ALLOWED_ORIGINS))
    joined = json.dumps(data, ensure_ascii=False).lower()
    check("no.synthetic_or_estimated", "synthetic" not in joined and "estimated" not in joined, "scanned", True)
    check("finance.tax_status", bool(finance) and finance[0]["tax_status"] == "not_supplied" and not finance[0]["tax_amount"], finance[0].get("tax_status") if finance else None, "not_supplied with blank amount")
    check("finance.dividend_status", bool(finance) and finance[0]["dividend_status"] == "not_supplied" and not finance[0]["dividend_amount"], finance[0].get("dividend_status") if finance else None, "not_supplied with blank amount")

    if finance:
        finance_expected = {
            "revenue": totals["revenue"],
            "hpp": totals["hpp"],
            "gross_profit": totals["gross_profit"],
            "operating_expense": totals["operating_expense"],
            "ebitda": totals["ebitda"],
            "depreciation": totals["depreciation_june_2026"],
            "ebit_operating_profit": totals["ebit_operating_profit"],
            "net_income_provisional": totals["ebit_operating_profit"],
            "retained_earnings_provisional": totals["ebit_operating_profit"],
        }
        for field, value in finance_expected.items():
            check(
                f"finance.reconciliation.{field}",
                decimal(finance[0][field], f"finance.{field}") == value,
                finance[0][field],
                str(value),
            )
        check(
            "finance.net_income_status",
            finance[0]["net_income_status"] == "provisional_before_tax",
            finance[0]["net_income_status"],
            "provisional_before_tax",
        )

    purchase_differences = [
        row
        for row in purchases
        if decimal(row["total_amount"], "purchase.total")
        != decimal(row["calculated_total"], "purchase.calculated")
    ]
    if purchase_differences:
        warn(
            "purchases.source_amount_difference",
            "source total_amount intentionally differs from quantity × unit_price; preserve total_amount and amount_difference",
            {"rows": len(purchase_differences)},
        )

    adjusted_assets = [row for row in assets if row["adjustment_note"].strip()]
    if adjusted_assets:
        warn(
            "assets.documented_source_unit_adjustment",
            "owner-delegated unit interpretation is documented in adjustment_note",
            {"rows": len(adjusted_assets)},
        )

    integer_lexeme_fields = ("bill_count", "adult_visitors", "child_visitors", "visitor_total")
    decimal_integer_lexemes = {
        field: sum(
            bool(row[field].strip()) and "." in row[field]
            for row in sales
        )
        for field in integer_lexeme_fields
    }
    if any(decimal_integer_lexemes.values()):
        warn(
            "daily_sales.integer_lexemes",
            "stage as numeric, assert integral values, then cast to integer",
            decimal_integer_lexemes,
        )

    traffic_by_date = {row["traffic_date"]: row for row in traffic}
    sales_bill_unknown = [
        row["date"]
        for row in sales
        if not row["bill_count"].strip()
        and decimal(traffic_by_date[row["date"]]["bill_count"], "traffic.bill_count")
        == 0
    ]
    if sales_bill_unknown:
        warn(
            "traffic.bill_count_null_to_zero",
            "traffic CSV records zero where daily sales source is blank; preserve approved value but treat lineage as documented limitation",
            sales_bill_unknown,
        )

    result = {
        "status": (
            "FAILED"
            if errors
            else "PASSED_WITH_DOCUMENTED_WARNINGS"
            if warnings
            else "PASSED"
        ),
        "package_root": str(package_root),
        "batch_key": BATCH,
        "observed": observed,
        "checks": checks,
        "errors": errors,
        "warnings": warnings,
    }
    report_root.mkdir(parents=True, exist_ok=True)
    (report_root / "codex_package_validation.json").write_text(
        json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    md = [
        "# Codex Package Validation",
        "",
        f"- Status: **{result['status']}**",
        f"- Batch: `{BATCH}`",
        f"- Checks: {len(checks)}",
        f"- Failed: {len(errors)}",
        f"- Documented warnings: {len(warnings)}",
        "",
        "## Counts",
        "",
        *[f"- {key}: {value}" for key, value in counts.items()],
        "",
        "## Totals",
        "",
        *[f"- {key}: {value}" for key, value in observed["totals"].items()],
        "",
        "## Errors",
        "",
        *(["- None"] if not errors else [f"- {error}" for error in errors]),
        "",
        "## Documented Warnings",
        "",
        *(["- None"] if not warnings else [f"- {warning}" for warning in warnings]),
        "",
    ]
    (report_root / "codex_package_validation.md").write_text("\n".join(md), encoding="utf-8")
    print(
        json.dumps(
            {
                "status": result["status"],
                "checks": len(checks),
                "errors": errors,
                "warnings": warnings,
            },
            indent=2,
        )
    )
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
