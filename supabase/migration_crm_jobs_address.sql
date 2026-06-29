-- ============================================================
-- Migration : adresse sur les jobs (calendrier) → bouton GPS « Itinéraire »
-- La table jobs n'avait pas d'adresse ; on en ajoute une (texte libre) pour
-- pouvoir ouvrir un itinéraire Google Maps vers le créneau planifié.
-- Idempotente.
-- ============================================================

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS address TEXT;

-- ============================================================
-- FIN
-- ============================================================
