import { Router } from "express";
import { db } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { refreshCountryCache, upsertCountryRisks } from "../risk/countryRepo";

const router = Router();

function csvLines(text: string) {
  return text.replace(/\r/g, "").split("\n").filter(l => l.trim().length > 0);
}

function parseCsvRow(line: string) {
  // Minimal CSV parser (handles quotes)
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i+1] === '"') { cur += '"'; i++; continue; }
      inQ = !inQ;
      continue;
    }
    if (ch === ',' && !inQ) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

async function logSync(job: string, status: string, details: any) {
  await db.query(
    "INSERT INTO sync_runs(job,status,details) VALUES($1,$2,$3)",
    [job, status, JSON.stringify(details || {})]
  );
}

router.get("/status", requireAuth, async (_req, res) => {
  const r = await db.query("SELECT job,status,details,created_at FROM sync_runs ORDER BY created_at DESC LIMIT 30");
  res.json(r.rows);
});

// === Country Risk Data Source ===
// If COUNTRY_RISK_URL is provided, it must return JSON array: [{iso2, score, components?}]
router.post("/sync/country-risks", requireAuth, async (_req, res) => {
  const url = process.env.COUNTRY_RISK_URL;
  try {
    if (!url) {
      const n = await refreshCountryCache();
      await logSync("country_risks", "success", { mode: "cache_refresh", count: n });
      return res.json({ ok: true, mode: "cache_refresh", count: n });
    }
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`fetch_failed_${resp.status}`);
    const json = await resp.json();
    if (!Array.isArray(json)) throw new Error("invalid_country_risk_payload");
    const count = await upsertCountryRisks(
      json
        .map((r: any) => ({ iso2: r.iso2, score: r.score, source: "external", components: r.components || {} }))
        .filter((r: any) => r.iso2 && typeof r.score !== "undefined")
    );
    await logSync("country_risks", "success", { mode: "external_url", url, count });
    res.json({ ok: true, mode: "external_url", count });
  } catch (e: any) {
    await logSync("country_risks", "error", { error: String(e?.message || e) });
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// === Sanctions API (EU/OFAC) ===
// EU_SANCTIONS_URL: CSV with columns incl. name
router.post("/sync/sanctions/eu", requireAuth, async (_req, res) => {
  const url = process.env.EU_SANCTIONS_URL;
  if (!url) return res.status(400).json({ error: "EU_SANCTIONS_URL_missing" });
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`fetch_failed_${resp.status}`);
    const text = await resp.text();
    const lines = csvLines(text);
    const header = parseCsvRow(lines[0]).map(h => h.toLowerCase());
    const idxName = header.findIndex(h => h.includes("name"));
    const idxProgram = header.findIndex(h => h.includes("program") || h.includes("regime"));
    const idxDate = header.findIndex(h => h.includes("listed") || h.includes("date"));
    if (idxName < 0) throw new Error("eu_csv_missing_name_column");

    // Replace dataset (MVP)
    await db.query("DELETE FROM sanctions_entities WHERE source='eu'");

    let inserted = 0;
    for (let i = 1; i < lines.length; i++) {
      const row = parseCsvRow(lines[i]);
      const name = row[idxName] || "";
      if (!name) continue;
      const program = idxProgram >= 0 ? (row[idxProgram] || null) : null;
      const listedAt = idxDate >= 0 ? (row[idxDate] || null) : null;
      await db.query(
        "INSERT INTO sanctions_entities(source,name,program,listed_at,raw,updated_at) VALUES($1,$2,$3,$4,$5,now())",
        ["eu", name, program, listedAt, JSON.stringify({ row })]
      );
      inserted++;
    }
    await logSync("sanctions_eu", "success", { url, inserted });
    res.json({ ok: true, source: "eu", inserted });
  } catch (e: any) {
    await logSync("sanctions_eu", "error", { error: String(e?.message || e) });
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// OFAC_SDN_URL: CSV with a name column (varies) — we do best-effort.
router.post("/sync/sanctions/ofac", requireAuth, async (_req, res) => {
  const url = process.env.OFAC_SDN_URL;
  if (!url) return res.status(400).json({ error: "OFAC_SDN_URL_missing" });
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`fetch_failed_${resp.status}`);
    const text = await resp.text();
    const lines = csvLines(text);
    const header = parseCsvRow(lines[0]).map(h => h.toLowerCase());
    const idxName = header.findIndex(h => h.includes("name"));
    if (idxName < 0) throw new Error("ofac_csv_missing_name_column");

    await db.query("DELETE FROM sanctions_entities WHERE source='ofac'");
    let inserted = 0;
    for (let i = 1; i < lines.length; i++) {
      const row = parseCsvRow(lines[i]);
      const name = row[idxName] || "";
      if (!name) continue;
      await db.query(
        "INSERT INTO sanctions_entities(source,name,raw,updated_at) VALUES($1,$2,$3,now())",
        ["ofac", name, JSON.stringify({ row })]
      );
      inserted++;
    }
    await logSync("sanctions_ofac", "success", { url, inserted });
    res.json({ ok: true, source: "ofac", inserted });
  } catch (e: any) {
    await logSync("sanctions_ofac", "error", { error: String(e?.message || e) });
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// === ESG dataset (optional) ===
// POST body: { items: [{ name: "Supplier/Entity", score: 0..100, issues: ["child_labor", ...], raw?: {...} }], source?: "..." }
router.post("/upload/esg", requireAuth, async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const source = (req.body?.source || "upload").toString();
  if (!items.length) return res.status(400).json({ error: "empty_items" });
  try {
    // Replace dataset for given source (MVP)
    await db.query("DELETE FROM esg_entities WHERE source=$1", [source]);
    let inserted = 0;
    for (const it of items) {
      const name = (it?.name || "").toString().trim();
      if (!name) continue;
      const score = Math.max(0, Math.min(100, Math.round(Number(it.score || 0))));
      const issues = Array.isArray(it.issues) ? it.issues : [];
      await db.query(
        "INSERT INTO esg_entities(source,name,score,issues,raw,updated_at) VALUES($1,$2,$3,$4,$5,now())",
        [source, name, score, JSON.stringify(issues), JSON.stringify(it.raw || it)]
      );
      inserted++;
    }
    await logSync("esg_upload", "success", { source, inserted });
    res.json({ ok: true, inserted, source });
  } catch (e: any) {
    await logSync("esg_upload", "error", { error: String(e?.message || e) });
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

export default router;
