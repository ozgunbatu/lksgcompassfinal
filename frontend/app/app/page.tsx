"use client";

import { useEffect, useMemo, useState } from "react";
import CountryRiskMap from "../../components/CountryRiskMap";

const API = process.env.NEXT_PUBLIC_API_URL!;

type Supplier = {
  id: string;
  name: string;
  country: string;
  industry: string;
  risk_score: number;
  annual_spend_eur?: number;
  workers?: number;
  has_audit?: boolean;
  has_code_of_conduct?: boolean;
};

type Company = { id: string; name: string; slug: string };

type Complaint = {
  id: string;
  supplier_name: string | null;
  violation_type: string | null;
  status: string;
  source: string;
  created_at: string;
};

function cx(...xs: Array<string | false | undefined | null>) {
  return xs.filter(Boolean).join(" ");
}

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

export default function AppPage() {
  const [mounted, setMounted] = useState(false);
  const [token, setToken] = useState<string>("");
  const [tab, setTab] = useState<"dashboard" | "suppliers" | "auto" | "reports" | "monitoring" | "complaints" | "integrations">("dashboard");

  const [company, setCompany] = useState<Company | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [error, setError] = useState<string>("");

  const authHeaders = useMemo(() => {
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [token]);

  useEffect(() => {
    setMounted(true);
    const t = typeof window !== "undefined" ? (localStorage.getItem("token") || "") : "";
    setToken(t);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!token) window.location.href = "/login";
  }, [mounted, token]);

  async function api(path: string, init?: RequestInit) {
    const r = await fetch(`${API}${path}`, {
      ...(init || {}),
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
        ...authHeaders
      }
    });

    if (r.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login";
      throw new Error("Unauthorized");
    }

    if (!r.ok) {
      const t = await r.text();
      throw new Error(t || `HTTP ${r.status}`);
    }

    const ct = r.headers.get("content-type") || "";
    if (ct.includes("application/json")) return r.json();
    return r.blob();
  }

  async function refresh() {
    setError("");
    try {
      const [c, s, comp] = await Promise.all([
        api("/companies/me"),
        api("/suppliers"),
        api("/complaints")
      ]);
      setCompany(c);
      setSuppliers(s);
      setComplaints(comp);
    } catch (e: any) {
      setError(e?.message || "Failed to load data");
    }
  }

  useEffect(() => {
    if (!token) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function addSupplierQuick() {
    const name = prompt("Supplier name?");
    if (!name) return;
    const country = prompt("Country? (e.g. Germany, China)") || "Germany";
    const industry = prompt("Industry? (e.g. textile, mining, electronics)") || "other";

    setError("");
    try {
      await api("/suppliers", {
        method: "POST",
        body: JSON.stringify({ name, country, industry })
      });
      await refresh();
      setTab("suppliers");
    } catch (e: any) {
      setError(e?.message || "Failed to add supplier");
    }
  }

  async function recalcAllRisks() {
    setError("");
    try {
      await api("/auto/recalculate", { method: "POST" });
      await refresh();
      setTab("dashboard");
    } catch (e: any) {
      setError(e?.message || "Risk recalculation failed");
    }
  }

  async function generateBafaReport() {
    setError("");
    try {
      // returns PDF blob
      const blob = await api(`/reports/bafa/${new Date().getFullYear()}`, { method: "POST" }) as Blob;
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (e: any) {
      setError(e?.message || "Report generation failed");
    }
  }

  async function runAutoCompliance(file: File) {
    setError("");
    const form = new FormData();
    form.append("file", file);
    const r = await fetch(`${API}/auto/run`, {
      method: "POST",
      headers: { ...authHeaders },
      body: form
    });
    if (r.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login";
      return;
    }
    if (!r.ok) {
      setError(await r.text());
      return;
    }
    await refresh();
    setTab("reports");
  }

  async function syncIntegrations() {
    setError("");
    try {
      await api("/integrations/sync", { method: "POST" });
      await refresh();
      setTab("monitoring");
    } catch (e: any) {
      setError(e?.message || "Sync failed");
    }
  }

  async function runMonitoring() {
    setError("");
    try {
      await api("/monitoring/run", { method: "POST" });
      await refresh();
      setTab("monitoring");
    } catch (e: any) {
      setError(e?.message || "Monitoring run failed");
    }
  }

  async function updateComplaintStatus(id: string, status: string) {
    setError("");
    try {
      await api(`/complaints/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      await refresh();
    } catch (e: any) {
      setError(e?.message || "Failed to update complaint");
    }
  }

  function logout() {
    localStorage.removeItem("token");
    window.location.href = "/";
  }

  if (!mounted) return null;
  if (!token) return null;

  const high = suppliers.filter(s => (s.risk_score ?? 0) >= 70).length;
  const med = suppliers.filter(s => (s.risk_score ?? 0) >= 45 && (s.risk_score ?? 0) < 70).length;
  const low = suppliers.filter(s => (s.risk_score ?? 0) < 45).length;

  const publicPortal = company?.slug ? `${typeof window !== "undefined" ? window.location.origin : ""}/complaints/${company.slug}` : "";

  return (
    <div className="appShell">
      <div className="topbar">
        <div className="brandRow">
          <div className="brandDot" />
          <div>
            <div className="brandName">LkSGCompass</div>
            <div className="brandSub">{company?.name || "Loading company…"}</div>
          </div>
        </div>
        <div className="topActions">
          <button className="btn ghost" onClick={addSupplierQuick}>+ Supplier</button>
          <button className="btn ghost" onClick={recalcAllRisks}>Recalculate</button>
          <button className="btn" onClick={generateBafaReport}>BAFA PDF</button>
          <button className="btn danger" onClick={logout}>Logout</button>
        </div>
      </div>

      <div className="body">
        <aside className="sidebar">
          <div className="navTitle">Workspace</div>
          {[
            ["dashboard", "Dashboard"],
            ["suppliers", "Suppliers"],
            ["auto", "Auto Compliance"],
            ["reports", "Reports"],
            ["monitoring", "Monitoring"],
            ["complaints", "Complaints"],
            ["integrations", "Integrations"],
          ].map(([k, label]) => (
            <button
              key={k}
              className={cx("navBtn", tab === k && "active")}
              onClick={() => setTab(k as any)}
            >
              {label}
            </button>
          ))}

          <div className="sideCard">
            <div className="muted">Public Whistleblower Portal</div>
            <div className="small">{publicPortal ? publicPortal : "—"}</div>
            {publicPortal && (
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button className="btn smallBtn" onClick={() => navigator.clipboard.writeText(publicPortal)}>Copy</button>
                <button className="btn ghost smallBtn" onClick={() => window.open(publicPortal, "_blank")}>Open</button>
              </div>
            )}
          </div>
        </aside>

        <main className="main">
          {error && <div className="errorBanner">{error}</div>}

          {tab === "dashboard" && (
            <>
              <div className="kpis">
                <div className="kpi">
                  <div className="muted">Suppliers</div>
                  <div className="big">{suppliers.length}</div>
                </div>
                <div className="kpi">
                  <div className="muted">High Risk</div>
                  <div className="big" style={{ color: "#C0392B" }}>{high}</div>
                </div>
                <div className="kpi">
                  <div className="muted">Medium Risk</div>
                  <div className="big" style={{ color: "#B45309" }}>{med}</div>
                </div>
                <div className="kpi">
                  <div className="muted">Low Risk</div>
                  <div className="big" style={{ color: "#2A5C3F" }}>{low}</div>
                </div>
              </div>

              <div className="card">
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                  <h2 style={{ margin: 0 }}>Global Risk Map</h2>
                  <div className="muted">Country risk heatmap (200+ countries)</div>
                </div>
                <div style={{ height: 520, marginTop: 12 }}>
                  <CountryRiskMap />
                </div>
              </div>

              <div className="card">
                <h2 style={{ marginTop: 0 }}>Top Risk Suppliers</h2>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th><th>Country</th><th>Industry</th><th>Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suppliers
                      .slice()
                      .sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0))
                      .slice(0, 8)
                      .map(s => (
                        <tr key={s.id}>
                          <td>{s.name}</td>
                          <td>{s.country}</td>
                          <td>{s.industry}</td>
                          <td>
                            <span className={cx("pill",
                              (s.risk_score ?? 0) >= 70 && "high",
                              (s.risk_score ?? 0) >= 45 && (s.risk_score ?? 0) < 70 && "med",
                              (s.risk_score ?? 0) < 45 && "low"
                            )}>
                              {s.risk_score ?? 0}
                            </span>
                          </td>
                        </tr>
                      ))}
                    {!suppliers.length && (
                      <tr><td colSpan={4} className="muted">No suppliers yet. Click “+ Supplier”.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab === "suppliers" && (
            <div className="card">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <h2 style={{ margin: 0 }}>Suppliers</h2>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn ghost" onClick={refresh}>Refresh</button>
                  <button className="btn" onClick={addSupplierQuick}>Add</button>
                </div>
              </div>
              <table className="table" style={{ marginTop: 12 }}>
                <thead>
                  <tr>
                    <th>Name</th><th>Country</th><th>Industry</th><th>Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map(s => (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td>{s.country}</td>
                      <td>{s.industry}</td>
                      <td>
                        <span className={cx("pill",
                          (s.risk_score ?? 0) >= 70 && "high",
                          (s.risk_score ?? 0) >= 45 && (s.risk_score ?? 0) < 70 && "med",
                          (s.risk_score ?? 0) < 45 && "low"
                        )}>
                          {s.risk_score ?? 0}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {!suppliers.length && (
                    <tr><td colSpan={4} className="muted">No suppliers.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === "auto" && (
            <div className="card">
              <h2 style={{ marginTop: 0 }}>Auto Compliance Mode</h2>
              <p className="muted">Upload a supplier CSV — we ingest, score risk, and prepare a BAFA-ready report.</p>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <label className="fileBtn">
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) runAutoCompliance(f);
                      e.currentTarget.value = "";
                    }}
                    style={{ display: "none" }}
                  />
                  Upload CSV
                </label>
                <button className="btn ghost" onClick={recalcAllRisks}>Recalculate all risks</button>
              </div>

              <div className="cardInset" style={{ marginTop: 16 }}>
                <div className="muted">Accepted columns</div>
                <div className="small mono">name,country,industry,annual_spend_eur,workers,has_audit,has_code_of_conduct</div>
              </div>
            </div>
          )}

          {tab === "reports" && (
            <div className="card">
              <h2 style={{ marginTop: 0 }}>Reports</h2>
              <p className="muted">Generate your BAFA annual report as PDF. Includes risk analysis, measures, and complaint statistics.</p>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn" onClick={generateBafaReport}>Generate BAFA PDF</button>
                <button className="btn ghost" onClick={refresh}>Refresh</button>
              </div>

              <div className="cardInset" style={{ marginTop: 16 }}>
                <div className="muted">Tip</div>
                <div className="small">Run “Auto Compliance Mode” first to ingest your supplier list and get an up-to-date risk baseline.</div>
              </div>
            </div>
          )}

          {tab === "monitoring" && (
            <div className="card">
              <h2 style={{ marginTop: 0 }}>Supplier Monitoring</h2>
              <p className="muted">Triggers dataset sync + screening checks (sanctions / ESG / news signals).</p>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn" onClick={runMonitoring}>Run monitoring now</button>
                <button className="btn ghost" onClick={syncIntegrations}>Sync datasets</button>
              </div>

              <div className="cardInset" style={{ marginTop: 16 }}>
                <div className="muted">Status</div>
                <div className="small">See backend logs for current connectors (EU/OFAC/GDELT). Production connectors can be wired to paid providers.</div>
              </div>
            </div>
          )}

          {tab === "complaints" && (
            <div className="card">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <h2 style={{ margin: 0 }}>Complaints</h2>
                <button className="btn ghost" onClick={refresh}>Refresh</button>
              </div>

              <table className="table" style={{ marginTop: 12 }}>
                <thead>
                  <tr>
                    <th>Supplier</th><th>Type</th><th>Source</th><th>Status</th><th>Created</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {complaints.map(c => (
                    <tr key={c.id}>
                      <td>{c.supplier_name || "—"}</td>
                      <td>{c.violation_type || "—"}</td>
                      <td>{c.source}</td>
                      <td><span className="pill">{c.status}</span></td>
                      <td className="small">{fmtDate(c.created_at)}</td>
                      <td>
                        <select
                          value={c.status}
                          onChange={(e) => updateComplaintStatus(c.id, e.target.value)}
                          className="select"
                        >
                          <option value="open">open</option>
                          <option value="in_review">in_review</option>
                          <option value="closed">closed</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                  {!complaints.length && (
                    <tr><td colSpan={6} className="muted">No complaints.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === "integrations" && (
            <div className="card">
              <h2 style={{ marginTop: 0 }}>Integrations</h2>
              <p className="muted">Connect real data sources (country risk, sanctions lists, ESG datasets). This MVP version includes connectors and caching.</p>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn" onClick={syncIntegrations}>Sync now</button>
                <button className="btn ghost" onClick={refresh}>Refresh</button>
              </div>

              <div className="cardInset" style={{ marginTop: 16 }}>
                <div className="muted">Configure via .env</div>
                <div className="small mono">COUNTRY_RISK_URL, EU_SANCTIONS_URL, OFAC_SDN_URL, GDELT_ENABLED</div>
              </div>
            </div>
          )}
        </main>
      </div>

      <style jsx global>{`
        :root { --bg:#f7f7f5; --card:#fff; --text:#0b0e0c; --muted:#6b7280; --line:#e5e7eb; --brand:#1b3d2b; }
        body { background: var(--bg); color: var(--text); }
        .appShell { min-height: 100vh; display: flex; flex-direction: column; }
        .topbar { position: sticky; top: 0; z-index: 20; background: rgba(247,247,245,.9); backdrop-filter: blur(14px); border-bottom: 1px solid var(--line); padding: 14px 18px; display:flex; justify-content: space-between; align-items: center; gap: 12px; }
        .brandRow { display:flex; align-items:center; gap: 10px; }
        .brandDot { width: 14px; height: 14px; border-radius: 6px; background: var(--brand); }
        .brandName { font-weight: 800; letter-spacing: .2px; }
        .brandSub { font-size: 12px; color: var(--muted); margin-top: 2px; }
        .topActions { display:flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
        .body { display:flex; flex: 1; gap: 14px; padding: 14px; max-width: 1400px; width: 100%; margin: 0 auto; }
        .sidebar { width: 260px; flex: 0 0 260px; }
        .navTitle { font-size: 12px; font-weight: 700; color: var(--muted); margin: 6px 0 10px; }
        .navBtn { width: 100%; text-align: left; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--line); background: var(--card); margin-bottom: 8px; cursor: pointer; }
        .navBtn.active { border-color: rgba(27,61,43,.35); box-shadow: 0 8px 20px rgba(0,0,0,.05); }
        .sideCard { margin-top: 12px; padding: 12px; border: 1px solid var(--line); background: var(--card); border-radius: 14px; }
        .main { flex: 1; min-width: 0; display:flex; flex-direction: column; gap: 14px; }
        .kpis { display:grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
        .kpi { padding: 14px; border: 1px solid var(--line); background: var(--card); border-radius: 14px; }
        .muted { color: var(--muted); font-size: 12px; }
        .small { font-size: 12px; }
        .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
        .big { font-size: 28px; font-weight: 850; margin-top: 4px; }
        .card { padding: 14px; border: 1px solid var(--line); background: var(--card); border-radius: 16px; }
        .cardInset { padding: 12px; border: 1px dashed var(--line); border-radius: 14px; background: rgba(0,0,0,.02); }
        .btn { padding: 9px 12px; border-radius: 12px; border: 1px solid rgba(27,61,43,.25); background: var(--brand); color: #fff; cursor:pointer; font-weight: 700; }
        .btn.ghost { background: var(--card); color: var(--brand); }
        .btn.danger { background: #b42318; border-color: rgba(180,35,24,.35); }
        .btn.smallBtn { padding: 7px 10px; font-size: 12px; }
        .fileBtn { display:inline-flex; align-items:center; justify-content:center; padding: 9px 12px; border-radius: 12px; border: 1px solid rgba(27,61,43,.25); background: var(--brand); color:#fff; cursor:pointer; font-weight: 700; }
        .errorBanner { padding: 10px 12px; border-radius: 14px; border: 1px solid rgba(180,35,24,.25); background: rgba(180,35,24,.08); color: #7a1610; font-size: 13px; }
        .table { width: 100%; border-collapse: collapse; }
        .table th { text-align: left; font-size: 12px; color: var(--muted); padding: 10px 8px; border-bottom: 1px solid var(--line); }
        .table td { padding: 10px 8px; border-bottom: 1px solid var(--line); font-size: 13px; }
        .pill { display:inline-flex; align-items:center; justify-content:center; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--line); background: rgba(0,0,0,.02); font-size: 12px; }
        .pill.high { border-color: rgba(192,57,43,.35); background: rgba(192,57,43,.08); color: #8a1f16; }
        .pill.med { border-color: rgba(180,83,9,.35); background: rgba(180,83,9,.10); color: #6b2f03; }
        .pill.low { border-color: rgba(42,92,63,.35); background: rgba(42,92,63,.10); color: #0f2a1c; }
        .select { border: 1px solid var(--line); border-radius: 12px; padding: 7px 10px; background: #fff; }
        @media (max-width: 980px) {
          .body { flex-direction: column; }
          .sidebar { width: 100%; flex: none; }
          .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
      `}</style>
    </div>
  );
}
