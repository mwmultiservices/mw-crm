-- ============================================================
-- MW CRM — Upsells de job + poinçon rattaché à la job
--
--   1. job_upsells   : service vendu PENDANT une job (ou à la vente),
--                      avec le vendeur qui l'a conclu → sa commission.
--   2. timesheets.job_id : le poinçon pointe vers la VRAIE job du jour
--                      (avant : seulement job_note, du texte libre).
--
-- Idempotente : ré-exécutable sans risque.
-- À coller dans Supabase → SQL Editor.
-- ============================================================

-- ------------------------------------------------------------
-- 1. job_upsells — vente additionnelle rattachée à une job
--    service = LIBELLÉ du menu déroulant (cf. lib/services.ts) ou
--    texte libre si « Autre ». sold_by = le vendeur crédité.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_upsells (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id      UUID        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  service     TEXT        NOT NULL,
  price       NUMERIC     NOT NULL DEFAULT 0,
  sold_by     UUID        REFERENCES profiles(id) ON DELETE SET NULL, -- vendeur crédité
  created_by  UUID        REFERENCES profiles(id) ON DELETE SET NULL, -- qui l'a saisi
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_upsells_job_idx     ON job_upsells (job_id);
CREATE INDEX IF NOT EXISTS job_upsells_sold_by_idx ON job_upsells (sold_by);

ALTER TABLE job_upsells ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS job_upsells_select ON job_upsells;
CREATE POLICY job_upsells_select ON job_upsells FOR SELECT TO authenticated USING (true);

-- Toute l'équipe peut enregistrer un upsell depuis le chantier.
DROP POLICY IF EXISTS job_upsells_insert ON job_upsells;
CREATE POLICY job_upsells_insert ON job_upsells FOR INSERT TO authenticated WITH CHECK (true);

-- Correction / suppression : l'auteur de la saisie ou un admin.
-- (Même compromis que job_expenses : saisir un upsell POUR un collègue
--  reste possible, mais c'est l'auteur — pas le vendeur crédité — qui peut
--  le corriger, sinon n'importe qui pourrait effacer la vente d'un autre.)
DROP POLICY IF EXISTS job_upsells_update ON job_upsells;
CREATE POLICY job_upsells_update ON job_upsells FOR UPDATE TO authenticated
  USING (mw_is_admin() OR created_by = auth.uid());

DROP POLICY IF EXISTS job_upsells_delete ON job_upsells;
CREATE POLICY job_upsells_delete ON job_upsells FOR DELETE TO authenticated
  USING (mw_is_admin() OR created_by = auth.uid());

-- ------------------------------------------------------------
-- 2. timesheets.job_id — « poinçon réglé pour les jobs du jour »
--    L'employé pointe SUR une job de son horaire : la paye du bloc de
--    temps suit alors le mode de paye de cette job (horaire vs % vitres).
--    ON DELETE SET NULL : supprimer une job n'efface pas des heures faites.
-- ------------------------------------------------------------
ALTER TABLE timesheets
  ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS timesheets_job_idx ON timesheets (job_id);

-- ============================================================
-- FIN
-- ============================================================
