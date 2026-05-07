# Forecast & Recommendation Logic

How the Blackskies inventory tool currently calculates restock recommendations — what data it uses, what formulas it applies, and what is not yet modeled.

ZFS and FBA each have their own recommendation calculation. The structure is similar (`daily demand × coverage × return adjustment × high-seller boost − current stock`) but the inputs, thresholds, and stock components differ.

## Data sources

| Source | What it provides |
|---|---|
| Internal Stocks (Shopify "Lager", via API) | Per SKU: a single quantity ("Lager") representing own-warehouse stock. The same number is stored as both "Internal Stock Quantity" and "Available Stock" in the integrated view. |
| ZFS Stocks (Zalando Partner Connect) | Per EAN: ZFS Quantity, Status Cluster, Status Description, country, partner variant size |
| ZFS Shipment (Zalando) | Per EAN: quantity sent to Zalando |
| ZFS Shipment Received (Zalando) | Per EAN: quantity actually arrived |
| ZFS Sales (Zalando) | Per (EAN, country) row: EAN, Country, Sold articles, Return rate %, PDP views, Conversion rate %, Days online, Article variant, Brand, Date first on offer |
| SKU-EAN Mapper (Shopify variant Barcode field, via API) | Links SKUs to EANs. Drives the integrated view. |
| Sellerboard Export | Per SKU: FBA stock, sent-to-FBA, reserved, prep-center stock, optional Estimated Sales Velocity, Marketplace |
| Sellerboard Sales + Returns | Per SKU 30-day totals: sales value and refund %. The 30-day window is **assumed** by the code (`/ 30` is hardcoded); uploading a different period would produce wrong daily-sales figures. |

## SKU / EAN matching

Before recommendations run, internal stock and ZFS stock are joined per row of the SKU-EAN Mapper:

- SKUs are normalized (trimmed, uppercased) for case-insensitive matching
- If no exact match, the tool tries **variant aggregation**: any internal SKU starting with `<mapping_sku>-` is summed into the parent (e.g., `AKWM-N-LUA-02-XS`, `AKWM-N-LUA-02-S` roll up under `AKWM-N-LUA-02`)
- Products without a row in the SKU-EAN Mapper are **not** included in the integrated view and therefore **never receive a recommendation** — even if they have sales data

After integration, duplicate `(SKU, EAN)` pairs are filtered.

## Pending shipment (ZFS only)

```
pendingShipment[ean] = max(0, sum(shipped_qty) − sum(received_qty))
```

Two behaviors worth knowing:
- Negative differences (received > shipped) clamp to zero.
- An EAN that appears in the **received** file but never appears in the **shipped** file is silently dropped — it does not produce a negative pending value, it simply has no entry. Practically: the tool only tracks shipments it knows about.

The result is added to current ZFS stock to form **ZFS Total** = stock under your control at Zalando, including units in transit.

There is no equivalent calculation for FBA — Sellerboard exposes "Sent to FBA" directly.

---

## ZFS recommendation

Computed per product, per EAN.

