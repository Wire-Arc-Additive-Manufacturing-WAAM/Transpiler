# Nibebee

**Tagline:** Connect. Carry. Delivered.

Monorepo for the Nibebee marketplace (lorry operators ↔ load seekers in Kenya, Uganda, and Tanzania).

| Area        | Path        | Stack                          |
|------------|-------------|---------------------------------|
| Frontend   | `frontend/` | Next.js 14, Tailwind, shadcn-style UI |
| Backend    | `backend/`  | NestJS 10, TypeScript           |
| Database   | `prisma/`   | PostgreSQL + Prisma 5           |

## Quick start (local)

1. **Install Docker Desktop** (recommended) or use any PostgreSQL 16+ instance and Redis 7+.

2. From the `Nibebee` folder, start infrastructure:

   ```bash
   docker compose up -d
   ```

   This exposes Postgres on **host port 5433** (see `docker-compose.yml`) and Redis on **6379**.

3. **Environment files**

   - Copy `Nibebee/.env.example` → `Nibebee/backend/.env` and fill at least `DATABASE_URL` and `JWT_ACCESS_SECRET` (32+ random characters).
   - Copy `Nibebee/frontend/.env.example` → `Nibebee/frontend/.env.local` and set `NEXT_PUBLIC_API_URL=http://localhost:4000/api`.

4. **Database schema & seed**

   ```bash
   cd backend
   npm install
   npx prisma migrate dev
   npm run db:seed
   ```

   The seed creates an admin user (override with `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` in `.env`).

5. **Run apps**

   ```bash
   # Terminal A — API (default http://localhost:4000)
   cd backend
   npm run start:dev

   # Terminal B — Web (http://localhost:3000)
   cd frontend
   npm install
   npm run dev
   ```

6. Open **http://localhost:3000** — landing, registration, login, dashboards, and browse UI.

## Manual configuration (third-party services)

Paste secrets into `backend/.env` and `frontend/.env.local` using the **exact variable names** from `Nibebee/.env.example`.

1. **Supabase (Auth — OTP + OAuth)**  
   Create a project at [supabase.com](https://supabase.com). In **Project Settings → API**, copy **Project URL** → `SUPABASE_URL` (backend) and `NEXT_PUBLIC_SUPABASE_URL` (frontend). Copy **anon public** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Copy **service_role** (server only) → `SUPABASE_SERVICE_ROLE_KEY`. In **Project Settings → API → JWT Settings**, copy **JWT Secret** → `SUPABASE_JWT_SECRET` if you verify Supabase JWTs in Nest.

2. **Africa’s Talking (SMS)**  
   Sign up at [africastalking.com](https://africastalking.com). From the dashboard, copy **Username** → `AT_USERNAME` and **API Key** → `AT_API_KEY`. Register a **Sender ID** (where supported) → `AT_SENDER_ID`.

3. **Resend (email + PDF delivery)**  
   Create an account at [resend.com](https://resend.com). Create an API key → `RESEND_API_KEY`. Verify your sending domain, then set `EMAIL_FROM` (e.g. `Nibebee <no-reply@your-domain.com>`).

4. **Flutterwave (subscriptions & escrow collections)**  
   At [flutterwave.com](https://flutterwave.com), open **Settings → API keys**: `FLW_PUBLIC_KEY`, `FLW_SECRET_KEY`, `FLW_ENCRYPTION_KEY`. Under **Webhooks**, create a secret → `FLW_WEBHOOK_SECRET` and point the URL to your deployed API, e.g. `https://api.your-domain.com/api/webhooks/flutterwave`.

5. **Google Maps**  
   In [Google Cloud Console](https://console.cloud.google.com), enable **Maps JavaScript API** and **Places** (and **Directions** if you use ETA). Create an API key restricted by HTTP referrer (frontend) → `NEXT_PUBLIC_GOOGLE_MAPS_KEY`.

6. **Mapbox**  
   At [mapbox.com](https://www.mapbox.com), create a **Default public token** → `NEXT_PUBLIC_MAPBOX_TOKEN` for optional map styles or fallbacks.

7. **PayPal Business (payouts of net subscription revenue)**  
   Use [PayPal Developer](https://developer.paypal.com/) for `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`. Set `PAYPAL_BUSINESS_EMAIL` to the receiving Business account email. Link PayPal to Flutterwave using Flutterwave’s dashboard payout instructions (country-dependent); trigger payouts from your `FLW_WEBHOOK` handler when subscription charges succeed.

8. **Cloudinary (lorry photos, evidence)**  
   From the [Cloudinary console](https://cloudinary.com), copy **Cloud name**, **API key**, **API secret** → `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.

9. **Vercel (frontend) & Railway (API, Postgres, Redis)**  
   Push the repo to GitHub. Deploy `frontend/` to [Vercel](https://vercel.com) and `backend/` to [Railway](https://railway.app). Provision **PostgreSQL** and **Redis** on Railway, set `DATABASE_URL` and `REDIS_URL` on the backend service, run `npx prisma migrate deploy` in a release command, and set `FRONTEND_URL` to your Vercel URL for CORS and cookies.

## PayPal ↔ Flutterwave (operator checklist)

1. Complete Flutterwave business verification for your country.  
2. In Flutterwave, open **Payouts** / **Settlement** settings and add your **PayPal Business** email as the settlement destination where the product allows.  
3. Keep subscription charges flowing to Flutterwave; use webhooks to append rows to `RevenueLedger` and enqueue `PayoutRecord` entries for reconciliation.  
4. Until automation is fully wired, use the admin revenue view (extend Nest admin module) to compare Flutterwave settlements against PayPal deposits.

## Deploying to a live domain (summary)

1. Buy a domain (e.g. Namecheap).  
2. GitHub → Vercel (frontend) + Railway (backend, Postgres, Redis).  
3. Point DNS: apex/`www` to Vercel; optional `api` subdomain to Railway.  
4. HTTPS is handled by Vercel/Railway.  
5. Run Prisma migrations on production.  
6. Create the first admin with `npm run db:seed` (or a one-off production script with strong passwords).

## First users & ongoing operations

- Seed demo listings or onboard a pilot SACCO.  
- Promote in WhatsApp/Facebook trucking groups (KE/UG/TZ).  
- Log in at `/admin` as a seeded **Admin** to extend: KYC queue, disputes, SMS broadcast, promo codes, revenue.  
- Ship updates via Git → Vercel/Railway auto-deploy.

## Security notes (from product spec)

- Access JWT lifetime **15 minutes**; refresh token is **httpOnly** cookie (`nibebee_refresh`).  
- Roles: `LoadSeeker`, `LorryOwner`, `Driver`, `Admin` (schema-ready).  
- Global validation, Helmet, CORS with credentials, throttling (in-memory default; swap to Redis storage in production).  
- KYC files: store **ciphertext + iv + authTag** using `KYC_ENCRYPTION_KEY_HEX` (generate a random 32-byte hex key).  
- **Supabase Row Level Security** applies when you mirror sensitive tables into Supabase; this repo uses Prisma + PostgreSQL as the primary store—keep contact fields out of public DTOs until `Contract.status === Signed` (extend `UsersService` / listing serializers accordingly).

## Repository layout

```
Nibebee/
  prisma/           # schema.prisma + seed.ts
  backend/          # NestJS API (`/api` prefix)
  frontend/         # Next.js app
  docker-compose.yml
  .env.example
  README.md
```

## License

Private / unlicensed by default — adjust for your organisation.
