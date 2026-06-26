-- ============================================================
-- Migration : connexion QuickBooks (Phase 7)
-- Stocke les tokens OAuth2 de l'entreprise (1 seule connexion QB pour MW).
-- RLS ACTIVÉE SANS POLICY → seuls les routes serveur (service role) y accèdent.
-- Les tokens ne sont JAMAIS lisibles depuis le client.
-- À exécuter quand on branche QuickBooks. Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS quickbooks_connection (
  id                INTEGER     PRIMARY KEY DEFAULT 1,   -- singleton (une connexion)
  realm_id          TEXT,                                -- id de la compagnie QuickBooks
  access_token      TEXT,
  refresh_token     TEXT,
  token_expires_at  TIMESTAMPTZ,
  connected_by      UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT quickbooks_singleton CHECK (id = 1)
);

-- RLS activée, AUCUNE policy → inaccessible en anon/authenticated.
-- Le service role (routes /api/quickbooks/*) contourne la RLS.
ALTER TABLE quickbooks_connection ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_qb_updated ON quickbooks_connection;
CREATE TRIGGER trg_qb_updated BEFORE UPDATE ON quickbooks_connection
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- FIN
-- ============================================================
