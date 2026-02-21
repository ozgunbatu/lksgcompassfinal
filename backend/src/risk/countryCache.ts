import countries from "i18n-iso-countries";

// Minimal locale registration (English) for alpha-2 lookups.
// The package ships locale JSON; resolveJsonModule is enabled.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const en = require("i18n-iso-countries/langs/en.json");
countries.registerLocale(en);

export type CachedCountry = {
  iso2: string;
  name: string;
  risk_score: number; // 0..100
  risk_level: "low" | "medium" | "high" | "unknown";
  components: Record<string, any>;
  updated_at?: string;
};

let byIso2: Record<string, CachedCountry> = {};

export function setCountryCache(rows: CachedCountry[]) {
  const m: Record<string, CachedCountry> = {};
  for (const r of rows) {
    if (!r?.iso2) continue;
    m[r.iso2.toUpperCase()] = r;
  }
  byIso2 = m;
}

export function getCountryByIso2(iso2: string): CachedCountry | null {
  return byIso2[(iso2 || "").toUpperCase()] || null;
}

export function nameToIso2(countryName: string): string | null {
  const name = (countryName || "").trim();
  if (!name) return null;
  const iso2 = countries.getAlpha2Code(name, "en");
  return iso2 ? iso2.toUpperCase() : null;
}
