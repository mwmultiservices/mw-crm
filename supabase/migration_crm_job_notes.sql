-- ============================================================
-- Migration : Notes du jour sur les jobs (techniciens de fenêtres + projets)
-- (demande client 2026-10-02)
-- À exécuter dans Supabase > SQL Editor > New Query (coller le CONTENU)
--
-- Idempotente — peut être relancée sans risque.
-- Pré-requis : table jobs (migration_crm_core.sql).
--
-- Le code déployé TOLÈRE l'absence de cette migration : la section
-- « Notes du jour » du job affiche un avertissement, rien ne casse.
--
-- Équivalent des notes de terrain de la Run gazon (gazon_notes) : plusieurs
-- notes par job, chacune avec son auteur et son heure. Distinct de
-- jobs.notes (consignes de l'admin, non modifiables par les employés).
-- ============================================================

CREATE TABLE IF NOT EXISTS job_notes (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id      UUID        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  note        TEXT        NOT NULL,
  author_id   UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_notes_job_idx ON job_notes (job_id, created_at);

ALTER TABLE job_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS job_notes_select ON job_notes;
CREATE POLICY job_notes_select ON job_notes FOR SELECT TO authenticated USING (true);

-- toute l'équipe écrit ses notes, en son propre nom
DROP POLICY IF EXISTS job_notes_insert ON job_notes;
CREATE POLICY job_notes_insert ON job_notes FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() OR mw_is_admin());

DROP POLICY IF EXISTS job_notes_update ON job_notes;
CREATE POLICY job_notes_update ON job_notes FOR UPDATE TO authenticated
  USING (mw_is_admin() OR author_id = auth.uid());

DROP POLICY IF EXISTS job_notes_delete ON job_notes;
CREATE POLICY job_notes_delete ON job_notes FOR DELETE TO authenticated
  USING (mw_is_admin() OR author_id = auth.uid());

-- PostgREST relit le schéma tout de suite (nouvelle table visible)
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- FIN
-- ============================================================
