-- ============================================================
-- Migration : noyau CRM (absorption de mw-crm dans porteaporte)
-- Phase 0 — consolidation des schémas dans le projet Supabase porteaporte
-- À exécuter dans Supabase > SQL Editor > New Query
-- IMPORTANT : exécuter APRÈS les migrations existantes (profil, objectifs,
-- dashboard, coach_ia) et AVANT migration_crm_rls.sql
--
-- Cette migration est idempotente (IF NOT EXISTS partout) — peut être relancée.
-- Elle NE touche PAS aux valeurs de role existantes ('manager'/'vendeur') pour
-- ne pas casser l'app actuelle. La normalisation des rôles se fait en Phase 1.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Helper : trigger updated_at générique
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- 1. Extension de la table profiles (employés)
--    Rôles cibles unifiés : 'admin' | 'lead' | 'rep' | 'tech' | 'terrain'
--    (legacy 'manager' ≈ admin, 'vendeur' ≈ rep — normalisé en Phase 1)
-- ------------------------------------------------------------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username       TEXT;          -- alias login / mapping CRM
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS secondary_role TEXT;          -- ex. rep + 'terrain'
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS teams          TEXT[] DEFAULT '{}';  -- ex. {fenetres,paysagement}
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hourly_rate    NUMERIC DEFAULT 0;    -- paysagement (paye horaire)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS active         BOOLEAN DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_key ON profiles (username) WHERE username IS NOT NULL;

