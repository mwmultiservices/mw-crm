-- ============================================================
-- MW CRM — Vendeur (« closer ») rattaché à une job
--
--   jobs.sold_by : l'employé qui a VENDU la job (vitres ou projet de
--   paysagement). Sa commission de vente (profiles.pct_vente) est calculée
--   automatiquement quand la job passe à « done » — cf. computeCommissions
--   dans lib/queries/payes.ts.
--
--   Une job créée depuis un lead gagné (lead_id non NULL) est ignorée par le
--   calcul : la commission a déjà été versée sur le lead, on ne paie pas
--   deux fois la même vente.
--
-- Idempotente : ré-exécutable sans risque.
-- À coller dans Supabase → SQL Editor.
-- ============================================================

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS sold_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS jobs_sold_by_idx ON jobs (sold_by);

-- ------------------------------------------------------------
-- Rappel (aucune DDL requise) : les statuts de job sont du TEXTE libre,
-- sans contrainte CHECK. Le jeu courant est défini dans lib/job-status.ts :
--   confirmed (jaune) · pending (orange) · dispo (mauve) · done (vert) · canceled
-- L'ancienne valeur 'scheduled' reste valide et s'affiche « Job confirmée ».
-- ------------------------------------------------------------

-- ============================================================
-- FIN
-- ============================================================
