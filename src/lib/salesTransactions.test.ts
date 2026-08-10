import { describe, expect, it } from "vitest";

import {
  MAX_SALES_TRANSACTION_ITEMS,
  buildCreateTransactionPayload,
  buildUpdateTransactionPayload,
  calculateLineSubtotal,
  calculateTotalQuantity,
  calculateTransactionTotal,
  formatTransactionNumber,
  summarizeSubunits,
  type SalesTransactionFormItem,
} from "@/lib/salesTransactions";

const lovinProductId = "ac37da46-d438-06b6-1eaa-bff264f0bdd6";
const arayyaProductId = "a0adcd51-e6cd-432e-b853-c9dd42bb2668";

const transactionId = "11111111-2222-3333-4444-555555555555";
const outletId = "861dc371-5f4d-433f-a4a4-c2588b7c944f";

const mixedItems: SalesTransactionFormItem[] = [
  {
    productId: lovinProductId,
    quantity: 2,
    unitPrice: 17_000,
    notes: "Lovin item",
  },
  {
    productId: arayyaProductId,
    quantity: 1,
    unitPrice: 15_000,
    notes: "Arayya item",
  },
];

describe("sales transaction calculations", () => {
  it("menghitung subtotal satu item", () => {
    expect(
      calculateLineSubtotal({
        quantity: 2,
        unitPrice: 17_000,
      }),
    ).toBe(34_000);
  });

  it("menghitung total mixed transaction berdasarkan subtotal setiap item", () => {
    expect(calculateTransactionTotal(mixedItems)).toBe(49_000);
  });

  it("mendukung quantity desimal dan membulatkan agregat quantity dua desimal", () => {
    expect(
      calculateTotalQuantity([
        { quantity: 1.25 },
        { quantity: 0.75 },
        { quantity: 2 },
      ]),
    ).toBe(4);

    expect(
      calculateLineSubtotal({
        quantity: 1.5,
        unitPrice: 10_000,
      }),
    ).toBe(15_000);
  });

  it("membulatkan setiap subtotal sebelum menghitung total seperti database", () => {
    expect(
      calculateTransactionTotal([
        {
          quantity: 1,
          unitPrice: 10.005,
        },
        {
          quantity: 1,
          unitPrice: 10.005,
        },
      ]),
    ).toBe(20.02);
  });
});

describe("sales transaction Subunit summary", () => {
  it("menghilangkan duplikasi Subunit dan mempertahankan urutan pertama", () => {
    expect(
      summarizeSubunits([
        {
          subunitId: "lovin",
          subunitNameSnapshot: "Lovin Milk",
        },
        {
          subunitId: "lovin",
          subunitNameSnapshot: "Lovin Milk",
        },
        {
          subunitId: "arayya",
          subunitNameSnapshot: "Arayya",
        },
      ]),
    ).toBe("Lovin Milk + Arayya");
  });

  it("mengembalikan placeholder ketika tidak ada Subunit", () => {
    expect(summarizeSubunits([])).toBe("—");
  });
});

