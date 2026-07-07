-- ============================================================
-- QuickBooks — import QB → CRM (clients + transactions passées)
-- + courriel sur les soumissions (BillEmail des devis/factures).
-- À exécuter dans Supabase SQL Editor AVANT de déployer le code.
-- ============================================================

-- Mapping Customer QBO <-> client CRM (posé par l'import ET par le push).
ALTER TABLE clients ADD COLUMN IF NOT EXISTS quickbooks_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS clients_quickbooks_idx
  ON clients (quickbooks_id) WHERE quickbooks_id IS NOT NULL;

-- Courriel du client sur la soumission (envoyé comme BillEmail vers QBO).
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS client_email TEXT;

-- Horodatage de l'envoi du courriel au client via QuickBooks (endpoint /send).
-- Sert de garde anti double-envoi.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS quickbooks_emailed_at TIMESTAMPTZ;
