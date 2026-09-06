-- ============================================================
-- MW CRM — Temps de la job + soumission rattachée (calendrier)
--
-- 1. jobs.pay_hours  : temps de la job en heures. Sert à payer les employés
--                      assignés sur les jobs en mode HORAIRE (copropriété /
--                      commercial, paysagement) : heures x taux horaire de
--                      chaque employé. NULL = on s'en tient aux heures pointées.
-- 2. jobs.quote_id   : soumission (devis/facture) signee avec le client,
--                      rattachee a une job de type « projet ». Le bouton
--                      « Previsualiser la soumission » n'est visible que pour
--                      les admins (la fiche affiche les prix).
--
-- Idempotente : re-executable sans risque.
-- A coller dans Supabase → SQL Editor.
-- ============================================================

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS pay_hours NUMERIC(6,2);

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS quote_id UUID
  REFERENCES quotes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS jobs_quote_id_idx ON jobs (quote_id) WHERE quote_id IS NOT NULL;
