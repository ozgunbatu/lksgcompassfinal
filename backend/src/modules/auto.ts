import { Router } from "express";
import { db } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { requireString } from "../lib/validate";
import { calculateRisk } from "../risk/engine";

type RiskLevel = "low" | "medium" | "high" | "unknown";

type Row = {
  name: string;
  country: string;
  industry: string;
  annual_spend_eur: number;
  workers: number;
  has_audit: boolean;
  has_code_of_conduct: boolean;
};

function toBool(v: any): boolean {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "y";
}

function toInt(v: any): number {
  const n = parseInt(String(v ?? "0").replace(/[^0-9\-]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function splitCSVLine(line: string): string[] {
  // Minimal CSV split (supports quoted commas)
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i=0; i<line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQ = !inQ;
      continue;
    }
    if (ch === "," && !inQ) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function parseCSV(csv: string): Row[] {
  const lines = csv.replace(/\r/g, "").split("\n").map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];

  const first = splitCSVLine(lines[0]).map(s => s.trim().toLowerCase());
  const hasHeader = first.includes("name") && first.includes("country");

  const header = hasHeader
    ? first
    : ["name","country","industry","annual_spend_eur","workers","has_audit","has_code_of_conduct"];

  const idx = (k: string) => header.indexOf(k);

  const rows: Row[] = [];
  const start = hasHeader ? 1 : 0;

  for (let i=start; i<lines.length; i++) {
    const cols = splitCSVLine(lines[i]);
    const name = cols[idx("name")] ?? "";
    const country = cols[idx("country")] ?? "";
    const industry = cols[idx("industry")] ?? "services";

    if (!name || !country) continue;

    rows.push({
      name,
      country,
      industry: industry || "services",
      annual_spend_eur: toInt(cols[idx("annual_spend_eur")]),
      workers: toInt(cols[idx("workers")]),
      has_audit: toBool(cols[idx("has_audit")]),
      has_code_of_conduct: toBool(cols[idx("has_code_of_conduct")]),
    });
  }

  return rows;
}

function applyAutoSignals(baseScore: number, row: Row) {
  const spendSignal = Math.min(20, Math.floor(row.annual_spend_eur / 50000) * 5); // +0..20
  const workerSignal = Math.min(15, Math.floor(row.workers / 500) * 5); // +0..15
  const controls = (row.has_audit ? -10 : 0) + (row.has_code_of_conduct ? -8 : 0);

  const score = Math.max(0, Math.min(100, Math.round(baseScore + spendSignal + workerSignal + controls)));
  let level: RiskLevel = "low";
  if (score >= 70) level = "high";
  else if (score >= 45) level = "medium";

  return { score, level, signals: { spendSignal, workerSignal, controls } };
}

const router = Router();

/**
 * Auto Compliance Run:
 * - CSV upload (as text in JSON body)
 * - Upsert suppliers
 * - Recompute risks + store extended attributes
 * - Return run summary + BAFA report URL
 */
router.post("/run", requireAuth, async (req, res) => {
  try {
    const companyId = req.auth!.companyId;
    const userId = req.auth!.userId;

    const csv = requireString(req.body.csv, "csv");
    const year = toInt(req.body.year) || new Date().getFullYear();

    const rows = parseCSV(csv);
    if (!rows.length) return res.status(400).json({ error: "No valid rows in CSV" });

    let low = 0, medium = 0, high = 0;

    // Upsert by (company_id, name)
    for (const row of rows) {
      const base = calculateRisk(row.country, row.industry);
      const adjusted = applyAutoSignals(base.riskScore, row);

      const mergedDetails = {
        ...base.details,
        autoSignals: adjusted.signals,
        autoInputs: {
          annual_spend_eur: row.annual_spend_eur,
          workers: row.workers,
          has_audit: row.has_audit,
          has_code_of_conduct: row.has_code_of_conduct
        }
      };

      if (adjusted.level === "high") high++;
      else if (adjusted.level === "medium") medium++;
      else low++;

      await db.query(
        `INSERT INTO suppliers(company_id,name,country,industry,risk_level,risk_score,risk_details,annual_spend_eur,workers,has_audit,has_code_of_conduct)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (company_id, name)
         DO UPDATE SET
           country=EXCLUDED.country,
           industry=EXCLUDED.industry,
           risk_level=EXCLUDED.risk_level,
           risk_score=EXCLUDED.risk_score,
           risk_details=EXCLUDED.risk_details,
           annual_spend_eur=EXCLUDED.annual_spend_eur,
           workers=EXCLUDED.workers,
           has_audit=EXCLUDED.has_audit,
           has_code_of_conduct=EXCLUDED.has_code_of_conduct,
           updated_at=now()`,
        [
          companyId,
          row.name,
          row.country,
          row.industry,
          adjusted.level,
          adjusted.score,
          mergedDetails,
          row.annual_spend_eur,
          row.workers,
          row.has_audit,
          row.has_code_of_conduct
        ]
      );
    }

    // Create an auto run record
    await db.query(
      `INSERT INTO auto_runs(company_id, created_by, year, supplier_count, high_risk_count, medium_risk_count, low_risk_count)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [companyId, userId, year, rows.length, high, medium, low]
    );

    // Ensure report metadata exists (PDF is generated on demand via reports module)
    await db.query(
      `INSERT INTO reports(company_id,year,created_by)
       VALUES($1,$2,$3)
       ON CONFLICT(company_id,year) DO UPDATE SET created_at=now(), created_by=$3`,
      [companyId, year, userId]
    );

    res.json({
      ok: true,
      year,
      supplierCount: rows.length,
      distribution: { high, medium, low },
      reportUrl: `/reports/bafa/${year}`
    });
  } catch (e: any) {
    res.status(400).json({ error: e.message ?? "Auto compliance run failed" });
  }
});

router.get("/runs", requireAuth, async (req, res) => {
  const companyId = req.auth!.companyId;
  const r = await db.query(
    `SELECT id, year, supplier_count, high_risk_count, medium_risk_count, low_risk_count, created_at
     FROM auto_runs
     WHERE company_id=$1
     ORDER BY created_at DESC
     LIMIT 50`,
    [companyId]
  );
  res.json(r.rows);
});

export default router;
