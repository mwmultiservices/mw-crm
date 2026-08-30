-- ============================================================
-- MW CRM — Grille salariale 2026 + mots de passe temporaires
--
-- Source : « SALAIRES MW 2026.pdf » + « technicien.txt » (qui corrige
-- le PDF : le 15 % / 18 % s'appliquent EN ÉQUIPE DE DEUX, et sont
-- versés PAR TECHNICIEN sur le prix complet de la job).
--
-- Idempotente : ré-exécutable sans risque.
-- À coller dans Supabase → SQL Editor.
-- ============================================================

-- ------------------------------------------------------------
-- 1. profiles — grille de rémunération par employé
--    Une personne peut cumuler : heures paysagement, heures
--    commercial (vitres), % sur job de vitres résidentielles,
--    % sur ses propres ventes, % d'override sur les ventes des autres.
-- ------------------------------------------------------------
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS rate_paysagement          NUMERIC DEFAULT 0,  -- $/h paysagement
  ADD COLUMN IF NOT EXISTS rate_commercial           NUMERIC DEFAULT 0,  -- $/h copropriété / commercial (vitres)
  ADD COLUMN IF NOT EXISTS pct_vitres_ext_equipe     NUMERIC DEFAULT 0,  -- % extérieur, équipe de 2 (par tech)
  ADD COLUMN IF NOT EXISTS pct_vitres_int_ext_equipe NUMERIC DEFAULT 0,  -- % int+ext, équipe de 2 (par tech)
  ADD COLUMN IF NOT EXISTS pct_vitres_solo           NUMERIC DEFAULT 0,  -- % flat solo (ext ou int/ext)
  ADD COLUMN IF NOT EXISTS pct_vente                 NUMERIC DEFAULT 0,  -- % sur ses propres ventes
  ADD COLUMN IF NOT EXISTS pct_override              NUMERIC DEFAULT 0;  -- % sur les ventes de chaque vendeur

-- ------------------------------------------------------------
-- 2. jobs.pay_mode — comment CETTE job paye les assignés
--    NULL = déduit automatiquement (voir lib/payes.ts : autoPayMode).
--    Valeurs : horaire | commercial | ext_equipe | int_ext_equipe | solo
-- ------------------------------------------------------------
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS pay_mode TEXT;

-- ------------------------------------------------------------
-- 3. timesheets.work_type — quel taux horaire appliquer
--    paysagement (défaut) | commercial
-- ------------------------------------------------------------
ALTER TABLE timesheets
  ADD COLUMN IF NOT EXISTS work_type TEXT DEFAULT 'paysagement';

-- ------------------------------------------------------------
-- 4. Anti-escalade : les nouveaux champs de paye sont, comme
--    hourly_rate, réservés aux admins / au service role.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION protect_profile_fields()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- service role (routes admin, scripts) ou admin : tout permis
  IF auth.role() = 'service_role' OR mw_is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.role                      IS DISTINCT FROM OLD.role
     OR NEW.commission_type        IS DISTINCT FROM OLD.commission_type
     OR NEW.commission_value       IS DISTINCT FROM OLD.commission_value
     OR NEW.hourly_rate            IS DISTINCT FROM OLD.hourly_rate
     OR NEW.rate_paysagement       IS DISTINCT FROM OLD.rate_paysagement
     OR NEW.rate_commercial        IS DISTINCT FROM OLD.rate_commercial
     OR NEW.pct_vitres_ext_equipe  IS DISTINCT FROM OLD.pct_vitres_ext_equipe
     OR NEW.pct_vitres_int_ext_equipe IS DISTINCT FROM OLD.pct_vitres_int_ext_equipe
     OR NEW.pct_vitres_solo        IS DISTINCT FROM OLD.pct_vitres_solo
     OR NEW.pct_vente              IS DISTINCT FROM OLD.pct_vente
     OR NEW.pct_override           IS DISTINCT FROM OLD.pct_override THEN
    RAISE EXCEPTION 'Champs sensibles du profil réservés à un administrateur';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_fields ON profiles;
