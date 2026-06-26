-- ============================================================
-- Migration : vue vendeur_stats + policies RLS doors
-- À exécuter dans Supabase > SQL Editor > New Query
-- IMPORTANT : à exécuter APRÈS migration_profil.sql et migration_objectifs.sql
-- ============================================================

-- 1. Vue vendeur_stats
-- Calcule les stats agrégées par vendeur pour le dashboard manager.
-- La colonne 'today' est calculée côté DB (UTC). Si vos vendeurs sont
-- en UTC-4/UTC-5, les données de fin de nuit peuvent avoir 1h de décalage.
-- DROP requis car CREATE OR REPLACE ne peut pas changer les noms de colonnes.
DROP VIEW IF EXISTS vendeur_stats;
CREATE VIEW vendeur_stats AS
SELECT
  p.id,
  p.full_name,
  p.color,
  p.email,
  -- Stats du jour (UTC)
  COUNT(CASE WHEN d.created_at::date = CURRENT_DATE THEN 1 END)::INT                                           AS portes_aujourd_hui,
  COUNT(CASE WHEN d.created_at::date = CURRENT_DATE AND d.status = 'vendu' THEN 1 END)::INT                   AS ventes_aujourd_hui,
  COALESCE(SUM(CASE WHEN d.created_at::date = CURRENT_DATE AND d.status = 'vendu' THEN d.contract_value END), 0) AS montant_aujourd_hui,
  -- Réponses = tout statut sauf 'pas_repondu' (quelqu'un a ouvert la porte)
  COUNT(CASE WHEN d.created_at::date = CURRENT_DATE AND d.status <> 'pas_repondu' THEN 1 END)::INT            AS reponses_aujourd_hui,
  -- Totaux depuis le début
  COUNT(d.id)::INT                                                                                              AS total_portes,
  COUNT(CASE WHEN d.status = 'vendu' THEN 1 END)::INT                                                         AS total_ventes,
  COUNT(CASE WHEN d.status <> 'pas_repondu' THEN 1 END)::INT                                                  AS total_reponses,
  COALESCE(SUM(CASE WHEN d.status = 'vendu' THEN d.contract_value END), 0)                                    AS total_revenus
FROM profiles p
LEFT JOIN doors d ON d.user_id = p.id
WHERE p.role <> 'manager'
GROUP BY p.id, p.full_name, p.color, p.email;

-- 2. RLS pour la table doors
-- (Si RLS est déjà activé cette commande est idempotente)
ALTER TABLE doors ENABLE ROW LEVEL SECURITY;

-- Tous les utilisateurs authentifiés peuvent lire TOUTES les portes
-- (les vendeurs voient le terrain de toute l'équipe sur la carte)
DO $$ BEGIN
  CREATE POLICY "doors_select_all_authenticated"
    ON doors FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Un vendeur ne peut créer que ses propres portes
DO $$ BEGIN
  CREATE POLICY "doors_insert_own"
    ON doors FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Modification : propre porte OU manager
DO $$ BEGIN
  CREATE POLICY "doors_update_own_or_manager"
    ON doors FOR UPDATE TO authenticated
    USING (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
          AND profiles.role = 'manager'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Suppression : propre porte OU manager
DO $$ BEGIN
  CREATE POLICY "doors_delete_own_or_manager"
    ON doors FOR DELETE TO authenticated
    USING (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
          AND profiles.role = 'manager'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Colonnes profiles manquantes (personal goals vendeur)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS daily_goal           INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS personal_goal_doors  INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS personal_goal_revenue NUMERIC DEFAULT 0;
