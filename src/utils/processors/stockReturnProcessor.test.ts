import { describe, expect, it } from "vitest";
import { processStockReturns } from "./stockReturnProcessor";

const config = {
  market: "DE" as const,
  salesHistoryDays: 30,
  forecastPeriodDays: 30,
  safetyBufferPercent: 20,
  storageFeePerUnitPerDay: 0.0128,
};

const inventoryRow = {
  ean: "4251812300001",
  partner_variant_size: "SKU-1",
  zalando_article_variant: "BFBTEST-Q11",
  article_name: "Test Cap",
  country: "de",
  sellable_zfs_stock: "100",
};

const salesRow = {
  "Zalando article variant": "BFBTEST-Q11",
  Country: "DE",
  "Sold articles": "20",
};

describe("processStockReturns", () => {
  it("calculates suggested return quantity and estimated savings", () => {
    const result = processStockReturns({
      inventoryRows: [inventoryRow],
      salesRows: [salesRow],
      config,
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]["Current ZFS stock"]).toBe(100);
    expect(result.rows[0]["Units sold in selected period"]).toBe(20);
    expect(result.rows[0]["Stock to keep"]).toBe(24);
    expect(result.rows[0]["Suggested return qty"]).toBe(76);
    expect(result.rows[0]["Estimated savings"]).toBe(29.18);
    expect(result.exportRows).toEqual([
      {
        EAN: "4251812300001",
        SKU: "SKU-1",
        "Article name": "Test Cap",
        "Current ZFS stock": 100,
        "Units sold in selected period": 20,
        "Stock to keep": 24,
        "Estimated savings": 29.18,
        "return qty": 76,
      },
    ]);
  });

  it("uses sales history days separately from forecast period", () => {
    const result = processStockReturns({
      inventoryRows: [inventoryRow],
      salesRows: [{ ...salesRow, "Sold articles": "90" }],
      config: {
        ...config,
        salesHistoryDays: 90,
        forecastPeriodDays: 30,
      },
    });

    expect(result.rows[0]["Average daily sales"]).toBe(1);
    expect(result.rows[0]["Stock to keep"]).toBe(36);
    expect(result.rows[0]["Suggested return qty"]).toBe(64);
  });

  it("allocates article-level demand across EAN rows by stock share", () => {
    const result = processStockReturns({
      inventoryRows: [
        { ...inventoryRow, ean: "EAN-1", sellable_zfs_stock: "70" },
        { ...inventoryRow, ean: "EAN-2", sellable_zfs_stock: "30" },
      ],
      salesRows: [salesRow],
      config,
    });

    const first = result.rows.find((row) => row.EAN === "EAN-1");
    const second = result.rows.find((row) => row.EAN === "EAN-2");

    expect(first?.["Stock to keep"]).toBe(17);
    expect(second?.["Stock to keep"]).toBe(7);
    expect(first?.["Suggested return qty"]).toBe(53);
    expect(second?.["Suggested return qty"]).toBe(23);
  });

  it("does not suggest returns when stock is within buffered demand", () => {
    const result = processStockReturns({
      inventoryRows: [{ ...inventoryRow, sellable_zfs_stock: "20" }],
      salesRows: [salesRow],
      config,
    });

    expect(result.rows[0]["Suggested return qty"]).toBe(0);
    expect(result.exportRows).toEqual([]);
  });

  it("filters inventory and detail sales rows to DE", () => {
    const result = processStockReturns({
      inventoryRows: [
        inventoryRow,
        { ...inventoryRow, ean: "4251812300002", country: "pl", sellable_zfs_stock: "100" },
      ],
      salesRows: [
        salesRow,
        { ...salesRow, Country: "PL", "Sold articles": "100" },
      ],
      config,
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].EAN).toBe("4251812300001");
    expect(result.rows[0]["Units sold in selected period"]).toBe(20);
  });

  it("uses global article-level sales rows when no country column is present", () => {
    const result = processStockReturns({
      inventoryRows: [inventoryRow],
      salesRows: [{ ...salesRow, Country: undefined, "Sold articles": "10" }],
      config,
    });

    expect(result.rows[0]["Units sold in selected period"]).toBe(10);
    expect(result.rows[0]["Stock to keep"]).toBe(12);
    expect(result.rows[0]["Suggested return qty"]).toBe(88);
  });

  it("uses Shopify SKU and article name when the EAN mapper matches", () => {
    const result = processStockReturns({
      inventoryRows: [inventoryRow],
      salesRows: [salesRow],
      shopifyStockRows: [{ SKU: "BS-CAP-203", Title: "Shopify Cap Name", Lager: "12" }],
      shopifySkuEanRows: [{ SKU: "BS-CAP-203", EAN: "4251812300001" }],
      config,
    });

    expect(result.rows[0].SKU).toBe("BS-CAP-203");
    expect(result.rows[0]["Article name"]).toBe("Shopify Cap Name");
    expect(result.rows[0]["Zalando article variant"]).toBe("BFBTEST-Q11");
    expect(result.exportRows[0].SKU).toBe("BS-CAP-203");
    expect(result.exportRows[0]["Article name"]).toBe("Shopify Cap Name");
  });
});
