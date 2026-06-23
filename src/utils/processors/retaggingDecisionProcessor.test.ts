import { describe, expect, it } from "vitest";
import { processRetaggingDecisions } from "./retaggingDecisionProcessor";

const config = {
  market: "DE" as const,
  sarThreshold: 85,
  nmvThreshold: 1000,
  currentDate: new Date("2026-06-19"),
};

const inventoryRow = {
  ean: "4251812300001",
  partner_variant_size: "SKU-1",
  zalando_article_variant: "BFBTEST-Q11",
  article_name: "Test Shirt",
  season: "Spring-Summer 2025",
  status_detail: "",
  status_description: "Live",
  country: "de",
  sellable_zfs_stock: "12",
  regular_price: "100",
  discounted_price: "90",
};

const salesRow = {
  "Zalando article variant": "BFBTEST-Q11",
  Category: "Apparel",
  Season: "Spring-Summer 2025",
  Country: "DE",
  NMV: "1500",
  "Avg. size availability rate": "90%",
  "Sold articles": "30",
  "Estimated return rate": "12%",
  "Sold discount rate": "10%",
};

describe("processRetaggingDecisions", () => {
  it("matches DE sales, inventory, and Shopify stock by variant/SKU", () => {
    const result = processRetaggingDecisions({
      salesRows: [salesRow],
      inventoryRows: [inventoryRow],
      shopifyStockRows: [{ SKU: "SKU-1", Lager: "8" }],
      config,
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]["Internal Shopify stock"]).toBe(8);
    expect(result.rows[0]["YRB eligibility"]).toBe("Eligible");
    expect(result.rows[0]["Retagging score"]).toBeGreaterThan(0);
  });

  it("matches Shopify stock by EAN through the SKU/EAN mapper", () => {
    const result = processRetaggingDecisions({
      salesRows: [salesRow],
      inventoryRows: [{ ...inventoryRow, partner_variant_size: "" }],
      shopifyStockRows: [{ SKU: "SKU-1", Lager: "11" }],
      shopifySkuEanRows: [{ SKU: "SKU-1", EAN: "4251812300001" }],
      config,
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].SKU).toBe("N/A");
    expect(result.rows[0].EAN).toBe("4251812300001");
    expect(result.rows[0]["Internal Shopify stock"]).toBe(11);
  });

  it("marks eligibility as unknown when SAR is missing", () => {
    const result = processRetaggingDecisions({
      salesRows: [{ ...salesRow, "Avg. size availability rate": "" }],
      inventoryRows: [inventoryRow],
      shopifyStockRows: [],
      config,
    });

    expect(result.rows[0]["YRB eligibility"]).toBe("Unknown / missing data");
    expect(result.rows[0]["Missing data / manual review note"]).toContain("SAR");
  });

  it("marks low NMV rows as not eligible", () => {
    const result = processRetaggingDecisions({
      salesRows: [{ ...salesRow, NMV: "100" }],
      inventoryRows: [inventoryRow],
      shopifyStockRows: [],
      config,
    });

    expect(result.rows[0]["YRB eligibility"]).toBe("Not eligible");
  });

  it("sends weak old-season sales to clearance", () => {
    const result = processRetaggingDecisions({
      salesRows: [{ ...salesRow, NMV: "10", "Sold articles": "0" }],
      inventoryRows: [inventoryRow],
      shopifyStockRows: [],
      config,
    });

    expect(result.rows[0]["Suggested action"]).toBe("Clearance / phase out");
  });

  it("adds sales-only rows for manual review when inventory is missing", () => {
    const result = processRetaggingDecisions({
      salesRows: [salesRow],
      inventoryRows: [],
      shopifyStockRows: [],
      config,
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]["Suggested action"]).toBe("Manual review");
    expect(result.rows[0]["Missing data / manual review note"]).toContain("SKU");
  });
});
