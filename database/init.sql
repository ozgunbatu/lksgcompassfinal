CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Companies
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  industry TEXT NOT NULL,
  risk_level TEXT NOT NULL DEFAULT 'unknown', -- low | medium | high | unknown
  risk_score INT NOT NULL DEFAULT 0,          -- 0-100
  risk_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_company ON suppliers(company_id);

-- Complaints (Whistleblowing)
CREATE TABLE IF NOT EXISTS complaints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'human_rights',
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', -- open | in_review | closed
  source TEXT NOT NULL DEFAULT 'internal', -- internal | public
  is_anonymous BOOLEAN NOT NULL DEFAULT false,
  reporter_contact TEXT,
  supplier_name_snapshot TEXT,
  supplier_country_snapshot TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_complaints_company ON complaints(company_id);

-- Reports (stored metadata; pdf stream generated on demand)
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  year INT NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(company_id, year)
);

CREATE INDEX IF NOT EXISTS idx_reports_company ON reports(company_id);

-- Simple trigger for updated_at on suppliers
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trg_suppliers_updated ON suppliers;
CREATE TRIGGER trg_suppliers_updated
BEFORE UPDATE ON suppliers
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at();

-- updated_at for reports
DROP TRIGGER IF EXISTS trg_reports_updated ON reports;
CREATE TRIGGER trg_reports_updated
BEFORE UPDATE ON reports
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at();

-- === STEP 2: Auto Compliance Mode ===
-- Additional supplier attributes for scoring + controls
ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS annual_spend_eur INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS workers INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS has_audit BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_code_of_conduct BOOLEAN NOT NULL DEFAULT false;

-- Unique supplier name per company for safe upsert
CREATE UNIQUE INDEX IF NOT EXISTS ux_suppliers_company_name ON suppliers(company_id, name);

-- Auto compliance runs
CREATE TABLE IF NOT EXISTS auto_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  year INT NOT NULL,
  supplier_count INT NOT NULL DEFAULT 0,
  high_risk_count INT NOT NULL DEFAULT 0,
  medium_risk_count INT NOT NULL DEFAULT 0,
  low_risk_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auto_runs_company ON auto_runs(company_id);


-- === STEP 5: Data Sources + Sanctions + ESG + Monitoring ===

-- Country risk dataset cache (200+ countries via external sources; cached here)
CREATE TABLE IF NOT EXISTS country_risks (
  iso2 TEXT PRIMARY KEY,
  country_name TEXT NOT NULL,
  risk_score INT NOT NULL DEFAULT 0,          -- 0-100
  risk_level TEXT NOT NULL DEFAULT 'unknown', -- low | medium | high | unknown
  source TEXT NOT NULL DEFAULT 'seed',
  components JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Sanctions dataset cache (entities & identifiers)
CREATE TABLE IF NOT EXISTS sanctions_entities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source TEXT NOT NULL,               -- eu | ofac | un | other
  name TEXT NOT NULL,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  identifiers JSONB NOT NULL DEFAULT '{}'::jsonb, -- {"passport":[],"lei":[],"vat":[],"other":[]}
  program TEXT,
  listed_at DATE,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- ESG dataset cache (violations / scores)
CREATE TABLE IF NOT EXISTS esg_entities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source TEXT NOT NULL DEFAULT 'external',
  name TEXT NOT NULL,
  score INT NOT NULL DEFAULT 0,
  issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_esg_name ON esg_entities USING GIN (to_tsvector('simple', name));

CREATE INDEX IF NOT EXISTS idx_sanctions_source ON sanctions_entities(source);
CREATE INDEX IF NOT EXISTS idx_sanctions_name ON sanctions_entities USING GIN (to_tsvector('simple', name));

-- Supplier screenings (sanctions + ESG + news monitoring results)
CREATE TABLE IF NOT EXISTS supplier_screenings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  screening_type TEXT NOT NULL,  -- sanctions | esg | news
  status TEXT NOT NULL DEFAULT 'clear', -- clear | hit | needs_review
  score INT NOT NULL DEFAULT 0,
  hits JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_screenings_company ON supplier_screenings(company_id);
CREATE INDEX IF NOT EXISTS idx_screenings_supplier ON supplier_screenings(supplier_id);

-- Monitoring events (news / alerts)
CREATE TABLE IF NOT EXISTS monitoring_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL, -- news | sanctions | esg | human_rights
  severity TEXT NOT NULL DEFAULT 'low', -- low | medium | high
  title TEXT NOT NULL,
  url TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_company ON monitoring_events(company_id);
CREATE INDEX IF NOT EXISTS idx_events_supplier ON monitoring_events(supplier_id);

-- Track background sync runs
CREATE TABLE IF NOT EXISTS sync_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job TEXT NOT NULL, -- country_risks | sanctions_eu | sanctions_ofac | news
  status TEXT NOT NULL DEFAULT 'success',
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
