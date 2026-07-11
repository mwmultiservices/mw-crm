-- ============================================================
-- Migration : Pipeline inbox — réponses SMS, notes par lead, push
-- À exécuter dans Supabase > SQL Editor > New Query
-- Idempotent : ré-exécutable sans risque.
--
-- 1. leads.unread_sms — le client a répondu par SMS et personne n'a
--    encore ouvert la conversation (pastille couleur sur le Kanban).
-- 2. lead_notes — notes rattachées à la JOB (au lead du pipeline),
--    PAS au client en général (ex. notes prises pendant l'appel).
-- 3. push_subscriptions — abonnements Web Push (notifications sur
--    l'écran d'accueil du cell quand un client répond / nouveau lead).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Drapeau « a répondu » sur les leads
-- ------------------------------------------------------------
ALTER TABLE leads ADD COLUMN IF NOT EXISTS unread_sms BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS leads_unread_idx ON leads (unread_sms) WHERE unread_sms;

-- ------------------------------------------------------------
-- 2. Notes par lead (job du pipeline)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lead_notes (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id      UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  author_id    UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  author_name  TEXT,
  body         TEXT        NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_notes_lead_idx ON lead_notes (lead_id, created_at);

ALTER TABLE lead_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_notes_select ON lead_notes;
CREATE POLICY lead_notes_select ON lead_notes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS lead_notes_insert ON lead_notes;
CREATE POLICY lead_notes_insert ON lead_notes FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

-- suppression : l'auteur ou un admin/lead
DROP POLICY IF EXISTS lead_notes_delete ON lead_notes;
CREATE POLICY lead_notes_delete ON lead_notes FOR DELETE TO authenticated
  USING (mw_is_admin() OR author_id = auth.uid());

-- ------------------------------------------------------------
-- 3. Abonnements Web Push (un par navigateur/appareil)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id   UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint     TEXT        NOT NULL UNIQUE,
  p256dh       TEXT        NOT NULL,
  auth         TEXT        NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_profile_idx ON push_subscriptions (profile_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- chacun gère SES abonnements ; l'envoi se fait côté serveur (service role)
DROP POLICY IF EXISTS push_select ON push_subscriptions;
CREATE POLICY push_select ON push_subscriptions FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

DROP POLICY IF EXISTS push_insert ON push_subscriptions;
CREATE POLICY push_insert ON push_subscriptions FOR INSERT TO authenticated
  WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS push_update ON push_subscriptions;
CREATE POLICY push_update ON push_subscriptions FOR UPDATE TO authenticated
  USING (profile_id = auth.uid());

DROP POLICY IF EXISTS push_delete ON push_subscriptions;
CREATE POLICY push_delete ON push_subscriptions FOR DELETE TO authenticated
  USING (profile_id = auth.uid());

-- ============================================================
-- FIN
-- ============================================================
