-- ============================================================
-- Migration : colonnes coach IA pour table doors
-- À exécuter dans Supabase > SQL Editor > New Query
-- ============================================================

ALTER TABLE doors ADD COLUMN IF NOT EXISTS transcription          TEXT;
ALTER TABLE doors ADD COLUMN IF NOT EXISTS transcription_corrigee TEXT;
ALTER TABLE doors ADD COLUMN IF NOT EXISTS feedback_ia            TEXT;
ALTER TABLE doors ADD COLUMN IF NOT EXISTS objection_detectee     TEXT;
ALTER TABLE doors ADD COLUMN IF NOT EXISTS suivi_necessaire       BOOLEAN DEFAULT false;
ALTER TABLE doors ADD COLUMN IF NOT EXISTS note_suivi             TEXT;
ALTER TABLE doors ADD COLUMN IF NOT EXISTS date_rappel            DATE;
ALTER TABLE doors ADD COLUMN IF NOT EXISTS analyse_ia_statut      TEXT DEFAULT 'non_analyse';
