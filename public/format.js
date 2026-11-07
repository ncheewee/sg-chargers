export const FRESH_MS = 10 * 60 * 1000;

export function distanceMetres(fromLat, fromLng, toLat, toLng) {
  const earth = 6371000;
  const radians = Math.PI / 180;
  const dLat = (toLat - fromLat) * radians;
  const dLng = (toLng - fromLng) * radians;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(fromLat * radians) * Math.cos(toLat * radians) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function formatDistance(metres) {
  if (!Number.isFinite(metres)) return "";
  if (metres < 1000) return `${Math.round(metres)} m`;
  const km = metres / 1000;
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

export function formatSgd(amount) {
  if (!Number.isFinite(amount)) return "";
  const rounded = Math.round(amount * 10000) / 10000;
  const fraction = String(rounded).split(".")[1] ?? "";
  const decimals = Math.min(4, Math.max(2, fraction.replace(/0+$/, "").length));
  return `$${rounded.toFixed(decimals)}`;
}

export function isCcs(connector) {
  return /combo\s*2|ccs\s*2|^ccs2$/i.test(connector.plug || "");
}

export function isType2(connector) {
  return /^type\s*2$/i.test(connector.plug || "");
}

export function isDc(connector) {
  if ((connector.current || "").toUpperCase() === "DC") return true;
  if ((connector.current || "").toUpperCase() === "AC") return false;
  return isCcs(connector);
}

export function poolFor(site, filters) {
  return site.connectors.filter((connector) => plugOk(connector, filters) && (!filters.dc || isDc(connector)));
}

export function siteMatches(site, filters) {
  const pool = poolFor(site, filters);
  if (pool.length === 0) return false;
  if (filters.free && !pool.some((connector) => connector.status === "free")) return false;
  return true;
}

export function summarize(connectors) {
  let free = 0;
  let busy = 0;
  let unknown = 0;
  const byUnit = new Map();
  let fastest = null;

  for (const connector of connectors) {
    if (connector.status === "free") free += 1;
    else if (connector.status === "busy") busy += 1;
    else unknown += 1;

    if (typeof connector.price === "number" && connector.unit) {
      const group = byUnit.get(connector.unit) || { min: connector.price, max: connector.price };
      group.min = Math.min(group.min, connector.price);
      group.max = Math.max(group.max, connector.price);
      byUnit.set(connector.unit, group);
    }

    if (typeof connector.kw === "number" && (!fastest || connector.kw > fastest.kw)) fastest = connector;
  }

  return {
    free,
    busy,
    unknown,
    prices: [...byUnit.entries()].map(([unit, group]) => ({ unit, min: group.min, max: group.max })),
    unpriced: connectors.filter((connector) => typeof connector.price !== "number").length,
    fastest,
  };
}

export const CHEAP_NEAR_M = 3000;

export function siteMatchesQuery(site, needle) {
  const query = String(needle ?? "").trim().toLowerCase();
  if (query.length < 2) return true;
  return (
    (site.postal || "") === query ||
    (site.name || "").toLowerCase().includes(query) ||
    (site.address || "").toLowerCase().includes(query) ||
    (site.operatorLabel || "").toLowerCase().includes(query) ||
    (site.operator || "").toLowerCase().includes(query)
  );
}

export function lowestKwh(connectors) {
  let best = null;
  for (const connector of connectors) {
    if (connector.unit !== "kWh" || typeof connector.price !== "number") continue;
    if (best == null || connector.price < best) best = connector.price;
  }
  return best;
}

export function compareNearby(a, b, cheap) {
  if (cheap) {
    const band = (row) => (row.metres <= CHEAP_NEAR_M ? 0 : 1);
    const byBand = band(a) - band(b);
    if (byBand) return byBand;
    if (band(a) === 0) {
      const aMissing = a.kwh == null ? 1 : 0;
      const bMissing = b.kwh == null ? 1 : 0;
      if (aMissing !== bMissing) return aMissing - bMissing;
      if (a.kwh != null && a.kwh !== b.kwh) return a.kwh - b.kwh;
    }
  }
  if (a.metres !== b.metres) return a.metres - b.metres;
  return a.name.localeCompare(b.name);
}

export function formatPrices(summary) {
  if (summary.prices.length === 0) return "No price in the feed";
  return summary.prices
    .map((group) => {
      const min = formatSgd(group.min);
      const max = group.max === group.min ? "" : `–${formatSgd(group.max)}`;
      return `${min}${max}/${group.unit}`;
    })
    .join(" · ");
}

export function formatKw(connector) {
  if (!connector || typeof connector.kw !== "number") return "";
  const kw = Number.isInteger(connector.kw) ? String(connector.kw) : String(connector.kw);
  const current = connector.current ? ` ${connector.current}` : "";
  return `Up to ${kw} kW${current}`;
}

export function formatConnectorPrice(connector) {
  if (typeof connector.price !== "number") return "No price in the feed";
  if (!connector.unit) return `${formatSgd(connector.price)} (unit not in the feed)`;
  return `${formatSgd(connector.price)}/${connector.unit}`;
}

export function dataTime(payload) {
  if (!payload) return NaN;
  const lta = payload.ltaUpdatedAt ? Date.parse(payload.ltaUpdatedAt) : NaN;
  if (Number.isFinite(lta)) return lta;
  const fetched = payload.fetchedAt ? Date.parse(payload.fetchedAt) : NaN;
  return Number.isFinite(fetched) ? fetched : NaN;
}

export function isFresh(payload, now = Date.now()) {
  if (!payload || payload.source !== "lta") return false;
  const time = dataTime(payload);
  if (!Number.isFinite(time)) return false;
  return now - time < FRESH_MS;
}

export function freshnessCopy(payload, now = Date.now()) {
  if (!payload) return { tone: "bad", text: "No feed loaded." };
  if (payload.source === "sample") return { tone: "sample", text: "Sample data. Not the live LTA feed." };
  if (payload.source === "unavailable") {
    return { tone: "bad", text: "The LTA feed did not load. No prices or status are shown." };
  }
  const time = dataTime(payload);
  if (!Number.isFinite(time)) return { tone: "stale", text: "Updated time is missing. Not current." };
  const minutes = Math.max(0, Math.round((now - time) / 60000));
  const ago = minutes < 1 ? "just now" : minutes === 1 ? "1 min ago" : `${minutes} min ago`;
  const clock = new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(time));
  if (now - time >= FRESH_MS) return { tone: "stale", text: `LTA ${clock} · ${ago}. Not current.` };
  return { tone: "ok", text: `LTA ${clock} · ${ago}.` };
}

function plugOk(connector, filters) {
  if (!filters.ccs && !filters.type2) return true;
  return (filters.ccs && isCcs(connector)) || (filters.type2 && isType2(connector));
}
