# Khata

A personal NPR ledger. It runs as a Next.js app, stores entries in Neon Postgres, and installs as a progressive web app. There is no Gmail connection in this repo. A daily routine can POST JSON, and rows with the same `externalId` update in place.

## Run locally

```bash
npm install
cp .env.example .env.local
# paste your Neon URLs into .env.local
npm run db:migrate
npm run db:seed
npm run dev
```

Open [http://127.0.0.1:3847](http://127.0.0.1:3847).

`npm run db:seed` loads `seed/week-of-2026-10-05.json`. For the week of 5–11 October 2026 that file is **NPR 820 spent** and **NPR 3,600 credited** (income 1,600 + the NIMB transfer 2,000). Running the seed again updates those rows instead of duplicating them.

`npm test` checks that week math without a database.

## Neon

1. Create a project in the [Neon console](https://console.neon.tech). The database is Lakebase Postgres.
2. Open **Connect** and copy both strings:
   - **Pooled** (hostname contains `-pooler`) → `DATABASE_URL`. The app uses this.
   - **Direct** (no `-pooler`) → `DATABASE_URL_UNPOOLED`. Drizzle migrations use this. A pooled connection can fail mid-migration with prepared-statement errors.
3. Put them in `.env.local` for your machine, and in the Vercel project for production. Do not commit either file. `.env.example` only has placeholders.

Apply the schema:

```bash
npm run db:migrate
```

That runs the SQL in `drizzle/`. Generate a new migration after a schema change with `npm run db:generate`, then migrate again.

Optional sample data, once `DATABASE_URL` is set:

```bash
npm run db:seed
```

The seed script falls back to `DATABASE_URL_UNPOOLED` if `DATABASE_URL` is empty.

## Passcode

Leave `APP_PASSCODE` empty while you are setting the app up. The ledger is then open to anyone who can reach the server.

Set `APP_PASSCODE` on Vercel when you want it private. The browser asks for that passcode and stores an httpOnly cookie. A daily import can skip the cookie and send:

```http
Authorization: Bearer <APP_PASSCODE>
```

`x-khata-passcode` is accepted as well.

## Deploy on Vercel

1. Import this repository in Vercel. Framework preset: Next.js. Build command: `npm run build` (Next.js, then the service worker).
2. Environment variables:
   - `DATABASE_URL` — pooled Neon URL
   - `DATABASE_URL_UNPOOLED` — direct Neon URL
   - `APP_PASSCODE` — optional
3. Deploy.
4. From your machine, with the production direct URL exported, run `npm run db:migrate` once. You can also set the Vercel build command to `npm run db:migrate && npm run build` after those variables exist.
5. Optional: `npm run db:seed` against the production `DATABASE_URL`.

The app uses `node-postgres` with a small pool. On Vercel Fluid, `attachDatabasePool` closes idle connections before the function suspends.

Install Khata from the browser once it is served over HTTPS (or localhost). The manifest, icons, and service worker are part of the production build. API calls are not cached, so an offline open shows the shell and asks for the network before it invents a balance.

## Daily JSON import

`POST /api/import` accepts either shape:

```json
{ "transactions": [ /* rows */ ] }
```

```json
[ /* rows */ ]
```

Each row:

| Field | Notes |
| --- | --- |
| `externalId` | Stable id, unique. A Gmail message id works. Re-importing the same id updates the row. |
| `date` | `YYYY-MM-DD` |
| `type` | `expense`, `income`, or `transfer` |
| `amount` | Positive number. Nepalese rupees. |
| `currency` | `NPR` |
| `category` | Free text. Unknown names are created. |
| `merchant` | Description shown in the ledger |
| `account` | `Nabil`, `NIMB`, `Sanima`, `Splitwise`, or `Other` |
| `note` | Optional |
| `source` | Optional. Defaults to `gmail` |

Example:

```bash
curl -X POST "$APP_URL/api/import" \
  -H "content-type: application/json" \
  -H "authorization: Bearer $APP_PASSCODE" \
  -d @seed/week-of-2026-10-05.json
```

The response is `{ "created": 0, "updated": 6, "invalid": [] }` after a second run of the sample week.

`GET /api/export` downloads the same shape as `{ "transactions": [ ... ] }`. The Sync screen also has a one-click download.

Credits on the dashboard are income plus transfers. Spend is expenses only. That is why the sample week shows 820 spent and 3,600 credited, and a net of 2,780.

The NIMB line is a transfer: “LAW/NIBL transfer”, with a note that Sameer paid 2,018 on Splitwise against a 2,000 bank credit.

## Other routes

- `GET/POST /api/transactions` and `PATCH/DELETE /api/transactions/:id`
- `GET/POST /api/categories` and `PATCH/DELETE /api/categories/:id`
- `GET /api/summary` — this week and this month in `Asia/Kathmandu`
- `POST /api/seed` — same file as `npm run db:seed`, from the Sync button

Default categories: Food, Transport, Parking, Entertainment, Shopping, Bills, Health, Transfer, Income, Other. They are editable. A category that still has entries cannot be deleted; rename it instead.
