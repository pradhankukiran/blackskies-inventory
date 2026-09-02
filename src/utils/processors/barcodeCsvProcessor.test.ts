import { describe, expect, it } from "vitest";
import {
  isValidEan13,
  processBarcodeCsvText,
} from "./barcodeCsvProcessor";

describe("processBarcodeCsvText", () => {
  it("parses the client semicolon format and preserves label text", () => {
    const result = processBarcodeCsvText(
      "\uFEFFURL;SKU;EAN;ARTICLE_NAME;COLOR;SIZE\r\n" +
        "www.blackskies.shop;BS-CAP-276;4006381333931;Athletic Mütze;Schwarz;One Size\r\n" +
        "www.blackskies.shop;BS-CAP-277;0123456789012;Athletic Cap;Blue;One Size\r\n"
    );

    expect(result.rows).toEqual([
      {
        sourceRowNumber: 2,
        sku: "BS-CAP-276",
        ean: "4006381333931",
        articleName: "Athletic Mütze",
        color: "Schwarz",
        size: "One Size",
        status: "ready",
        issues: [],
      },
      {
        sourceRowNumber: 3,
        sku: "BS-CAP-277",
        ean: "0123456789012",
        articleName: "Athletic Cap",
        color: "Blue",
        size: "One Size",
        status: "ready",
        issues: [],
      },
    ]);
    expect(result.summary).toEqual({
      totalRows: 2,
      readyRows: 2,
      invalidRows: 0,
      duplicateRows: 0,
    });
    expect(result.warnings).toEqual([]);
  });

  it("reports missing values and invalid EAN-13 numbers", () => {
    const result = processBarcodeCsvText(
      "SKU,EAN,ARTICLE_NAME,COLOR,SIZE\n" +
        "BS-CAP-276,4006381333930,Athletic Cap,,One Size\n"
    );

    expect(result.rows[0]).toMatchObject({
      status: "invalid",
      issues: ["Missing color.", "EAN must be a valid 13-digit EAN-13 number."],
    });
    expect(result.summary).toEqual({
      totalRows: 1,
      readyRows: 0,
      invalidRows: 1,
      duplicateRows: 0,
    });
    expect(result.warnings).toContain("1 row needs correction before label generation.");
  });

  it("deduplicates exact rows and rejects conflicting data for one EAN", () => {
    const result = processBarcodeCsvText(
      "SKU;EAN;ARTICLE_NAME;COLOR;SIZE\n" +
        "BS-CAP-276;4006381333931;Athletic Cap;Black;One Size\n" +
        "BS-CAP-276;4006381333931;Athletic Cap;Black;One Size\n" +
        "BS-CAP-277;5901234123457;Athletic Cap;Blue;One Size\n" +
        "BS-CAP-277;5901234123457;Athletic Cap;Red;One Size\n"
    );

    expect(result.rows.map((row) => row.status)).toEqual([
      "ready",
      "duplicate",
      "invalid",
      "invalid",
    ]);
    expect(result.summary).toEqual({
      totalRows: 4,
      readyRows: 1,
      invalidRows: 2,
      duplicateRows: 1,
    });
    expect(result.rows[2].issues).toEqual(["This EAN is used by conflicting product data."]);
  });

  it("rejects every repeated EAN when one occurrence is invalid", () => {
    const result = processBarcodeCsvText(
      "SKU;EAN;ARTICLE_NAME;COLOR;SIZE\n" +
        "BS-CAP-276;5012345678900;Athletic Cap;Black;One Size\n" +
        "BS-CAP-276;5012345678900;Athletic Cap;Black;\n"
    );

    expect(result.rows.map((row) => row.status)).toEqual(["invalid", "invalid"]);
    expect(result.rows[0].issues).toEqual(["This EAN is used by conflicting product data."]);
    expect(result.rows[1].issues).toEqual([
      "Missing size.",
      "This EAN is used by conflicting product data.",
    ]);
    expect(result.summary).toMatchObject({ readyRows: 0, invalidRows: 2 });
  });

  it("requires the five product columns", () => {
    expect(() => processBarcodeCsvText("SKU;EAN\nBS-CAP-276;4006381333931\n")).toThrow(
      "CSV is missing required columns: ARTICLE_NAME, COLOR, SIZE."
    );
  });

  it("rejects empty files", () => {
    expect(() => processBarcodeCsvText(" \r\n")).toThrow("The CSV file is empty.");
  });
});

describe("isValidEan13", () => {
  it("requires 13 digits and a correct check digit", () => {
    expect(isValidEan13("4006381333931")).toBe(true);
    expect(isValidEan13("4006381333930")).toBe(false);
    expect(isValidEan13("400638133393")).toBe(false);
    expect(isValidEan13("400638133393A")).toBe(false);
  });
});
