import {
  CHEAP_NEAR_M,
  compareNearby,
  distanceMetres,
  formatConnectorPrice,
  formatDistance,
  formatKw,
  formatPrices,
  freshnessCopy,
  isFresh,
  lowestKwh,
  poolFor,
  siteMatches,
  siteMatchesQuery,
  summarize,
} from "./format.js";

const PAGE = 20;
const API_ORIGIN = location.hostname === "ncheewee.github.io" ? "https://sg-chargers.ncheewee.workers.dev" : "";

function apiUrl(path) {
  const base = API_ORIGIN ? `${API_ORIGIN}/` : document.baseURI;
  return new URL(path.replace(/^\//, ""), base);
}
const state = {
  payload: null,
  origin: null,
  geo: "idle",
  filters: { free: false, dc: false, ccs: false, type2: false },
  view: "list",
  limit: PAGE,
  query: "",
  cheap: false,
  suggestions: [],
  suggestOpen: false,
  placeWarning: "",
  selectedId: null,
};

const search = document.querySelector("#search");
const suggestions = document.querySelector("#suggestions");
const main = document.querySelector("#main");
const banner = document.querySelector("#banner");
const context = document.querySelector("#context");
const detail = document.querySelector("#detail");
const sourceNote = document.querySelector("#source-note");

const map = { zoom: 15, cx: 0, cy: 0, pinned: "" };

let suggestTimer = 0;
let suggestAbort = null;
let deferredInstall = null;

document.querySelector("#view-list").addEventListener("click", () => setView("list"));
document.querySelector("#view-map").addEventListener("click", () => setView("map"));
document.querySelector("#near").addEventListener("click", () => useNearMe());
document.querySelector("#cheap").addEventListener("click", () => {
  state.cheap = !state.cheap;
  state.limit = PAGE;
  render();
});
document.querySelector("#filter-free").addEventListener("click", () => toggleFilter("free"));
document.querySelector("#filter-dc").addEventListener("click", () => toggleFilter("dc"));
document.querySelector("#filter-ccs").addEventListener("click", () => toggleFilter("ccs"));
document.querySelector("#filter-type2").addEventListener("click", () => toggleFilter("type2"));
document.querySelector("#search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (state.suggestions[0]) chooseSuggestion(state.suggestions[0]);
});
search.addEventListener("input", onSearch);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!detail.hidden) closeDetail();
    else closeSuggestions();
  }
});
document.addEventListener("click", (event) => {
  if (!event.target.closest("form")) closeSuggestions();
});
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (state.view === "map") renderMain();
});

loadChargers();
useNearMe();
setInterval(renderStatus, 30000);
registerInstall();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

async function loadChargers() {
  try {
    const response = await fetch(apiUrl("api/chargers"), { cache: "no-store" });
    state.payload = await response.json();
  } catch {
    state.payload = { source: "unavailable", sites: [], connectorCount: 0, fetchedAt: null, ltaUpdatedAt: null };
  }
  render();
}

function useNearMe() {
  search.value = "";
  closeSuggestions();
  if (!navigator.geolocation) {
    state.geo = "unavailable";
    state.origin = null;
    render();
    return;
  }
  state.geo = "pending";
  renderStatus();
  navigator.geolocation.getCurrentPosition(
    (position) => {
      state.geo = "granted";
      state.origin = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        label: "you",
        kind: "geo",
      };
      state.limit = PAGE;
      render();
    },
    () => {
      state.geo = "denied";
      if (state.origin?.kind === "geo") state.origin = null;
      render();
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
  );
}

function onSearch() {
  const query = search.value.trim();
  state.query = query;
  state.limit = PAGE;
  state.suggestOpen = query.length >= 2;
  state.suggestions = localSuggestions(query).map((site) => ({ kind: "site", site }));
  state.placeWarning = "";
  renderSuggestions();
  renderStatus();
  renderMain();
  clearTimeout(suggestTimer);
  suggestAbort?.abort();
  if (query.length < 2) return;
  suggestTimer = setTimeout(() => fetchPlaces(query), 200);
}

