# Vercel Cron Setup

KM Boards uses two cron jobs for automated tasks. Both are configured in `vercel.json`.

---

## Cron Endpoints

| Endpoint | Schedule | Purpose |
|----------|----------|---------|
| `/api/cron/digest` | `0 8 * * *` (daily 8 AM UTC) | Sends email digests to users with assigned/overdue cards |
| `/api/cron/qa-monitor` | `0 */6 * * *` (every 6 hours) | Runs scheduled QA checks (dev QA, visual regression) |

---

## Setup Steps

### 1. Set the CRON_SECRET environment variable

Both endpoints use `CRON_SECRET` as a bearer token to prevent unauthorized access.

```bash
# Generate a secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add it to your Vercel project:
- Go to **Vercel Dashboard > Project > Settings > Environment Variables**
- Add `CRON_SECRET` with the generated value
- Apply to **Production** (and optionally Preview)

### 2. Deploy with vercel.json

The `vercel.json` at project root registers the cron jobs:

```json
{
  "crons": [
    {
      "path": "/api/cron/digest",
      "schedule": "0 8 * * *"
    },
    {
      "path": "/api/cron/qa-monitor",
      "schedule": "0 */6 * * *"
    }
  ]
}
```

After deploying, Vercel will automatically call these endpoints on schedule with the `Authorization: Bearer <CRON_SECRET>` header.

### 3. Verify

After deployment:
- Go to **Vercel Dashboard > Project > Cron Jobs** tab
- Both jobs should appear with their schedules
- Click "Trigger" to test manually

### 4. Required Environment Variables

Both cron endpoints need these vars set in Vercel:

| Variable | Required | Purpose |
|----------|----------|---------|
| `CRON_SECRET` | Yes | Auth token for cron requests |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Admin access for querying all users |
| `RESEND_API_KEY` | Digest only | Sending email digests |
| `RESEND_FROM_EMAIL` | Digest only | Sender address |
| `BROWSERLESS_API_KEY` | QA only | Headless browser for Lighthouse/visual checks |

---

## How Each Cron Works

### Digest Cron (`/api/cron/digest`)

1. Queries `digest_configs` for users with digests enabled
2. For each user: fetches assigned cards, overdue cards
3. Builds HTML email via `buildDigestEmail()`
4. Sends via Resend using `sendDigest()`
5. Returns `{ sent, failed }` counts

### QA Monitor Cron (`/api/cron/qa-monitor`)

1. Queries `qa_schedules` for due checks via `getDueSchedules()`
2. For each schedule: runs dev QA (`runDevQA`) and/or visual regression (`runVisualRegression`)
3. Stores results via `storeQAResult()`
4. Creates notifications for failures
5. Marks schedule as run via `markScheduleRun()`
6. `maxDuration = 300` (5 minutes) to allow Lighthouse scans to complete

---

## Local Testing

To test cron endpoints locally without Vercel:

```bash
# Start dev server
npm run dev

# Test digest (no auth required if CRON_SECRET not set)
curl http://localhost:3000/api/cron/digest

# Test with auth
curl -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/digest
```

---

## Vercel Plan Requirements

- **Hobby plan**: Cron jobs run once per day minimum. The `*/6` schedule will be rounded to daily.
- **Pro plan**: Supports custom schedules down to every minute. Both crons work as configured.
