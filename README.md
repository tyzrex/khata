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

`vercel.json` sets the build command to `npm run build`. That runs Next.js and then Serwist, which writes `public/sw.js`. Vercel’s default Next.js command is only `next build`, so leave this override in place or the service worker will be missing. Migrations are not part of the build. A deploy can succeed before the database exists; the app will answer 503 until the tables are there.

In the Vercel project, set:

| Name | Required | Where it comes from |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Neon **pooled** string, hostname contains `-pooler` |
| `DATABASE_URL_UNPOOLED` | Yes, for migrations | Neon **direct** string, no `-pooler` |
| `APP_PASSCODE` | No | Empty keeps the ledger open |

Do not commit those values. `.env.example` is placeholders only. `.env.local` is gitignored.

Node 20.9 or newer. The app uses `node-postgres`. On Vercel Fluid, `attachDatabasePool` closes idle connections before the function suspends.

Apply the schema from a machine that has the Neon URLs. A variable already in the shell wins over `.env.local`, so a local file does not point this at the wrong database:

```bash
DATABASE_URL_UNPOOLED='postgresql://USER:PASSWORD@ep-example.region.aws.neon.tech/neondb?sslmode=require' npm run db:migrate
DATABASE_URL='postgresql://USER:PASSWORD@ep-example-pooler.region.aws.neon.tech/neondb?sslmode=require' npm run db:seed
```

`db:migrate` applies `drizzle/0000_pink_husk.sql` (categories, transactions) and `drizzle/0001_share_book.sql` (people, groups, splits, settlements). `db:seed` is idempotent: bank rows upsert on `externalId`, and the sample share book upserts on its stable ids.

There is no Neon URL in this workspace. The commands above are what to run once you paste yours. A local Postgres URL in `.env.local` is only for development.

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

The NIMB line is a transfer: “LAW/NIBL transfer”. The share book records Sameer’s settlement as NPR 2,018 and links it to that bank credit of NPR 2,000. The NPR 18 gap stays on the bank line.

## Friends, groups, and settling

People, groups, shared expenses, and settlements live in their own tables. They do not change spent or credited totals.

- Equal, exact, shares, and percent splits. Amounts are stored in paisa so a split always adds up to the total.
- Balances are per person: you owe, you are owed, and what other people owe each other. A simplified list shows the fewest payments with the same nets.
- A settlement can point at one bank transaction. Cine Mark is linked to the two Nabil charges the same way, without merging those charges into the share total.
- `npm run db:seed` and **Load sample week** load both the bank week and Biker Gang (You, Sameer, Anita, Rajan).

After the sample, you owe Anita NPR 2,000, Sameer owes you NPR 1,425, and Rajan owes you NPR 300.

## Other routes

- `GET/POST /api/transactions` and `PATCH/DELETE /api/transactions/:id`
- `GET/POST /api/categories` and `PATCH/DELETE /api/categories/:id`
- `GET /api/summary` — this week and this month in `Asia/Kathmandu`
- `POST /api/seed` — bank week plus the sample share book
- `GET /api/shares` — people, groups, balances, expenses, settlements
- `POST /api/people`, `POST /api/groups`, `POST /api/shared-expenses`, `POST /api/settlements`

Default categories: Food, Transport, Parking, Entertainment, Shopping, Bills, Health, Transfer, Income, Other. They are editable. A category that still has entries cannot be deleted; rename it instead.