async function fetchPlaces(query) {
  suggestAbort = new AbortController();
  try {
    const response = await fetch(apiUrl(`api/search?q=${encodeURIComponent(query)}`), {
      cache: "no-store",
      signal: suggestAbort.signal,
    });
    if (!response.ok) {
      state.suggestions = localSuggestions(query).map((site) => ({ kind: "site", site }));
      state.placeWarning = "Place names are unavailable. Matching chargers still appear.";
      state.suggestOpen = true;
      renderSuggestions();
      return;
    }
    const body = await response.json();
    if (search.value.trim() !== query) return;
    const places = (body.results || []).map((place) => ({ kind: "place", place }));
    const sites = localSuggestions(query).map((site) => ({ kind: "site", site }));
    state.suggestions = [...places, ...sites].slice(0, 8);
    state.placeWarning = body.configured ? body.warning || "" : "Place names are unavailable. Matching chargers still appear.";
    state.suggestOpen = true;
    renderSuggestions();
  } catch (error) {
    if (error.name === "AbortError") return;
  }
}

function localSuggestions(query) {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  return (state.payload?.sites || [])
    .map((site) => ({ site, score: scoreSite(site, needle) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.site.name.localeCompare(b.site.name))
    .slice(0, 6)
    .map((item) => item.site);
}

function scoreSite(site, needle) {
  if (site.postal && site.postal === needle) return 100;
  const name = site.name.toLowerCase();
  if (name.startsWith(needle)) return 80;
  if (name.includes(needle)) return 60;
  if (site.address.toLowerCase().includes(needle)) return 40;
  if (site.operatorLabel.toLowerCase().includes(needle)) return 20;
  return 0;
}

function chooseSuggestion(item) {
  if (item.kind === "place") {
    state.origin = { lat: item.place.lat, lng: item.place.lng, label: item.place.label, kind: "place" };
    state.selectedId = null;
  } else {
    state.origin = { lat: item.site.lat, lng: item.site.lng, label: item.site.name, kind: "place" };
    state.selectedId = item.site.id;
  }
  state.limit = PAGE;
  state.query = "";
  search.value = "";
  closeSuggestions();
  render();
  if (item.kind === "site") openDetail(item.site.id);
}

function toggleFilter(key) {
  state.filters[key] = !state.filters[key];
  state.limit = PAGE;
  render();
}

function setView(view) {
  state.view = view;
  if (view === "map") map.pinned = "";
  render();
}

function ranked() {
  const sites = state.payload?.sites || [];
  const query = state.query.trim();
  return sites
    .filter((site) => siteMatches(site, state.filters) && siteMatchesQuery(site, query))
    .map((site) => ({
      site,
      name: site.name,
      metres:
        state.origin && site.lat != null && site.lng != null
          ? distanceMetres(state.origin.lat, state.origin.lng, site.lat, site.lng)
          : Number.POSITIVE_INFINITY,
      kwh: lowestKwh(poolFor(site, state.filters)),
    }))
    .sort((a, b) => compareNearby(a, b, state.cheap));
}

function render() {
  renderStatus();
  renderMain();
  if (state.selectedId) openDetail(state.selectedId);
}

function renderStatus() {
  const copy = freshnessCopy(state.payload);
  banner.dataset.tone = copy.tone;
  banner.textContent = state.payload ? copy.text : "Loading the charger list.";
  document.body.classList.toggle("is-fresh", isFresh(state.payload));

  const pressed = state.origin?.kind === "geo" && state.geo === "granted";
  document.querySelector("#near").setAttribute("aria-pressed", String(pressed));
  document.querySelector("#cheap").setAttribute("aria-pressed", String(state.cheap));
  for (const [key, id] of [
    ["free", "filter-free"],
    ["dc", "filter-dc"],
    ["ccs", "filter-ccs"],
    ["type2", "filter-type2"],
  ]) {
    document.querySelector(`#${id}`).setAttribute("aria-pressed", String(state.filters[key]));
  }
  document.querySelector("#view-list").setAttribute("aria-pressed", String(state.view === "list"));
  document.querySelector("#view-map").setAttribute("aria-pressed", String(state.view === "map"));

  const searching = state.query.trim().length >= 2;
  const rows = state.origin || searching ? ranked() : [];
  if (!state.origin && !searching) {
    context.textContent =
      state.geo === "pending" ? "Finding where you are." : "Search for a postal code or place in Singapore.";
  } else if (!state.origin) {
    context.textContent = `${rows.length} sites match “${state.query.trim()}”. Pick one, or search a place to sort from there.`;
  } else {
    const where = state.origin.kind === "geo" ? "you" : state.origin.label;
    const far = rows[0] && rows[0].metres > 30000 ? " You look far from these." : "";
    const matched = state.query.trim().length >= 2 ? ` matching “${state.query.trim()}”` : "";
    if (state.cheap) {
      const priced = rows.some((row) => row.metres <= CHEAP_NEAR_M && row.kwh != null);
      context.textContent = priced
        ? `Cheapest per kWh within 3 km of ${where}${matched}, then farther sites. Straight-line, not a drive time. Hourly prices are not compared.`
        : `No per-kWh price within 3 km of ${where}${matched}. Straight-line, not a drive time.`;
    } else {
      context.textContent = `${rows.length} sites${matched} nearest to ${where}. Straight-line, not a drive time.${far}`;
    }
  }

  if (state.payload?.source === "lta") sourceNote.textContent = "Charger data: LTA DataMall. Place search: OneMap © SLA.";
  else if (state.payload?.source === "sample") sourceNote.textContent = "Sample file for the layout. Not LTA’s live feed.";
  else sourceNote.textContent = "Charger data: LTA DataMall.";
}

function renderMain() {
  if (!state.origin && state.query.trim().length < 2) {
    main.innerHTML = `<p class="empty">The list starts from where you are, or from a place you search.</p>`;
    return;
  }
  const rows = ranked();
  const visible = rows.slice(0, state.limit);
  if (state.view === "map") {
    renderMap(rows);
    return;
  }
  if (visible.length === 0) {
    main.innerHTML = `<p class="empty">Nothing nearby matches these filters.</p>`;
    return;
  }
  const items = visible
    .map(({ site, metres }) => {
      const summary = summarize(poolFor(site, state.filters));
      const counts = [
        summary.free ? `<span class="count-free">${summary.free} free</span>` : "",
        summary.busy ? `<span>${summary.busy} busy</span>` : "",
        summary.unknown ? `<span>${summary.unknown} unknown</span>` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      return `<li><button type="button" class="site" data-id="${esc(site.id)}">
        <span class="site-top"><span class="site-name">${esc(site.name)}</span><span class="distance">${esc(formatDistance(metres))}</span></span>
        <p class="operator">${esc(site.operatorLabel)}</p>
        <p class="counts">${counts || "No connectors match"}</p>
        <p class="price-line">${esc(formatPrices(summary))}${summary.fastest ? ` · ${esc(formatKw(summary.fastest))}` : ""}</p>
      </button></li>`;
    })
    .join("");
  const more =
    rows.length > visible.length
      ? `<button type="button" class="more" id="more">Show ${Math.min(PAGE, rows.length - visible.length)} more</button>`
      : "";
  main.innerHTML = `<ol class="site-list">${items}</ol>${more}`;
  main.querySelectorAll(".site").forEach((button) => {
    button.addEventListener("click", () => openDetail(button.dataset.id));
  });
  document.querySelector("#more")?.addEventListener("click", () => {
    state.limit += PAGE;
    renderMain();
    renderStatus();
  });
}

function renderSuggestions() {
  search.setAttribute("aria-expanded", String(state.suggestOpen && state.suggestions.length > 0));
  if (!state.suggestOpen) {
    suggestions.hidden = true;
    suggestions.innerHTML = "";
    return;
  }
  const items = state.suggestions
    .map((item, index) => {
      if (item.kind === "place") {
        return `<li><button type="button" role="option" data-index="${index}"><span>${esc(item.place.label)}</span><br><span class="suggestion-kind">${esc(item.place.address)}</span></button></li>`;
      }
      return `<li><button type="button" role="option" data-index="${index}"><span>${esc(item.site.name)}</span><br><span class="suggestion-kind">${esc(item.site.operatorLabel)} · charger</span></button></li>`;
    })
    .join("");
  const warning = state.placeWarning ? `<li class="suggestion-kind" style="padding:8px 12px">${esc(state.placeWarning)}</li>` : "";
  suggestions.innerHTML = items + warning || `<li class="suggestion-kind" style="padding:8px 12px">No matches.</li>`;
  suggestions.hidden = false;
  suggestions.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => chooseSuggestion(state.suggestions[Number(button.dataset.index)]));
  });
}

