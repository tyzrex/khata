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

## Accounts

Khata uses [Better Auth](https://www.better-auth.com). Email and password work without an email provider. Google is optional until the client id and secret are set. There is no shared passcode.

Sessions are httpOnly cookies (`better-auth.session_token`, prefixed `__Secure-` on HTTPS), `SameSite=Lax`, and `Secure` in production. Better Auth checks the request origin on sign-in and sign-up. The signed cookie cache lasts five minutes so most page loads skip a database read. A route still calls `getSession` before it reads the ledger.

Every ledger and share row stores `user_id`. Queries only return the signed-in account. `npm run db:seed` writes rows with a null owner; the first account that signs in adopts those rows. A second account gets its own empty book. The sample week uses stable ids, so only one account can hold that sample.

Password reset email is not wired up. Add an email sender later if you want reset links. Until then, keep the password, or sign in with Google using the same verified address (Google is a trusted provider for account linking).

## Deploy on Vercel

`vercel.json` sets the build command to `npm run build`. That runs Next.js and then Serwist, which writes `public/sw.js`. Vercel’s default Next.js command is only `next build`, so leave this override in place or the service worker will be missing. Migrations are not part of the build. A deploy can succeed before the database exists; the app will answer 503 until the tables are there.

In the Vercel project, set:

| Name | Required | Where it comes from |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Neon **pooled** string, hostname contains `-pooler` |
| `DATABASE_URL_UNPOOLED` | Yes, for migrations | Neon **direct** string, no `-pooler` |
| `BETTER_AUTH_SECRET` | Yes | `openssl rand -base64 32`. At least 32 characters. |
| `BETTER_AUTH_URL` | Production and local | Canonical origin, no trailing slash. Leave **unset** on Vercel Preview. |
| `GOOGLE_CLIENT_ID` | For Google sign-in | Google Cloud OAuth web client |
| `GOOGLE_CLIENT_SECRET` | For Google sign-in | Same client |

Do not commit those values. `.env.example` is placeholders only. `.env.local` is gitignored.

Node 20.9 or newer. The app uses `node-postgres`. On Vercel Fluid, `attachDatabasePool` closes idle connections before the function suspends.

Apply the schema from a machine that has the Neon URLs. A variable already in the shell wins over `.env.local`, so a local file does not point this at the wrong database:

```bash
DATABASE_URL_UNPOOLED='postgresql://USER:PASSWORD@ep-example.region.aws.neon.tech/neondb?sslmode=require' npm run db:migrate
DATABASE_URL='postgresql://USER:PASSWORD@ep-example-pooler.region.aws.neon.tech/neondb?sslmode=require' npm run db:seed
```

`db:migrate` applies `drizzle/0000_pink_husk.sql` (categories, transactions), `drizzle/0001_share_book.sql` (people, groups, splits, settlements), and `drizzle/0002_sparkling_colonel_america.sql` (Better Auth tables, plus `user_id` on the ledger). `db:seed` is idempotent: bank rows upsert on `externalId`, and the sample share book upserts on its stable ids. Those seeded rows stay unowned until the first sign-in claims them.

There is no Neon URL in this workspace. The commands above are what to run once you paste yours. A local Postgres URL in `.env.local` is only for development.

## Google sign-in

1. Open [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → Create credentials → OAuth client ID → Web application.
2. Authorized JavaScript origins:
   - `http://127.0.0.1:3847`
   - `http://localhost:3847`
   - `https://YOUR_PRODUCTION_DOMAIN`
3. Authorized redirect URIs (Better Auth’s callback):
   - `http://127.0.0.1:3847/api/auth/callback/google`
   - `http://localhost:3847/api/auth/callback/google`
   - `https://YOUR_PRODUCTION_DOMAIN/api/auth/callback/google`
4. Copy the client id and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` locally and on Vercel. Restart `npm run dev` after changing `.env.local`.
5. Set `BETTER_AUTH_URL` to the origin you actually open. Locally that is `http://127.0.0.1:3847` if you follow the link above. A mismatch here makes Google’s redirect fail.
6. Preview deployments each have their own host. Leave `BETTER_AUTH_URL` empty on the Preview environment. Add that preview origin and `https://<preview-host>/api/auth/callback/google` in Google Cloud if you need Google on that URL, or use a stable branch alias.

Email and password do not use Google. The Google button stays hidden until both client variables are set.

Vercel’s own deployment protection (team SSO) is separate. Once this app has accounts, you can turn that protection off for visitors who are not on the Vercel team. The ledger still requires a Khata session.

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
  -H "authorization: Bearer $KHATA_SESSION_TOKEN" \
  -d @seed/week-of-2026-10-05.json
```

`KHATA_SESSION_TOKEN` is the `better-auth.session_token` cookie from a signed-in browser (devtools → Application → Cookies). The same value can be sent as that cookie instead of a bearer token. The import is stored on that account.

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

## Inviting friends to a group

Friends sign up for their own Khata account and join your group as real members.

1. Open **Groups**, pick a group you own, and press **Invite**.
2. Optional: enter an email. That invite then works only for a signed-in account with that address, and only once. Without an email, the link works for anyone who has it until it expires (7 days).
3. Optional: pick a name already in the group (for example a placeholder you added earlier). When the friend joins, that person is linked to their account, so past shares and balances carry over. Otherwise a new member is created from their account name.
4. Copy the link and send it. If `RESEND_API_KEY` is set, an email with the link is sent too.
5. The friend opens `/invite/<token>`, signs in or creates an account, and presses **Join**. They land on **Groups**.

Members see the group's expenses, balances, and members, and can add or edit shared expenses and record settlements inside that group. Each person's bank ledger stays private. Only the group owner can invite, rename, or change members. Group data is stored in the owner's book and shared with members through `group_user_access`. Removing a linked person from the owner's People list revokes that account's access.

Optional env vars: `RESEND_API_KEY` and `INVITE_FROM_EMAIL` (for example `Khata <invites@your-domain.example>`). Without a key the invite link is still created and can be shared by hand.

Migration `0003_multi_user_invites` adds `group_invites`, `group_user_access`, and `people.linked_user_id`, and backfills owner rows for existing groups. Run `npm run db:migrate`.

## Other routes

- `GET/POST /api/transactions` and `PATCH/DELETE /api/transactions/:id`
- `GET/POST /api/categories` and `PATCH/DELETE /api/categories/:id`
- `GET /api/summary` — this week and this month in `Asia/Kathmandu`
- `POST /api/seed` — bank week plus the sample share book
- `GET /api/shares` — people, groups, balances, expenses, settlements
- `POST /api/people`, `POST /api/groups`, `POST /api/shared-expenses`, `POST /api/settlements`

Default categories: Food, Transport, Parking, Entertainment, Shopping, Bills, Health, Transfer, Income, Other. They are editable. A category that still has entries cannot be deleted; rename it instead.
