import { extractLtaBatchLink, isAllowedBatchUrl, normalizeFeed, parseLtaTimestamp } from "./normalize.mjs";
import { sampleFeed } from "./sample-feed.mjs";

const LTA_BATCH_URL = "https://datamall2.mytransport.sg/ltaodataservice/EVCBatch";
const ONEMAP_ORIGIN = "https://www.onemap.gov.sg";
const PAGES_ORIGIN = "https://ncheewee.github.io";
const WINDOW_MS = 5 * 60 * 1000;
const FETCH_MS = 15000;

let ltaInflight = null;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders(request) });
      }
      if (request.method === "GET" && url.pathname === "/api/health") {
        return json(request, {
          ok: true,
          ltaConfigured: Boolean(env.LTA_ACCOUNT_KEY),
          onemapConfigured: onemapConfigured(env),
        });
      }
      if (request.method === "GET" && url.pathname === "/api/chargers") {
        return json(request, await chargersPayload(request, env, ctx));
      }
      if (request.method === "GET" && url.pathname === "/api/search") {
        return json(request, await searchPlaces(url.searchParams.get("q") || "", env, request));
      }
      return json(request, { error: "Not found" }, 404);
    }

    const asset = await env.ASSETS.fetch(request);
    const headers = new Headers(asset.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set("Permissions-Policy", "camera=(), geolocation=(self), microphone=(), payment=()");
    if (url.pathname === "/" || url.pathname.endsWith(".html")) {
      headers.set("Cache-Control", "no-cache");
      headers.set("Content-Security-Policy", contentSecurityPolicy());
    }
    return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
  },
};

async function chargersPayload(request, env, ctx) {
  if (!env.LTA_ACCOUNT_KEY) return samplePayload();

  const slot = Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS;
  const freshKey = cacheRequest(request, `/__cache/chargers/${slot}`);
  const lastKey = cacheRequest(request, "/__cache/chargers/last");
  const fresh = await cacheGet(freshKey);
  if (fresh) return fresh;

  try {
    const live = await refreshLta(env);
    ctx.waitUntil(cachePut(freshKey, live, 300).catch(() => {}));
    ctx.waitUntil(cachePut(lastKey, live, 60 * 60 * 24).catch(() => {}));
    return live;
  } catch (error) {
    console.error(JSON.stringify({ event: "lta_refresh_failed", message: error instanceof Error ? error.message : "failed" }));
    const last = await cacheGet(lastKey);
    if (last) return last;
    return {
      source: "unavailable",
      fetchedAt: null,
      ltaUpdatedAt: null,
      warning: "The LTA feed did not load.",
      sites: [],
      connectorCount: 0,
    };
  }
}

function samplePayload() {
  const normalized = normalizeFeed(sampleFeed);
  return {
    source: "sample",
    fetchedAt: null,
    ltaUpdatedAt: null,
    warning: "",
    ...normalized,
  };
}

async function refreshLta(env) {
  if (!ltaInflight) {
    ltaInflight = fetchLta(env).finally(() => {
      ltaInflight = null;
    });
  }
  return ltaInflight;
}

async function fetchLta(env) {
  const metaResponse = await fetch(LTA_BATCH_URL, {
    headers: { AccountKey: env.LTA_ACCOUNT_KEY, accept: "application/json" },
    signal: AbortSignal.timeout(FETCH_MS),
  });
  if (!metaResponse.ok) throw new Error(`DataMall EVCBatch returned ${metaResponse.status}`);
  const meta = await metaResponse.json();
  const link = extractLtaBatchLink(meta);
  if (!link) throw new Error("DataMall EVCBatch did not include a download link");

  const fileResponse = await fetchAllowed(link, 0);
  if (!fileResponse.ok) throw new Error(`DataMall batch file returned ${fileResponse.status}`);
  const declared = Number(fileResponse.headers.get("content-length") || 0);
  if (declared > 32 * 1024 * 1024) throw new Error("DataMall batch file is too large");
  const batchText = await fileResponse.text();
  if (batchText.length > 32 * 1024 * 1024) throw new Error("DataMall batch file is too large");
  const batch = JSON.parse(batchText);
  const normalized = normalizeFeed(batch);
  if (normalized.connectorCount === 0) throw new Error("DataMall batch had no connectors");
  const fetchedAtMs = Date.now();
  return {
    source: "lta",
    fetchedAt: new Date(fetchedAtMs).toISOString(),
    ltaUpdatedAt: parseLtaTimestamp(batch.LastUpdatedTime || batch.lastUpdatedTime || ""),
    warning: "",
    ...normalized,
  };
}

