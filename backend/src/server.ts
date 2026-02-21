import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import auth from "./modules/auth";
import suppliers from "./modules/suppliers";
import complaints from "./modules/complaints";
import reports from "./modules/reports";
import auto from "./modules/auto";
import companies from "./modules/companies";
import publicApi from "./modules/public";
import countries from "./modules/countries";
import integrations from "./modules/integrations";
import monitoring from "./modules/monitoring";
import { healthcheck } from "./lib/db";
import { ensureCountrySeed, refreshCountryCache } from "./risk/countryRepo";

dotenv.config();

const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || "*",
  credentials: false,
}));
app.use(express.json({ limit: "2mb" }));

app.get("/health", async (_req, res) => {
  const ok = await healthcheck().catch(() => false);
  res.json({ ok });
});

app.use("/auth", auth);
app.use("/companies", companies);
app.use("/public", publicApi);
app.use("/countries", countries);
app.use("/integrations", integrations);
app.use("/monitoring", monitoring);
app.use("/auto", auto);
app.use("/suppliers", suppliers);
app.use("/complaints", complaints);
app.use("/reports", reports);

app.use((err: any, _req: any, res: any, _next: any) => {
  res.status(500).json({ error: "Server error", detail: String(err?.message ?? err) });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, async () => {
  try {
    await ensureCountrySeed();
    await refreshCountryCache();
  } catch (e) {
    console.warn("[startup] country_risks seed/cache skipped:", (e as any)?.message || e);
  }
  console.log(`LkSGCompass API on :${port}`);
});
