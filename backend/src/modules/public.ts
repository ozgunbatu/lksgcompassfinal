import { Router } from "express";
import { db } from "../lib/db";
import { requireString, optionalString } from "../lib/validate";

const router = Router();

/**
 * Public endpoint: get company + supplier list for the public whistleblowing portal.
 * This is intentionally minimal (no internal data).
 */
router.get("/company/:slug", async (req, res) => {
  const slug = req.params.slug;
  const c = await db.query("SELECT id,name,slug FROM companies WHERE slug=$1", [slug]);
  if (!c.rows.length) return res.status(404).json({ error: "Company not found" });

  const company = c.rows[0];
  const suppliers = await db.query(
    "SELECT id,name,country,industry FROM suppliers WHERE company_id=$1 ORDER BY name ASC",
    [company.id]
  );

  res.json({ company, suppliers: suppliers.rows });
});

/**
 * Public anonymous complaint submission (no login required)
 */
router.post("/complaints/:slug", async (req, res) => {
  try {
    const slug = req.params.slug;

    const c = await db.query("SELECT id,name,slug FROM companies WHERE slug=$1", [slug]);
    if (!c.rows.length) return res.status(404).json({ error: "Company not found" });
    const companyId = c.rows[0].id as string;

    const supplierId = optionalString(req.body.supplierId);
    const supplierName = optionalString(req.body.supplierName);
    const category = requireString(req.body.category ?? "human_rights", "category");
    const description = requireString(req.body.description, "description");

    // Optional contact (not required; keep anonymous by default)
    const reporterContact = optionalString(req.body.reporterContact);

    // Snapshots (if supplier exists, snapshot name/country; else use provided supplierName)
    let supplierNameSnapshot: string | null = null;
    let supplierCountrySnapshot: string | null = null;

    if (supplierId) {
      const s = await db.query(
        "SELECT name,country FROM suppliers WHERE id=$1 AND company_id=$2",
        [supplierId, companyId]
      );
      if (!s.rows.length) return res.status(400).json({ error: "Invalid supplierId" });
      supplierNameSnapshot = s.rows[0].name;
      supplierCountrySnapshot = s.rows[0].country;
    } else if (supplierName) {
      supplierNameSnapshot = supplierName;
    }

    const r = await db.query(
      `INSERT INTO complaints(company_id,supplier_id,category,description,status,source,is_anonymous,reporter_contact,supplier_name_snapshot,supplier_country_snapshot)
       VALUES($1,$2,$3,$4,'open','public',true,$5,$6,$7)
       RETURNING id,created_at`,
      [companyId, supplierId ?? null, category, description, reporterContact ?? null, supplierNameSnapshot, supplierCountrySnapshot]
    );

    res.json({ ok: true, id: r.rows[0].id, created_at: r.rows[0].created_at });
  } catch (e: any) {
    res.status(400).json({ error: e.message ?? "Create public complaint failed" });
  }
});

export default router;
