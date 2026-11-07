import assert from "node:assert/strict";
import test from "node:test";
import {
  compareNearby,
  distanceMetres,
  formatConnectorPrice,
  formatPrices,
  formatSgd,
  freshnessCopy,
  isFresh,
  lowestKwh,
  poolFor,
  siteMatches,
  siteMatchesQuery,
  summarize,
} from "../public/format.js";
import { extractLtaBatchLink, isAllowedBatchUrl, normalizeFeed } from "../src/normalize.mjs";
import { operatorInfo, titleCasePlace } from "../src/operators.mjs";
import { sampleFeed } from "../src/sample-feed.mjs";

const sample = normalizeFeed(sampleFeed);

function siteNamed(name, operator) {
  const found = sample.sites.find((site) => site.name === name && site.operatorLabel === operator);
  assert.ok(found, `${operator} at ${name}`);
  return found;
}

test("short operator names stay readable", () => {
  assert.equal(operatorInfo("MNL SOLUTIONS PTE. LTD.").label, "MNL Solutions");
  assert.equal(operatorInfo("ST ENGINEERING URBAN SOLUTIONS LTD.").label, "ST Engineering Urban Solutions");
  assert.equal(operatorInfo("SP MOBILITY PTE. LTD.").label, "SP Mobility");
});

test("a search matches an operator, and cheap nearby prefers a lower per-kWh price", () => {
  const mnl = { name: "Depot", address: "1 Road", postal: "123456", operator: "MNL SOLUTIONS PTE. LTD.", operatorLabel: "MNL Solutions" };
  assert.equal(siteMatchesQuery(mnl, "mnl"), true);
  assert.equal(siteMatchesQuery(mnl, "shell"), false);
  const nearCheap = { name: "A", metres: 800, kwh: 0.5 };
  const nearDear = { name: "B", metres: 400, kwh: 0.9 };
  const farCheap = { name: "C", metres: 8000, kwh: 0.2 };
  assert.ok(compareNearby(nearCheap, nearDear, true) < 0);
  assert.ok(compareNearby(nearDear, farCheap, true) < 0);
  assert.equal(lowestKwh([{ unit: "h", price: 1 }, { unit: "kWh", price: 0.7 }, { unit: "kWh", price: 0.4 }]), 0.4);
  assert.equal(lowestKwh([{ unit: "h", price: 0.1 }]), null);
});

test("keeps a letter that follows a block number", () => {
  assert.equal(titleCasePlace("BLK 207A BISHAN STREET 23"), "Blk 207A Bishan Street 23");
  assert.equal(titleCasePlace("3E RIVER VALLEY ROAD"), "3E River Valley Road");
  assert.match(siteNamed("Blk 207A Bishan Street 23", "SP Mobility").address, /207A/);
  assert.match(siteNamed("Clarke Quay", "SP Mobility").address, /3E River Valley Road/);
});

test("splits operators that share a car park", () => {
  const holland = sample.sites.filter((site) => site.name === "One Holland Village");
  assert.equal(holland.length, 2);
  assert.deepEqual(holland.map((site) => site.operatorLabel).sort(), ["SP Mobility", "Tesla"]);
});

test("counts each connector and does not treat blank or 100 as free", () => {
  const quay = siteNamed("Clarke Quay", "SP Mobility");
  const quaySummary = summarize(quay.connectors);
  assert.equal(quaySummary.free, 2);
  assert.equal(quaySummary.busy, 2);

  const holland = siteNamed("One Holland Village", "SP Mobility");
  const hollandSummary = summarize(holland.connectors);
  assert.equal(hollandSummary.free, 3);
  assert.equal(hollandSummary.busy, 4);

  const fernvale = siteNamed("Blk 414 Fernvale Link Fernvale Riverbow", "Shell");
  const fernvaleSummary = summarize(fernvale.connectors);
  assert.equal(fernvaleSummary.free, 1);
  assert.equal(fernvaleSummary.busy, 1);
  assert.equal(fernvaleSummary.unknown, 1);
  assert.equal(formatPrices(fernvaleSummary), "$0.69/kWh");
});

test("keeps a missing price missing and links only exact operator names", () => {
  const tesla = siteNamed("One Holland Village", "Tesla");
  assert.equal(tesla.operatorUrl, null);
  assert.equal(summarize(tesla.connectors).prices.length, 0);
  assert.equal(formatConnectorPrice(tesla.connectors[0]), "No price in the feed");
  assert.equal(siteNamed("Clarke Quay", "SP Mobility").operatorUrl, "https://www.spmobility.sg/");
  assert.equal(siteNamed("AMK Autopoint", "Charge+").operatorUrl, "https://www.chargeplus.com/");

  const almost = normalizeFeed({
    evLocationsData: [
      {
        name: "LOOKALIKE",
        address: "1 ROAD SINGAPORE 111111",
        latitude: 1.3,
        longtitude: 103.8,
        postalCode: "111111",
        chargingPoints: [
          {
            operator: "Charge+",
            status: "1",
            position: "L1",
            plugTypes: [
              {
                plugType: "Type 2",
                price: "0.50",
                current: "AC",
                powerRating: "7.4",
                priceType: "kWh",
                evIds: [{ evCpId: "Z-1", status: "1" }],
              },
            ],
          },
        ],
      },
    ],
  });
  assert.equal(almost.sites[0].operatorUrl, null);
});

