import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../lib/db";
import { requireString } from "../lib/validate";

const router = Router();

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

async function uniqueCompanySlug(base: string) {
  let slug = base || "company";
  // ensure unique by adding numeric suffix
  for (let i = 0; i < 1000; i++) {
    const candidate = i === 0 ? slug : `${slug}-${i}`;
    const exists = await db.query("SELECT 1 FROM companies WHERE slug=$1", [candidate]);
    if (!exists.rows.length) return candidate;
  }
  // fallback (very unlikely)
  return `${slug}-${Date.now()}`;
}


router.post("/register", async (req, res) => {
  try {
    const companyName = requireString(req.body.companyName, "companyName");
    const email = requireString(req.body.email, "email").toLowerCase();
    const password = requireString(req.body.password, "password");

    const slugBase = slugify(companyName);
    const slug = await uniqueCompanySlug(slugBase);

    const c = await db.query("INSERT INTO companies(name,slug) VALUES($1,$2) RETURNING id,name,slug", [companyName, slug]);
    const companyId = c.rows[0].id as string;

    const passwordHash = await bcrypt.hash(password, 12);
    const u = await db.query(
      "INSERT INTO users(company_id,email,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id,email,role,company_id",
      [companyId, email, passwordHash, "admin"]
    );

    const token = jwt.sign(
      { userId: u.rows[0].id, companyId, role: u.rows[0].role },
      process.env.JWT_SECRET!,
      { expiresIn: "7d" }
    );

    res.json({ token, user: u.rows[0], company: c.rows[0] });
  } catch (e: any) {
    res.status(400).json({ error: e.message ?? "Registration failed" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const email = requireString(req.body.email, "email").toLowerCase();
    const password = requireString(req.body.password, "password");

    const u = await db.query("SELECT id,email,role,company_id,password_hash FROM users WHERE email=$1", [email]);
    if (!u.rows.length) return res.status(401).json({ error: "Invalid credentials" });

    const user = u.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { userId: user.id, companyId: user.company_id, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: "7d" }
    );

    res.json({ token, user: { id: user.id, email: user.email, role: user.role, company_id: user.company_id } });
  } catch (e: any) {
    res.status(400).json({ error: e.message ?? "Login failed" });
  }
});

export default router;