function closeSuggestions() {
  state.suggestOpen = false;
  renderSuggestions();
}

function openDetail(id) {
  const site = (state.payload?.sites || []).find((item) => item.id === id);
  if (!site) return;
  state.selectedId = id;
  const fresh = isFresh(state.payload);
  const connectors = site.connectors
    .slice()
    .sort((a, b) => statusRank(a.status) - statusRank(b.status) || (b.kw || 0) - (a.kw || 0));
  const rows = connectors
    .map((connector) => {
      const freeClass = connector.status === "free" && fresh ? " count-free" : "";
      return `<article class="connector">
        <p><strong class="${freeClass.trim()}">${esc(statusWord(connector.status))}</strong> · ${esc(connector.plug || "Plug not in the feed")}${connector.current ? ` · ${esc(connector.current)}` : ""}</p>
        <p>${connector.kw == null ? "Power not in the feed" : `${esc(String(connector.kw))} kW`} · ${esc(formatConnectorPrice(connector))}</p>
        <p>${esc(connector.position || "Position not in the feed")}</p>
        ${connector.id ? `<p class="connector-id">${esc(connector.id)}</p>` : ""}
      </article>`;
    })
    .join("");
  const operator = site.operatorUrl
    ? `<a class="text-button" href="${esc(site.operatorUrl)}" target="_blank" rel="noopener noreferrer">${esc(site.operatorLabel)}</a>`
    : "";
  const directions =
    site.lat == null
      ? ""
      : `<a class="text-button" href="https://www.google.com/maps/dir/?api=1&destination=${site.lat},${site.lng}" target="_blank" rel="noopener noreferrer">Directions</a>`;
  detail.innerHTML = `<div class="detail-inner ${fresh ? "is-fresh" : ""}">
    <div class="detail-head"><h2>${esc(site.name)}</h2><button type="button" class="text-button" id="close-detail">Close</button></div>
    <p class="operator">${esc(site.operatorLabel)}</p>
    <p class="address">${esc(site.address)}</p>
    <div class="actions">${directions}${operator}</div>
    ${rows}
    <p class="honesty">Status can be up to five minutes behind the charger.</p>
    <p class="honesty">Parking and idle fees are not in this feed.</p>
  </div>`;
  detail.hidden = false;
  document.body.style.overflow = "hidden";
  document.querySelector("#close-detail").addEventListener("click", closeDetail);
  document.querySelector("#close-detail").focus();
}

