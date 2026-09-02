import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BarcodeLabelRow } from "@/types/barcode";
import { createBarcodeLabelDocument, encodeEan13 } from "./barcodePdfExporter";

const readyRow: BarcodeLabelRow = {
  sourceRowNumber: 2,
  sku: "BS-CAP-264",
  articleName: "Circuit Baseball Trucker Cap",
  color: "White-Grey",
  size: "One Size",
  ean: "4251812349856",
  status: "ready",
  issues: [],
};

describe("encodeEan13", () => {
  it("encodes a known EAN-13 value into the standard 95 modules", () => {
    expect(encodeEan13("4006381333931")).toBe(
      "10100011010100111010111101111010001001011001101010100001010000101000010111010010000101100110101"
    );
  });

  it("preserves leading zeroes", () => {
    const modules = encodeEan13("0123456789012");

    expect(modules).toHaveLength(95);
    expect(modules.startsWith("101")).toBe(true);
    expect(modules.slice(45, 50)).toBe("01010");
    expect(modules.endsWith("101")).toBe(true);
  });

  it("rejects invalid values instead of printing an unusable barcode", () => {
    expect(() => encodeEan13("4006381333930")).toThrow("Cannot generate an EAN-13 barcode");
    expect(() => encodeEan13("123")).toThrow("Cannot generate an EAN-13 barcode");
  });
});

describe("createBarcodeLabelDocument", () => {
  it("creates one 90 by 50 mm PDF page per label", () => {
    const logo = readFileSync(
      new URL("../../../public/Blackskies-Barcode-Logo.png", import.meta.url)
    ).toString("base64");
    const document = createBarcodeLabelDocument(
      [readyRow, { ...readyRow, sourceRowNumber: 3, ean: "4006381333931" }],
      "blackskies",
      `data:image/png;base64,${logo}`
    );

    expect(document.getNumberOfPages()).toBe(2);
    expect(document.internal.pageSize.getWidth()).toBeCloseTo(90, 2);
    expect(document.internal.pageSize.getHeight()).toBeCloseTo(50, 2);
    const signature = new TextDecoder().decode(document.output("arraybuffer").slice(0, 5));
    expect(signature).toBe("%PDF-");
  });
});