### Inputs
- `totalSales` — sum of "Sold articles" across **every row** for the EAN in the uploaded ZFS Sales file. The code does **not** filter rows by date; the timeline window only acts as the divisor in `dailyDemand` below. The user is expected to upload a file whose contents already represent the selected window.
- `timelineDays` — 30 or 180, user-selected
- `returnRate` — sales-weighted average of `Return rate (%)` across country rows for the EAN (each row's rate weighted by its `Sold articles`).
- `coverageDays` — user-set, default 14
- `statusCluster` — value from ZFS Stocks. **Missing or blank values are coerced to `Live`.** Only the value `Live` triggers special handling in the no-sales branch; explicit non-Live values (e.g., `On Hold`, `Discontinued`) fall through to recommend 0.
- `zfsTotal` — ZFS Quantity + Pending Shipment
- `currentStock` — own-warehouse stock (Shopify "Available Stock")

### Step 1 — No-sales rule
If `totalSales == 0`:
- If product is `Live` AND `zfsTotal == 0` → recommend **1**
- Otherwise → recommend **0**

### Step 2 — Base recommendation (when there are sales)
```
dailyDemand = totalSales / timelineDays
projected   = round(dailyDemand × coverageDays × (1 − returnRate/100))
```

### Step 3 — High-seller boost (×1.2)
If `totalSales > 5` over the timeline:
```
projected = round(projected × 1.2)
```

### Step 4 — Subtract what's already at Zalando
```
recommended = max(0, projected − zfsTotal)
```

### Step 5 — Listing-active fallback
If `zfsTotal == 0` AND `recommended == 0` AND `currentStock > 0`:
```
recommended = 1
```

### Step 6 — Country allocation
The country list comes from the **rows in the ZFS Sales file itself** for that EAN — not from any separate "listed countries" source.

If `recommended > 0` and at least one country row exists for the EAN in the sales data, the quantity is split proportionally by each country's share of total sales (single-country case: all to that country). Countries that appear in the sales file with **zero** sold articles get a default minimum of `max(1, floor(recommended / numCountries))`. Any rounding gap between the per-country sum and the target is reconciled by walking the countries in descending-allocation order and adding/removing one unit at a time.

Note: when reducing allocations, the code skips countries already at 1 (it never goes to 0) but still consumes a "remaining" slot, which can leave the per-country total slightly above target in narrow edge cases.

---

## FBA recommendation

Computed per SKU.

**Marketplace filter:** Sellerboard rows where `Marketplace` includes `Amazon.co.uk` are excluded. **All other marketplaces pass through** (Amazon.de, Amazon.com, Amazon.fr, blank, etc.) — the filter is "exclude UK," not "include DE only." The same exclusion is applied to the **Sales + Returns** export when that file has a Marketplace column.

**SKU dedup:** When the same SKU appears more than once across marketplaces, duplicates are collapsed to a single row, preferring the Amazon.de entry when one exists.

### Inputs
- `dailySales` — preferred from Sellerboard's `Estimated Sales Velocity` field on the Export (the actual column header has embedded line breaks: `Estimated\nSales\nVelocity`). Falls back to `(30-day total Sales) / 30` from the Sales+Returns export when `Estimated Sales Velocity` is missing or zero. **⚠ Note:** the parser strips currency symbols (€, $, £) from the "Sales" value before parsing, which suggests the column may hold monetary value rather than unit count. If so, the fallback path would produce a currency-per-day figure that the formula consumes as if it were units-per-day, inflating recommendations. Worth verifying against your actual Sellerboard export format before relying on the fallback path.
- `coverageDays` — user-set, default 14 (same control as ZFS)
- `refundPercentage` — Sellerboard's `% Refunds` column on the Sales+Returns export
- `fbaQuantity` — current sellable stock at Amazon (read from `FBA/FBM Stock`, `Stock`, or `FBA Quantity` columns)
- `sentToFBA` — units in transit to Amazon (read from `Sent to FBA`)
- `reservedUnits` — units held by Amazon (read from `Reserved`)
- `internalStock` — prep-center / internal stock from Sellerboard (read from `FBA prep. stock`, `Prep center 1 stock`, etc.). **Note: this is Sellerboard's own number, not the Shopify "Lager" value.** Whether they represent the same physical inventory depends on how Sellerboard is configured.

### Composite stock
```
totalFbaStock = fbaQuantity + sentToFBA + reservedUnits
```

### Recommendation formula
```
boost = (dailySales × 30) > 10 ? 1.2 : 1
recommendedQty = max(0, round(
    dailySales × coverageDays × (1 − refundPercentage/100) × boost − totalFbaStock
))
```

The FBA high-seller threshold is **>10 sales over 30 days**, different from ZFS's **>5 sales over the timeline**.

### Listing-active fallback
If `recommendedQty == 0` AND `totalFbaStock == 0` AND `internalStock > 0`:
```
recommendedQty = 1
```

### Sellerboard's own "Recommended Quantity" column is not used
The tool never reads any `Recommended Quantity` value from the Sellerboard input. It computes its own and emits that value under the same column name in the integrated output.

---

## Stock visibility per channel

| Channel | Tracked components |
|---|---|
| Internal warehouse | Single Shopify "Lager" quantity, mirrored into "Internal Stock Quantity" and "Available Stock". Only "Available Stock" is read by the math. |
| ZFS | ZFS Quantity (sellable) + ZFS Pending Shipment (in transit) |
| FBA | FBA Quantity + Sent to FBA + Reserved Units. Plus Sellerboard's prep-center stock (used only in the FBA listing-active fallback). |

---

## Inputs that influence the forecast

### ZFS
| Input | Effect |
|---|---|
| `totalSales` | Drives daily demand. More sales → higher recommendation. |
| `timelineDays` | Smoothing window. Longer window = lower daily demand, more conservative. |
| `returnRate` | Reduces projected demand by `(1 − returnRate%)`. |
| `coverageDays` | Multiplies projected demand. Longer coverage = more stock. |
| `statusCluster` | Only the value `Live` matters. Affects no-sales / fallback rules; doesn't scale the math. |
| `zfsTotal` | Subtracted from projected demand. |
| `currentStock` (Available Stock) | Used only in the listing-active fallback (Step 5). |

### FBA
| Input | Effect |
|---|---|
| `dailySales` | Drives projected demand. |
| `coverageDays` | Multiplies projected demand. Same UI control as ZFS. |
| `refundPercentage` | Reduces projected demand by `(1 − refundPercentage%)`. |
| `fbaQuantity` | Subtracted (part of `totalFbaStock`). |
| `sentToFBA` | Subtracted (part of `totalFbaStock`). |
| `reservedUnits` | Subtracted (part of `totalFbaStock`). |
| `internalStock` (prep-center) | Used only in the listing-active fallback. |

---

## What is NOT currently considered

- **Minimum Order Quantity (MOQ).** Not modeled. Recommendations are any positive integer; no rounding to manufacturer pack sizes.
- **Lead time (warehouse → ZFS/FBA).** Treated as instant. Compensated for today by setting Coverage Days higher.
- **Safety stock / demand variance.** Not modeled. Formula projects flat daily demand.
- **Reserved stock on the internal side.** Shopify exposes only "available" via the API; Lager is treated as fully sellable.
- **Days online for new products.** ZFS daily demand divides by the full timeline (30 or 180), even if a product was listed for fewer days, so newly launched products are under-recommended. The `Days online` field is read but never used in the math.
- **Seasonality, trend, campaign demand shifts.** Daily demand is purely backward-looking. The Adjusted Trend / Seasonality Factor (planned next) introduces a manual forward-looking adjustment.

## Data fields read from sources but not used in the recommendation math

- ZFS Sales: `Days online`, `PDP views`, `Conversion rate (%)`, `Article variant`, `Brand`, `Date first on offer` (some used only for display labels)
- ZFS Sales: `Category` and `season` are referenced in the calculator but **not preserved** by the sales processor — they are always empty in the integrated data
- Stock: `pricePoint` (`regular_price` / `discounted_price`) is extracted and stored on the recommendation row but does not affect any formula

`Days online` is the most consequential of these — using it would fix the new-product under-recommendation noted above.

---

## Where this lives in the code

- ZFS recommendation: `src/utils/calculators/stockRecommendations.ts`
- FBA recommendation: `src/utils/processors/sellerboardStockProcessor.ts`
- Pending shipment: `src/utils/calculators/pendingShipments.ts`
- SKU/EAN matching and integration: `src/utils/mergers/dataIntegrator.ts`
- ZFS sales parsing: `src/utils/processors/zfsSalesProcessor.ts`
- Worker orchestration: `src/workers/fileProcessor.worker.ts`
