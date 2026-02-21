import { getCountrySignals } from "./countryRisk";

export type RiskLevel = "low" | "medium" | "high";

export type RiskDetails = {
  countrySignals: ReturnType<typeof getCountrySignals>;
  industryRisk: number;
  mediaRisk: number;
  sanctionsRisk: number;
  computedAt: string;
  formula: {
    country: number;
    industry: number;
    human: number;
    corruption: number;
    labor: number;
    stability: number;
    media: number;
    sanctions: number;
  };
};

const INDUSTRY_BASE: Record<string, number> = {
  textile: 70,
  mining: 85,
  agriculture: 60,
  electronics: 55,
  logistics: 45,
  automotive: 40,
  construction: 50,
  services: 30
};

function clamp(n: number, min=0, max=100) { return Math.max(min, Math.min(max, n)); }

export function calculateRisk(country: string, industry: string) {
  const signals = getCountrySignals(country);
  const industryRisk = INDUSTRY_BASE[industry?.toLowerCase()] ?? 45;

  // Demo placeholders (replace with real monitoring later)
  const mediaRisk = clamp(Math.round((signals.humanRights + signals.labor) / 4));      // 0..50-ish
  const sanctionsRisk = clamp(Math.round((signals.corruption + signals.stability) / 4));

  // Weighted score 0..100
  const score =
    (signals.humanRights * 0.18) +
    (signals.labor * 0.18) +
    (signals.corruption * 0.10) +
    (signals.stability * 0.10) +
    (industryRisk * 0.22) +
    (mediaRisk * 0.12) +
    (sanctionsRisk * 0.10);

  const riskScore = clamp(Math.round(score));

  let level: RiskLevel = "low";
  if (riskScore >= 70) level = "high";
  else if (riskScore >= 45) level = "medium";

  const details: RiskDetails = {
    countrySignals: signals,
    industryRisk,
    mediaRisk,
    sanctionsRisk,
    computedAt: new Date().toISOString(),
    formula: {
      country: 0, // kept for readability, rolled into signals
      industry: 0.22,
      human: 0.18,
      corruption: 0.10,
      labor: 0.18,
      stability: 0.10,
      media: 0.12,
      sanctions: 0.10
    }
  };

  return { riskScore, level, details };
}
