import { Router } from "express";
import { db } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { requireString, optionalString } from "../lib/validate";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  const companyId = req.auth!.companyId;
  const r = await db.query(
    `SELECT c.id,c.category,c.description,c.status,c.source,c.is_anonymous,c.reporter_contact,c.supplier_name_snapshot,c.supplier_country_snapshot,c.created_at,
            s.id as supplier_id, s.name as supplier_name
     FROM complaints c
     LEFT JOIN suppliers s ON s.id=c.supplier_id
     WHERE c.company_id=$1
     ORDER BY c.created_at DESC`,
    [companyId]
  );
  res.json(r.rows);
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const companyId = req.auth!.companyId;
    const supplierId = optionalString(req.body.supplierId);
    const category = requireString(req.body.category ?? "human_rights", "category");
    const description = requireString(req.body.description, "description");

    const r = await db.query(
      `INSERT INTO complaints(company_id,supplier_id,category,description)
       VALUES($1,$2,$3,$4) RETURNING id,category,description,status,source,is_anonymous,created_at,supplier_id`,
      [companyId, supplierId ?? null, category, description]
    );
    res.json(r.rows[0]);
  } catch (e: any) {
    res.status(400).json({ error: e.message ?? "Create complaint failed" });
  }
});

router.put("/:id/status", requireAuth, async (req, res) => {
  const companyId = req.auth!.companyId;
  const id = req.params.id;
  const status = requireString(req.body.status, "status");
  const allowed = new Set(["open", "in_review", "closed"]);
  if (!allowed.has(status)) return res.status(400).json({ error: "Invalid status" });

  const r = await db.query(
    "UPDATE complaints SET status=$1 WHERE id=$2 AND company_id=$3 RETURNING id,status",
    [status, id, companyId]
  );
  res.json(r.rows[0] ?? null);
});

export default router;
