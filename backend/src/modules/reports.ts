import { Router } from "express";
import PDFDocument from "pdfkit";
import { db } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import jwt from "jsonwebtoken";

import { requireInt } from "../lib/validate";

const router = Router();

// "Real" BAFA export in the sense of mirroring the official questionnaire structure.
// The report is still a generator output and must be reviewed before submission.
// We store a draft JSON that admins can edit to fill narrative/organizational details.
type ReportDraft = {
  reporting_scope: string;
  organization_structure: string;
  responsible_persons: string;
  risk_methodology: string;
  prioritized_risks: string;
  prevention_measures: string;
  remediation_measures: string;
  complaints_procedure: string;
  complaints_access_groups: string;
  complaints_rules_public_url: string;
  effectiveness_review: string;
};

function defaultDraft(companyName: string, publicPortalUrl: string): ReportDraft {
  return {
    reporting_scope: `Berichtsjahr entspricht dem Geschäftsjahr. Dieses Dokument bezieht sich auf ${companyName}.`,
    organization_structure: "Beschreiben Sie die Unternehmensstruktur und die organisatorische Verankerung des Risikomanagements (z.B. Compliance, Einkauf, HR).",
    responsible_persons: "Benennen Sie zuständige Personen/Funktionen (z.B. Menschenrechtsbeauftragte:r) und Verantwortlichkeiten.",
    risk_methodology: "Beschreiben Sie Verfahren, Datenquellen und Kriterien der Risikoanalyse (jährlich + anlassbezogen).",
    prioritized_risks: "Beschreiben Sie priorisierte Risiken (eigener Geschäftsbereich, unmittelbare und mittelbare Zulieferer).",
    prevention_measures: "Beschreiben Sie Präventionsmaßnahmen (Code of Conduct, Trainings, SAQs, Vertragsklauseln, Audits, Einkaufspraxis).",
    remediation_measures: "Beschreiben Sie Abhilfemaßnahmen (CAPs, Zeitpläne, Beendigung/Minimierung, ggf. Abbruch der Geschäftsbeziehung).",
    complaints_procedure: `Beschreiben Sie das Beschwerdeverfahren. Öffentliches Portal: ${publicPortalUrl}`,
    complaints_access_groups: "Welche potenziell Beteiligten haben Zugang? (Beschäftigte, Zulieferer, Betroffene, NGOs, etc.)",
    complaints_rules_public_url: publicPortalUrl,
    effectiveness_review: "Beschreiben Sie, wie Angemessenheit und Wirksamkeit des Risikomanagements überprüft wird (KPIs, Reviews, Audit-Findings).",
  };
}

async function getOrCreateReport(companyId: string, year: number, userId: string) {
  await db.query(
    `INSERT INTO reports(company_id,year,created_by,summary) VALUES($1,$2,$3,$4)
     ON CONFLICT(company_id,year) DO UPDATE SET updated_at=now()`,
    [companyId, year, userId, JSON.stringify({})]
  );
  return db.query("SELECT * FROM reports WHERE company_id=$1 AND year=$2", [companyId, year]);
}

// Draft endpoints (admin-only)
router.get("/bafa/:year/draft", requireAuth, async (req, res) => {
  const year = requireInt(req.params.year, "year");
  const companyId = req.auth!.companyId;

  const company = await db.query("SELECT id,name,slug FROM companies WHERE id=$1", [companyId]);
  const cname = company.rows[0]?.name ?? "—";
  const slug = company.rows[0]?.slug ?? "";
  const publicPortalUrl = `${process.env.PUBLIC_APP_URL || ""}/complaints/${slug}`.replace(/\/$/, "");

  const r = await getOrCreateReport(companyId, year, req.auth!.userId);
  const existing = r.rows[0]?.summary || {};
  const draft: ReportDraft = {
    ...defaultDraft(cname, publicPortalUrl),
    ...(existing?.draft || {})
  };

  // Persist default if missing
  await db.query(
    "UPDATE reports SET summary = jsonb_set(COALESCE(summary,'{}'::jsonb), '{draft}', $1::jsonb, true) WHERE company_id=$2 AND year=$3",
    [JSON.stringify(draft), companyId, year]
  );

  res.json({ year, draft, company: { id: companyId, name: cname, slug } });
});

