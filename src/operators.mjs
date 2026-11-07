const KNOWN = new Map([
  ["CHARGE+ PTE. LTD.", { label: "Charge+", url: "https://www.chargeplus.com/" }],
  ["SP MOBILITY PTE. LTD.", { label: "SP Mobility", url: "https://www.spmobility.sg/" }],
  ["SHELL SINGAPORE PTE. LTD.", { label: "Shell", url: null }],
  ["COMFORTDELGRO ENGIE PTE. LTD.", { label: "ComfortDelGro Engie", url: null }],
  ["STRIDES YTL PTE. LTD.", { label: "Strides YTL", url: null }],
  ["TESLA MOTORS SINGAPORE PRIVATE LIMITED", { label: "Tesla", url: null }],
]);

export function operatorKey(raw) {
  return String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function operatorInfo(raw) {
  const key = operatorKey(raw);
  const known = KNOWN.get(key);
  if (known) return { key, label: known.label, url: known.url };
  return { key, label: fallbackLabel(raw), url: null };
}

function fallbackLabel(raw) {
  const stripped = String(raw ?? "")
    .replace(/\b(PTE\.?|LTD\.?|PRIVATE|LIMITED)\b/gi, "")
    .replace(/[.,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return titleCasePlace(String(raw ?? "").trim()) || "Unknown";
  return stripped
    .split(" ")
    .map((word) => (/^[A-Z0-9]{2,4}$/.test(word) ? word : titleCasePlace(word)))
    .join(" ");
}

export function titleCasePlace(value) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!text) return "";
  return text
    .replace(/\b([a-z])/g, (letter) => letter.toUpperCase())
    .replace(/(\d)([a-z])/g, (match, digit, letter) => digit + letter.toUpperCase())
    .replace(/\bAmk\b/g, "AMK")
    .replace(/\bMscp\b/g, "MSCP")
    .replace(/\bJtc\b/g, "JTC")
    .replace(/\bHdb\b/g, "HDB")
    .replace(/\bYwca\b/g, "YWCA");
}
