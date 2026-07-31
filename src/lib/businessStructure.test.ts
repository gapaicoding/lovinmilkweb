import { describe, expect, it } from "vitest";

import {
  generateBusinessCode,
  getActiveSubunits,
  getInventoryStatusLabel,
  getSubunitDisplayLabel,
  sortSubunitsByName,
} from "@/lib/businessStructure";

describe("businessStructure", () => {
  it("menghasilkan kode subunit yang stabil", () => {
    expect(generateBusinessCode("Lovin Milk")).toBe("LOVIN_MILK");
    expect(generateBusinessCode("Arayya")).toBe("ARAYYA");
    expect(generateBusinessCode("Play Zone")).toBe("PLAY_ZONE");
  });

  it("menghilangkan karakter tidak relevan dari kode", () => {
    expect(generateBusinessCode("  Arayya Space!!!  ")).toBe(
      "ARAYYA_SPACE",
    );
  });

  it("hanya mengambil subunit aktif dan tidak terhapus", () => {
    const rows = [
      {
        id: "1",
        outlet_id: "o1",
        code: "LOVIN_MILK",
        name: "Lovin Milk",
        inventory_enabled: false,
        is_active: true,
        deleted_at: null,
      },
      {
        id: "2",
        outlet_id: "o1",
        code: "ARAYYA",
        name: "Arayya",
        inventory_enabled: true,
        is_active: false,
        deleted_at: null,
      },
      {
        id: "3",
        outlet_id: "o1",
        code: "OLD",
        name: "Old",
        inventory_enabled: false,
        is_active: true,
        deleted_at: "2026-07-27T00:00:00Z",
      },
    ];

    expect(getActiveSubunits(rows)).toHaveLength(1);
    expect(getActiveSubunits(rows)[0]?.code).toBe("LOVIN_MILK");
  });

  it("mengurutkan subunit berdasarkan nama", () => {
    const rows = [
      {
        id: "1",
        outlet_id: "o1",
        code: "LOVIN_MILK",
        name: "Lovin Milk",
        inventory_enabled: false,
        is_active: true,
      },
      {
        id: "2",
        outlet_id: "o1",
        code: "ARAYYA",
        name: "Arayya",
        inventory_enabled: true,
        is_active: true,
      },
    ];

    expect(sortSubunitsByName(rows).map((row) => row.name)).toEqual([
      "Arayya",
      "Lovin Milk",
    ]);
  });

  it("memberikan label inventory yang benar", () => {
    expect(getInventoryStatusLabel(true)).toBe("Aktif");
    expect(getInventoryStatusLabel(false)).toBe("Tidak Aktif");
  });

  it("memberikan fallback nama subunit", () => {
    expect(getSubunitDisplayLabel({ name: "Arayya" })).toBe("Arayya");
    expect(getSubunitDisplayLabel(null)).toBe(
      "Subunit tidak tersedia",
    );
  });
});