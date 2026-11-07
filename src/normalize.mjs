import { operatorInfo, titleCasePlace } from "./operators.mjs";

const BATCH_HOST = "dmprod-datasets.s3.ap-southeast-1.amazonaws.com";

export function extractLtaBatchLink(payload) {
  if (!payload || typeof payload !== "object") return "";
  const direct = payload.Link || payload.link || payload.DownloadLink || payload.downloadLink;
  if (isAllowedBatchUrl(direct)) return direct;

  for (const value of Object.values(payload)) {
    if (value && typeof value === "object") {
      const nested = extractLtaBatchLink(value);
      if (nested) return nested;
    }
  }

  for (const value of Object.values(payload)) {
    if (isAllowedBatchUrl(value)) return value;
  }

  return "";
}

export function isAllowedBatchUrl(value) {
  if (typeof value !== "string" || !value) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname.toLowerCase() === BATCH_HOST &&
      /^\/ev-batch\/\d{4}-\d{2}-\d{2}\//i.test(url.pathname) &&
      /\/EVBatch-/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

export function connectorStatus(value) {
  if (value === 1 || value === "1") return "free";
  if (value === 0 || value === "0") return "busy";
  return "unknown";
}

export function canonicalUnit(priceType) {
  const text = clean(priceType);
  if (!text) return "";
  if (/kwh/i.test(text)) return "kWh";
  if (/hour/i.test(text) || /^h$/i.test(text) || /\$\/h/i.test(text)) return "h";
  return text;
}

export function normalizeFeed(payload) {
  const groups = new Map();

  for (const location of extractLocations(payload)) {
    const lat = numberOrNull(location.latitude ?? location.Latitude);
    const lng = numberOrNull(
      location.longtitude ?? location.longitude ?? location.Longtitude ?? location.Longitude,
    );
    const rawName = clean(location.name ?? location.Name) || clean(location.address ?? location.Address) || "Unnamed site";
    const rawAddress = clean(location.address ?? location.Address);
    const postal = clean(location.postalCode ?? location.PostalCode) || rawAddress.match(/\b\d{6}\b/)?.[0] || "";
    const points = asArray(location.chargingPoints ?? location.ChargingPoints);

    for (const point of points) {
      const operator = clean(point.operator ?? point.Operator ?? location.operator ?? location.Operator) || "Unknown";
      const info = operatorInfo(operator);
      const key = [
        info.key,
        postal,
        lat == null ? "" : lat.toFixed(5),
        lng == null ? "" : lng.toFixed(5),
        rawName.toUpperCase(),
      ].join("|");

      let site = groups.get(key);
      if (!site) {
        site = {
          id: key,
          name: titleCasePlace(rawName),
          address: titleCasePlace(rawAddress),
          postal,
          lat,
          lng,
          operator,
          operatorLabel: info.label,
          operatorUrl: info.url,
          connectors: [],
        };
        groups.set(key, site);
      }

      const position = clean(point.position ?? point.Position).replace(/\s+/g, " ");
      const plugs = asArray(point.plugTypes ?? point.PlugTypes);

      if (plugs.length === 0) {
        site.connectors.push({
          id: clean(point.id ?? point.Id),
          plug: "",
          current: "",
          kw: null,
          price: null,
          unit: "",
          status: connectorStatus(point.status ?? point.Status),
          position,
        });
        continue;
      }

      for (const plug of plugs) {
        const power = readPower(plug);
        const price = readPrice(plug);
        const unit = canonicalUnit(plug.priceType ?? plug.PriceType);
        const plugName = clean(plug.plugType ?? plug.PlugType);
        const evIds = asArray(plug.evIds ?? plug.EvIds);

        if (evIds.length === 0) {
          site.connectors.push({
            id: "",
            plug: plugName,
            current: power.current,
            kw: power.kw,
            price,
            unit,
            status: connectorStatus(point.status ?? point.Status),
            position,
          });
          continue;
        }

        for (const ev of evIds) {
          site.connectors.push({
            id: clean(ev.evCpId ?? ev.EvCpId ?? ev.id ?? ev.Id),
            plug: plugName,
            current: power.current,
            kw: power.kw,
            price,
            unit,
            status: connectorStatus(ev.status ?? ev.Status),
            position,
          });
        }
      }
    }
  }

  const sites = [...groups.values()].filter((site) => site.connectors.length > 0);
  const connectorCount = sites.reduce((count, site) => count + site.connectors.length, 0);
  return { sites, connectorCount };
}

export function parseLtaTimestamp(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = "00"] = match;
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}+08:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function extractLocations(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const candidates = [
    payload.evLocationsData,
    payload.EvLocationsData,
    payload.stations,
    payload.value,
    payload.Value,
    payload.data,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function readPower(plug) {
  const powerRating = clean(plug.powerRating ?? plug.PowerRating);
  const chargingSpeed = clean(plug.chargingSpeed ?? plug.ChargingSpeed);
  const currentField = clean(plug.current ?? plug.Current ?? plug.powerType ?? plug.PowerType);
  const ratingNumber = numericText(powerRating);
  const speedNumber = numericText(chargingSpeed);
  let current = currentField.toUpperCase();
  if (current !== "AC" && current !== "DC") {
    current = !ratingNumber && /^(ac|dc)$/i.test(powerRating) ? powerRating.toUpperCase() : "";
  }
  const kw = speedNumber ?? ratingNumber;
  return { kw, current };
}

function readPrice(plug) {
  const raw = clean(plug.price ?? plug.Price);
  if (!raw) return null;
  const price = Number(raw);
  return Number.isFinite(price) ? price : null;
}

function numericText(value) {
  if (!/^-?\d+(\.\d+)?$/.test(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function numberOrNull(value) {
  if (value == null || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}
