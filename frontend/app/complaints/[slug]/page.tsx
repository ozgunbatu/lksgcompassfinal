"use client";

import { useEffect, useMemo, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL!;

type Supplier = { id: string; name: string; country: string; industry: string };

const CATEGORIES = [
  { value: "human_rights", label: "Menschenrechte" },
  { value: "child_labor", label: "Kinderarbeit" },
  { value: "forced_labor", label: "Zwangsarbeit" },
  { value: "discrimination", label: "Diskriminierung" },
  { value: "environment", label: "Umweltschaden" },
  { value: "safety", label: "Arbeitssicherheit" },
  { value: "other", label: "Sonstiges" },
];

export default function PublicComplaintPage({ params }: { params: { slug: string } }) {
  const slug = params.slug;

  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState<string>("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState<string>("");
  const [supplierName, setSupplierName] = useState<string>("");
  const [category, setCategory] = useState<string>("human_rights");
  const [description, setDescription] = useState<string>("");
  const [reporterContact, setReporterContact] = useState<string>(""); // optional
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const showSupplierName = useMemo(() => !supplierId, [supplierId]);

  useEffect(() => {
    (async () => {
      setError("");
      setLoading(true);
      try {
        const r = await fetch(`${API}/public/company/${slug}`);
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || "Company not found");
        setCompanyName(data.company.name);
        setSuppliers(data.suppliers || []);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  async function submit() {
    setError("");
    const payload: any = { category, description };
    if (supplierId) payload.supplierId = supplierId;
    if (!supplierId && supplierName.trim()) payload.supplierName = supplierName.trim();
    if (reporterContact.trim()) payload.reporterContact = reporterContact.trim();

    const r = await fetch(`${API}/public/complaints/${slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(data?.error || "Submission failed");
      return;
    }
    setDone(true);
  }

  return (
    <div className="container" style={{ paddingTop: 56, paddingBottom: 56 }}>
      <div className="card" style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div>
            <div className="brand" style={{ fontSize: 18 }}>LkSGCompass — Hinweisgebersystem</div>
            <div style={{ color: "var(--muted)", marginTop: 6 }}>
              Unternehmen: <b>{companyName || "—"}</b>
            </div>
          </div>
          <div className="badge" title="No login required">Public</div>
        </div>

        {loading && <p style={{ marginTop: 18, color: "var(--muted)" }}>Lade…</p>}
        {error && <div className="error" style={{ marginTop: 18 }}>{error}</div>}

        {!loading && !error && !done && (
          <div style={{ marginTop: 18 }}>
            <p style={{ color: "var(--muted)" }}>
              Dieses Formular ermöglicht eine <b>anonyme</b> Meldung im Sinne des LkSG. Kontaktdaten sind optional.
            </p>

            <div className="grid2" style={{ marginTop: 14 }}>
              <div>
                <label className="label">Lieferant (optional)</label>
                <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                  <option value="">— kein Lieferant ausgewählt —</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.country})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Kategorie</label>
                <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {showSupplierName && (
              <div style={{ marginTop: 12 }}>
                <label className="label">Lieferant Name (optional)</label>
                <input className="input" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="z.B. ABC Textiles Ltd." />
              </div>
            )}

            <div style={{ marginTop: 12 }}>
              <label className="label">Beschreibung (erforderlich)</label>
              <textarea className="input" style={{ minHeight: 140 }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Bitte beschreiben Sie den Sachverhalt so konkret wie möglich." />
            </div>

            <div style={{ marginTop: 12 }}>
              <label className="label">Kontakt (optional)</label>
              <input className="input" value={reporterContact} onChange={(e) => setReporterContact(e.target.value)} placeholder="E-Mail oder Telefon (optional)" />
              <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}>
                Wenn leer, bleibt die Meldung anonym.
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 18, alignItems: "center" }}>
              <button className="btn" onClick={submit} disabled={!description.trim()}>
                Meldung absenden
              </button>
              <div style={{ color: "var(--muted)", fontSize: 12 }}>
                Durch Absenden stimmen Sie zu, dass die Information zur Prüfung verarbeitet wird.
              </div>
            </div>
          </div>
        )}

        {!loading && !error && done && (
          <div style={{ marginTop: 18 }}>
            <h2 style={{ marginTop: 0 }}>Danke.</h2>
            <p style={{ color: "var(--muted)" }}>
              Ihre Meldung wurde eingereicht. Falls Sie Kontaktdaten angegeben haben, kann das Unternehmen ggf. Rückfragen stellen.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
