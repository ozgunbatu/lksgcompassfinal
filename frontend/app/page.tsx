"use client";

export default function Landing() {
  return (
    <div>
      <div className="nav">
        <div className="inner">
          <div className="brand">LkSGCompass</div>
          <div style={{ display: "flex", gap: 10 }}>
            <a className="btn ghost" href="/login">Login</a>
            <a className="btn" href="/register">Kostenlos starten</a>
          </div>
        </div>
      </div>

      <div className="container">
        <div className="grid">
          <div className="card">
            <h1 style={{ margin: 0, fontSize: 44, lineHeight: 1.05 }}>
              Lieferketten-Compliance.
              <br />
              <span style={{ color: "var(--brand)" }}>Messbar.</span> Audit-fest.
            </h1>
            <p style={{ color: "var(--muted)", fontSize: 16, marginTop: 14 }}>
              Risikoanalyse, Whistleblowing, Monitoring und BAFA-Jahresbericht – in einem Tool.
            </p>
            <div className="row" style={{ marginTop: 14 }}>
              <span className="badge">Auto Compliance</span>
              <span className="badge">BAFA Export</span>
              <span className="badge">Risk Map</span>
              <span className="badge">Monitoring</span>
            </div>

            <div style={{ display: "flex", gap: 12, marginTop: 18, flexWrap: "wrap" }}>
              <a className="btn" href="/register">Demo starten</a>
              <a className="btn ghost" href="/login">Ich habe schon einen Account</a>
            </div>

            <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 16 }}>
              Hinweis: Dies ist ein MVP/Starter. Datenquellen & Monitoring lassen sich je nach Plan aktivieren.
            </p>
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>So funktioniert’s</h2>
            <ol style={{ margin: 0, paddingLeft: 18, color: "var(--text)" }}>
              <li style={{ marginBottom: 10 }}>Account erstellen</li>
              <li style={{ marginBottom: 10 }}>Lieferanten per CSV hochladen</li>
              <li style={{ marginBottom: 10 }}>Auto-Risikoanalyse & Maßnahmen</li>
              <li>BAFA-Report exportieren</li>
            </ol>

            <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
              <div className="card" style={{ background: "var(--soft)", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>Risiko-Index</div>
                <div style={{ height: 10, background: "#e7e7e7", borderRadius: 999, overflow: "hidden", marginTop: 10 }}>
                  <div style={{ width: "76%", height: "100%", background: "var(--brand)" }} />
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 10 }}>Abdeckung: 82% geprüft</div>
              </div>
              <div className="card" style={{ background: "var(--soft)", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>BAFA-ready</div>
                <div style={{ marginTop: 8, fontSize: 14 }}>Export in strukturierter Jahresbericht-Form.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
