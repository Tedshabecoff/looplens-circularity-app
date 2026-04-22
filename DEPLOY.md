# Loop Lens — Circularity Snapshot Tool
## Deployment Guide

### What's in this folder

```
looplens-app/
├── index.html                          ← The full app (no build step needed)
├── netlify.toml                        ← Netlify config + redirects
├── package.json                        ← Node deps for the function
├── netlify/
│   └── functions/
│       └── generate-report.js          ← Serverless function (Anthropic + Brevo)
└── DEPLOY.md                           ← This file
```

---

### Step 1 — Get your API keys

**Anthropic**
1. Go to https://console.anthropic.com
2. Create an API key
3. Keep it — you'll add it as an env var in Netlify

**Brevo**
1. Create a free account at https://brevo.com
2. Go to SMTP & API → API Keys → Generate a new key
3. Under Contacts → Lists, create a list called "Loop Lens Leads" — note its ID number
4. In `netlify/functions/generate-report.js`, find `listIds: [2]` and replace `2` with your actual list ID
5. Verify your sender email address in Brevo (Settings → Senders & IP)

---

### Step 2 — Deploy to Netlify

**Option A — GitHub (recommended)**
1. Push this folder to a GitHub repo
2. Log into https://netlify.com → "Add new site" → "Import an existing project"
3. Connect your GitHub repo
4. Build settings: leave blank (no build command, publish directory = `.`)
5. Click Deploy

**Option B — Netlify CLI**
```bash
npm install -g netlify-cli
cd looplens-app
netlify deploy --prod
```

---

### Step 3 — Add environment variables

In Netlify: Site Settings → Environment Variables → Add

| Variable              | Value                          |
|-----------------------|--------------------------------|
| `ANTHROPIC_API_KEY`   | Your Anthropic API key         |
| `BREVO_API_KEY`       | Your Brevo API key             |
| `BREVO_SENDER_EMAIL`  | Your verified Brevo sender email (e.g. ted@looplens.co) |

After adding vars, trigger a redeploy: Deploys → Trigger deploy.

---

### Step 4 — Test it

1. Visit your Netlify URL (e.g. `https://your-site.netlify.app`)
2. Complete the questionnaire
3. Enter a test name/company/email
4. Verify: report displays on screen + email arrives + contact appears in Brevo

---

### Sharing with portfolio companies

Share the Netlify URL directly. For a custom domain (e.g. `circularity.looplens.co`):
- Netlify: Domain Management → Add custom domain
- Add a CNAME record in your DNS pointing to the Netlify URL

---

### Costs

| Service    | Free tier                          | Overage              |
|------------|------------------------------------|----------------------|
| Netlify    | 125k function calls/month          | $25/mo for more      |
| Anthropic  | Pay-per-use (~$0.003 per report)   | Very low at low volume |
| Brevo      | 300 emails/day, unlimited contacts | $25/mo for more sends |

For a portfolio tool used by ~50 companies, you're looking at pennies per month.

---

### Customization notes

- To update questions: edit the `SECTIONS` array in `index.html`
- To adjust the AI report structure: edit `SYSTEM_PROMPT` in `generate-report.js`
- Brand colors: search `#1B3A2D` (deep green) and `#C9913D` (copper) to update
- looplens.co CTA link appears in both the on-screen report and email — update in both files if needed
