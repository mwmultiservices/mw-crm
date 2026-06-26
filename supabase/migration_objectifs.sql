-- ============================================================
-- Migration : table objectifs (portes cognées / ventes)
-- À exécuter dans Supabase > SQL Editor > New Query
-- ============================================================

-- 1. Créer la table si elle n'existe pas encore
CREATE TABLE IF NOT EXISTS objectifs (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  vendeur_id UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL DEFAULT 'portes',
  valeur     INTEGER     NOT NULL DEFAULT 0,
  date       DATE        NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Si la table existait avec l'ancien schéma (objectif_portes),
--    ajouter les nouvelles colonnes
ALTER TABLE objectifs ADD COLUMN IF NOT EXISTS type       TEXT    NOT NULL DEFAULT 'portes';
ALTER TABLE objectifs ADD COLUMN IF NOT EXISTS valeur     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE objectifs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 3. Contrainte d'unicité (un objectif par vendeur/date/type)
DO $$ BEGIN
  ALTER TABLE objectifs
    ADD CONSTRAINT objectifs_vendeur_date_type_key
    UNIQUE (vendeur_id, date, type);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

-- 4. Row Level Security
ALTER TABLE objectifs ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "objectifs_select"
  ON objectifs FOR SELECT TO authenticated USING (true);

CREATE POLICY IF NOT EXISTS "objectifs_insert"
  ON objectifs FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "objectifs_update"
  ON objectifs FOR UPDATE TO authenticated USING (true);

CREATE POLICY IF NOT EXISTS "objectifs_delete"
  ON objectifs FOR DELETE TO authenticated USING (true);