describe("sales transaction payload", () => {
  it("membuat payload CREATE mixed Subunit tanpa mempercayai category atau Subunit dari frontend", () => {
    expect(
      buildCreateTransactionPayload({
        transactionDate: "2026-07-28",
        outletId,
        notes: "  Transaksi Lovin + Arayya  ",
        items: mixedItems,
      }),
    ).toEqual({
      p_transaction_date: "2026-07-28",
      p_items: [
        {
          product_id: lovinProductId,
          quantity: 2,
          unit_price: 17_000,
          notes: "Lovin item",
        },
        {
          product_id: arayyaProductId,
          quantity: 1,
          unit_price: 15_000,
          notes: "Arayya item",
        },
      ],
      p_notes: "Transaksi Lovin + Arayya",
      p_entry_source: "manual",
      p_outlet_id: outletId,
      p_existing_visit_id: null,
      p_new_visit: null,
    });
  });

  it("membuat payload UPDATE tanpa mengirim Outlet atau transaction number", () => {
    expect(
      buildUpdateTransactionPayload({
        transactionId,
        transactionDate: "2026-07-27",
        notes: "   ",
        items: [
          {
            productId: arayyaProductId,
            quantity: 2,
            unitPrice: 15_000,
          },
        ],
      }),
    ).toEqual({
      p_transaction_id: transactionId,
      p_transaction_date: "2026-07-27",
      p_items: [
        {
          product_id: arayyaProductId,
          quantity: 2,
          unit_price: 15_000,
          notes: null,
        },
      ],
      p_notes: null,
      p_existing_visit_id: null,
      p_new_visit: null,
    });
  });

  it("menerima canonical PostgreSQL UUID tanpa memaksa UUID version tertentu dan menerima harga nol", () => {
    expect(
      buildCreateTransactionPayload({
        transactionDate: "2026-07-28",
        items: [
          {
            productId: "AC37DA46-D438-06B6-1EAA-BFF264F0BDD6",
            quantity: 1,
            unitPrice: 0,
          },
        ],
      }),
    ).toEqual({
      p_transaction_date: "2026-07-28",
      p_items: [
        {
          product_id: lovinProductId,
          quantity: 1,
          unit_price: 0,
          notes: null,
        },
      ],
      p_notes: null,
      p_entry_source: "manual",
      p_outlet_id: null,
      p_existing_visit_id: null,
      p_new_visit: null,
    });
  });

  it("membangun pilihan kunjungan existing secara eksklusif", () => {
    expect(
      buildCreateTransactionPayload({
        transactionDate: "2026-08-02",
        items: mixedItems,
        visit: { mode: "existing", existingVisitId: transactionId },
      }),
    ).toMatchObject({
      p_existing_visit_id: transactionId,
      p_new_visit: null,
    });
  });

  it("memvalidasi jumlah orang pada kunjungan baru", () => {
    expect(() =>
      buildCreateTransactionPayload({
        transactionDate: "2026-08-02",
        items: mixedItems,
        visit: {
          mode: "new",
          newVisit: { visitorId: null, adultCount: 0, childCount: 0, notes: null },
        },
      }),
    ).toThrow("Jumlah pengunjung minimal satu orang.");

    expect(
      buildCreateTransactionPayload({
        transactionDate: "2026-08-02",
        items: mixedItems,
        visit: {
          mode: "new",
          newVisit: { visitorId: null, adultCount: 2, childCount: 1, notes: " Grup " },
        },
      }),
    ).toMatchObject({
      p_existing_visit_id: null,
      p_new_visit: {
        visitor_id: null,
        adult_count: 2,
        child_count: 1,
        notes: "Grup",
      },
    });
  });

  it("menolak payload kosong, quantity tidak valid, harga negatif, dan cart lebih dari 200 item", () => {
    expect(() =>
      buildCreateTransactionPayload({
        transactionDate: "2026-07-28",
        items: [],
      }),
    ).toThrow("Transaksi wajib memiliki minimal satu item.");

    expect(() =>
      buildCreateTransactionPayload({
        transactionDate: "2026-07-28",
        items: [
          {
            productId: lovinProductId,
            quantity: 0,
            unitPrice: 17_000,
          },
        ],
      }),
    ).toThrow("Jumlah pada baris 1 harus lebih dari 0.");

    expect(() =>
      buildCreateTransactionPayload({
        transactionDate: "2026-07-28",
        items: [
          {
            productId: lovinProductId,
            quantity: 1,
            unitPrice: -1,
          },
        ],
      }),
    ).toThrow("Harga satuan pada baris 1 tidak boleh negatif.");

    expect(() =>
      buildCreateTransactionPayload({
        transactionDate: "2026-07-28",
        items: Array.from(
          {
            length: MAX_SALES_TRANSACTION_ITEMS + 1,
          },
          () => ({
            productId: lovinProductId,
            quantity: 1,
            unitPrice: 17_000,
          }),
        ),
      }),
    ).toThrow(`Satu transaksi maksimal memiliki ${MAX_SALES_TRANSACTION_ITEMS} baris item.`);
  });
});

describe("sales transaction display helpers", () => {
  it("menampilkan nomor transaksi dari database tanpa membuat nomor baru di frontend", () => {
    expect(formatTransactionNumber("  TRX-0000000012  ")).toBe("TRX-0000000012");
    expect(formatTransactionNumber(null)).toBe("—");
    expect(formatTransactionNumber("")).toBe("—");
  });
});
