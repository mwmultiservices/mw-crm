-- ============================================================
-- Migration : page Profil – colonnes et table app_settings
-- À exécuter dans Supabase > SQL Editor > New Query
-- ============================================================

-- 1. Ajouter les colonnes manquantes à profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS commission_type  TEXT    DEFAULT 'percent',
  ADD COLUMN IF NOT EXISTS commission_value NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS phone            TEXT;

-- 2. Créer la table app_settings
CREATE TABLE IF NOT EXISTS app_settings (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  key        TEXT        UNIQUE NOT NULL,
  value      TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Row Level Security
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "auth_read_settings"
  ON app_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY IF NOT EXISTS "auth_insert_settings"
  ON app_settings FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "auth_update_settings"
  ON app_settings FOR UPDATE TO authenticated USING (true);

-- 4. RLS : permettre au manager de modifier les profils des vendeurs
-- (à adapter selon votre politique de sécurité)
CREATE POLICY IF NOT EXISTS "manager_update_profiles"
  ON profiles FOR UPDATE TO authenticated
  USING (true);