CREATE TRIGGER trg_protect_profile_fields
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_profile_fields();

-- ------------------------------------------------------------
-- 5. temp_credentials — mots de passe temporaires en clair
--    Table SÉPARÉE de profiles : la RLS de Postgres est par LIGNE,
--    pas par colonne, et profiles_select est USING(true) — un mot de
--    passe stocké dans profiles serait lisible par tout employé.
--    Ici : SELECT réservé aux admins, l'employé peut seulement
--    SUPPRIMER sa propre ligne (quand il choisit son mot de passe).
--    Écriture réservée au service role (/api/team/temp-password).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS temp_credentials (
  profile_id  UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  password    TEXT        NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  created_by  UUID        REFERENCES profiles(id) ON DELETE SET NULL
);

ALTER TABLE temp_credentials ENABLE ROW LEVEL SECURITY;

-- Lecture : admins seulement (le patron doit pouvoir les envoyer).
DROP POLICY IF EXISTS temp_credentials_select ON temp_credentials;
CREATE POLICY temp_credentials_select ON temp_credentials
  FOR SELECT TO authenticated USING (mw_is_admin());

-- Suppression : l'employé efface la SIENNE après avoir choisi son
-- mot de passe (« caché sur le site »), l'admin peut effacer aussi.
DROP POLICY IF EXISTS temp_credentials_delete ON temp_credentials;
CREATE POLICY temp_credentials_delete ON temp_credentials
  FOR DELETE TO authenticated USING (profile_id = auth.uid() OR mw_is_admin());

-- Pas de policy INSERT/UPDATE : réservé au service role.

-- ------------------------------------------------------------
-- 6. Seed de la grille 2026 (par username, donc rejouable).
--    Les employés absents de la grille gardent 0 partout et
--    restent éditables dans Profil → Équipe.
-- ------------------------------------------------------------

-- PAYSAGEMENT — taux horaire + 13 % sur leurs propres ventes
UPDATE profiles SET rate_paysagement = 24, pct_vente = 13 WHERE username = 'edouard.dufault';
UPDATE profiles SET rate_paysagement = 24, pct_vente = 13 WHERE username = 'maxime.beaupre';
UPDATE profiles SET rate_paysagement = 22, pct_vente = 13 WHERE username = 'laurier.st-germain';
UPDATE profiles SET rate_paysagement = 22, pct_vente = 13 WHERE username = 'otavio.haygert';
UPDATE profiles SET rate_paysagement = 20, pct_vente = 13 WHERE username = 'adrian.bonspille';
UPDATE profiles SET rate_paysagement = 20, pct_vente = 13 WHERE username = 'justin.barriere';
-- « Noah » du PDF : aucun profil correspondant dans la base (compte à créer).

-- LAVAGE DE VITRES — 20 $/h paysagement, 22 $/h commercial,
-- 15 % ext équipe / 18 % int-ext équipe / 23 % solo, 13 % vente
UPDATE profiles SET
  rate_paysagement = 20, rate_commercial = 22,
  pct_vitres_ext_equipe = 15, pct_vitres_int_ext_equipe = 18, pct_vitres_solo = 23,
  pct_vente = 13
WHERE username IN ('victor.mathieu', 'manuel.martinez', 'charles.yelle', 'will.lowe');
-- « Elliot Tremblay » du PDF : aucun profil correspondant (compte à créer).

-- VENTE — 13 % sur leurs ventes
UPDATE profiles SET pct_vente = 13 WHERE username IN ('marc.yankov', 'nathan.quintal');
-- « Adam » du PDF : aucun profil correspondant (compte à créer).

-- Will Lowe : 13 % de vente + 2 % sur les ventes de CHAQUE vendeur
UPDATE profiles SET pct_vente = 13, pct_override = 2 WHERE username = 'will.lowe';

-- ============================================================
-- FIN
-- ============================================================