function closeDetail() {
  state.selectedId = null;
  detail.hidden = true;
  detail.innerHTML = "";
  document.body.style.overflow = "";
}

function renderMap(rows) {
  const origin = state.origin;
  const pin = `${origin ? `${origin.lat},${origin.lng}` : "none"}|${state.query.trim().toLowerCase()}`;
  const refit = map.pinned !== pin;
  main.innerHTML = `<div class="map" id="map" data-zoom="">
      <div class="map-layer"></div>
      <div class="map-markers"></div>
      <div class="zoom"><button type="button" id="zoom-in" aria-label="Zoom in">+</button><button type="button" id="zoom-out" aria-label="Zoom out">−</button></div>
      <p class="map-credit">© SLA / OneMap</p>
    </div>`;
  const viewport = document.querySelector("#map");
  if (refit) {
    const focus = state.query.trim().length >= 2 ? rows.slice(0, 40) : rows.slice(0, 20);
    fitMap(viewport, focus.length ? focus : rows);
    map.pinned = pin;
  }
  const paint = () => paintMap(viewport, rows);
  paint();
  bindMapGestures(viewport, paint);
}

function bindMapGestures(viewport, paint) {
  const pointers = new Map();
  let drag = null;
  let pinch = null;

  viewport.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".zoom")) return;
    if (pointers.size === 0 && event.target.closest(".marker")) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    viewport.setPointerCapture(event.pointerId);
    if (pointers.size === 1) {
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, cx: map.cx, cy: map.cy };
      pinch = null;
    } else {
      drag = null;
      const dist = pointerSpan(pointers);
      pinch = dist > 0 ? { dist, zoom: map.zoom } : null;
    }
  });
  viewport.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2 && pinch) {
      const dist = pointerSpan(pointers);
      if (dist > 0) {
        setZoom(pinch.zoom + Math.log2(dist / pinch.dist), pointerMid(pointers));
        paint();
      }
      return;
    }
    if (!drag || drag.id !== event.pointerId) return;
    map.cx = drag.cx - (event.clientX - drag.x);
    map.cy = drag.cy - (event.clientY - drag.y);
    paint();
  });
  const endPointer = (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (pointers.size === 1) {
      const [id, point] = pointers.entries().next().value;
      drag = { id, x: point.x, y: point.y, cx: map.cx, cy: map.cy };
      pinch = null;
      return;
    }
    drag = null;
    pinch = null;
  };
  viewport.addEventListener("pointerup", endPointer);
  viewport.addEventListener("pointercancel", endPointer);
  viewport.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const step = Math.max(-0.75, Math.min(0.75, -event.deltaY / 300));
      if (step) setZoom(map.zoom + step, { x: event.clientX, y: event.clientY });
      paint();
    },
    { passive: false },
  );
  document.querySelector("#zoom-in").addEventListener("click", () => {
    setZoom(Math.floor(map.zoom) + 1);
    paint();
  });
  document.querySelector("#zoom-out").addEventListener("click", () => {
    setZoom(Math.ceil(map.zoom) - 1);
    paint();
  });
}

