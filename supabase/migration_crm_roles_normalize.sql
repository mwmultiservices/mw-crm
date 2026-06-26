-- ============================================================
-- Migration : normalisation des rôles vers le modèle unifié
-- Phase 1 — À exécuter APRÈS migration_crm_core.sql ET migration_crm_rls.sql
-- (utilise la fonction mw_is_admin() définie dans migration_crm_rls.sql)
-- À exécuter dans Supabase > SQL Editor > New Query
--
-- Bascule : 'manager' -> 'admin', 'vendeur' -> 'rep'
-- Modèle cible : admin | lead | rep | tech | terrain
-- ============================================================

-- 1. Normaliser les valeurs existantes
UPDATE profiles SET role = 'admin' WHERE role = 'manager';
UPDATE profiles SET role = 'rep'   WHERE role = 'vendeur';

-- 2. Recréer la vue vendeur_stats (les « vendeurs » du dashboard = role 'rep')
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

-- 3. Mettre à jour les policies doors qui référençaient role = 'manager'
--    (utilisent désormais mw_is_admin() qui couvre admin/lead/manager)
DROP POLICY IF EXISTS "doors_update_own_or_manager" ON doors;
CREATE POLICY "doors_update_own_or_manager"
  ON doors FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR mw_is_admin());

DROP POLICY IF EXISTS "doors_delete_own_or_manager" ON doors;
CREATE POLICY "doors_delete_own_or_manager"
  ON doors FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR mw_is_admin());

-- ============================================================
-- FIN — modèle de rôles unifié actif
-- ============================================================
