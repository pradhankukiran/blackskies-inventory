import { describe, expect, it } from "vitest";
import { integrateStockData } from "./dataIntegrator";
import { ProcessedZFSStock } from "@/types/processors";

const stockRow = (
  country: string,
  quantity: number,
  statusCluster: string,
): ProcessedZFSStock => ({
  EAN: "4251812313505",
  "Product Name": "Test Product",
  "ZFS Quantity": quantity,
  "Status Cluster": statusCluster,
  "Status Description": "",
  country,
  partner_variant_size: "SKU-1",
});

describe("integrateStockData", () => {
  it("uses the highest ZFS stock for an EAN across all countries", () => {
    const result = integrateStockData(
      [{
        SKU: "SKU-1",
        "Product Name": "Test Product",
        "Internal Stock Quantity": 0,
        "Available Stock": 0,
      }],
      [
        stockRow("ie", 0, "Blocked"),
        stockRow("pl", 3, "Live"),
        stockRow("de", 2, "Live"),
      ],
      [{ SKU: "SKU-1", EAN: "4251812313505" }],
      new Map(),
    );

    expect(result).toHaveLength(1);
    expect(result[0]["ZFS Quantity"]).toBe(3);
    expect(result[0].country).toBe("pl");
    expect(result[0]["Status Cluster"]).toBe("Live");
  });
});
