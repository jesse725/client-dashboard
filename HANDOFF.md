# Merova Media — Client Dashboard Handoff

**Owner:** Jesse Chan (jesse@bayridgeadvisory.com)  
**Project path:** `/Users/jessechan/Desktop/client-dashboard`  
**Last updated:** June 26, 2026

---

## What This Is

A private multi-client agency dashboard for Merova Media. It tracks leads, pipeline stats, quotes, ad spend, and ROI for each client. Clients get a private shareable link (no login) that embeds directly into GHL's left sidebar.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Database | SQLite via `better-sqlite3` |
| Auth | NextAuth.js v4 (JWT, CredentialsProvider) |
| Styling | Tailwind CSS v4 |
| Icons | lucide-react |
| CRM | Go High Level (GHL) v2 API |
| Ad Data | Meta Graph API v19.0 |

---

## Running the Project

```bash
cd /Users/jessechan/Desktop/client-dashboard
npm run dev
# Runs on http://localhost:3000
```

**Default admin login:**
- Email: `admin@agency.com`
- Password: `admin123`

**Environment variables** (`.env.local`):
```
NEXTAUTH_SECRET=merova-media-dashboard-secret-2024
NEXTAUTH_URL=http://localhost:3000
```

---

## File Structure

```
client-dashboard/
├── app/
│   ├── admin/
│   │   ├── page.tsx              # Admin settings: GHL sync, users, stage mapping
│   │   └── onboard/
│   │       └── page.tsx          # 5-step new client onboarding form
│   ├── api/
│   │   ├── clients/
│   │   │   ├── route.ts          # GET all clients, POST create new client
│   │   │   └── [id]/
│   │   │       ├── route.ts      # GET, PATCH, DELETE single client
│   │   │       ├── ghl/route.ts  # GET live pipeline stats from GHL
│   │   │       ├── quotes/
│   │   │       │   ├── route.ts         # GET all quotes, POST new quote
│   │   │       │   └── [quoteId]/route.ts  # PATCH, DELETE quote
│   │   │       ├── token/route.ts # POST generate share token, DELETE revoke
│   │   │       └── pipelines/route.ts  # GET GHL pipelines for stage mapping modal
│   │   ├── ghl/
│   │   │   └── pipelines/route.ts  # GET GHL pipelines (used by onboarding form)
│   │   ├── share/
│   │   │   └── [token]/route.ts  # Public share endpoint — no auth, returns all metrics
│   │   ├── settings/route.ts     # GET/POST agency-wide settings (GHL agency key, sync interval)
│   │   ├── sync/route.ts         # POST trigger GHL agency sync
│   │   └── users/route.ts        # GET/POST users
│   ├── c/
│   │   └── [token]/page.tsx      # PUBLIC client share page — no login, embeds in GHL iframe
│   ├── dashboard/
│   │   ├── page.tsx              # All-clients view (admin) or redirect (client)
│   │   └── [clientId]/page.tsx   # Single client dashboard (admin/team view)
│   ├── login/page.tsx
│   ├── layout.tsx
│   ├── page.tsx                  # Root → redirects to /dashboard
│   └── providers.tsx             # SessionProvider wrapper
├── components/
│   ├── AddClientModal.tsx        # Quick-add modal (legacy, onboarding form preferred)
│   ├── EditClientModal.tsx       # Edit all client fields + generate/revoke share link
│   ├── QuoteModal.tsx            # Add/edit/delete a quote
│   └── StageMappingModal.tsx     # Map GHL pipeline stages via dropdowns
├── lib/
│   ├── auth.ts                   # NextAuth config (JWT, CredentialsProvider)
│   ├── db.ts                     # SQLite init, schema, all migrations
│   ├── ghl.ts                    # GHL v2 API functions
│   ├── meta.ts                   # Meta Ads Graph API v19.0
│   ├── metrics.ts                # All metric calculations (ROI, ROAS, CPL, rates)
│   └── sync.ts                   # GHL agency-wide sync (all sub-accounts)
├── types/
│   └── index.ts                  # TypeScript interfaces
├── data/
│   └── dashboard.db              # SQLite database (auto-created on first run)
├── .env.local                    # NEXTAUTH_SECRET, NEXTAUTH_URL
└── next.config.ts                # serverExternalPackages for better-sqlite3 + bcryptjs
```

