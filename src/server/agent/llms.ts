import { ENDPOINTS } from "@/server/agent/openapi";

/** A short guide for a language model, served as /api/v1/llms.txt. */
export function llmsText(origin: string) {
  const base = `${origin}/api/v1`;
  return `# Khata API

> Khata is a personal NPR (Nepalese rupee) ledger with a Splitwise-style share book. This API lets an assistant act for one Khata user.

Base URL: ${base}
OpenAPI: ${base}/openapi.json
Auth: send the user's personal key as \`Authorization: Bearer khata_...\` (or \`X-API-Key: khata_...\`). Keys are made in Khata → Settings → API keys.

## Rules

- Call GET /context first. Use the friend, group, category and account names it returns.
- Refer to people by name. "me" is the user. A unique first name is enough.
- If a response has ok:false with \`candidates\`, ask the user which one they meant. Never guess between people: it moves money.
- Every response has \`message\`. Read it back to the user.
- Personal spending → POST /transactions. A bill shared with friends → POST /expenses. Someone paying back → POST /settlements.
- Amounts are NPR. An entry that was really made in another currency carries that too: send
  {"currency": "USD", "foreignAmount": 20, "fxRate": 134.25} instead of "amount" and the NPR value
  is computed from those two. Dates are YYYY-MM-DD, "today" or "yesterday", in Asia/Kathmandu. Date defaults to today.
- Confirm with the user before any DELETE.
- When retrying a POST /expenses or POST /settlements after a timeout, resend it with the same Idempotency-Key header (any unique string, or an "externalId" in the body). The first answer comes back instead of a second entry.

## Endpoints

${ENDPOINTS.map(([method, path, text]) => `- ${method} ${path} — ${text}`).join("\n")}

## Examples

"I spent 450 on lunch at Bajeko Sekuwa with my Nabil card"
POST /transactions {"amount": 450, "merchant": "Bajeko Sekuwa", "category": "Food", "account": "Nabil"}

Accounts are the caller's own; /context lists them. An account name you send is matched
case-insensitively against that list, and an unknown one is rejected rather than created.

"I paid $20 for Figma, the dollar was 134.25"
POST /transactions {"currency": "USD", "foreignAmount": 20, "fxRate": 134.25, "merchant": "Figma", "category": "Bills"}

"Split dinner 1200 with Sameer and Anita, I paid"
POST /expenses {"description": "Dinner", "amount": 1200, "splitWith": ["Sameer", "Anita"]}

"Rajan paid 3000 for fuel for the Biker Gang"
POST /expenses {"description": "Fuel", "amount": 3000, "group": "Biker Gang", "paidBy": "Rajan"}

"I paid 500 for Anita's movie ticket"
POST /expenses {"description": "Movie ticket", "amount": 500, "splitWith": ["Anita"], "excludeMe": true}

"Groceries 900: my share 600, Anita 300"
POST /expenses {"description": "Groceries", "amount": 900, "splitMode": "exact", "split": {"me": 600, "Anita": 300}}

"Sameer paid me back 1425"
POST /settlements {"from": "Sameer", "amount": 1425}

"Make a group Pokhara trip with Sameer and Bikash"
POST /groups {"name": "Pokhara trip", "members": ["Sameer", "Bikash"], "createMissing": true}

"Who owes me?"
GET /balances

"How much did I spend on food this month?"
GET /transactions?category=Food&from=2026-10-01&to=2026-10-31 → data.totals.spent
`;
}