-- ------------------------------------------------------------
-- 2. clients — base de données clients
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clients (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name            TEXT        NOT NULL,
  address         TEXT,
  city            TEXT,
  postal_code     TEXT,
  phone           TEXT,
  email           TEXT,
  services        TEXT[]      DEFAULT '{}',
  notes           TEXT,
  num_vitres      INTEGER,                 -- nb de vitres (fenêtres)
  superficie_pi2  INTEGER,                 -- superficie terrain (paysagement)
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clients_name_idx ON clients (name);

DROP TRIGGER IF EXISTS trg_clients_updated ON clients;
CREATE TRIGGER trg_clients_updated BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- 3. leads — pipeline (entrants web/meta/google + D2D)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leads (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id         UUID        REFERENCES clients(id) ON DELETE SET NULL,
  name              TEXT        NOT NULL,
  phone             TEXT,
  email             TEXT,
  source            TEXT,                  -- site_web | meta_ads | google_ads | flyers | d2d | reference
  service           TEXT,
  service_category  TEXT,                  -- fenetre | paysagement | projet
  stage             TEXT        NOT NULL DEFAULT 'new',
  rep_id            UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  price             NUMERIC,
  door_id           UUID,                  -- FK vers doors ajoutée plus bas (après garantie d'existence)
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leads_stage_idx      ON leads (stage);
CREATE INDEX IF NOT EXISTS leads_rep_idx        ON leads (rep_id);
CREATE INDEX IF NOT EXISTS leads_created_idx    ON leads (created_at);
CREATE INDEX IF NOT EXISTS leads_source_idx     ON leads (source);

DROP TRIGGER IF EXISTS trg_leads_updated ON leads;
CREATE TRIGGER trg_leads_updated BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- 4. sms_messages — fil de conversation Twilio
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sms_messages (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id      UUID        REFERENCES leads(id) ON DELETE CASCADE,
  direction    TEXT        NOT NULL DEFAULT 'out',   -- in | out
  message      TEXT        NOT NULL,
  phone        TEXT,
  twilio_sid   TEXT,
  status       TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sms_lead_idx    ON sms_messages (lead_id);
CREATE INDEX IF NOT EXISTS sms_created_idx ON sms_messages (created_at);

-- ------------------------------------------------------------
-- 5. jobs — rendez-vous / créneaux calendrier (fenêtres & paysagement)
--    Remplace l'ancienne table 'jobs' du CRM (qui ne servait qu'au compteur).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jobs (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id     UUID        REFERENCES clients(id) ON DELETE SET NULL,
  lead_id       UUID        REFERENCES leads(id) ON DELETE SET NULL,
  title         TEXT,
  service       TEXT,
  type          TEXT        NOT NULL DEFAULT 'fenetre',  -- fenetre | gazon | projet
  team          TEXT,                                    -- equipe1 | equipe2
  assigned_ids  UUID[]      DEFAULT '{}',                -- profiles assignés (techs/gars)
  route_name    TEXT,                                    -- paysagement: route préfaite (Phase 4: table routes)
  start_at      TIMESTAMPTZ,
  end_at        TIMESTAMPTZ,
  all_day       BOOLEAN     DEFAULT false,
  status        TEXT        DEFAULT 'scheduled',         -- scheduled | done | canceled
  price         NUMERIC,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jobs_start_idx  ON jobs (start_at);
CREATE INDEX IF NOT EXISTS jobs_type_idx   ON jobs (type);
CREATE INDEX IF NOT EXISTS jobs_team_idx   ON jobs (team);
CREATE INDEX IF NOT EXISTS jobs_client_idx ON jobs (client_id);

DROP TRIGGER IF EXISTS trg_jobs_updated ON jobs;
CREATE TRIGGER trg_jobs_updated BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- 6. quotes — devis / factures (QuickBooks)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quotes (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id         UUID        REFERENCES clients(id) ON DELETE SET NULL,
  client_name       TEXT,                  -- secours si pas encore de client_id
  service_type      TEXT,
  service_category  TEXT,                  -- fenetre | paysagement | projet
  plan              TEXT,                  -- 1x | 2x | 3x (récurrent)
  price             NUMERIC,
  notes             TEXT,
  status            TEXT        NOT NULL DEFAULT 'draft',  -- draft | sent | signed | invoiced | paid
  type              TEXT        DEFAULT 'devis',           -- devis | facture
  rep_id            UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  quickbooks_id     TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quotes_status_idx  ON quotes (status);
CREATE INDEX IF NOT EXISTS quotes_client_idx  ON quotes (client_id);
CREATE INDEX IF NOT EXISTS quotes_created_idx ON quotes (created_at);

DROP TRIGGER IF EXISTS trg_quotes_updated ON quotes;
CREATE TRIGGER trg_quotes_updated BEFORE UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- 7. commissions — payes vente (reps %) & fenêtres (techs 18%)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS commissions (
  id                 UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id         UUID        REFERENCES profiles(id) ON DELETE CASCADE,
  type               TEXT        NOT NULL DEFAULT 'rep',   -- rep | tech
  week_of            DATE        NOT NULL,                 -- lundi de la semaine
  sales_amount       NUMERIC     DEFAULT 0,                -- montant de base
  rate               NUMERIC     DEFAULT 0,                -- taux (% ou 18)
  commission_amount  NUMERIC     DEFAULT 0,
  jobs_count         INTEGER     DEFAULT 0,
  doors_knocked      INTEGER     DEFAULT 0,
  deals_closed       INTEGER     DEFAULT 0,
  bonus              NUMERIC     DEFAULT 0,
  paid               BOOLEAN     DEFAULT false,
  paid_at            TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS commissions_profile_week_type_key
  ON commissions (profile_id, week_of, type);
CREATE INDEX IF NOT EXISTS commissions_week_idx ON commissions (week_of);

-- ------------------------------------------------------------
-- 8. timesheets — heures paysagement (punch in/out)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS timesheets (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id   UUID        REFERENCES profiles(id) ON DELETE CASCADE,
  date         DATE        NOT NULL DEFAULT CURRENT_DATE,
  clock_in     TIMESTAMPTZ,
  clock_out    TIMESTAMPTZ,
  hours        NUMERIC     DEFAULT 0,
  job_note     TEXT,
  route_name   TEXT,
  paid         BOOLEAN     DEFAULT false,
  paid_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS timesheets_profile_idx ON timesheets (profile_id);
CREATE INDEX IF NOT EXISTS timesheets_date_idx    ON timesheets (date);

-- ------------------------------------------------------------
-- 9. Relations doors <-> pipeline/clients
--    (une porte « closé » alimentera un lead / un client)
-- ------------------------------------------------------------
ALTER TABLE doors ADD COLUMN IF NOT EXISTS lead_id   UUID REFERENCES leads(id)   ON DELETE SET NULL;
ALTER TABLE doors ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

-- FK leads.door_id -> doors (ajoutée ici car doors existe déjà)
DO $$ BEGIN
  ALTER TABLE leads
    ADD CONSTRAINT leads_door_id_fkey
    FOREIGN KEY (door_id) REFERENCES doors(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS doors_lead_idx   ON doors (lead_id);
CREATE INDEX IF NOT EXISTS doors_client_idx ON doors (client_id);

-- ============================================================
-- FIN — exécuter ensuite migration_crm_rls.sql
-- ============================================================
