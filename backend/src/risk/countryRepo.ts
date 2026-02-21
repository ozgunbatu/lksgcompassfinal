import { db } from "../lib/db";
import countries from "i18n-iso-countries";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const en = require("i18n-iso-countries/langs/en.json");
countries.registerLocale(en);

import { getAllCountryRisks } from "./countryDataset";
import { setCountryCache, CachedCountry } from "./countryCache";

function tier(score: number): "low" | "medium" | "high" {
  if (score >= 70) return "high";
  if (score >= 45) return "medium";
  return "low";
}

export async function ensureCountrySeed() {
  const c = await db.query("SELECT COUNT(*)::int AS n FROM country_risks");
  if ((c.rows[0]?.n ?? 0) > 0) return;

  const data = getAllCountryRisks();
  // Bulk insert
  const values: any[] = [];
  const placeholders: string[] = [];
  data.forEach((r, i) => {
    const name = countries.getName(r.iso2, "en") || r.iso2;
    const score = r.score;
    const level = tier(score);
    const base = i * 6;
    placeholders.push(`($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6})`);
    values.push(r.iso2, name, score, level, "seed", JSON.stringify({}));
  });

  if (placeholders.length) {
    await db.query(
      `INSERT INTO country_risks (iso2, country_name, risk_score, risk_level, source, components)
       VALUES ${placeholders.join(",")}
       ON CONFLICT (iso2) DO NOTHING`,
      values
    );
  }
}

export async function refreshCountryCache() {
  const r = await db.query(
    "SELECT iso2, country_name AS name, risk_score, risk_level, components, updated_at FROM country_risks"
  );
  setCountryCache(r.rows as CachedCountry[]);
  return r.rows.length;
}

export async function upsertCountryRisks(rows: Array<{ iso2: string; score: number; source?: string; components?: any }>) {
  if (!rows.length) return 0;
  const values: any[] = [];
  const placeholders: string[] = [];

  rows.forEach((r, i) => {
    const iso2 = (r.iso2 || "").toUpperCase();
    if (!iso2) return;
    const name = countries.getName(iso2, "en") || iso2;
    const score = Math.max(0, Math.min(100, Math.round(r.score)));
    const level = tier(score);
    const source = r.source || "external";
    const components = r.components || {};
    const base = i * 6;
    placeholders.push(`($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6})`);
    values.push(iso2, name, score, level, source, JSON.stringify(components));
  });

  await db.query(
    `INSERT INTO country_risks (iso2, country_name, risk_score, risk_level, source, components)
     VALUES ${placeholders.join(",")}
     ON CONFLICT (iso2) DO UPDATE SET
       risk_score=EXCLUDED.risk_score,
       risk_level=EXCLUDED.risk_level,
       source=EXCLUDED.source,
       components=EXCLUDED.components,
       updated_at=now()`,
    values
  );
  await refreshCountryCache();
  return rows.length;
}
