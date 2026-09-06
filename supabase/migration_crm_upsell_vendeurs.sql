-- ============================================================
-- MW CRM — Plusieurs vendeurs par upsell (vente splittée)
--
-- Un service vendu sur le chantier peut être conclu à DEUX (ou plus).
-- On garde sold_by (1er vendeur, compatibilité) et on ajoute la liste
-- complète : la commission de vente est ensuite SPLITTÉE également entre
-- les vendeurs listés (cf. upsellSellers/upsellShare dans lib/payes.ts).
--
-- Pas de clé étrangère possible sur les éléments d'un tableau : l'app
-- résout les noms côté client et ignore un id inconnu (employé supprimé).
--
-- Idempotente : ré-exécutable sans risque.
-- À coller dans Supabase → SQL Editor.
-- ============================================================

ALTER TABLE job_upsells
  ADD COLUMN IF NOT EXISTS sold_by_ids UUID[] NOT NULL DEFAULT '{}';

-- Reprise de l'existant : le vendeur unique devient une liste d'un seul.
UPDATE job_upsells
   SET sold_by_ids = ARRAY[sold_by]
 WHERE sold_by IS NOT NULL
   AND cardinality(sold_by_ids) = 0;

CREATE INDEX IF NOT EXISTS job_upsells_sold_by_ids_idx
  ON job_upsells USING GIN (sold_by_ids);

-- ============================================================
-- FIN
-- ============================================================
