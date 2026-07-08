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
        "Days online": "N/A",
        "Sales days used": 30,
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

  it("caps sales velocity denominator by Days online from Stock performance rows", () => {
    const result = processStockReturns({
      inventoryRows: [inventoryRow],
      salesRows: [{
        ...salesRow,
        EAN: "4251812300001",
        "Sold articles": "20",
        "Days online": "40",
      }],
      config: {
        ...config,
        salesHistoryDays: 180,
        forecastPeriodDays: 30,
      },
    });

    expect(result.rows[0]["Units sold in selected period"]).toBe(20);
    expect(result.rows[0]["Days online"]).toBe(40);
    expect(result.rows[0]["Sales days used"]).toBe(40);
    expect(result.rows[0]["Average daily sales"]).toBe(0.5);
    expect(result.rows[0]["Stock to keep"]).toBe(18);
    expect(result.rows[0]["Suggested return qty"]).toBe(82);
  });

  it("does not use size availability from Stock performance rows", () => {
    const result = processStockReturns({
      inventoryRows: [inventoryRow],
      salesRows: [{
        ...salesRow,
        EAN: "4251812300001",
        "Sold articles": "20",
        "Days online": "40",
        "Size availability rate (%)": "1",
      }],
      config: {
        ...config,
        salesHistoryDays: 180,
        forecastPeriodDays: 30,
      },
    });

    expect(result.rows[0]["Average daily sales"]).toBe(0.5);
    expect(result.rows[0]["Suggested return qty"]).toBe(82);
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

  it("filters inventory rows to DE while aggregating stock performance sales globally", () => {
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
    expect(result.rows[0]["Units sold in selected period"]).toBe(120);
  });

  it("sums Stock performance sold units across countries for the same EAN", () => {
    const result = processStockReturns({
      inventoryRows: [{
        ...inventoryRow,
        ean: "4251812305975",
        zalando_article_variant: "BFB52P010-Q11",
        partner_variant_size: "BS-CAP-054",
      }],
      salesRows: [
        {
          "Zalando article variant": "BFB52P010-Q11",
          EAN: "4251812305975",
          Country: "DE",
          "Sold articles": "4",
          "Days online": "1293",
        },
        {
          "Zalando article variant": "BFB52P010-Q11",
          EAN: "4251812305975",
          Country: "FR",
          "Sold articles": "7",
          "Days online": "1293",
        },
      ],
      config: {
        ...config,
        salesHistoryDays: 180,
      },
    });

    expect(result.rows[0]["Units sold in selected period"]).toBe(11);
    expect(result.rows[0]["Sales days used"]).toBe(180);
    expect(result.rows[0]["Stock to keep"]).toBe(3);
    expect(result.rows[0]["Suggested return qty"]).toBe(97);
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

  it("accepts zDirect Stock performance rows as a ZFS stock source", () => {
    const result = processStockReturns({
      inventoryRows: [{
        "Article variant": "BS-PRO-P-1_light blue",
        "Zalando article variant": "BFB52B00H-K11",
        "Variant size": "BS-PRO-015",
        EAN: "4251812347098",
        Country: "DE",
        "Fulfilled by": "ZFS and partner",
        "Offerable ZFS stock": "79",
        "Article type": "Headgear",
      }],
      salesRows: [{
        "Zalando article variant": "BFB52B00H-K11",
        EAN: "4251812347098",
        Country: "DE",
        "Sold articles": "1",
        "Days online": "27",
      }],
      config: {
        ...config,
        salesHistoryDays: 180,
      },
    });

    expect(result.rows[0].SKU).toBe("BS-PRO-015");
    expect(result.rows[0]["Article name"]).toBe("Headgear");
    expect(result.rows[0]["Current ZFS stock"]).toBe(79);
    expect(result.rows[0]["Sales days used"]).toBe(27);
  });
});
