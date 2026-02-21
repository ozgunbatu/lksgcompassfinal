"use client";

import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL!;

function getToken() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("token") || "";
}

export default function RegisterPage() {
  const [companyName, setCompanyName] = useState("LkSGCompass Demo GmbH");
  const [email, setEmail] = useState("admin@lksgcompass.test");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState("");

  useEffect(() => {
    const t = getToken();
    if (t) window.location.href = "/app";
  }, []);

  async function submit() {
    setError("");
    const r = await fetch(`${API}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyName, email, password }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return setError(data?.error || "Registration failed");

    localStorage.setItem("token", data.token);
    window.location.href = "/app";
  }

  return (
    <div>
      <div className="nav">
        <div className="inner">
          <a className="brand" href="/">LkSGCompass</a>
          <div style={{ display: "flex", gap: 10 }}>
            <a className="btn ghost" href="/login">Login</a>
          </div>
        </div>
      </div>

      <div className="container">
        <div className="grid">
          <div className="card">
            <h1 style={{ margin: 0, fontSize: 34 }}>Register</h1>
            <p style={{ color: "var(--muted)" }}>
              Erstelle eine Company und starte mit Auto Compliance.
            </p>
          </div>

          <div className="card">
            <div className="label">COMPANY</div>
            <input className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />

            <div className="label">EMAIL</div>
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />

            <div className="label">PASSWORD</div>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />

            {error && <p style={{ color: "var(--danger)", marginTop: 10 }}>{error}</p>}

            <button className="btn" style={{ width: "100%", marginTop: 12 }} onClick={submit}>
              Create account
            </button>

            <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 12 }}>
              Demo values are pre-filled.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