---

## Database Schema

**Table: `clients`**

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | auto |
| name | TEXT | client business name |
| slug | TEXT UNIQUE | URL-safe name |
| logo_url | TEXT | optional |
| ghl_api_key | TEXT | sub-account PIT token (preferred over agency key) |
| ghl_location_id | TEXT | GHL sub-account location ID |
| ghl_pipeline_id | TEXT | ID of the tracked pipeline |
| stage_leads | TEXT | GHL stage ID for "New Lead" |
| stage_contacted | TEXT | GHL stage ID for "Contacted (Responded)" |
| stage_phone | TEXT | GHL stage ID for "Discovery Call Booked" |
| stage_inhome | TEXT | GHL stage ID for "In Person Quote Scheduled" |
| stage_unqualified | TEXT | GHL stage ID for "Unqualified" |
| retainer_price | REAL | monthly retainer in $ |
| ad_spend | REAL | manual total ad spend override |
| daily_ad_spend | REAL | $ per day (auto-calculates total = daily × days together) |
| meta_access_token | TEXT | Meta Ads long-lived access token |
| meta_ad_account_id | TEXT | format: `act_XXXXXXXXXX` |
| contract_url | TEXT | Google Drive or DocuSign link |
| slack_url | TEXT | Slack channel link |
| start_date | TEXT | contract start date (YYYY-MM-DD) |
| date_launched | TEXT | ads launch date (YYYY-MM-DD) |
| date_billed | TEXT | last billing date (YYYY-MM-DD) |
| rebilling_date | TEXT | next billing date (YYYY-MM-DD) |
| next_checkin | TEXT | ISO datetime for next check-in call |
| ghl_custom_fields | TEXT | JSON blob of custom field data |
| share_token | TEXT UNIQUE | hex token for public share link |
| created_at | TEXT | auto |

**Table: `quotes`**

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | auto |
| client_id | INTEGER FK | → clients.id, CASCADE DELETE |
| customer_name | TEXT | |
| value | REAL | dollar value of the quote |
| status | TEXT | `open` / `closed` / `lost` |
| drive_url | TEXT | link to quote document |
| notes | TEXT | |
| created_at | TEXT | auto |

**Table: `users`**

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| email | TEXT UNIQUE | |
| password_hash | TEXT | bcrypt |
| role | TEXT | `admin` or `client` |
| client_id | INTEGER | null for admin, links to clients.id for client users |
| name | TEXT | |

**Table: `settings`** — key/value store
- `ghl_agency_key` — agency-level PIT token
- `sync_interval_minutes` — GHL auto-sync interval
- `last_sync` — ISO timestamp of last sync run

**Table: `sync_log`** — history of GHL agency syncs

---

## Current Clients in DB

| ID | Name | GHL Location | Pipeline Mapped | Share Token | Retainer | Daily Spend |
|----|------|-------------|-----------------|-------------|----------|-------------|
| 1 | Smart Wire Systems | ZJqSzUdBgcWGGCFcgQ3d | ✅ Yes | ✅ Yes | $1,750/mo | $50/day |
| 2 | Aventador Cleaning | S6TNYTiCxcepeDkhfTQR | ❌ No | ❌ No | — | — |
| 3 | JLC Media | QZUuAuXl2JKBiP84bkko | ❌ No | ❌ No | — | — |
| 4 | Merova Media | NqZup9jK9NOBs8GDIyuX | ❌ No | ❌ No | — | — |
| 5 | Next AV Company | hThF4KoNQAN0ZzTmTP98 | ❌ No | ❌ No | — | — |

