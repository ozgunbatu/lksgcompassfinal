"use client";

import { useEffect, useMemo, useState } from "react";
import Map, { Layer, Source } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";

const API = process.env.NEXT_PUBLIC_API_URL!;

type CountryRisk = { iso2: string; score: number; tier: "low" | "medium" | "high" };

function bandColor(score: number) {
  if (score >= 70) return "#C0392B";
  if (score >= 45) return "#B45309";
  return "#2A5C3F";
}

export default function CountryRiskMap() {
  const [data, setData] = useState<CountryRisk[]>([]);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const token = typeof window === "undefined" ? "" : (localStorage.getItem("token") || "");
        const r = await fetch(`${API}/countries/risks`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || "Failed to load country risks");
        if (mounted) setData(j.data || []);
      } catch (e: any) {
        if (mounted) setError(e.message);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const fillExpression = useMemo(() => {
    // Mapbox expression:
    // ["match", ["get", "iso_3166_1"], "DE", "#...", "CN", "#...", default]
    const expr: any[] = ["match", ["get", "iso_3166_1"]];
    for (const c of data) {
      expr.push(c.iso2, bandColor(c.score));
    }
    expr.push("#E3E0D8");
    return expr;
  }, [data]);

  // Mapbox country boundaries tileset (vector). Requires a Mapbox token.
  // If your token is missing, we show a helpful message.
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

  if (!token) {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Global Risk Map</h2>
        <p style={{ color: "var(--muted)" }}>
          Mapbox token missing. Set <code>NEXT_PUBLIC_MAPBOX_TOKEN</code> and reload.
        </p>
      </div>
    );
  }

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>Global Risk Map</h2>
          <p style={{ marginTop: 6, color: "var(--muted)" }}>
            200+ countries heatmap (MVP dataset; Step 5 will replace with real sources).
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <span className="badge low">Low</span>
          <span className="badge medium">Medium</span>
          <span className="badge high">High</span>
        </div>
      </div>

      {error && <p style={{ color: "#C0392B" }}>{error}</p>}

      <div style={{ height: 520, borderRadius: 16, overflow: "hidden", border: "1px solid var(--line)", marginTop: 12 }}>
        <Map
          mapboxAccessToken={token}
          initialViewState={{ longitude: 10, latitude: 20, zoom: 1.6 }}
          style={{ width: "100%", height: "100%" }}
          mapStyle="mapbox://styles/mapbox/light-v11"
        >
          <Source id="countries" type="vector" url="mapbox://mapbox.country-boundaries-v1">
            <Layer
              id="country-fill"
              type="fill"
              source-layer="country_boundaries"
              paint={{
                "fill-color": fillExpression as any,
                "fill-opacity": 0.75,
                "fill-outline-color": "#ffffff",
              }}
            />
          </Source>
        </Map>
      </div>

      <p style={{ marginTop: 10, color: "var(--muted)", fontSize: 12 }}>
        Note: This uses Mapbox Country Boundaries. If the layer name differs in your Mapbox plan, adjust <code>source-layer</code>.
      </p>
    </div>
  );
}