async function fetchAllowed(url, redirects) {
  if (!isAllowedBatchUrl(url)) throw new Error("Refused batch URL");
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    redirect: "manual",
    signal: AbortSignal.timeout(FETCH_MS),
  });
  if (response.status >= 300 && response.status < 400) {
    if (redirects >= 2) throw new Error("Refused batch redirect");
    const next = response.headers.get("location");
    if (!next) throw new Error("Refused batch redirect");
    return fetchAllowed(new URL(next, url).toString(), redirects + 1);
  }
  return response;
}

async function searchPlaces(rawQuery, env, request) {
  const query = String(rawQuery).replace(/[\u0000-\u001f]/g, "").trim().slice(0, 80);
  if (query.length < 2) return { configured: onemapConfigured(env), results: [] };
  if (!onemapConfigured(env)) {
    return { configured: false, results: [], warning: "Place names are unavailable." };
  }

  try {
    const token = await oneMapToken(env, request);
    const url = new URL("/api/common/elastic/search", ONEMAP_ORIGIN);
    url.searchParams.set("searchVal", query);
    url.searchParams.set("returnGeom", "Y");
    url.searchParams.set("getAddrDetails", "Y");
    url.searchParams.set("pageNum", "1");
    const response = await fetch(url, {
      headers: { accept: "application/json", Authorization: token },
      signal: AbortSignal.timeout(FETCH_MS),
    });
    if (!response.ok) throw new Error(`OneMap search returned ${response.status}`);
    const payload = await response.json();
    const results = (Array.isArray(payload.results) ? payload.results : [])
      .map(normalizePlace)
      .filter(Boolean)
      .slice(0, 6);
    return {
      configured: true,
      results,
      warning: payload.error && results.length === 0 ? "Place search failed." : "",
    };
  } catch (error) {
    console.error(JSON.stringify({ event: "onemap_search_failed", message: error instanceof Error ? error.message : "failed" }));
    return { configured: true, results: [], warning: "Place search failed." };
  }
}

function normalizePlace(place) {
  const lat = Number(place.LATITUDE ?? place.latitude);
  const lng = Number(place.LONGITUDE ?? place.LONGTITUDE ?? place.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < 1.15 || lat > 1.5 || lng < 103.55 || lng > 104.15) return null;
  const label = String(place.SEARCHVAL || place.BUILDING || place.ADDRESS || "").trim();
  const address = String(place.ADDRESS || label).trim();
  const postal = String(place.POSTAL || "").trim();
  if (!label && !address) return null;
  return {
    label: label || address,
    address,
    postal: postal === "NIL" ? "" : postal,
    lat,
    lng,
  };
}

async function oneMapToken(env, request) {
  if (env.ONEMAP_API_TOKEN) return env.ONEMAP_API_TOKEN;
  const key = cacheRequest(request, "/__cache/onemap-token");
  const cached = await cacheGet(key);
  if (cached?.token && cached.expiresAtMs > Date.now() + 5 * 60 * 1000) return cached.token;

  const response = await fetch(new URL("/api/auth/post/getToken", ONEMAP_ORIGIN), {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ email: env.ONEMAP_EMAIL, password: env.ONEMAP_PASSWORD }),
    signal: AbortSignal.timeout(FETCH_MS),
  });
  if (!response.ok) throw new Error(`OneMap token request returned ${response.status}`);
  const payload = await response.json();
  const token = payload.access_token || payload.token || "";
  if (!token) throw new Error("OneMap token response had no access token");
  const expiry = Number(payload.expiry_timestamp || 0);
  const expiresAtMs = expiry > 1_000_000_000_000 ? expiry : expiry > 0 ? expiry * 1000 : Date.now() + 72 * 60 * 60 * 1000;
  await cachePut(key, { token, expiresAtMs }, 60 * 60 * 24).catch(() => {});
  return token;
}

function onemapConfigured(env) {
  return Boolean(env.ONEMAP_API_TOKEN || (env.ONEMAP_EMAIL && env.ONEMAP_PASSWORD));
}

function cacheRequest(request, pathname) {
  return new Request(new URL(pathname, request.url).toString());
}

async function cacheGet(requestOrUrl) {
  try {
    const hit = await caches.default.match(typeof requestOrUrl === "string" ? requestOrUrl : requestOrUrl);
    if (!hit) return null;
    return await hit.json();
  } catch {
    return null;
  }
}

async function cachePut(requestOrUrl, value, seconds) {
  const response = new Response(JSON.stringify(value), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${seconds}`,
    },
  });
  const request = typeof requestOrUrl === "string" ? requestOrUrl : requestOrUrl;
  await caches.default.put(request, response);
}

function contentSecurityPolicy() {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://www.onemap.gov.sg",
    "connect-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

function allowedOrigin(origin) {
  if (origin === PAGES_ORIGIN) return origin;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || "")) return origin;
  return "";
}

function corsHeaders(request) {
  const origin = allowedOrigin(request.headers.get("Origin") || "");
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(request, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...corsHeaders(request),
    },
  });
}
