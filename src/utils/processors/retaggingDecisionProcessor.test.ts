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
      salesRows: [],
      salesArticleLevelRows: [salesRow],
      inventoryRows: [inventoryRow],
      shopifyStockRows: [{ SKU: "SKU-1", Lager: "8" }],
      config,
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]["Internal Shopify stock"]).toBe(8);
    expect(result.rows[0]["Zalando SKU"]).toBe("BFBTEST-Q11");
    expect(result.rows[0]["Basic Retagging Eligible"]).toBe("Yes");
    expect(result.rows[0]["Season recommendation"]).toBe("Basic retagging eligible - choose department manually");
    expect(result.rows[0]["Retagging score"]).toBeGreaterThan(0);
  });

  it("matches Shopify stock by EAN through the SKU/EAN mapper", () => {
    const result = processRetaggingDecisions({
      salesRows: [],
      salesArticleLevelRows: [salesRow],
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
      salesRows: [],
      salesArticleLevelRows: [{ ...salesRow, "Avg. size availability rate": "" }],
      inventoryRows: [inventoryRow],
      shopifyStockRows: [],
      config,
    });

    expect(result.rows[0]["Basic Retagging Eligible"]).toBe("No");
    expect(result.rows[0]["Missing data / manual review note"]).toContain("SAR");
  });

  it("marks low NMV rows as not eligible", () => {
    const result = processRetaggingDecisions({
      salesRows: [],
      salesArticleLevelRows: [{ ...salesRow, NMV: "100" }],
      inventoryRows: [inventoryRow],
      shopifyStockRows: [],
      config,
    });

    expect(result.rows[0]["Basic Retagging Eligible"]).toBe("No");
  });

  it("recommends no action for articles already classified as basics", () => {
    const result = processRetaggingDecisions({
      salesRows: [],
      salesArticleLevelRows: [salesRow],
      inventoryRows: [{ ...inventoryRow, season: "spring_summer_basics" }],
      shopifyStockRows: [{ SKU: "SKU-1", Lager: "8" }],
      config,
    });

    expect(result.rows[0]["Season recommendation"]).toBe("Already Basic / no action required");
    expect(result.rows[0]["Suggested action"]).toBe("Already Basic / no action required");
  });

  it("does not hide blocking issues behind an already-basic recommendation", () => {
    const result = processRetaggingDecisions({
      salesRows: [],
      salesArticleLevelRows: [salesRow],
      inventoryRows: [{
        ...inventoryRow,
        season: "year_round_basics",
        status_description: "Blocked",
        status_detail: "ZANOS_01",
      }],
      shopifyStockRows: [{ SKU: "SKU-1", Lager: "8" }],
      config,
    });

    expect(result.rows[0]["Season recommendation"]).toBe("Manual review");
    expect(result.rows[0]["Operational note"]).toContain("Blocking issue code");
  });

  it("keeps replenishment as an operational note instead of the season recommendation", () => {
    const result = processRetaggingDecisions({
      salesRows: [],
      salesArticleLevelRows: [salesRow],
      inventoryRows: [{ ...inventoryRow, sellable_zfs_stock: "0" }],
      shopifyStockRows: [{ SKU: "SKU-1", Lager: "8" }],
      config,
    });

    expect(result.rows[0]["Season recommendation"]).not.toBe("Manual review");
    expect(result.rows[0]["Season recommendation"]).not.toBe("Replenish ZFS first");
    expect(result.rows[0]["Operational note"]).toContain("Replenish ZFS first");
  });

  it("retags below-threshold NMV articles when the data is otherwise usable", () => {
    const result = processRetaggingDecisions({
      salesRows: [],
      salesArticleLevelRows: [{ ...salesRow, NMV: "100", "Sold articles": "4" }],
      inventoryRows: [{ ...inventoryRow, season: "FS_26" }],
      shopifyStockRows: [{ SKU: "SKU-1", Lager: "8" }],
      config,
    });

    expect(result.rows[0]["Basic Retagging Eligible"]).toBe("No");
    expect(result.rows[0]["Season recommendation"]).toBe("Retag to next season");
  });

  it("does not suggest discount action when the required old-season discount is already met", () => {
    const result = processRetaggingDecisions({
      salesRows: [],
      salesArticleLevelRows: [{ ...salesRow, NMV: "700", "Sold articles": "10" }],
      inventoryRows: [{ ...inventoryRow, season: "Spring-Summer 2025", regular_price: "100", discounted_price: "70" }],
      shopifyStockRows: [{ SKU: "SKU-1", Lager: "8" }],
      config: { ...config, currentSeasonCode: "FS_26", requiredDiscountThreshold: 20 },
    });

    expect(result.rows[0]["Season recommendation"]).toBe("Retag to next season");
    expect(result.rows[0]["Operational note"]).toContain("Already discounted / no discount action required");
    expect(result.rows[0]["Operational note"]).not.toContain("Discount required");
  });

  it("uses article-level sales metrics even when detail-breakdown has zero sales", () => {
    const result = processRetaggingDecisions({
      salesRows: [
        { ...salesRow, Country: "DE", NMV: "0", "Sold articles": "0", "Avg. size availability rate": "47.8%" },
      ],
      salesArticleLevelRows: [
        { ...salesRow, Country: "", NMV: "53.21", "Sold articles": "2", "Avg. size availability rate": "29.8%" },
      ],
      inventoryRows: [inventoryRow],
      shopifyStockRows: [{ SKU: "SKU-1", Lager: "8" }],
      config,
    });

    expect(result.rows[0]["Size Availability Rate / SAR"]).toBe(29.8);
    expect(result.rows[0]["NMV used as GMV proxy"]).toBe(53.21);
    expect(result.rows[0]["Units sold selected period"]).toBe(2);
  });

  it("does not send weak old-season sales to clearance when the article can still be retagged", () => {
    const result = processRetaggingDecisions({
      salesRows: [],
      salesArticleLevelRows: [{ ...salesRow, NMV: "10", "Sold articles": "0" }],
      inventoryRows: [inventoryRow],
      shopifyStockRows: [],
      config,
    });

    expect(result.rows[0]["Suggested action"]).toBe("Retag to next season");
  });

  it("uses clearance only for a clear no-stock blocked case", () => {
    const result = processRetaggingDecisions({
      salesRows: [],
      salesArticleLevelRows: [{ ...salesRow, NMV: "10", "Sold articles": "0" }],
      inventoryRows: [{
        ...inventoryRow,
        status_description: "Blocked",
        status_detail: "ZANOS_01",
        sellable_zfs_stock: "0",
      }],
      shopifyStockRows: [],
      config,
    });

    expect(result.rows[0]["Suggested action"]).toBe("Clearance / phase out");
  });

  it("adds sales-only rows for manual review when inventory is missing", () => {
    const result = processRetaggingDecisions({
      salesRows: [],
      salesArticleLevelRows: [salesRow],
      inventoryRows: [],
      shopifyStockRows: [],
      config,
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]["Suggested action"]).toBe("Manual review");
    expect(result.rows[0]["Missing data / manual review note"]).toContain("SKU");
  });
});