function pointerSpan(pointers) {
  const points = [...pointers.values()];
  if (points.length < 2) return 0;
  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
}

function pointerMid(pointers) {
  const points = [...pointers.values()];
  return { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
}

function paintMap(viewport, rows) {
  const width = viewport.clientWidth;
  const height = viewport.clientHeight;
  const tileZ = Math.max(11, Math.min(18, Math.round(map.zoom)));
  const scale = 2 ** (map.zoom - tileZ);
  const left = map.cx - width / 2;
  const top = map.cy - height / 2;
  const minX = Math.max(0, Math.floor(left / scale / 256));
  const maxX = Math.min(2 ** tileZ - 1, Math.floor((left + width) / scale / 256));
  const minY = Math.max(0, Math.floor(top / scale / 256));
  const maxY = Math.min(2 ** tileZ - 1, Math.floor((top + height) / scale / 256));
  const style = window.matchMedia("(prefers-color-scheme: dark)").matches ? "Night" : "Grey";
  const layer = viewport.querySelector(".map-layer");
  const size = 256 * scale;
  const tiles = [];
  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      tiles.push(
        `<img class="map-tile" alt="" style="left:${x * size - left}px;top:${y * size - top}px;width:${size}px;height:${size}px" src="https://www.onemap.gov.sg/maps/tiles/${style}/${tileZ}/${x}/${y}.png" />`,
      );
    }
  }
  layer.innerHTML = tiles.join("");
  viewport.dataset.zoom = map.zoom.toFixed(2);
  const fresh = isFresh(state.payload);
  const margin = 24;
  const markers = rows
    .filter((row) => row.site.lat != null)
    .map(({ site }) => {
      const point = world(site.lat, site.lng, map.zoom);
      return { site, point };
    })
    .filter(({ point }) => point.x >= left - margin && point.x <= left + width + margin && point.y >= top - margin && point.y <= top + height + margin)
    .map(({ site, point }) => {
      const summary = summarize(poolFor(site, state.filters));
      const klass = fresh && summary.free > 0 ? "marker fresh" : "marker";
      return `<button type="button" class="${klass}" data-id="${esc(site.id)}" aria-label="${esc(`${site.operatorLabel}, ${site.name}`)}" style="left:${point.x - left}px;top:${point.y - top}px"></button>`;
    });
  if (state.origin?.kind === "geo") {
    const you = world(state.origin.lat, state.origin.lng, map.zoom);
    markers.push(`<span class="you" style="left:${you.x - left}px;top:${you.y - top}px"></span>`);
  }
  const markerLayer = viewport.querySelector(".map-markers");
  markerLayer.innerHTML = markers.join("");
  markerLayer.querySelectorAll(".marker").forEach((marker) => {
    marker.addEventListener("click", () => openDetail(marker.dataset.id));
  });
}

