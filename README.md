# Apartment Tracker

Personal apartment tracking tool. Single-user, intentionally minimal.

---

## Implementation plan (short version)

| Layer | What it does |
|---|---|
| **Supabase DB** | `apartments` + `units` tables |
| **Edge Function** | Fetches the URL server-side (avoids CORS), does best-effort HTML parsing, returns JSON |
| **`index.html`** | Dashboard list + URL import form |
| **`apartment.html`** | Detail view for one property |
| **`js/config.js`** | Your Supabase credentials |
| **`js/db.js`** | Supabase client + thin DB helpers |
| **`js/dashboard.js`** | Import flow, card rendering, refresh/delete |
| **`js/detail.js`** | Detail + units rendering, refresh |

---

## File structure

```
apartmentDB/
├── index.html              ← dashboard + import form
├── apartment.html          ← detail view
├── js/
│   ├── config.js           ← YOUR credentials go here
│   ├── db.js               ← Supabase client + DB helpers
│   ├── dashboard.js        ← dashboard page logic
│   └── detail.js           ← detail page logic
├── supabase/
│   └── functions/
│       └── fetch-apartment/
│           └── index.ts    ← Edge Function (fetch + parse)
├── sql/
│   └── schema.sql          ← run once in Supabase SQL Editor
└── README.md
```

---

## Setup

### 1. Create a Supabase project

Go to [supabase.com](https://supabase.com), create a free project.

### 2. Run the schema

- Open **SQL Editor → New Query** in your Supabase dashboard
- Paste the contents of `sql/schema.sql` and run it

### 3. Add your credentials to `js/config.js`

```js
export const SUPABASE_URL      = 'https://xxxx.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJ...';   // Settings → API → anon/public key
```

> The **anon key** is safe to use in client-side JS. It controls access through RLS policies.
> Keep your `config.js` (and thus your GitHub repo) **private** if you don't want others
> to read your apartment data.

### 4. Install Supabase CLI and deploy the Edge Function

```bash
# Install CLI (once)
npm install -g supabase

# Link to your project
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# Deploy the function
supabase functions deploy fetch-apartment
```

Find `YOUR_PROJECT_REF` in Supabase dashboard → Settings → General → Reference ID.

### 5. Serve the frontend

The HTML files use ES modules (`type="module"`), so you need a local server or GitHub Pages.

**Local:**
```bash
# Python (quick)
python -m http.server 8080

# or npx
npx serve .
```

Then open `http://localhost:8080`.

**GitHub Pages:**
Push to a private (or public) repo, enable Pages on the `main` branch → root `/`.

---

## Usage

1. Open `index.html`
2. Paste any apartment URL and click **Fetch**
3. Review the extracted data (edit any wrong fields)
4. Click **Save Apartment**
5. The card appears in the dashboard
6. Click **↻ Refresh** on a card to re-fetch the page and update saved data
7. Click the property name to open the detail view

---

## Parsing notes

The Edge Function does best-effort extraction:

- Reads `<title>`, Open Graph tags, and `<meta description>`
- Parses `application/ld+json` blocks looking for `ApartmentComplex`, `Place`, or `LocalBusiness` types
- Falls back to regex patterns for phone, address (City, ST ZIP), rent (`$X,XXX`), sqft, and availability text

**It will not work perfectly on every site** — especially JavaScript-rendered SPAs where
the meaningful content isn't in the initial HTML. In that case, fill in the fields manually
in the review step before saving.

---

## Security note

The anon key + RLS-allow-all policy means anyone who obtains your Supabase URL and anon key
can read and write your data. For a short-term private tool this is acceptable. If you want to
lock it down, add Supabase Auth and change the RLS policies to `auth.uid() is not null`.
