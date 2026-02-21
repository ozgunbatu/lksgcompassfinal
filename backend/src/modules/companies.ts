import { Router } from "express";
import { db } from "../lib/db";
import { requireAuth } from "../middleware/auth";

const router = Router();

// Get current company details (for showing public portal URL, etc.)
router.get("/me", requireAuth, async (req, res) => {
  const companyId = req.auth!.companyId;
  const r = await db.query("SELECT id,name,slug,created_at FROM companies WHERE id=$1", [companyId]);
  res.json(r.rows[0] ?? null);
});

export default router;