function fitMap(viewport, rows) {
  const points = rows
    .filter((row) => row.site.lat != null)
    .map((row) => ({ lat: row.site.lat, lng: row.site.lng }));
  if (state.origin) points.push({ lat: state.origin.lat, lng: state.origin.lng });
  if (points.length === 0) return;
  if (points.length === 1) {
    map.zoom = 15;
    const only = world(points[0].lat, points[0].lng, map.zoom);
    map.cx = only.x;
    map.cy = only.y;
    return;
  }
  const width = Math.max(viewport.clientWidth, 280);
  const height = Math.max(viewport.clientHeight, 280);
  const pad = 56;
  let zoom = 11;
  for (let candidate = 16; candidate >= 11; candidate -= 1) {
    const span = spanOf(points, candidate);
    if (span.width <= width - pad && span.height <= height - pad) {
      zoom = candidate;
      break;
    }
  }
  const span = spanOf(points, zoom);
  map.zoom = zoom;
  map.cx = span.minX + span.width / 2;
  map.cy = span.minY + span.height / 2;
}

function spanOf(points, zoom) {
  const projected = points.map((point) => world(point.lat, point.lng, zoom));
  const minX = Math.min(...projected.map((point) => point.x));
  const maxX = Math.max(...projected.map((point) => point.x));
  const minY = Math.min(...projected.map((point) => point.y));
  const maxY = Math.max(...projected.map((point) => point.y));
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

function setZoom(next, client) {
  const zoom = Math.max(11, Math.min(18, next));
  if (Math.abs(zoom - map.zoom) < 0.001) return;
  const viewport = document.querySelector("#map");
  const rect = viewport.getBoundingClientRect();
  const ax = client ? client.x - rect.left : rect.width / 2;
  const ay = client ? client.y - rect.top : rect.height / 2;
  const scale = 2 ** (zoom - map.zoom);
  const worldX = (map.cx - rect.width / 2 + ax) * scale;
  const worldY = (map.cy - rect.height / 2 + ay) * scale;
  map.zoom = zoom;
  map.cx = worldX - ax + rect.width / 2;
  map.cy = worldY - ay + rect.height / 2;
}

function world(lat, lng, zoom) {
  const scale = 256 * 2 ** zoom;
  const x = ((lng + 180) / 360) * scale;
  const sine = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * scale;
  return { x, y };
}

function statusRank(status) {
  return { free: 0, busy: 1, unknown: 2 }[status] ?? 3;
}

function statusWord(status) {
  if (status === "free") return "Free";
  if (status === "busy") return "Busy";
  return "Unknown";
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function registerInstall() {
  const slot = document.querySelector("#install");
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstall = event;
    slot.innerHTML = `<button type="button" class="text-button" id="install-button">Install</button>`;
    document.querySelector("#install-button").addEventListener("click", async () => {
      deferredInstall.prompt();
      await deferredInstall.userChoice;
      deferredInstall = null;
      slot.innerHTML = "";
    });
  });
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.navigator.standalone || window.matchMedia("(display-mode: standalone)").matches;
  if (ios && !standalone && !localStorage.getItem("chargers-install-hint")) {
    slot.innerHTML = `<span>To install, share this page and choose Add to Home Screen. </span><button type="button" class="text-button" id="hide-install">Hide</button>`;
    document.querySelector("#hide-install").addEventListener("click", () => {
      localStorage.setItem("chargers-install-hint", "1");
      slot.innerHTML = "";
    });
  }
}
