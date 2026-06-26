-- ============================================================
-- Migration 00 : SCHÉMA SOCLE (porte-à-porte) pour un projet Supabase NEUF
-- ------------------------------------------------------------
-- À exécuter EN PREMIER dans le projet mw-crm (qui n'a pas encore le schéma
-- porteaporte). Reconstruit profiles / doors / objectifs / app_settings +
-- vue vendeur_stats + RLS, directement dans le modèle de rôles unifié.
--
-- Cette migration REMPLACE (folde) les anciennes migrations porteaporte :
--   migration_profil.sql, migration_objectifs.sql, migration_dashboard.sql,
--   migration_coach_ia.sql  -> NE PAS les exécuter séparément sur ce projet.
--
-- Ordre complet :
--   1) migration_00_base.sql      (ce fichier)
--   2) migration_crm_core.sql
--   3) migration_crm_rls.sql
--   4) migration_crm_roles_normalize.sql
--
-- Idempotent (IF NOT EXISTS / CREATE OR REPLACE / DROP+CREATE).
-- Rôles : admin | lead | rep | tech | terrain
-- ============================================================

-- ------------------------------------------------------------
-- 0. Helpers
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- 1. profiles (1 ligne par employé, id = auth.users.id)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id                    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name             TEXT,
  email                 TEXT,
  role                  TEXT        NOT NULL DEFAULT 'rep',   -- admin|lead|rep|tech|terrain
  color                 TEXT,
  phone                 TEXT,
  commission_type       TEXT        DEFAULT 'percent',
  commission_value      NUMERIC     DEFAULT 0,
  hourly_rate           NUMERIC     DEFAULT 0,
  daily_goal            INTEGER     DEFAULT 0,
  personal_goal_doors   INTEGER     DEFAULT 0,
  personal_goal_revenue NUMERIC     DEFAULT 0,
  username              TEXT,
  secondary_role        TEXT,
  teams                 TEXT[]      DEFAULT '{}',
  active                BOOLEAN     DEFAULT true,
  created_at            TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_key ON profiles (username) WHERE username IS NOT NULL;

-- Admin = supervision (SECURITY DEFINER -> pas de récursion RLS sur profiles)
-- Définie ICI (après profiles) car une fonction LANGUAGE sql valide son corps à la création.
CREATE OR REPLACE FUNCTION mw_is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'lead', 'manager')
  );
$$;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select ON profiles;
CREATE POLICY profiles_select ON profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS profiles_insert ON profiles;
CREATE POLICY profiles_insert ON profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() OR mw_is_admin());

DROP POLICY IF EXISTS profiles_update ON profiles;
CREATE POLICY profiles_update ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR mw_is_admin());

-- Auto-création du profil à l'inscription (depuis les métadonnées auth)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, full_name, email, role, color)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'role', 'rep'),
    NEW.raw_user_meta_data ->> 'color'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ------------------------------------------------------------
-- 2. doors (portes cognées en D2D)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS doors (
  id                     UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                UUID        REFERENCES profiles(id) ON DELETE CASCADE,
  latitude               DOUBLE PRECISION,
  longitude              DOUBLE PRECISION,
  address                TEXT,
  status                 TEXT        DEFAULT 'pas_repondu',
  service_type           TEXT,
  contract_value         NUMERIC,
  scheduled_date         DATE,
  objection              TEXT,
  notes                  TEXT,
  follow_up_needed       BOOLEAN     DEFAULT false,
  follow_up_date         DATE,
  follow_up_note         TEXT,
  client_name            TEXT,
  phone                  TEXT,
  -- coach IA
  transcription          TEXT,
  transcription_corrigee TEXT,
  feedback_ia            TEXT,
  objection_detectee     TEXT,
  suivi_necessaire       BOOLEAN     DEFAULT false,
  note_suivi             TEXT,
  date_rappel            DATE,
  analyse_ia_statut      TEXT        DEFAULT 'non_analyse',
  created_at             TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS doors_user_idx    ON doors (user_id);
CREATE INDEX IF NOT EXISTS doors_status_idx  ON doors (status);
CREATE INDEX IF NOT EXISTS doors_created_idx ON doors (created_at);

ALTER TABLE doors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS doors_select_all_authenticated ON doors;
CREATE POLICY doors_select_all_authenticated ON doors FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS doors_insert_own ON doors;
CREATE POLICY doors_insert_own ON doors FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS doors_update_own_or_manager ON doors;
CREATE POLICY doors_update_own_or_manager ON doors FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR mw_is_admin());

