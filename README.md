# Blackskies Inventory

Internal inventory, replenishment, Zalando retagging, and ZFS stock-return tool for Blackskies.

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwindcss&logoColor=white)
![React Router](https://img.shields.io/badge/React_Router-CA4245?style=for-the-badge&logo=reactrouter&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)
![Shopify](https://img.shields.io/badge/Shopify-7AB55C?style=for-the-badge&logo=shopify&logoColor=white)

## What It Does

The app has four main workflows:

- **Zalando ZFS restock recommendations**: combines Shopify internal stock, SKU/EAN mapping, ZFS stock, ZFS shipment files, received shipment files, and ZFS sales exports.
- **Amazon FBA restock recommendations**: processes Sellerboard stock and sales/returns exports, with its own FBA recommendation table.
- **Zalando Retagging Decision Tool**: DE-only MVP that uses Zalando CSV exports and Shopify internal stock to recommend season-retagging, basics applications, discount notes, clearance, or manual review.
- **ZFS Stock Return Tool**: DE-only workflow that identifies slow-moving ZFS overstock and suggests Return to Merchant quantities by EAN.

It runs fully through CSV/file uploads plus the existing Shopify Admin API sync. There is no direct Zalando API integration.

## Main Features

- Syncs Shopify internal stock from the `Lager` location.
- Syncs the Shopify SKU/EAN mapper from variant barcodes.
- Keeps ZFS, FBA, Retagging, and Stock Return files/results scoped separately.
- Scopes Shopify sync to the active module where sync was started.
- Persists uploaded files, table results, and UI settings locally using IndexedDB/localStorage.
- Supports configurable restock controls: coverage days, sales timeline, safety factor, and demand/trend factor.
- Exports ZFS, FBA, Retagging, and Stock Return outputs as CSV and Excel where applicable.
- Uses sticky table headers and drag-to-scroll behavior for wide data tables.

## ZFS / FBA Restock Logic

ZFS and FBA recommendations are based on sales velocity, returns/refunds, current external stock, in-transit stock where available, and the selected coverage target.

The detailed formulas are documented in [FORECAST_LOGIC.md](./FORECAST_LOGIC.md).

Key user-adjustable inputs:

- **Coverage days**: target stock coverage period.
- **Timeline**: ZFS sales window used for daily demand smoothing.
- **Safety factor**: extra buffer applied on top of calculated demand.
- **Demand factor**: manual demand adjustment layer, for example `+20%` or `+30%`.

## Retagging Decision Tool

The Retagging module is currently built as a Germany-only MVP.

### Inputs

Required:

- Zalando Sales Performance **detail-breakdown** CSV.
- Zalando Sales Performance **article-level** CSV, used as the source for NMV, units sold, SAR, return rate, and discount.
- Zalando ZFS Inventory CSV.

Optional but recommended:

- Shopify Internal Stock from the app's Shopify sync.
- Shopify SKU/EAN mapper from the same Shopify sync.

The retagging tool uses the article-level Sales Performance report as the main sales source. Shopify stock improves internal stock visibility and SKU/EAN fallback matching.

### Matching

Rows are matched primarily by Zalando article variant / SKU. When Shopify mapper data is available, the tool also uses EAN to find the related Shopify SKU and internal stock.

### Configurable Thresholds

- **SAR threshold**: default `85%`.
- **NMV/GMV threshold**: default `1000 EUR`.
- **Current active season**: default `FS_26`; used for old-season and discount/clearance logic.
- **Required discount**: default `20%`; used to decide whether an old-season item needs a discount note.

The Zalando report currently provides NMV, not GMV. The app labels this as **NMV used as GMV proxy**.

### Output

The module produces one main table and export: **Retagging Decision Export**.

Important columns include:

- SKU, Zalando SKU, EAN, article name, category.
- Current season.
- Article status and Zalando issue/status code.
- ZFS stock and internal Shopify stock.
- NMV/GMV proxy, units sold, return rate, SAR, discount.
- Basic retagging eligibility and regular retagging eligibility.
- Retagging score.
- Season recommendation.
- Operational note.
- Reason / explanation.
- Missing data / manual review note.

### Decision Shape

The retagging logic intentionally separates season decisions from operational warnings:

- **Season recommendation**: already basic/no action, basic retagging eligible with manual department choice, retag to next season, clearance/phase out, or manual review.
- **Operational note**: replenish ZFS first, low internal stock, low size availability, missing data, blocking issue code, high return rate, discount required, or already discounted.

This avoids replacing a season decision with an operational task like replenishing ZFS.

## ZFS Stock Return Tool

The Stock Return module helps identify excess ZFS stock that can be returned to Blackskies via Zalando Return to Merchant / Stock Return.

### Inputs

Required:

- Zalando ZFS Inventory CSV.
- Zalando Sales Performance CSV.

Optional but recommended:

- Shopify Internal Stock from the app's Shopify sync.
- Shopify SKU/EAN mapper from the same Shopify sync.

Shopify data is used to show Blackskies internal SKUs and Shopify product names in the review table and export. The return-quantity calculation itself is based on ZFS stock and sales velocity.

### Configurable Inputs

- **Sales history period**: source period used for average daily sales, for example `30`, `90`, or `180` days.
- **Forecast period**: demand window to keep stock for, for example `14`, `30`, `45`, `60`, or `90` days.
- **Safety buffer**: extra stock kept on top of expected demand.
- **Storage fee per unit per day**: default `0.0128 EUR`.

### Calculation

For each EAN:

```text
average daily sales = units sold in selected sales history period / sales history days
expected demand = average daily sales × forecast period
stock to keep = expected demand × (1 + safety buffer)
suggested return qty = current ZFS stock - stock to keep
estimated savings = return qty × storage fee per unit per day × forecast period
```

Return quantity is never negative.

### Output

The dashboard table includes review columns such as:

- EAN.
- Shopify/internal SKU.
- Article name.
- Zalando article variant.
- Current ZFS stock.
- Units sold in selected period.
- Average daily sales.
- Stock to keep.
- Suggested return quantity.
- Estimated savings.

Exports:

- **CSV / Excel export** for rows with a suggested return quantity.
- The export includes Zalando-required `EAN` and `return qty`, plus review columns such as SKU, article name, current ZFS stock, units sold, stock to keep, and estimated savings.

## Shopify Sync And Persistence

Shopify sync creates two CSV files in-app:

- `shopify-internal-stocks.csv`: SKU, title, and internal stock from the configured Shopify location.
- `shopify-sku-ean.csv`: SKU/EAN mapper from Shopify variant barcodes.

Sync is scoped to the module where the user starts it:

- ZFS sync updates ZFS internal stock and SKU/EAN mapper files.
- Retagging sync updates Retagging Shopify files.
- Stock Return sync updates Stock Return Shopify files.
- FBA does not use Shopify sync.

The header keeps the active sync label tied to the module where sync was started, even if the user changes tabs before the request finishes.

Local persistence:

- ZFS/FBA use IndexedDB stores keyed as `currentZfsFiles`, `currentZfsData`, `currentFbaFiles`, and `currentFbaData`.
- Retagging and Stock Return use module-scoped generic IndexedDB keys.
- UI settings such as restock factors and last Shopify sync metadata use localStorage.
- Reset actions are scoped per module.

## Local Development

Install dependencies:

```bash
npm install
```

Run the frontend only:

```bash
npm run dev
```

Run with Vercel serverless API support for Shopify sync:

```bash
vercel dev --listen 5173
```

Shopify sync requires environment variables in `.env` / Vercel env:

- `SHOPIFY_STORE_DOMAIN`
- `SHOPIFY_ADMIN_ACCESS_TOKEN`
- `SHOPIFY_LOCATION_NAME`

Build:

```bash
npm run build
```

Run tests:

```bash
npm test
```

Run the retagging processor tests:

```bash
npm test -- --run src/utils/processors/retaggingDecisionProcessor.test.ts
```

Run the stock return processor tests:

```bash
npm test -- --run src/utils/processors/stockReturnProcessor.test.ts
```

## Tech Stack

- React 18
- TypeScript
- Vite
- Tailwind CSS
- React Router
- PapaParse for CSV parsing
- SheetJS/XLSX for spreadsheet export
- Vercel serverless function for Shopify sync
- IndexedDB/localStorage for local persistence

## Important Code Paths

- App shell and routing: `src/App.tsx`, `src/components/IntegratedStockParser.tsx`
- ZFS/FBA file orchestration: `src/hooks/useFileProcessing.ts`
- Local persistence: `src/lib/appPersistence.ts`, `src/lib/indexedDB.ts`
- Shopify sync API: `api/shopify/sync.ts`
- ZFS recommendations: `src/utils/calculators/stockRecommendations.ts`
- FBA recommendations: `src/utils/processors/sellerboardStockProcessor.ts`
- Retagging UI: `src/components/RetaggingDecisionTool.tsx`
- Retagging logic: `src/utils/processors/retaggingDecisionProcessor.ts`
- Retagging tests: `src/utils/processors/retaggingDecisionProcessor.test.ts`
- Stock Return UI: `src/components/StockReturnTool.tsx`
- Stock Return logic: `src/utils/processors/stockReturnProcessor.ts`
- Stock Return tests: `src/utils/processors/stockReturnProcessor.test.ts`
