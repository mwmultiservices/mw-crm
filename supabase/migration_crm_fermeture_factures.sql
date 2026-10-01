-- ============================================================
-- Migration : Run fermeture (prix + temps estimé) + Factures
--             + Temps de la job (« bug heures » des jobs de fermeture)
-- (demande client 2026-10-01)
-- À exécuter dans Supabase > SQL Editor > New Query (coller le CONTENU)
--
-- Idempotente — peut être relancée sans risque.
-- Pré-requis : migration_crm_fermeture.sql, migration_crm_gazon_paye.sql.
--
-- Le code déployé TOLÈRE l'absence de cette migration : les champs
-- concernés sont désactivés avec un avertissement, rien ne casse.
--
--   1. fermeture_clients.price / duree_min : prix de la job (admin) et temps
--      estimé en minutes → total sous chaque journée et chaque ville
--      (« Longueuil #1 : 9 h 30 »), « Diviser » équilibre selon le temps.
--   2. job_expenses.job_id facultatif : « Entrée de facture » d'une dépense
--      générale (gaz…) sans job ; index par date pour la page Factures.
--   3. Storage mw-photos : policy SELECT. Supabase l'exige pour SUPPRIMER un
--      fichier : sans elle, supprimer une facture ou une photo laissait le
--      fichier dans le bucket (le bucket est déjà public en lecture).
--   4. jobs.pay_hours / jobs.quote_id = migration_crm_job_heures.sql, jamais
--      appliquée (vérifié en base le 2026-10-01) : c'est le « bug heures » —
--      le « Temps de la job » des jobs de fermeture restait grisé.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Run fermeture : prix + temps estimé par client
-- ------------------------------------------------------------
ALTER TABLE fermeture_clients ADD COLUMN IF NOT EXISTS price     NUMERIC(10,2); -- $ (admin)
ALTER TABLE fermeture_clients ADD COLUMN IF NOT EXISTS duree_min INTEGER;       -- temps estimé (minutes)

-- ------------------------------------------------------------
-- 2. Factures (job_expenses) : dépense sans job + tri par date
-- ------------------------------------------------------------
ALTER TABLE job_expenses ALTER COLUMN job_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS job_expenses_created_idx ON job_expenses (created_at DESC);

-- ------------------------------------------------------------
-- 3. Storage : lecture via l'API (nécessaire à remove())
-- ------------------------------------------------------------
DROP POLICY IF EXISTS mw_photos_select ON storage.objects;
CREATE POLICY mw_photos_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'mw-photos');

-- ------------------------------------------------------------
-- 4. Temps de la job + soumission rattachée (= migration_crm_job_heures.sql)
-- ------------------------------------------------------------
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS pay_hours NUMERIC(6,2);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS quote_id UUID
  REFERENCES quotes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS jobs_quote_id_idx ON jobs (quote_id) WHERE quote_id IS NOT NULL;

-- PostgREST relit le schéma tout de suite (nouvelles colonnes visibles)
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- FIN
-- ============================================================