DROP POLICY IF EXISTS doors_delete_own_or_manager ON doors;
CREATE POLICY doors_delete_own_or_manager ON doors FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR mw_is_admin());

-- ------------------------------------------------------------
-- 3. objectifs (objectifs portes/ventes par vendeur/jour)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS objectifs (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  vendeur_id UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL DEFAULT 'portes',   -- portes | ventes
  valeur     INTEGER     NOT NULL DEFAULT 0,
  date       DATE        NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
DO $$ BEGIN
  ALTER TABLE objectifs ADD CONSTRAINT objectifs_vendeur_date_type_key
    UNIQUE (vendeur_id, date, type);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

ALTER TABLE objectifs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS objectifs_select ON objectifs;
CREATE POLICY objectifs_select ON objectifs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS objectifs_insert ON objectifs;
CREATE POLICY objectifs_insert ON objectifs FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS objectifs_update ON objectifs;
CREATE POLICY objectifs_update ON objectifs FOR UPDATE TO authenticated USING (true);

-- ------------------------------------------------------------
-- 4. app_settings (réglages globaux clé/valeur)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_settings (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  key        TEXT        UNIQUE NOT NULL,
  value      TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_settings_select ON app_settings;
CREATE POLICY app_settings_select ON app_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS app_settings_insert ON app_settings;
CREATE POLICY app_settings_insert ON app_settings FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS app_settings_update ON app_settings;
CREATE POLICY app_settings_update ON app_settings FOR UPDATE TO authenticated USING (true);

-- ------------------------------------------------------------
-- 5. vue vendeur_stats (stats agrégées par vendeur = role 'rep')
-- ------------------------------------------------------------
DROP VIEW IF EXISTS vendeur_stats;
CREATE VIEW vendeur_stats AS
SELECT
  p.id,
  p.full_name,
  p.color,
  p.email,
  COUNT(CASE WHEN d.created_at::date = CURRENT_DATE THEN 1 END)::INT                                              AS portes_aujourd_hui,
  COUNT(CASE WHEN d.created_at::date = CURRENT_DATE AND d.status = 'vendu' THEN 1 END)::INT                      AS ventes_aujourd_hui,
  COALESCE(SUM(CASE WHEN d.created_at::date = CURRENT_DATE AND d.status = 'vendu' THEN d.contract_value END), 0) AS montant_aujourd_hui,
  COUNT(CASE WHEN d.created_at::date = CURRENT_DATE AND d.status <> 'pas_repondu' THEN 1 END)::INT              AS reponses_aujourd_hui,
  COUNT(d.id)::INT                                                                                               AS total_portes,
  COUNT(CASE WHEN d.status = 'vendu' THEN 1 END)::INT                                                           AS total_ventes,
  COUNT(CASE WHEN d.status <> 'pas_repondu' THEN 1 END)::INT                                                    AS total_reponses,
  COALESCE(SUM(CASE WHEN d.status = 'vendu' THEN d.contract_value END), 0)                                      AS total_revenus
FROM profiles p
LEFT JOIN doors d ON d.user_id = p.id
WHERE p.role IN ('rep', 'vendeur')
GROUP BY p.id, p.full_name, p.color, p.email;

-- ============================================================
-- FIN — exécuter ensuite migration_crm_core.sql
-- ============================================================
