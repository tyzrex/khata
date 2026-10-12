# Khata

A personal NPR ledger. It runs as a Next.js app, stores entries in Neon Postgres, and installs as a progressive web app. There is no Gmail connection in this repo. A daily routine can POST JSON, and rows with the same `externalId` update in place.

## Run locally

This project uses [Bun](https://bun.sh) (1.4+) as its package manager and script runner. Node 20.9+ is still needed because Next.js builds and serves under Node.

```bash
bun install
cp .env.example .env.local
# paste your Neon URLs into .env.local
bun run db:migrate
bun run db:seed
bun run dev
```

Open [http://127.0.0.1:3847](http://127.0.0.1:3847).

`bun run db:seed` loads `seed/week-of-2026-10-05.json`. For the week of 5–11 October 2026 that file is **NPR 820 spent** and **NPR 3,600 credited** (income 1,600 + the NIMB transfer 2,000). Running the seed again updates those rows instead of duplicating them.

`bun run test` checks that week math without a database.

## Neon

1. Create a project in the [Neon console](https://console.neon.tech). The database is Lakebase Postgres.
2. Open **Connect** and copy both strings:
   - **Pooled** (hostname contains `-pooler`) → `DATABASE_URL`. The app uses this.
   - **Direct** (no `-pooler`) → `DATABASE_URL_UNPOOLED`. Drizzle migrations use this. A pooled connection can fail mid-migration with prepared-statement errors. The live notification stream listens on it too: `LISTEN` needs a session that stays yours, and a pooler that multiplexes sessions will accept the subscription and then never deliver anything to it.
3. Put them in `.env.local` for your machine, and in the Vercel project for production. Do not commit either file. `.env.example` only has placeholders.

Apply the schema:

```bash
bun run db:migrate
```

That runs the SQL in `drizzle/`. Generate a new migration after a schema change with `bun run db:generate`, then migrate again.

To start over from nothing with two connected accounts — everything in every table
is deleted first, so only point this at a database you are testing against:

```bash
bun run db:reset-demo -- http://localhost:3847
```

It signs both accounts in through the real API rather than writing rows, so what
you get is exactly what a sign-up produces.

Optional sample data, once `DATABASE_URL` is set:

```bash
bun run db:seed
```

The seed script falls back to `DATABASE_URL_UNPOOLED` if `DATABASE_URL` is empty.

## Accounts

Khata uses [Better Auth](https://www.better-auth.com). Email and password work without an email provider; password reset and email-change links need one (`RESEND_API_KEY`). Google is optional until the client id and secret are set. There is no shared passcode.

Sessions are httpOnly cookies (`better-auth.session_token`, prefixed `__Secure-` on HTTPS), `SameSite=Lax`, and `Secure` in production. Better Auth checks the request origin on sign-in and sign-up. The signed cookie cache lasts five minutes so most page loads skip a database read. A route still calls `getSession` before it reads the ledger.

Every ledger and share row stores `user_id`. Queries only return the signed-in account. `bun run db:seed` writes rows with a null owner; the first account that signs in adopts those rows. A second account gets its own empty book. The sample week uses stable ids, so only one account can hold that sample.

**Settings → Your details / Password / Signed-in devices / Delete this account** covers managing the account. Name changes are immediate. Changing the email sends a confirmation link to the new address and nothing moves until it is clicked, so the sender must be a real domain — `INVITE_FROM_EMAIL`, not the `onboarding@resend.dev` sandbox. Deleting never happens in one step: Better Auth's `sendDeleteAccountVerification` short-circuits the immediate delete, so every deletion is confirmed by a link emailed to the address on the account. The password field in that dialog is an identity pre-check, and it is skipped for a Google-only account. The link's callback runs `beforeDelete`, which clears `settlements` and `shared_expenses` first: those hold `ON DELETE RESTRICT` references to `people`, and RESTRICT is checked as each row goes, so leaving them to the cascade from `user.id` can fail outright.

**Forgot password** is wired up at `/reset-password`, also linked from the sign-in screen. It emails a single-use link that expires in an hour; opening it lands back on `/reset-password?token=…`, which asks for the new password. Requests are rate limited to 5 per five minutes per address so this cannot be used to flood someone's inbox, and the response never says whether the address exists. Like every other email here it needs `RESEND_API_KEY` and a real `INVITE_FROM_EMAIL` — with no key the request still succeeds, the link is never sent, and the server logs why. A Google-only account has no password to reset: sign in with Google instead (Google is a trusted provider for account linking).

Migration `0008_auth_timestamps_timezone` moves Better Auth's timestamp columns to `timestamptz`. The app runs in Asia/Kathmandu while the database is UTC, so a naive column stored local wall clock and Node read it back as UTC — expiry checks drifted by the offset, and a session list would show sessions that had already expired. Existing rows are reinterpreted in the database session's time zone; session lifetimes are 30 days, so nothing is revoked by the change.

## Deploy on Vercel

`vercel.json` sets the install command to `bun install --frozen-lockfile` and the build command to `bun run build`. That runs Next.js and then Serwist, which writes `public/sw.js`. Vercel’s default Next.js command is only `next build`, so leave this override in place or the service worker will be missing. Migrations are not part of the build. A deploy can succeed before the database exists; the app will answer 503 until the tables are there.

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
DATABASE_URL_UNPOOLED='postgresql://USER:PASSWORD@ep-example.region.aws.neon.tech/neondb?sslmode=require' bun run db:migrate
DATABASE_URL='postgresql://USER:PASSWORD@ep-example-pooler.region.aws.neon.tech/neondb?sslmode=require' bun run db:seed
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
4. Copy the client id and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` locally and on Vercel. Restart `bun run dev` after changing `.env.local`.
5. Set `BETTER_AUTH_URL` to the origin you actually open. Locally that is `http://127.0.0.1:3847` if you follow the link above. A mismatch here makes Google’s redirect fail.
6. Preview deployments each have their own host. Leave `BETTER_AUTH_URL` empty on the Preview environment. Add that preview origin and `https://<preview-host>/api/auth/callback/google` in Google Cloud if you need Google on that URL, or use a stable branch alias.

Email and password do not use Google. The Google button stays hidden until both client variables are set.

Vercel’s own deployment protection (team SSO) is separate. Once this app has accounts, you can turn that protection off for visitors who are not on the Vercel team. The ledger still requires a Khata session.

Install Khata from the browser once it is served over HTTPS (or localhost). The manifest, icons, and service worker are part of the production build. API calls are not cached, so an offline open shows the shell and asks for the network before it invents a balance.

### Push notifications

Khata sends a web push when someone shares an expense or records a settlement in a book you are part of. Generate a VAPID key pair once and put it in `.env.local` locally and in the Vercel project for production:

```bash
bun run vapid:generate   # prints a public/private pair
```

Set all three of `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (a `mailto:` or `https://` contact). The public key reaches the browser; the private key signs every send and must never be committed. If any of the three is missing the app still runs, but the Settings card says the notification service is not configured and nothing is ever sent.

People turn notifications on per browser under **Settings → Notifications**, alongside three account-wide preferences: shared expenses, settlements, and whether to include amounts. Amounts are off by default so a lock screen does not show what someone owes. `POST /api/push/test` sends a test to the caller's own subscriptions, rate limited to 5 an hour.

Two things follow from push being per browser and the endpoint being unique per subscription:

- A browser can only be registered to one account. Signing in as somebody else moves that endpoint, which is why signing out detaches it first — the next person on a shared device does not inherit the previous one's notifications.
- A subscription row is removed automatically when the push service reports it gone (404/410), and after repeated permanent failures. The Settings card offers "Register this browser" if the browser holds a subscription the account no longer owns.

Push only works against a production build over HTTPS. `bun run dev` disables the service worker, and the client refuses to subscribe there; use `bun run build && bun run start`, or a preview deployment. Delivery is fire-and-forget: a push that fails never turns a committed expense or settlement into an error.

### The in-app feed

The bell is live, not polled. `GET /api/notifications/stream` holds a server-sent event open and says only "your feed moved" — no notification text ever crosses it — and the browser refetches `GET /api/notifications` exactly as the poll always did. A shared write also refreshes the share book and the ledger, because it moves balances as well as adding a row.

Events are announced with Postgres `LISTEN`/`NOTIFY` rather than an in-process emitter, because on serverless the write and the stream watching for it are usually two different instances that share no memory. That makes `DATABASE_URL_UNPOOLED` a requirement, not just a convenience — see [Neon](#neon). If the stream cannot connect, or the platform stops the function mid-connection, the browser reconnects with backoff and the one-minute poll carries on underneath; neither path depends on the other.

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
| `amount` | Positive number. Nepalese rupees. Omit it when the row is foreign and carries `foreignAmount` + `fxRate`. |
| `currency` | Optional. `NPR` (the default) or the three-letter code the entry was really made in. |
| `foreignAmount`, `fxRate` | Optional, and only together. The amount in `currency` and NPR per one unit of it. The stored NPR value is `foreignAmount × fxRate`. |
| `category` | Free text. Unknown names are created. |
| `merchant` | Description shown in the ledger |
| `account` | One of the caller's own accounts. `GET /api/v1/context` lists them; names match case-insensitively and an unknown name is rejected. |
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

### Money in another currency

Every stored amount is NPR — that is the only figure summaries, balances and splits ever read. An entry can still record what it really was: pick a currency in the entry dialog (or send `currency` with `foreignAmount` and `fxRate` on the API) and the NPR value is computed from the two, while the ledger row keeps the original, e.g. `$20 @ 134.25`. The dialog shows the converted figure live before you save.

Rates are never looked up — you type them, so nothing here depends on a rates API and no historical total silently changes later. The column holds six decimals, and `manualTransactionSchema` refuses a foreign row that is missing either half, so a rate can never be stored without the amount it belongs to. Switching the dialog back to NPR drops both fields instead of leaving them behind. Shared expenses are always NPR.

## Friends, groups, and settling

People, groups, shared expenses, and settlements live in their own tables. They do not change spent or credited totals.

- Equal, exact, shares, and percent splits. Amounts are stored in paisa so a split always adds up to the total.
- Balances are per person: you owe, you are owed, and what other people owe each other. A simplified list shows the fewest payments with the same nets.
- Shared expenses record who added and last edited them, keep prior revisions, and reject stale edits instead of silently overwriting someone else's change. Group owners can correct any entry; members can only change entries they created.
- Settlements can be edited, are protected by the same owner-or-creator rule, and can point at one bank transaction. Cine Mark is linked to the two Nabil charges the same way, without merging those charges into the share total.
- Members can leave a joined group once their balances are settled. Historical entries remain with the group.
- `bun run db:seed` and **Load sample week** load both the bank week and Biker Gang (You, Sameer, Anita, Rajan).

After the sample, you owe Anita NPR 2,000, Sameer owes you NPR 1,425, and Rajan owes you NPR 300.

## Inviting friends to a group

Friends sign up for their own Khata account and join your group as real members.

1. Open **Groups**, pick a group you own, and press **Invite**.
2. Optional: enter an email. That invite then works only for a signed-in account with that address, and only once. Without an email, the link works for anyone who has it until it expires (7 days).
3. Optional: pick a name already in the group (for example a placeholder you added earlier). When the friend joins, that person is linked to their account, so past shares and balances carry over. Otherwise a new member is created from their account name.
4. Copy the link and send it. If `RESEND_API_KEY` is set, an email with the link is sent too.
5. The friend opens `/invite/<token>`, signs in or creates an account, and presses **Join**. They land on **Groups**.

Members see the group's expenses, balances, and members, and can add or edit shared expenses and record settlements inside that group. Each person's bank ledger stays private. Only the group owner can invite, rename, or change members. Group data is stored in the owner's book and shared with members through `group_user_access`. Removing a linked person from the owner's People list revokes that account's access.

Optional env vars: `RESEND_API_KEY` and `INVITE_FROM_EMAIL` (for example `Khata <invites@mail.your-domain.example>`). Without a key the invite link is still created and can be shared by hand.

### Keeping invites out of Promotions

Gmail files mail into Promotions mostly on sender reputation and on how the message looks. The code side is handled: each invite is sent as `"<Inviter> via Khata" <your address>`, with `Reply-To` set to the inviter, a plain-text part, a short HTML part with one link and no images, buttons, tracking or unsubscribe footer, and a unique `X-Entity-Ref-ID` so separate invites do not thread together.

The rest is DNS and cannot be fixed in code:

1. Do not send from `onboarding@resend.dev`. Verify your own domain in Resend, ideally a subdomain such as `mail.your-domain.example`, and add the SPF and DKIM records it gives you.
2. Add a DMARC record, for example `_dmarc.your-domain.example TXT "v=DMARC1; p=none; rua=mailto:dmarc@your-domain.example"`.
3. Keep invites on that subdomain only. Do not send newsletters or marketing from the same address.
4. New domains start with no reputation. The first invites can still land in Promotions or spam; replies and "Move to Primary" from recipients teach Gmail quickly.

Migration `0003_multi_user_invites` adds `group_invites`, `group_user_access`, and `people.linked_user_id`, and backfills owner rows for existing groups. Migration `0009_vengeful_magik` adds expense/settlement authorship, optimistic versions, and durable shared-expense revisions. Run `bun run db:migrate`.

## Pages

Each section is its own route, so links, the back button and bookmarks work:

| Route | What it shows |
| --- | --- |
| `/` | Dashboard. `?range=week\|month\|year\|all\|custom`, `?at=YYYY-MM-DD` to step to another period, `?from=&to=` for a custom range |
| `/ledger` | Every bank and cash entry. Filters live in the URL: `?q=`, `?type=expense\|income\|transfer`, `?category=`, `?from=`, `?to=` |
| `/friends`, `/friends/:id` | Friends and one friend's shared books |
| `/groups`, `/groups/:id` | Groups and one group's expenses and balances |
| `/balances`, `/activity` | Who owes whom; every shared expense and payment |
| `/categories`, `/sync`, `/settings` | Categories, JSON import and export, preferences |

Old `/?view=ledger` links redirect to the matching route. `?action=add` or `?action=split` on any page opens the entry or split dialog (the installed app's shortcuts use this).

The signed-in layout reads the session, paints the navigation, and reads the ledger and share book on the server in parallel while a skeleton of the requested page shows. Writes then update that data in place without a reload.

## API for bots and AI assistants

`/api/v1` lets a bot or assistant (a Telegram bot, a custom GPT, an MCP tool) act for one Khata user. It takes names instead of ids: "split 1200 with Sameer and Anita" becomes `POST /api/v1/expenses {"description":"Dinner","amount":1200,"splitWith":["Sameer","Anita"]}`.

1. In Khata, open **Settings → API keys** and create a key per bot. The full key (`khata_...`) is shown once; only a SHA-256 hash is stored.
2. Send it as `Authorization: Bearer khata_...` or `X-API-Key: khata_...`.
3. Point the bot at `/api/v1/openapi.json` (OpenAPI 3.1) or `/api/v1/llms.txt` (a short guide for a language model). Both, and the `/api/v1` index, are public.

Every response is `{ ok: true, message, data }` or `{ ok: false, error, candidates? }`. `message` is a sentence the bot can read back. When a name matches more than one friend, the call fails with `candidates` so the bot asks instead of guessing. `POST /transactions` accepts an `externalId` so retries do not double-add. Writes are limited to 300 per user per hour.

| Endpoint | What it does |
| --- | --- |
| `GET /context` | Me, friends, groups, categories, accounts, today and balances. Call first |
| `GET/POST /transactions`, `GET/PATCH/DELETE /transactions/:id` | Personal ledger, with totals on search |
| `GET/POST /friends` | Friends with net balances; add by name |
| `GET/POST /groups`, `GET/PATCH /groups/:group` | Groups by id or name; rename, add or remove members |
| `GET/POST /expenses`, `GET/DELETE /expenses/:id` | Shared expenses split equal, exact, by shares or percent |
| `POST /settlements`, `DELETE /settlements/:id` | Record or remove a payment |
| `GET /balances` | Who owes whom, with ready-to-read sentences |

Revoking a key in Settings takes effect on the bot's next call. Keys cannot list or create other keys; that needs a signed-in session. Migration `0006_agent_api_keys` adds the `api_keys` table. Run `bun run db:migrate`.

## Other routes

- `GET/POST /api/transactions` and `PATCH/DELETE /api/transactions/:id`
- `GET/POST /api/categories` and `PATCH/DELETE /api/categories/:id`
- `GET /api/summary` — this week and this month in `Asia/Kathmandu`
- `POST /api/seed` — bank week plus the sample share book
- `GET /api/shares` — people, groups, balances, expenses, settlements
- `GET /api/notifications` — the in-app feed, and `GET /api/notifications/stream` — the live version of it
- `POST /api/people`, `POST /api/groups`, `POST /api/shared-expenses`, `POST /api/settlements`

Default categories: Food, Transport, Parking, Entertainment, Shopping, Bills, Health, Transfer, Income, Other. They are editable. A category that still has entries cannot be deleted; rename it instead.
