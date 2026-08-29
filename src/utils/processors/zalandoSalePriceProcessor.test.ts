import { describe, expect, it } from "vitest";
import {
  parseZalandoPrice,
  processZalandoSalePrices,
} from "./zalandoSalePriceProcessor";

describe("processZalandoSalePrices", () => {
  it("processes the client example and calculates 33,99 as 27.19", () => {
    const result = processZalandoSalePrices([{
      status_detail: "ZABLO_01",
      partner_variant_size: "AK-R-PUR-03-11",
      ean: "4251812338836",
      article_name: "Purple article",
      regular_price: "33,99",
      currency: "EUR",
    }]);

    expect(result.rows).toEqual([expect.objectContaining({
      sourceRowNumber: 1,
      sourceRowId: "zablo-sale-price-row-1",
      status: "ready",
      sku: "AK-R-PUR-03-11",
      ean: "4251812338836",
      articleName: "Purple article",
      currency: "EUR",
      regularPrice: 33.99,
      salePrice: 27.19,
    })]);
    expect(result.summary).toMatchObject({ totalRows: 1, readyRows: 1, invalidRows: 0, skippedRows: 0 });
  });

  it("prepares rows whose status list contains ZABLO_01, case-insensitively", () => {
    const result = processZalandoSalePrices([
      { status_detail: " zablo_01 ", partner_variant_size: "ready-sku", regular_price: "20" },
      { status_detail: "ZABLO_02", partner_variant_size: "skipped-sku", regular_price: "10" },
      {
        status_detail: "ZABLO_15, ZABLO_01, ZANOS_01",
        partner_variant_size: "combined-status",
        regular_price: "20",
      },
    ]);

    expect(result.rows.map((row) => row.status)).toEqual([
      "ready",
      "skipped_non_zablo_01",
      "ready",
    ]);
    expect(result.rows[1].salePrice).toBeNull();
    expect(result.summary).toMatchObject({ readyRows: 2, skippedRows: 1, skippedNonZablo01Rows: 1 });
  });

  it("reports ZABLO_01 rows that lack both Shopify identifiers", () => {
    const result = processZalandoSalePrices([{
      status_detail: "ZABLO_01",
      partner_variant_size: " ",
      ean: "",
      regular_price: "20,00",
    }]);

    expect(result.rows[0]).toMatchObject({
      status: "error_missing_identifier",
      regularPrice: 20,
      salePrice: null,
    });
    expect(result.summary).toMatchObject({ invalidRows: 1, missingIdentifierRows: 1 });
  });

  it("reports missing and invalid regular prices", () => {
    const result = processZalandoSalePrices([
      { status_detail: "ZABLO_01", sku: "missing-price", regular_price: "" },
      { status_detail: "ZABLO_01", sku: "bad-price", regular_price: "not a price" },
      { status_detail: "ZABLO_01", sku: "zero-price", regular_price: "0" },
    ]);

    expect(result.rows.map((row) => row.status)).toEqual([
      "error_missing_regular_price",
      "error_invalid_regular_price",
      "error_invalid_regular_price",
    ]);
    expect(result.summary).toMatchObject({
      invalidRows: 3,
      missingRegularPriceRows: 1,
      invalidRegularPriceRows: 2,
    });
  });

  it("rounds calculated sale prices and applies the €15.00 minimum with a warning", () => {
    const result = processZalandoSalePrices([{
      status_detail: "ZABLO_01",
      sku: "ROUND-1",
      regular_price: "12.57",
    }]);

    expect(result.rows[0]).toMatchObject({
      regularPrice: 12.57,
      salePrice: 15,
      minimumPriceApplied: true,
      message: expect.stringContaining("€15.00 minimum"),
    });
    expect(result.summary.minimumPriceAppliedRows).toBe(1);
    expect(result.warnings).toContain(
      "1 row(s) were raised to the minimum Zalando sale price of €15.00."
    );
  });

  it("supports common aliases, prioritizes partner_variant_size, and normalizes identifiers", () => {
    const result = processZalandoSalePrices([{
      "Status Code": "ZABLO_01",
      "Partner Variant Size": " ak-r-pur-03-11 ",
      "Seller SKU": "SHOULD-NOT-WIN",
      GTIN: " 4251812338836 ",
      "Product Name": "Purple article",
      "Retail Price": "€1.234,56",
      "Currency Code": "eur",
    }]);

    expect(result.rows[0]).toMatchObject({
      status: "ready",
      sku: "AK-R-PUR-03-11",
      ean: "4251812338836",
      articleName: "Purple article",
      regularPrice: 1234.56,
      salePrice: 987.65,
      currency: "EUR",
    });
  });

  it("parses European and dot-decimal prices", () => {
    expect(parseZalandoPrice("33,99")).toBe(33.99);
    expect(parseZalandoPrice("1.234,56")).toBe(1234.56);
    expect(parseZalandoPrice("1,234.56")).toBe(1234.56);
    expect(parseZalandoPrice("33.99")).toBe(33.99);
  });
});
