import { describe, expect, it } from "vitest";
import {
  calculateZalandoSalePrice,
  parseZalandoPrice,
  processZalandoSalePrices,
} from "./zalandoSalePriceProcessor";

describe("processZalandoSalePrices", () => {
  it("uses the 10% default discount for the client example", () => {
    const result = processZalandoSalePrices([{
      status_detail: "ZABLO_646",
      partner_variant_size: "AK-R-PUR-03-11",
      ean: "4251812338836",
      article_name: "Purple article",
      regular_price: "33,99",
      country: "de",
      currency: "EUR",
    }]);

    expect(result.rows).toEqual([expect.objectContaining({
      sourceRowNumber: 1,
      sourceRowId: "zablo-sale-price-row-1",
      status: "ready",
      sku: "AK-R-PUR-03-11",
      ean: "4251812338836",
      articleName: "Purple article",
      country: "DE",
      currency: "EUR",
      regularPrice: 33.99,
      salePrice: 30.59,
    })]);
    expect(result).toMatchObject({
      discountPercentage: 10,
      summary: { totalRows: 1, readyRows: 1, invalidRows: 0, skippedRows: 0 },
    });
  });

  it("supports a custom discount and rounds before applying the €15.00 floor", () => {
    const row = {
      status_detail: "ZABLO_646",
      sku: "CUSTOM-DISCOUNT",
      regular_price: "33,99",
      country: "de",
      currency: "EUR",
    };

    expect(calculateZalandoSalePrice(33.99)).toBe(30.59);
    expect(calculateZalandoSalePrice(33.99, 25)).toBe(25.49);
    expect(calculateZalandoSalePrice(20, 100)).toBe(15);
    expect(processZalandoSalePrices([row], 25)).toMatchObject({
      discountPercentage: 25,
      rows: [expect.objectContaining({ salePrice: 25.49, minimumPriceApplied: false })],
    });
    expect(processZalandoSalePrices([{ ...row, regular_price: "18" }], 25)).toMatchObject({
      rows: [expect.objectContaining({ salePrice: 15, minimumPriceApplied: true })],
      summary: { minimumPriceAppliedRows: 1 },
    });
  });

  it("rejects discounts outside the allowed 10% to 100% range", () => {
    const row = {
      status_detail: "ZABLO_646",
      sku: "INVALID-DISCOUNT",
      regular_price: "33,99",
      country: "de",
      currency: "EUR",
    };

    expect(() => calculateZalandoSalePrice(33.99, 9)).toThrow(RangeError);
    expect(() => calculateZalandoSalePrice(33.99, 101)).toThrow(RangeError);
    expect(() => processZalandoSalePrices([row], 9)).toThrow(RangeError);
    expect(() => processZalandoSalePrices([row], 101)).toThrow(RangeError);
  });

  it("prepares German EUR rows whose status list contains ZABLO_646", () => {
    const result = processZalandoSalePrices([
      { status_detail: " zablo_646 ", partner_variant_size: "ready-sku", regular_price: "20", country: "de", currency: "eur" },
      { status_detail: "ZABLO_02", partner_variant_size: "skipped-sku", regular_price: "10", country: "de", currency: "EUR" },
      {
        status_detail: "ZABLO_564, ZABLO_646, ZANOS_01",
        partner_variant_size: "combined-status",
        regular_price: "20",
        country: "de",
        currency: "EUR",
      },
    ]);

    expect(result.rows.map((row) => row.status)).toEqual([
      "ready",
      "outside_target_status",
      "ready",
    ]);
    expect(result.rows[1].salePrice).toBeNull();
    expect(result.summary).toMatchObject({ readyRows: 2, skippedRows: 1, outsideTargetStatusRows: 1 });
  });

  it("reports target rows that lack both Shopify identifiers", () => {
    const result = processZalandoSalePrices([{
      status_detail: "ZABLO_646",
      partner_variant_size: " ",
      ean: "",
      regular_price: "20,00",
      country: "de",
      currency: "EUR",
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
      { status_detail: "ZABLO_646", sku: "missing-price", regular_price: "", country: "de", currency: "EUR" },
      { status_detail: "ZABLO_646", sku: "bad-price", regular_price: "not a price", country: "de", currency: "EUR" },
      { status_detail: "ZABLO_646", sku: "zero-price", regular_price: "0", country: "de", currency: "EUR" },
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
      status_detail: "ZABLO_646",
      sku: "ROUND-1",
      regular_price: "12.57",
      country: "de",
      currency: "EUR",
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
      "Status Code": "ZABLO_646",
      "Partner Variant Size": " ak-r-pur-03-11 ",
      "Seller SKU": "SHOULD-NOT-WIN",
      GTIN: " 4251812338836 ",
      "Product Name": "Purple article",
      "Retail Price": "€1.234,56",
      "Country Code": "de",
      "Currency Code": "eur",
    }]);

    expect(result.rows[0]).toMatchObject({
      status: "ready",
      sku: "AK-R-PUR-03-11",
      ean: "4251812338836",
      articleName: "Purple article",
      country: "DE",
      regularPrice: 1234.56,
      salePrice: 1111.1,
      currency: "EUR",
    });
  });

  it("filters non-German rows and blocks German rows outside EUR", () => {
    const result = processZalandoSalePrices([
      {
        status_detail: "ZABLO_646",
        sku: "OTHER-MARKET",
        regular_price: "20",
        country: "dk",
        currency: "DKK",
      },
      {
        status_detail: "ZABLO_646",
        sku: "WRONG-CURRENCY",
        regular_price: "20",
        country: "de",
        currency: "DKK",
      },
    ]);

    expect(result.rows.map((row) => row.status)).toEqual([
      "outside_target_market",
      "invalid_currency",
    ]);
    expect(result.summary).toMatchObject({
      readyRows: 0,
      skippedRows: 1,
      invalidRows: 1,
      outsideTargetMarketRows: 1,
      invalidCurrencyRows: 1,
    });
  });

  it("parses European and dot-decimal prices", () => {
    expect(parseZalandoPrice("33,99")).toBe(33.99);
    expect(parseZalandoPrice("1.234,56")).toBe(1234.56);
    expect(parseZalandoPrice("1,234.56")).toBe(1234.56);
    expect(parseZalandoPrice("33.99")).toBe(33.99);
  });
});
