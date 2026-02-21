import { Router } from "express";
import { db } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { requireString, optionalString } from "../lib/validate";
import { calculateRisk } from "../risk/engine";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  const companyId = req.auth!.companyId;
  const r = await db.query(
    "SELECT id,name,country,industry,annual_spend_eur,workers,has_audit,has_code_of_conduct,risk_level,risk_score,created_at,updated_at FROM suppliers WHERE company_id=$1 ORDER BY created_at DESC",
    [companyId]
  );
  res.json(r.rows);
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const companyId = req.auth!.companyId;
    const name = requireString(req.body.name, "name");
    const country = requireString(req.body.country, "country");
    const industry = requireString(req.body.industry, "industry");

    const { riskScore, level, details } = calculateRisk(country, industry);

    const r = await db.query(
      `INSERT INTO suppliers(company_id,name,country,industry,risk_level,risk_score,risk_details)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,name,country,industry,risk_level,risk_score,created_at,updated_at`,
      [companyId, name, country, industry, level, riskScore, details]
    );
    res.json(r.rows[0]);
  } catch (e: any) {
    res.status(400).json({ error: e.message ?? "Create supplier failed" });
  }
});

router.put("/:id", requireAuth, async (req, res) => {
  try {
    const companyId = req.auth!.companyId;
    const id = requireString(req.params.id, "id");

    const name = optionalString(req.body.name);
    const country = optionalString(req.body.country);
    const industry = optionalString(req.body.industry);

    const current = await db.query("SELECT * FROM suppliers WHERE id=$1 AND company_id=$2", [id, companyId]);
    if (!current.rows.length) return res.status(404).json({ error: "Not found" });

    const nextName = name ?? current.rows[0].name;
    const nextCountry = country ?? current.rows[0].country;
    const nextIndustry = industry ?? current.rows[0].industry;

    const { riskScore, level, details } = calculateRisk(nextCountry, nextIndustry);

    const r = await db.query(
      `UPDATE suppliers
       SET name=$1,country=$2,industry=$3,risk_level=$4,risk_score=$5,risk_details=$6
       WHERE id=$7 AND company_id=$8
       RETURNING id,name,country,industry,risk_level,risk_score,created_at,updated_at`,
      [nextName, nextCountry, nextIndustry, level, riskScore, details, id, companyId]
    );
    res.json(r.rows[0]);
  } catch (e: any) {
    res.status(400).json({ error: e.message ?? "Update supplier failed" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  const companyId = req.auth!.companyId;
  const id = req.params.id;
  await db.query("DELETE FROM suppliers WHERE id=$1 AND company_id=$2", [id, companyId]);
  res.json({ ok: true });
});

// CSV import (text/csv)
router.post("/import/csv", requireAuth, async (req, res) => {
  try {
    const companyId = req.auth!.companyId;
    const csv = requireString(req.body.csv, "csv");

    const lines = csv.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) return res.status(400).json({ error: "Empty CSV" });

    // Allow header
    const startIndex = /name\s*,\s*country\s*,\s*industry/i.test(lines[0]) ? 1 : 0;

    const inserted: any[] = [];
    for (let i = startIndex; i < lines.length; i++) {
      const [name, country, industry] = lines[i].split(",").map(x => (x ?? "").trim());
      if (!name || !country || !industry) continue;

      const { riskScore, level, details } = calculateRisk(country, industry);
      const r = await db.query(
        `INSERT INTO suppliers(company_id,name,country,industry,risk_level,risk_score,risk_details)
         VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,name,country,industry,risk_level,risk_score,created_at,updated_at`,
        [companyId, name, country, industry, level, riskScore, details]
      );
      inserted.push(r.rows[0]);
    }

    res.json({ insertedCount: inserted.length, inserted });
  } catch (e: any) {
    res.status(400).json({ error: e.message ?? "CSV import failed" });
  }
});

router.post("/recalculate", requireAuth, async (req, res) => {
  const companyId = req.auth!.companyId;
  const r = await db.query("SELECT id,country,industry FROM suppliers WHERE company_id=$1", [companyId]);

  for (const s of r.rows) {
    const { riskScore, level, details } = calculateRisk(s.country, s.industry);
    await db.query(
      "UPDATE suppliers SET risk_level=$1,risk_score=$2,risk_details=$3 WHERE id=$4 AND company_id=$5",
      [level, riskScore, details, s.id, companyId]
    );
  }

  res.json({ ok: true, recalculated: r.rows.length });
});

export default router;