**Smart Wire Systems** is fully configured. Clients 2–5 were auto-imported from GHL but need pipeline mapping and retainer/spend details filled in via the Edit modal or onboarding form.

**Smart Wire share link:**
`http://localhost:3000/c/6b98cb34fb07e87563d77c4935e4947d5540129755f0657f`

---

## GHL Integration

### API Version
All GHL calls use **v2**: `https://services.leadconnectorhq.com` with header `Version: 2021-07-28`

### Key functions (`lib/ghl.ts`)
- `fetchAgencyLocations(agencyApiKey)` — lists all sub-accounts under the agency
- `fetchLocationPipelines(apiKey, locationId)` — lists pipelines + stages for a location
- `fetchGHLPipelineStats(apiKey, locationId, pipelineId, stageIds)` — counts opportunities per stage (paginates all results, uses total count as `leads`)
- `resolveApiKey(locationKey, agencyKey)` — uses sub-account key if set, otherwise falls back to agency key

### Pipeline stats logic
`leads` = total opportunities in the pipeline (not just those in "New Lead" stage — this ensures rates stay accurate as people move through stages)

### GHL agency key
Stored in `settings` table under key `ghl_agency_key`.  
Current value starts with `pit-d4d3...` — this token does NOT have scopes enabled (was causing 401s). The workaround is to use sub-account keys per client.

### Smart Wire sub-account key
`pit-ab143f4a-4900-4c93-a205-950fdf6d4d33` — stored in `clients.ghl_api_key` for client ID 1.

### Stage IDs for Smart Wire
| Stage | GHL ID |
|-------|--------|
| New Lead | `228df47e-81fc-4747-9600-f55baa4d4fde` |
| Contacted (Responded) | `2cf4bd1b-b34d-46f5-b1d1-a272c9480dca` |
| Discovery Call Booked | `1aab2797-ebae-4274-b8a4-b49a1a4892b6` |
| In Person Quote Scheduled | `665e9309-4f71-453c-bdab-6f25858e0fde` |
| Unqualified | `33dd3fbf-7470-4e1d-9fab-2d2cd1ddcfc6` |

### Contact Rate tracking (GHL Workflow)
A GHL Workflow is set up to auto-move leads to "Contacted (Responded)" when they reply to any message. Trigger: "Customer Replied". Action: Move to Contacted stage.

---

## Meta Ads Integration

### File: `lib/meta.ts`
Calls `https://graph.facebook.com/v19.0/act_{accountId}/insights`  
Fields: `spend, impressions, clicks, ctr, cpc, reach, frequency`  
Date preset: `maximum` (all-time)

### Smart Wire Meta credentials
- Ad Account ID: `act_2255745248569716`
- Access token: stored in DB (long-lived, expires ~60 days from June 26 2026)
- When token expires: generate new one at developers.facebook.com → Graph API Explorer → `ads_read` permission → extend to long-lived token

### Ad spend priority (in `lib/metrics.ts`)
1. Meta live spend (if token + account ID set) ← highest priority
2. `daily_ad_spend × daysTogether` (if daily spend > 0)
3. Manual `ad_spend` field ← fallback

---

## Metrics Calculated (`lib/metrics.ts`)

| Metric | Formula |
|--------|---------|
| daysTogether | `(now - start_date) / 86400000` |
| monthsWorked | calendar months |
| totalRevenue | sum of closed quote values |
| pipelineValue | sum of open quote values |
| totalAdSpend | Meta spend OR daily×days OR manual |
| totalRetainer | `retainer_price × monthsWorked` |
| totalCost | `totalAdSpend + totalRetainer` |
| ROI | `(revenue - cost) / cost × 100` |
| ROAS | `revenue / adSpend` |
| CAC | `totalCost / closedDeals` |
| CPL | `totalAdSpend / leads` |
| contactRate | `contacted / leads × 100` |
| leadToBookRate | `phone / leads × 100` |
| bookToHomeRate | `inhome / phone × 100` |
| homeToCloseRate | `closedDeals / inhome × 100` |
| leadToCloseRate | `closedDeals / leads × 100` |
| closeRateByCount | `closedDeals / totalQuotes × 100` |
| closeRateByValue | `revenue / totalQuoted × 100` |