router.put("/bafa/:year/draft", requireAuth, async (req, res) => {
  const year = requireInt(req.params.year, "year");
  const companyId = req.auth!.companyId;
  const incoming = (req.body || {}) as Partial<ReportDraft>;

  const r = await db.query("SELECT summary FROM reports WHERE company_id=$1 AND year=$2", [companyId, year]);
  const currentDraft = (r.rows[0]?.summary?.draft || {}) as Partial<ReportDraft>;
  const merged = { ...currentDraft, ...incoming };

  await db.query(
    "UPDATE reports SET summary = jsonb_set(COALESCE(summary,'{}'::jsonb), '{draft}', $1::jsonb, true), updated_at=now() WHERE company_id=$2 AND year=$3",
    [JSON.stringify(merged), companyId, year]
  );

  res.json({ ok: true });
});

function sectionTitle(doc: PDFKit.PDFDocument, t: string) {
  doc.moveDown(0.6);
  doc.fontSize(14).font("Helvetica-Bold").text(t);
  doc.moveDown(0.2);
  doc.fontSize(11).font("Helvetica");
}

router.get("/bafa/:year", async (req, res) => {
  // allow auth via query token for opening PDF in a new tab
  const header = String(req.headers.authorization || "").trim();
  const qtoken = String((req.query as any)?.token || "").trim();
  const token = header.startsWith("Bearer ") ? header.slice(7) : (header || qtoken);

  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const decoded: any = jwt.verify(token, process.env.JWT_SECRET!);
    (req as any).auth = decoded;
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const companyId = req.auth!.companyId;
  const year = requireInt(req.params.year, "year");

  const company = await db.query("SELECT id,name,slug FROM companies WHERE id=$1", [companyId]);
  const suppliers = await db.query(
    "SELECT name,country,industry,risk_level,risk_score FROM suppliers WHERE company_id=$1 ORDER BY risk_score DESC",
    [companyId]
  );

  const complaints = await db.query(
    `SELECT source, status, category, created_at
     FROM complaints
     WHERE company_id=$1 AND EXTRACT(YEAR FROM created_at) = $2`,
    [companyId, year]
  );

  // Ensure report exists + draft
  const rep = await getOrCreateReport(companyId, year, req.auth!.userId);
  const draft: ReportDraft | undefined = rep.rows[0]?.summary?.draft;
  const cname = company.rows[0]?.name ?? "—";
  const slug = company.rows[0]?.slug ?? "";
  const publicPortalUrl = `${process.env.PUBLIC_APP_URL || ""}/complaints/${slug}`.replace(/\/$/, "");
  const d = { ...defaultDraft(cname, publicPortalUrl), ...(draft || {}) };

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="BAFA_LkSG_Report_${year}.pdf"`);

  const doc = new PDFDocument({ margin: 48, info: { Title: `LkSG Jahresbericht ${year} — ${cname}`, Author: "LkSGCompass" } });
  doc.pipe(res);

  // Cover
  doc.fontSize(22).font("Helvetica-Bold").text("LkSG Jahresbericht (BAFA)");
  doc.fontSize(12).font("Helvetica").text("Generator-Export aus LkSGCompass");
  doc.moveDown(0.5);
  doc.fontSize(12).font("Helvetica").text(`Unternehmen: ${cname}`);
  doc.text(`Berichtsjahr: ${year}`);
  doc.text(`Erstellt am: ${new Date().toLocaleString("de-DE")}`);
  doc.moveDown(0.8);
  doc.fontSize(10).fillColor("gray").text(
    "Hinweis: Struktur orientiert sich am BAFA-Fragebogen nach § 10 Abs. 2 LkSG. Inhalte vor Einreichung fachlich prüfen.",
    { align: "left" }
  );
  doc.fillColor("black");

  // Table of contents
  doc.addPage();
  doc.fontSize(16).font("Helvetica-Bold").text("Inhaltsverzeichnis");
  doc.moveDown(0.5);
  doc.fontSize(11).font("Helvetica").list([
    "1. Unternehmensstruktur",
    "2. Risikoanalyse und Präventionsmaßnahmen",
    "3. Feststellung von Verletzungen und Abhilfemaßnahmen",
    "4. Beschwerdeverfahren",
    "5. Überprüfung des Risikomanagements (Wirksamkeitskontrolle)",
    "Anhang: Lieferantenübersicht (Top-Risiken)"
  ]);

  doc.addPage();

  sectionTitle(doc, "1. Unternehmensstruktur");
  doc.text(d.reporting_scope);
  doc.moveDown(0.3);
  doc.text(d.organization_structure);
  doc.moveDown(0.3);
  doc.text(d.responsible_persons);

  sectionTitle(doc, "2. Risikoanalyse und Präventionsmaßnahmen");
  doc.text("(Orientiert am BAFA-Fragebogen: Durchführung/Vorgehen/Ergebnisse der Risikoanalyse, Gewichtung/Priorisierung, Kommunikation der Ergebnisse.)");
  doc.moveDown(0.3);
  doc.text(d.risk_methodology);
  doc.moveDown(0.3);
  doc.text(d.prioritized_risks);
  doc.moveDown(0.4);

  doc.font("Helvetica-Bold").text("2.1 Ergebnisübersicht (Systemdaten)");
  doc.font("Helvetica");
  doc.text("Lieferanten-Risiken (Score 0–100; höher = risikoreicher). ");

  const rows = suppliers.rows.slice(0, 30);
  rows.forEach((s: any, idx: number) => {
    doc.text(`${idx + 1}. ${s.name} — ${s.country} — ${s.industry} — Level: ${s.risk_level} — Score: ${s.risk_score}`);
  });

  doc.moveDown(0.6);
  doc.font("Helvetica-Bold").text("2.2 Präventionsmaßnahmen (Beschreibung)");
  doc.font("Helvetica").text(d.prevention_measures);

  sectionTitle(doc, "3. Feststellung von Verletzungen und Abhilfemaßnahmen");
  doc.text("(Orientiert am BAFA-Fragebogen: Feststellung, Priorisierung, Maßnahmen, Wirksamkeitsprüfung, ggf. Beendigung/Abbruch der Geschäftsbeziehung.)");
  doc.moveDown(0.3);
  doc.text(d.remediation_measures);

  sectionTitle(doc, "4. Beschwerdeverfahren");
  doc.text("(Orientiert am BAFA-Fragebogen: Form des Verfahrens, Zugang, Verfahrensordnung, Zuständigkeiten, Schutz vor Benachteiligung, Umsetzung.)");
  doc.moveDown(0.3);
  doc.text(d.complaints_procedure);
  doc.moveDown(0.3);
  doc.text("Zugangsgruppen:");
  doc.text(d.complaints_access_groups);
  doc.moveDown(0.3);
  doc.text("Verfahrensordnung/Portal-Link:");
  doc.fillColor("blue").text(d.complaints_rules_public_url, { link: d.complaints_rules_public_url, underline: true });
  doc.fillColor("black");

  const cTotal = complaints.rows.length;
  const cPublic = complaints.rows.filter((c: any) => c.source === "public").length;
  const cInternal = cTotal - cPublic;
  const cOpen = complaints.rows.filter((c: any) => c.status === "open").length;
  const cInReview = complaints.rows.filter((c: any) => c.status === "in_review").length;
  const cClosed = complaints.rows.filter((c: any) => c.status === "closed").length;

  doc.moveDown(0.4);
  doc.text(`Eingegangene Beschwerden im Jahr ${year}: ${cTotal} (public: ${cPublic}, internal: ${cInternal})`);
  doc.text(`Status: open ${cOpen}, in_review ${cInReview}, closed ${cClosed}`);

  // category breakdown (top)
  const byCat: Record<string, number> = {};
  complaints.rows.forEach((c: any) => { byCat[c.category] = (byCat[c.category] || 0) + 1; });
  const cats = Object.entries(byCat).sort((a,b)=>b[1]-a[1]).slice(0, 6);
  if (cats.length) {
    doc.text("Kategorien (Top): " + cats.map(([k,v]) => `${k}=${v}`).join(", "));
  }

  sectionTitle(doc, "5. Überprüfung des Risikomanagements (Wirksamkeitskontrolle)");
  const highCount = suppliers.rows.filter((s: any) => s.risk_level === "high").length;
  doc.text(`Anzahl Hochrisiko-Lieferanten: ${highCount}`);
  doc.moveDown(0.3);
  doc.text(d.effectiveness_review);

  // Annex
  doc.addPage();
  doc.fontSize(14).font("Helvetica-Bold").text("Anhang: Lieferantenübersicht (Top-Risiken)");
  doc.fontSize(11).font("Helvetica");
  suppliers.rows.slice(0, 60).forEach((s: any, idx: number) => {
    doc.text(`${idx + 1}. ${s.name} | ${s.country} | ${s.industry} | ${s.risk_level} | ${s.risk_score}`);
  });

  doc.moveDown(1);
  doc.fontSize(9).fillColor("gray").text("Hinweis: Dieses PDF ist ein Generator-Output. Für BAFA-Einreichung bitte Inhalte mit Compliance/Legal final prüfen.", { align: "left" });

  doc.end();
});

export default router;
