-- ============================================================
-- Migration : automatisations pipeline (Phase 3.4)
-- Ajoute le suivi des relances d'inactivité sur les leads.
-- À exécuter APRÈS migration_crm_core. Idempotente.
-- ============================================================

-- Drapeau « à relancer » + date de mise en relance (posé par /api/automations/run).
ALTER TABLE leads ADD COLUMN IF NOT EXISTS needs_follow_up BOOLEAN DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_at    TIMESTAMPTZ;

-- Index partiel : retrouver vite les leads à relancer.
CREATE INDEX IF NOT EXISTS leads_followup_idx ON leads (needs_follow_up) WHERE needs_follow_up = true;

-- ============================================================
-- FIN
-- ============================================================
