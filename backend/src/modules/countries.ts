import { Router } from "express";
import { db } from "../lib/db";
import { ensureCountrySeed } from "../risk/countryRepo";

const router = Router();

// Public endpoint: used by the map to render the global heatmap.
router.get("/risks", (_req, res) => {
  (async () => {
    await ensureCountrySeed();
    const r = await db.query(
      "SELECT iso2, country_name, risk_score, risk_level, source, components, updated_at FROM country_risks ORDER BY iso2"
    );
    res.json({ version: "step5-datasources", count: r.rows.length, data: r.rows });
  })().catch(e => res.status(500).json({ error: "countries_risks_failed", detail: String(e?.message || e) }));
});

export default router;
