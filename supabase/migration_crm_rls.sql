-- ============================================================
-- Migration : RLS pour les tables CRM
-- Phase 0 — à exécuter APRÈS migration_crm_core.sql
-- À exécuter dans Supabase > SQL Editor > New Query
--
-- Idempotent : DROP POLICY IF EXISTS puis CREATE (PostgreSQL ne supporte pas
-- CREATE POLICY IF NOT EXISTS de façon fiable).
-- ============================================================

-- ------------------------------------------------------------
-- 0. Helpers de rôle (SECURITY DEFINER pour lire profiles sans récursion RLS)
--    Inclut les rôles legacy 'manager'/'vendeur' pendant la transition.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mw_is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'lead', 'manager')
  );
$$;

-- ------------------------------------------------------------
-- 1. clients — équipe (lecture + écriture authentifiée), suppression admin
-- ------------------------------------------------------------
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clients_select ON clients;
CREATE POLICY clients_select ON clients FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS clients_insert ON clients;
CREATE POLICY clients_insert ON clients FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS clients_update ON clients;
CREATE POLICY clients_update ON clients FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS clients_delete ON clients;
CREATE POLICY clients_delete ON clients FOR DELETE TO authenticated USING (mw_is_admin());

-- ------------------------------------------------------------
-- 2. leads — équipe ventes collabore; suppression admin
-- ------------------------------------------------------------
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS leads_select ON leads;
CREATE POLICY leads_select ON leads FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS leads_insert ON leads;
CREATE POLICY leads_insert ON leads FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS leads_update ON leads;
CREATE POLICY leads_update ON leads FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS leads_delete ON leads;
CREATE POLICY leads_delete ON leads FOR DELETE TO authenticated USING (mw_is_admin());

-- ------------------------------------------------------------
-- 3. sms_messages — lecture/écriture authentifiée (envoi + webhook serveur)
-- ------------------------------------------------------------
ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sms_select ON sms_messages;
CREATE POLICY sms_select ON sms_messages FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS sms_insert ON sms_messages;
CREATE POLICY sms_insert ON sms_messages FOR INSERT TO authenticated WITH CHECK (true);

-- (Les SMS entrants Twilio sont insérés côté serveur via la service role key,
--  qui bypasse la RLS — pas besoin de policy anon.)

-- ------------------------------------------------------------
-- 4. jobs (calendrier) — tous lisent; planification réservée admin/lead
-- ------------------------------------------------------------
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS jobs_select ON jobs;
CREATE POLICY jobs_select ON jobs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS jobs_insert ON jobs;
CREATE POLICY jobs_insert ON jobs FOR INSERT TO authenticated WITH CHECK (mw_is_admin());

DROP POLICY IF EXISTS jobs_update ON jobs;
CREATE POLICY jobs_update ON jobs FOR UPDATE TO authenticated USING (mw_is_admin());

DROP POLICY IF EXISTS jobs_delete ON jobs;
CREATE POLICY jobs_delete ON jobs FOR DELETE TO authenticated USING (mw_is_admin());

-- ------------------------------------------------------------
-- 5. quotes — reps créent les leurs; admin gère tout
-- ------------------------------------------------------------
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quotes_select ON quotes;
CREATE POLICY quotes_select ON quotes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS quotes_insert ON quotes;
CREATE POLICY quotes_insert ON quotes FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS quotes_update ON quotes;
CREATE POLICY quotes_update ON quotes FOR UPDATE TO authenticated
  USING (mw_is_admin() OR rep_id = auth.uid());

DROP POLICY IF EXISTS quotes_delete ON quotes;
CREATE POLICY quotes_delete ON quotes FOR DELETE TO authenticated USING (mw_is_admin());

-- ------------------------------------------------------------
-- 6. commissions — l'employé voit les siennes; admin gère tout (sensible)
-- ------------------------------------------------------------
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commissions_select ON commissions;
CREATE POLICY commissions_select ON commissions FOR SELECT TO authenticated
  USING (mw_is_admin() OR profile_id = auth.uid());

DROP POLICY IF EXISTS commissions_insert ON commissions;
CREATE POLICY commissions_insert ON commissions FOR INSERT TO authenticated
  WITH CHECK (mw_is_admin());

DROP POLICY IF EXISTS commissions_update ON commissions;
CREATE POLICY commissions_update ON commissions FOR UPDATE TO authenticated
  USING (mw_is_admin());

DROP POLICY IF EXISTS commissions_delete ON commissions;
CREATE POLICY commissions_delete ON commissions FOR DELETE TO authenticated
  USING (mw_is_admin());

-- ------------------------------------------------------------
-- 7. timesheets — l'employé pointe/voit les siennes; admin gère tout
-- ------------------------------------------------------------
ALTER TABLE timesheets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS timesheets_select ON timesheets;
CREATE POLICY timesheets_select ON timesheets FOR SELECT TO authenticated
  USING (mw_is_admin() OR profile_id = auth.uid());

DROP POLICY IF EXISTS timesheets_insert ON timesheets;
CREATE POLICY timesheets_insert ON timesheets FOR INSERT TO authenticated
  WITH CHECK (mw_is_admin() OR profile_id = auth.uid());

DROP POLICY IF EXISTS timesheets_update ON timesheets;
CREATE POLICY timesheets_update ON timesheets FOR UPDATE TO authenticated
  USING (mw_is_admin() OR profile_id = auth.uid());

DROP POLICY IF EXISTS timesheets_delete ON timesheets;
CREATE POLICY timesheets_delete ON timesheets FOR DELETE TO authenticated
  USING (mw_is_admin());

-- ============================================================
-- FIN — RLS active sur toutes les tables CRM
-- ============================================================