test("does not convert an hourly price into a per-kWh price", () => {
  const normalized = normalizeFeed({
    evLocationsData: [
      {
        name: "HOUR SITE",
        address: "1 ROAD SINGAPORE 222222",
        latitude: 1.31,
        longtitude: 103.82,
        postalCode: "222222",
        chargingPoints: [
          {
            operator: "EXAMPLE OPERATOR",
            status: "1",
            position: "L1",
            plugTypes: [
              {
                plugType: "Type 2",
                price: "2.50",
                current: "AC",
                powerRating: "7.4",
                priceType: "$/h",
                evIds: [{ evCpId: "H-1", status: "1" }],
              },
            ],
          },
        ],
      },
    ],
  });
  const connector = normalized.sites[0].connectors[0];
  assert.equal(connector.unit, "h");
  assert.equal(connector.price, 2.5);
  assert.equal(formatConnectorPrice(connector), "$2.50/h");
});

test("reads the API guide power fields without swapping them", () => {
  const normalized = normalizeFeed({
    evLocationsData: [
      {
        name: "GUIDE",
        address: "1 ROAD SINGAPORE 333333",
        latitude: 1.3,
        longtitude: 103.8,
        postalCode: "333333",
        chargingPoints: [
          {
            operator: "EXAMPLE OPERATOR",
            status: "0",
            position: "L1",
            plugTypes: [
              {
                plugType: "Type 2",
                price: "0.70",
                powerRating: "AC",
                chargingSpeed: "7.4",
                priceType: "$/kWh",
                evIds: [{ evCpId: "G-1", status: "" }],
              },
            ],
          },
        ],
      },
    ],
  });
  const connector = normalized.sites[0].connectors[0];
  assert.equal(connector.kw, 7.4);
  assert.equal(connector.current, "AC");
  assert.equal(connector.unit, "kWh");
  assert.equal(connector.status, "unknown");
  assert.equal(formatConnectorPrice(connector), "$0.70/kWh");
});

test("plug filters do not treat Combo 2 as Type 2", () => {
  const quay = siteNamed("Clarke Quay", "SP Mobility");
  const filters = { free: false, dc: false, ccs: false, type2: true };
  assert.equal(poolFor(quay, filters).every((connector) => connector.plug === "Type 2"), true);
  assert.equal(siteMatches(quay, { ...filters, free: true }), false);
  assert.equal(siteMatches(quay, { free: true, dc: true, ccs: false, type2: false }), true);
  assert.equal(poolFor(quay, { free: false, dc: false, ccs: true, type2: true }).length, quay.connectors.length);
});

test("a same-unit range is shown and mixed units are not collapsed", () => {
  const quay = summarize(siteNamed("Clarke Quay", "SP Mobility").connectors);
  assert.equal(formatPrices(quay), "$0.7739–$0.8611/kWh");
  assert.equal(quay.fastest.kw, 50);
  assert.equal(quay.fastest.current, "DC");

  const mixed = summarize([
    { status: "free", price: 0.7, unit: "kWh", kw: 7.4, current: "AC", plug: "Type 2" },
    { status: "free", price: 2, unit: "h", kw: 7.4, current: "AC", plug: "Type 2" },
  ]);
  assert.equal(formatPrices(mixed), "$0.70/kWh · $2.00/h");
});

test("green is allowed only for a live feed younger than ten minutes", () => {
  const now = Date.parse("2026-11-06T04:00:00+08:00");
  const live = { source: "lta", fetchedAt: "2026-11-06T03:58:00+08:00", ltaUpdatedAt: "2026-11-06T03:56:00+08:00" };
  assert.equal(isFresh(live, now), true);
  assert.equal(isFresh({ ...live, ltaUpdatedAt: "2026-11-06T03:40:00+08:00" }, now), false);
  assert.equal(isFresh({ source: "sample", fetchedAt: new Date(now).toISOString() }, now), false);
  assert.match(freshnessCopy({ source: "sample" }, now).text, /Sample data/);
  assert.match(freshnessCopy(live, now).text, /Not current|ago/);
  assert.match(freshnessCopy({ ...live, ltaUpdatedAt: "2026-11-06T03:20:00+08:00" }, now).text, /Not current/);
});

test("distance is straight-line metres", () => {
  const metres = distanceMetres(1.290314, 103.846728, 1.311049, 103.794146);
  assert.ok(metres > 6000 && metres < 7000, metres);
});

test("money keeps the feed's fractions", () => {
  assert.equal(formatSgd(0.6781), "$0.6781");
  assert.equal(formatSgd(0.7), "$0.70");
  assert.equal(formatSgd(0.695), "$0.695");
});

test("batch links are limited to the LTA file host", () => {
  const good = "https://dmprod-datasets.s3.ap-southeast-1.amazonaws.com/ev-batch/2026-11-06/EVBatch-1.json";
  const guide =
    "https://dm-traffic-flow-data.s3.ap-southeast-1.amazonaws.com/ev-batch/2026-02-05/EVBatch-20260205130000.json";
  assert.equal(isAllowedBatchUrl(good), true);
  assert.equal(isAllowedBatchUrl(guide), true);
  assert.equal(isAllowedBatchUrl("https://evil.example/ev-batch/2026-11-06/EVBatch-1.json"), false);
  assert.equal(extractLtaBatchLink({ value: [{ Link: good }] }), good);
  assert.equal(extractLtaBatchLink({ Link: "https://evil.example/steal" }), "");
});
