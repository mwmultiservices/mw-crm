-- ============================================================
-- Migration : Run de gazon + photos/dépenses jobs + slots dispo
-- (lot de changements client 2026-08)
-- À exécuter dans Supabase > SQL Editor > New Query (coller le CONTENU)
--
-- Idempotente — peut être relancée sans risque.
-- À appliquer AVANT de déployer le code qui l'utilise :
--   - page /gazon (tables gazon_terrains / gazon_passages)
--   - photos & dépenses dans les jobs (job_photos / job_expenses + bucket)
--   - téléphone/courriel client sur les jobs (jobs.client_phone/client_email)
-- Ensuite : node --env-file=.env.local scripts/import-gazon-csv.mjs Run_Gazon_2026_Suivi.csv
-- ============================================================

-- ------------------------------------------------------------
-- 1. gazon_terrains — les terrains des routes de gazon
--    secteur = route (ST-LAMBERT, LONGUEUIL, …), position = ordre de passage
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gazon_terrains (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  secteur         TEXT        NOT NULL,
  position        INTEGER     DEFAULT 0,
  name            TEXT        NOT NULL,
  address         TEXT,
  phone           TEXT,
  superficie_pi2  INTEGER,
  notes           TEXT,
  frequency       TEXT,                 -- ex. « BIW », « Jeudi », « 13juin-2aout »
  photos          TEXT[]      DEFAULT '{}',   -- chemins Storage (bucket mw-photos)
  a_eviter        BOOLEAN     DEFAULT false,  -- admin : « à ne pas faire » avant les runs
  active          BOOLEAN     DEFAULT true,   -- false = client parti / saison finie
  client_id       UUID        REFERENCES clients(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gazon_terrains_secteur_idx ON gazon_terrains (secteur, position);

DROP TRIGGER IF EXISTS trg_gazon_terrains_updated ON gazon_terrains;
CREATE TRIGGER trg_gazon_terrains_updated BEFORE UPDATE ON gazon_terrains
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- 2. gazon_passages — suivi hebdo par terrain (FAIT / À ÉVITER)
--    1 ligne max par terrain par semaine (week_of = lundi)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gazon_passages (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  terrain_id   UUID        NOT NULL REFERENCES gazon_terrains(id) ON DELETE CASCADE,
  week_of      DATE        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'fait',   -- fait | evite
  note         TEXT,
  done_by      UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  done_at      TIMESTAMPTZ DEFAULT now(),
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS gazon_passages_terrain_week_key
  ON gazon_passages (terrain_id, week_of);
CREATE INDEX IF NOT EXISTS gazon_passages_week_idx ON gazon_passages (week_of);

-- ------------------------------------------------------------
-- 3. job_photos — photos partagées sur un job (projets pavé/taillage…)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_photos (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id      UUID        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  path        TEXT        NOT NULL,       -- chemin Storage (bucket mw-photos)
  caption     TEXT,
  author_id   UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_photos_job_idx ON job_photos (job_id);

-- ------------------------------------------------------------
-- 4. job_expenses — dépenses de job (gaz, matériel) + photo de facture
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_expenses (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id       UUID        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  profile_id   UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  label        TEXT        NOT NULL,      -- ex. « Gaz », « Pavés Rona »
  amount       NUMERIC     NOT NULL DEFAULT 0,
  photo_path   TEXT,                      -- photo de la facture (Storage)
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_expenses_job_idx ON job_expenses (job_id);

-- ------------------------------------------------------------
-- 5. jobs — coordonnées client sur le job (calendrier vitres)
--    (le statut 'dispo' — slot mauve à vendre — ne demande aucune colonne :
--     jobs.status est TEXT libre)
-- ------------------------------------------------------------
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS client_phone TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS client_email TEXT;

-- ------------------------------------------------------------
-- 6. RLS
-- ------------------------------------------------------------
ALTER TABLE gazon_terrains ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gazon_terrains_select ON gazon_terrains;
CREATE POLICY gazon_terrains_select ON gazon_terrains FOR SELECT TO authenticated USING (true);

-- toute l'équipe peut rentrer un nouveau client rapidement (saison fermeture)
DROP POLICY IF EXISTS gazon_terrains_insert ON gazon_terrains;
CREATE POLICY gazon_terrains_insert ON gazon_terrains FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS gazon_terrains_update ON gazon_terrains;
CREATE POLICY gazon_terrains_update ON gazon_terrains FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS gazon_terrains_delete ON gazon_terrains;
CREATE POLICY gazon_terrains_delete ON gazon_terrains FOR DELETE TO authenticated USING (mw_is_admin());

ALTER TABLE gazon_passages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gazon_passages_select ON gazon_passages;
CREATE POLICY gazon_passages_select ON gazon_passages FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS gazon_passages_insert ON gazon_passages;
CREATE POLICY gazon_passages_insert ON gazon_passages FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS gazon_passages_update ON gazon_passages;
CREATE POLICY gazon_passages_update ON gazon_passages FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS gazon_passages_delete ON gazon_passages;
CREATE POLICY gazon_passages_delete ON gazon_passages FOR DELETE TO authenticated
  USING (mw_is_admin() OR done_by = auth.uid());

ALTER TABLE job_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS job_photos_select ON job_photos;
CREATE POLICY job_photos_select ON job_photos FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS job_photos_insert ON job_photos;
CREATE POLICY job_photos_insert ON job_photos FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS job_photos_delete ON job_photos;
CREATE POLICY job_photos_delete ON job_photos FOR DELETE TO authenticated
  USING (mw_is_admin() OR author_id = auth.uid());

ALTER TABLE job_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS job_expenses_select ON job_expenses;
CREATE POLICY job_expenses_select ON job_expenses FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS job_expenses_insert ON job_expenses;
CREATE POLICY job_expenses_insert ON job_expenses FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS job_expenses_update ON job_expenses;
CREATE POLICY job_expenses_update ON job_expenses FOR UPDATE TO authenticated
  USING (mw_is_admin() OR profile_id = auth.uid());

DROP POLICY IF EXISTS job_expenses_delete ON job_expenses;
CREATE POLICY job_expenses_delete ON job_expenses FOR DELETE TO authenticated
  USING (mw_is_admin() OR profile_id = auth.uid());

-- ------------------------------------------------------------
-- 7. Storage — bucket public 'mw-photos' (photos terrains / jobs / factures)
--    Lecture = URL publique ; upload/suppression = employés authentifiés.
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('mw-photos', 'mw-photos', true, 10485760, ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS mw_photos_insert ON storage.objects;
CREATE POLICY mw_photos_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'mw-photos');

DROP POLICY IF EXISTS mw_photos_update ON storage.objects;
CREATE POLICY mw_photos_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'mw-photos');

DROP POLICY IF EXISTS mw_photos_delete ON storage.objects;
CREATE POLICY mw_photos_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'mw-photos' AND (owner = auth.uid() OR mw_is_admin()));

-- ============================================================
-- FIN — appliquer PUIS lancer l'import CSV, PUIS déployer le code.
-- ============================================================
