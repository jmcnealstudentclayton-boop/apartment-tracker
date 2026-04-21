// supabase/functions/fetch-apartment/index.ts
// Supabase Edge Function — fetch a URL and extract apartment data.
// Runs in Deno. Deploy with: supabase functions deploy fetch-apartment

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let url: string;
  try {
    const body = await req.json();
    url = body?.url?.trim();
    if (!url) throw new Error("url is required");
    new URL(url); // validate
  } catch (e) {
    return jsonResponse(400, { error: String(e) });
  }

  try {
    const html = await fetchHtml(url);
    const data = parseApartmentHtml(html, url);
    return jsonResponse(200, { ok: true, data });
  } catch (e) {
    return jsonResponse(500, { error: String(e) });
  }
});

// ─── HTML fetch ───────────────────────────────────────────────

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

// ─── Parser ───────────────────────────────────────────────────

function parseApartmentHtml(html: string, url: string) {
  const domain = extractDomain(url);

  // Basic tag extractions
  const title = firstMatch(html, /<title[^>]*>([^<]+)<\/title>/i);
  const ogTitle = firstMatch(
    html,
    /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i,
  ) || firstMatch(html, /<meta[^>]+content="([^"]+)"[^>]+property="og:title"/i);
  const metaDesc = firstMatch(
    html,
    /<meta[^>]+name="description"[^>]+content="([^"]+)"/i,
  ) || firstMatch(html, /<meta[^>]+content="([^"]+)"[^>]+name="description"/i);

  // JSON-LD structured data
  const jsonLd = extractJsonLd(html);

  // Build fields from JSON-LD first, fall back to heuristics
  let propertyName = jsonLd?.name || ogTitle || cleanTitle(title) || "";
  let addressLine1 = jsonLd?.address?.streetAddress || "";
  let city = jsonLd?.address?.addressLocality || "";
  let state = jsonLd?.address?.addressRegion || "";
  let zip = jsonLd?.address?.postalCode || "";
  let phone = jsonLd?.telephone || "";
  let officialUrl = (jsonLd?.url !== url ? jsonLd?.url : "") || "";

  // Phone fallback
  if (!phone) {
    phone = firstMatch(html, /\(?\b(\d{3})\)?[\s.\-]\d{3}[\s.\-]\d{4}\b/) || "";
  }

  // Address fallback: look for "City, ST 12345" pattern in visible text
  if (!city) {
    const stripped = stripTags(html);
    const m = stripped.match(/\b([A-Z][a-zA-Z\s]{2,25}),\s*([A-Z]{2})\s+(\d{5})\b/);
    if (m) {
      city = m[1].trim();
      state = m[2];
      zip = m[3];
    }
  }

  // Rent heuristic
  const rentMatches = matchAll(
    html,
    /\$\s*[\d,]+(?:\s*[–\-]\s*\$?\s*[\d,]+)?\s*(?:\/mo|\/month|per\s+month)?/gi,
    6,
  );
  const rentSummaryText = rentMatches.join("  ·  ") || "";

  // Sqft heuristic
  const sqftMatches = matchAll(
    html,
    /[\d,]+\s*(?:[–\-]\s*[\d,]+\s*)?sq\.?\s*ft\.?/gi,
    6,
  );
  const sqftSummaryText = sqftMatches.join("  ·  ") || "";

  // Availability heuristic
  const availMatches = matchAll(
    html,
    /(?:available|move[- ]in|vacancy)[^.<]{0,80}/gi,
    4,
  );
  const availabilitySummaryText = availMatches.join("  ·  ") || "";

  // Raw text (first 3 000 chars of visible text, for debugging)
  const rawText = stripTags(html).slice(0, 3000);

  return {
    source_url: url,
    source_domain: domain,
    property_name: propertyName,
    official_url: officialUrl,
    address_line1: addressLine1,
    city,
    state,
    zip,
    phone,
    rent_summary_text: rentSummaryText,
    sqft_summary_text: sqftSummaryText,
    availability_summary_text: availabilitySummaryText,
    raw_text: rawText,
    last_fetched_at: new Date().toISOString(),
  };
}

// ─── Helpers ──────────────────────────────────────────────────

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function firstMatch(str: string, re: RegExp): string {
  return re.exec(str)?.[1]?.trim() || "";
}

function matchAll(str: string, re: RegExp, limit: number): string[] {
  const results: string[] = [];
  for (const m of str.matchAll(re)) {
    const val = m[0].replace(/\s+/g, " ").trim();
    if (val && !results.includes(val)) {
      results.push(val);
      if (results.length >= limit) break;
    }
  }
  return results;
}

function stripTags(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTitle(title: string): string {
  // "Property Name | Apartments.com" → "Property Name"
  return title.split(/[|\-–—]/)[0].trim();
}

// Try known LD+JSON types. Returns the first useful object found.
function extractJsonLd(html: string): Record<string, any> | null {
  const re = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  const useful = ["ApartmentComplex", "Apartment", "Place", "LocalBusiness", "Hotel"];

  for (const m of html.matchAll(re)) {
    try {
      const parsed = JSON.parse(m[1]);
      const items: any[] = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (useful.includes(item["@type"])) return item;
        // @graph support
        if (Array.isArray(item["@graph"])) {
          for (const g of item["@graph"]) {
            if (useful.includes(g["@type"])) return g;
          }
        }
      }
    } catch {
      // malformed JSON-LD — skip
    }
  }
  return null;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
