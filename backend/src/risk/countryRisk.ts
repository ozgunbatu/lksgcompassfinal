/**
 * Demo risk dataset (extend/replace with real sources later).
 * Values: 0 (best) .. 100 (worst)
 */
export type CountrySignals = {
  humanRights: number;
  corruption: number;
  labor: number;
  stability: number;
};

import { getCountryByIso2, nameToIso2 } from "./countryCache";

export const COUNTRY_SIGNALS: Record<string, CountrySignals> = {
  Germany: { humanRights: 10, corruption: 10, labor: 10, stability: 10 },
  USA: { humanRights: 20, corruption: 15, labor: 25, stability: 20 },
  China: { humanRights: 80, corruption: 55, labor: 70, stability: 45 },
  Vietnam: { humanRights: 60, corruption: 50, labor: 65, stability: 40 },
  Bangladesh: { humanRights: 85, corruption: 60, labor: 90, stability: 55 },
  India: { humanRights: 70, corruption: 60, labor: 75, stability: 50 },
  Turkey: { humanRights: 55, corruption: 55, labor: 55, stability: 45 },
  Mexico: { humanRights: 65, corruption: 70, labor: 60, stability: 60 },
  Brazil: { humanRights: 55, corruption: 60, labor: 55, stability: 55 },
  Indonesia: { humanRights: 65, corruption: 55, labor: 70, stability: 50 },
  Pakistan: { humanRights: 85, corruption: 65, labor: 80, stability: 70 },
  Nigeria: { humanRights: 80, corruption: 75, labor: 70, stability: 80 },
  SouthAfrica: { humanRights: 55, corruption: 55, labor: 55, stability: 60 },
  Poland: { humanRights: 20, corruption: 20, labor: 20, stability: 20 },
  Spain: { humanRights: 15, corruption: 18, labor: 18, stability: 15 }
};

export function normalizeCountry(country: string): string {
  const c = country.trim();
  // Simple aliases
  if (/^south\s*africa$/i.test(c)) return "SouthAfrica";
  return c;
}

export function getCountrySignals(country: string): CountrySignals {
  const key = normalizeCountry(country);

  // 1) DB-backed cache (Step 5) if available
  const iso2 = nameToIso2(key);
  if (iso2) {
    const c = getCountryByIso2(iso2);
    if (c) {
      const score = c.risk_score ?? 50;
      // Translate overall score into component signals if components are missing
      const components = c.components || {};
      return {
        humanRights: components.humanRights ?? score,
        corruption: components.corruption ?? score,
        labor: components.labor ?? score,
        stability: components.stability ?? score,
      };
    }
  }

  // 2) Built-in demo fallback
  return COUNTRY_SIGNALS[key] ?? { humanRights: 50, corruption: 50, labor: 50, stability: 50 };
}
