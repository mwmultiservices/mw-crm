-- ============================================================
-- Migration : Gazon v2 — fréquence structurée + notes du jour
-- (lot de changements client 2026-08-17)
-- À exécuter dans Supabase > SQL Editor > New Query (coller le CONTENU)
--
-- Idempotente — peut être relancée sans risque.
-- Pré-requis : migration_crm_gazon_paye.sql (tables gazon_terrains / gazon_passages).
--
-- Le code déployé TOLÈRE l'absence de cette migration (les nouveaux champs
-- sont simplement inactifs), mais l'appliquer AVANT d'utiliser :
--   - le sélecteur de fréquence (chaque semaine / aux 2 semaines / one shot)
--   - le bouton « Note du jour » et le « Rapport du jour » admin
-- ============================================================

-- ------------------------------------------------------------
-- 1. gazon_terrains.frequency_type — fréquence STRUCTURÉE
--    hebdo | bi-hebdo | one-shot
--    (la colonne `frequency` existante reste du TEXTE LIBRE : période,
--     jour préféré… — ex. « Jeudi · 13 juin-2 août ». On n'y touche pas.)
-- ------------------------------------------------------------
ALTER TABLE gazon_terrains ADD COLUMN IF NOT EXISTS frequency_type TEXT DEFAULT 'hebdo';

-- Reprise des valeurs importées du CSV : « BIW », « BiW? » = aux 2 semaines.
UPDATE gazon_terrains
   SET frequency_type = 'bi-hebdo'
 WHERE frequency_type IS DISTINCT FROM 'bi-hebdo'
   AND frequency ILIKE '%biw%';

UPDATE gazon_terrains SET frequency_type = 'hebdo' WHERE frequency_type IS NULL;

-- ------------------------------------------------------------
-- 2. gazon_notes — « note du jour » d'un terrain
--    Plusieurs notes possibles par terrain et par jour (1 par employé,
--    voire plusieurs) → sert au « Rapport du jour » de l'admin.
--    Distinct de gazon_passages.note (1 seule ligne par terrain/semaine).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gazon_notes (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  terrain_id  UUID        NOT NULL REFERENCES gazon_terrains(id) ON DELETE CASCADE,
  note_date   DATE        NOT NULL DEFAULT CURRENT_DATE,
  note        TEXT        NOT NULL,
  author_id   UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gazon_notes_date_idx    ON gazon_notes (note_date DESC);
CREATE INDEX IF NOT EXISTS gazon_notes_terrain_idx ON gazon_notes (terrain_id, note_date DESC);

ALTER TABLE gazon_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gazon_notes_select ON gazon_notes;
CREATE POLICY gazon_notes_select ON gazon_notes FOR SELECT TO authenticated USING (true);

-- toute l'équipe écrit ses notes de terrain
DROP POLICY IF EXISTS gazon_notes_insert ON gazon_notes;
CREATE POLICY gazon_notes_insert ON gazon_notes FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS gazon_notes_update ON gazon_notes;
CREATE POLICY gazon_notes_update ON gazon_notes FOR UPDATE TO authenticated
  USING (mw_is_admin() OR author_id = auth.uid());

DROP POLICY IF EXISTS gazon_notes_delete ON gazon_notes;
CREATE POLICY gazon_notes_delete ON gazon_notes FOR DELETE TO authenticated
  USING (mw_is_admin() OR author_id = auth.uid());

-- ============================================================
-- FIN
-- ============================================================
