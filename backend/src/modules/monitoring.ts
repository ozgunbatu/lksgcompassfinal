import { Router } from "express";
import { db } from "../lib/db";
import { requireAuth } from "../middleware/auth";

const router = Router();

function severityFromScore(score: number): "low"|"medium"|"high" {
  if (score >= 80) return "high";
  if (score >= 55) return "medium";
  return "low";
}

async function sanctionsScreenSupplier(companyId: string, supplierId: string, supplierName: string) {
  // MVP: name match against cached sanctions dataset
  const hits = await db.query(
    "SELECT id, source, name, program FROM sanctions_entities WHERE name ILIKE $1 LIMIT 10",
    [`%${supplierName}%`]
  );
  if (!hits.rows.length) {
    await db.query(
      "INSERT INTO supplier_screenings(supplier_id,company_id,screening_type,status,score,hits) VALUES($1,$2,'sanctions','clear',0,'[]'::jsonb)",
      [supplierId, companyId]
    );
    return { status: "clear", score: 0, hits: [] };
  }

  const score = 90;
  await db.query(
    "INSERT INTO supplier_screenings(supplier_id,company_id,screening_type,status,score,hits) VALUES($1,$2,'sanctions','hit',$3,$4)",
    [supplierId, companyId, score, JSON.stringify(hits.rows)]
  );

  await db.query(
    "INSERT INTO monitoring_events(company_id,supplier_id,event_type,severity,title,payload) VALUES($1,$2,'sanctions',$3,$4,$5)",
    [companyId, supplierId, severityFromScore(score), `Sanctions match for ${supplierName}`, JSON.stringify({ hits: hits.rows })]
  );

  return { status: "hit", score, hits: hits.rows };
}

async function newsMonitor(companyId: string, supplierId: string, supplierName: string) {
  // Optional: GDELT (no key needed). If unavailable, skip.
  const enabled = (process.env.GDELT_ENABLED || "true").toLowerCase() !== "false";
  if (!enabled) return { ok: false, reason: "disabled" };
  try {
    const query = encodeURIComponent(`${supplierName} (labor OR human rights OR corruption OR child labor)`);
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=ArtList&format=json&maxrecords=5&format=JSON`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`gdelt_${resp.status}`);
    const json: any = await resp.json();
    const arts = json?.articles || [];
    for (const a of arts) {
      await db.query(
        "INSERT INTO monitoring_events(company_id,supplier_id,event_type,severity,title,url,payload) VALUES($1,$2,'news','medium',$3,$4,$5)",
        [companyId, supplierId, a.title || `News mention: ${supplierName}`, a.url || null, JSON.stringify(a)]
      );
    }
    return { ok: true, count: arts.length };
  } catch (e: any) {
    return { ok: false, reason: String(e?.message || e) };
  }
}

async function esgScreenSupplier(companyId: string, supplierId: string, supplierName: string) {
  const hits = await db.query(
    "SELECT id, source, name, score, issues FROM esg_entities WHERE name ILIKE $1 ORDER BY score DESC LIMIT 5",
    [`%${supplierName}%`]
  );
  if (!hits.rows.length) {
    await db.query(
      "INSERT INTO supplier_screenings(supplier_id,company_id,screening_type,status,score,hits) VALUES($1,$2,'esg','clear',0,'[]'::jsonb)",
      [supplierId, companyId]
    );
    return { status: "clear", score: 0, hits: [] };
  }
  const score = Math.max(0, Math.min(100, Math.round(hits.rows[0].score || 0)));
  const status = score >= 60 ? "needs_review" : "clear";
  await db.query(
    "INSERT INTO supplier_screenings(supplier_id,company_id,screening_type,status,score,hits) VALUES($1,$2,'esg',$3,$4,$5)",
    [supplierId, companyId, status, score, JSON.stringify(hits.rows)]
  );
  if (status !== "clear") {
    await db.query(
      "INSERT INTO monitoring_events(company_id,supplier_id,event_type,severity,title,payload) VALUES($1,$2,'esg',$3,$4,$5)",
      [companyId, supplierId, severityFromScore(score), `ESG issue signal for ${supplierName}`, JSON.stringify({ hits: hits.rows })]
    );
  }
  return { status, score, hits: hits.rows };
}

// Run monitoring for all suppliers of this company
router.post("/run", requireAuth, async (req, res) => {
  const companyId = req.auth!.companyId;
  const suppliers = await db.query(
    "SELECT id,name FROM suppliers WHERE company_id=$1 ORDER BY created_at DESC",
    [companyId]
  );
  const results: any[] = [];
  for (const s of suppliers.rows) {
    const sanctions = await sanctionsScreenSupplier(companyId, s.id, s.name);
    const esg = await esgScreenSupplier(companyId, s.id, s.name);
    const news = await newsMonitor(companyId, s.id, s.name);
    results.push({ supplierId: s.id, supplierName: s.name, sanctions, esg, news });
  }
  res.json({ ok: true, suppliers: suppliers.rows.length, results });
});

router.get("/events", requireAuth, async (req, res) => {
  const companyId = req.auth!.companyId;
  const r = await db.query(
    "SELECT id,supplier_id,event_type,severity,title,url,created_at FROM monitoring_events WHERE company_id=$1 ORDER BY created_at DESC LIMIT 200",
    [companyId]
  );
  res.json(r.rows);
});

router.get("/screenings", requireAuth, async (req, res) => {
  const companyId = req.auth!.companyId;
  const r = await db.query(
    "SELECT id,supplier_id,screening_type,status,score,created_at FROM supplier_screenings WHERE company_id=$1 ORDER BY created_at DESC LIMIT 400",
    [companyId]
  );
  res.json(r.rows);
});

export default router;