---

## Two User Roles

| Role | Access |
|------|--------|
| `admin` | All clients, all settings, edit everything |
| `client` | Only their own client dashboard (read-only) |

Client users have `client_id` set in the users table linking to their client record.

---

## Public Share Page (`/c/[token]`)

- No login required
- Uses `share_token` (hex string) stored on the client record
- Displays: Days Together, Campaign Overview, Meta Ad Performance, Lead Pipeline funnel, Conversion Rates, Quotes & Deals
- Designed with inline styles (not Tailwind) so it renders cleanly in GHL's iframe
- Auto-syncs every hour via `setInterval`
- Shows "Last synced HH:MM" in footer

### GHL Sidebar embed instructions
1. In GHL sub-account → Settings → Custom Menu Links
2. Add link, name it "My Dashboard"
3. Paste the `/c/[token]` URL
4. Check "Open in iframe"
5. Save

---

## Important Next.js 16 Pattern

All route handlers use **async params** (required in Next.js 16):

```typescript
// CORRECT
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // ...
}

// WRONG (will break)
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params; // error in Next.js 16
}
```

---

## Key Pages & URLs

| URL | Description |
|-----|-------------|
| `/` | Redirects to `/dashboard` |
| `/login` | Login page |
| `/dashboard` | All clients list (admin) |
| `/dashboard/[clientId]` | Single client admin view with sync button |
| `/admin` | Admin settings: GHL agency sync, users, stage mapping |
| `/admin/onboard` | 5-step new client onboarding form |
| `/c/[token]` | Public client share page (no login) |

---

## Onboarding Flow (for new clients)

Go to `/admin/onboard` (or click "Onboard Client" button).

**What it does automatically on submit:**
1. Creates client record in DB with unique slug
2. Auto-generates share token
3. If GHL API key + location ID provided: fetches pipelines and fuzzy-maps stages by name
4. Returns success screen with share URL and step-by-step GHL sidebar instructions

**For clients 2–5 (Aventador, JLC, Merova, Next AV):**
These were auto-imported from GHL agency sync but are incomplete. Need to:
- Set retainer price and daily ad spend
- Get sub-account API keys for each
- Map pipeline stages (use Stage Mapping modal in `/admin` or re-onboard)
- Generate share tokens (Edit modal → "Generate Share Link")

---

## Auto-Sync Behavior

- GHL pipeline data syncs on page load + every 1 hour (client-side `setInterval`)
- Both the admin dashboard and the public share page auto-refresh
- The "Sync GHL" button in the admin dashboard forces an immediate sync
- The agency-wide sync (imports all GHL sub-accounts) runs on a schedule set in Admin → GHL Sync tab

---

## Known Issues / TODO

1. **Agency GHL key has no scopes** — `pit-d4d3...` returns 401 for all API calls. Agency-wide sync won't discover new sub-accounts. Fix: go to GHL → Settings → Private Integrations → edit the agency key → enable `opportunities.readonly`, `locations.readonly`, `pipelines.readonly`.

2. **Clients 2–5 need full setup** — see onboarding section above.

3. **Meta token expires ~60 days** — Smart Wire token expires around late August 2026. Will need renewal.

4. **No deployment yet** — running locally on `localhost:3000`. To deploy: Railway is recommended (persists SQLite). Vercel will NOT work without switching to a hosted DB (SQLite is ephemeral on Vercel).

5. **AddClientModal still exists** — legacy quick-add modal component. The preferred flow is now `/admin/onboard`. The "Add Client" button on the dashboard page now links to onboard instead.
