import { describe, expect, it } from "vitest";

import { parseVisitPage } from "@/lib/visitor";

describe("visitor Sales integration parser", () => {
  it("keeps linked Sales and legacy manual purchase as separate values", () => {
    const result = parseVisitPage({
      rows: [
        {
          id: "visit-1",
          visitor_id: null,
          visitor_code: "TAMU-UMUM",
          full_name: "Tamu Umum",
          phone: null,
          visit_date: "2026-08-02",
          check_in_at: "2026-08-02T05:00:00Z",
          check_out_at: null,
          notes: null,
          outlet_id: "outlet-1",
          adult_count: 2,
          child_count: 1,
          total_visitors: 3,
          record_source: "operational",
          active_transaction_count: 2,
          active_purchase_total: 105000,
          archived_transaction_count: 1,
          linked_transactions: [
            {
              transaction_id: "sale-1",
              transaction_number: "TRX-001",
              transaction_date: "2026-08-02",
              total_amount: 80000,
              deleted_at: null,
            },
          ],
          legacy_manual_purchase_amount: 80000,
          legacy_manual_quantity: 2,
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
    });

    expect(result.rows[0]).toMatchObject({
      total_visitors: 3,
      active_transaction_count: 2,
      active_purchase_total: 105000,
      legacy_manual_purchase_amount: 80000,
    });
    expect(result.rows[0].active_purchase_total).not.toBe(
      result.rows[0].active_purchase_total +
        (result.rows[0].legacy_manual_purchase_amount ?? 0),
    );
  });

  it("preserves unavailable legacy values as null", () => {
    const result = parseVisitPage({
      rows: [
        {
          id: "visit-legacy",
          visitor_code: "PG-000001",
          full_name: "Pengunjung Lama",
          visit_date: "2026-07-01",
          check_in_at: "2026-07-01T05:00:00Z",
          record_source: "legacy_manual",
          adult_count: null,
          child_count: null,
          total_visitors: null,
          legacy_manual_purchase_amount: null,
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
    });

    expect(result.rows[0].total_visitors).toBeNull();
    expect(result.rows[0].legacy_manual_purchase_amount).toBeNull();
  });
});
