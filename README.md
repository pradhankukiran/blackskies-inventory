# Blackskies Inventory

Internal inventory and restock-recommendation tool for Blackskies' three sales channels — Shopify (own store), Zalando ZFS, and Amazon FBA.

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwindcss&logoColor=white)
![React Router](https://img.shields.io/badge/React_Router-CA4245?style=for-the-badge&logo=reactrouter&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)
![Shopify](https://img.shields.io/badge/Shopify-7AB55C?style=for-the-badge&logo=shopify&logoColor=white)

## What it does

- Pulls own-warehouse stock and SKU/EAN mapping from Shopify via the Admin API (location: `Lager`)
- Accepts manual file uploads for Zalando ZFS data (stocks, shipments, received, sales)
- Accepts manual file uploads for Amazon FBA data (Sellerboard Export + Sales/Returns)
- Merges everything into a per-SKU view across all three channels
- Calculates pending ZFS shipments (shipped vs received)
- Generates restock recommendations for ZFS and FBA based on sales velocity, return rate, and coverage days
- Produces a stock-deduction CSV for re-import into Shopify when stock is moved to ZFS / FBA

## Forecast logic

The exact formulas and inputs used to generate recommendations are documented in [FORECAST_LOGIC.md](./FORECAST_LOGIC.md).

## Stack

React + TypeScript + Vite frontend, Tailwind for styling, React Router for routing, deployed on Vercel. A Vercel serverless function handles the Shopify Admin API integration.
