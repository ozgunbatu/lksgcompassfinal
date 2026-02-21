// Synthetic-but-stable global country risk dataset (MVP).
// Purpose: power the 200+ country choropleth heatmap + default country baseline.
// NOTE: Replace/override with real sources in Step 5 (World Bank/ILO/TI/UN + sanctions).

export type CountryRisk = {
  iso2: string; // ISO 3166-1 alpha-2
  score: number; // 0..100 (higher = riskier)
  tier: "low" | "medium" | "high";
};

// Compact ISO alpha-2 list (249 entries). Source: ISO 3166-1 alpha-2 set.
// Kept as a single string for repo size/readability.
const ISO2 = `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ
BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ
CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ
DE DJ DK DM DO DZ
EC EE EG EH ER ES ET
FI FJ FK FM FO FR
GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY
HK HM HN HR HT HU
ID IE IL IM IN IO IQ IR IS IT
JE JM JO JP
KE KG KH KI KM KN KP KR KW KY KZ
LA LB LC LI LK LR LS LT LU LV LY
MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ
NA NC NE NF NG NI NL NO NP NR NU NZ
OM
PA PE PF PG PH PK PL PM PN PR PS PT PW PY
QA
RE RO RS RU RW
SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ
TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ
UA UG UM US UY UZ
VA VC VE VG VI VN VU
WF WS
YE YT
ZA ZM ZW`;

const ISO2_LIST = ISO2.split(/\s+/).map(s => s.trim()).filter(Boolean);

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function hashIso(iso2: string) {
  // Stable pseudo-hash 0..999
  const a = iso2.charCodeAt(0);
  const b = iso2.charCodeAt(1);
  return (a * 31 + b * 17 + (a ^ b) * 13) % 1000;
}

// A few overrides to avoid obviously-wrong defaults for the demo.
// (Not claiming these are "official" scores — Step 5 replaces this with real data sources.)
const OVERRIDES: Record<string, number> = {
  DE: 12,
  AT: 14,
  CH: 12,
  NL: 14,
  SE: 12,
  NO: 10,
  DK: 12,
  FI: 12,
  GB: 18,
  US: 22,
  CA: 16,
  JP: 16,
  AU: 16,
  NZ: 14,
  CN: 72,
  BD: 78,
  PK: 76,
  MM: 82,
  AF: 88,
  SY: 90,
  SD: 85,
  SS: 90,
  YE: 90,
  SO: 88,
  HT: 70,
  RU: 68,
  UA: 66,
  IR: 74,
  IQ: 70,
  LY: 78,
  NG: 70,
  ET: 66,
  CD: 78,
  KP: 92,
};

export function getAllCountryRisks(): CountryRisk[] {
  return ISO2_LIST.map((iso2) => {
    let score: number;
    if (OVERRIDES[iso2] !== undefined) {
      score = OVERRIDES[iso2];
    } else {
      // Base score from hash + gentle spread
      const h = hashIso(iso2);
      score = 20 + Math.round((h / 1000) * 70); // 20..90

      // Small stabilization: keep most in 25..85
      score = clamp(score, 25, 85);
    }

    let tier: CountryRisk["tier"] = "low";
    if (score >= 70) tier = "high";
    else if (score >= 45) tier = "medium";

    return { iso2, score, tier };
  });
}

export function getCountryRiskByIso2(iso2: string) {
  const u = iso2.toUpperCase();
  if (OVERRIDES[u] !== undefined) {
    const score = OVERRIDES[u];
    const tier = score >= 70 ? "high" : score >= 45 ? "medium" : "low";
    return { iso2: u, score, tier } as CountryRisk;
  }
  const h = hashIso(u);
  let score = 20 + Math.round((h / 1000) * 70);
  score = clamp(score, 25, 85);
  const tier = score >= 70 ? "high" : score >= 45 ? "medium" : "low";
  return { iso2: u, score, tier } as CountryRisk;
}
