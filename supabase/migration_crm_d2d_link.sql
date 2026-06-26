-- ============================================================
-- Migration : liaison D2D → pipeline (Phase 6)
-- Quand une porte passe à 'vendu', créer automatiquement un client + un lead
-- (source = 'd2d', stage = 'won') et lier la porte (doors.lead_id / client_id).
--
-- À exécuter APRÈS migration_crm_core + migration_crm_rls.
-- Idempotente (CREATE OR REPLACE + DROP TRIGGER IF EXISTS).
-- ============================================================

-- ------------------------------------------------------------
-- Catégorisation du service (texte libre des portes → fenetre | paysagement | projet)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mw_service_category(raw TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN raw IS NULL THEN NULL
    WHEN raw ILIKE '%fenetre%' OR raw ILIKE '%fenêtre%' OR raw ILIKE '%vitre%' THEN 'fenetre'
    WHEN raw ILIKE '%gazon%'   OR raw ILIKE '%pelouse%' OR raw ILIKE '%paysag%'
      OR raw ILIKE '%tonte%'   OR raw ILIKE '%haie%'                          THEN 'paysagement'
    WHEN raw ILIKE '%projet%'  OR raw ILIKE '%pavé%'    OR raw ILIKE '%pave%'
      OR raw ILIKE '%amenag%'  OR raw ILIKE '%aménag%'  OR raw ILIKE '%muret%' THEN 'projet'
    ELSE NULL
  END;
$$;

-- ------------------------------------------------------------
-- Trigger : porte 'vendu' → client + lead, puis liaison
-- AFTER (le lead a une FK door_id → la porte doit déjà exister).
-- La récursion est évitée par `UPDATE OF status` (on ne touche que lead_id/client_id)
-- + le garde-fou `NEW.lead_id IS NULL`.
-- SECURITY DEFINER : insère dans clients/leads en contournant la RLS.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mw_door_to_pipeline()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_client_id UUID := NEW.client_id;
  v_lead_id   UUID;
  v_category  TEXT;
  v_name      TEXT := COALESCE(NULLIF(btrim(NEW.client_name), ''), 'Client D2D');
BEGIN
  IF NEW.status = 'vendu' AND NEW.lead_id IS NULL THEN
    v_category := mw_service_category(NEW.service_type);

    -- 1. client (réutilise celui déjà lié le cas échéant)
    IF v_client_id IS NULL THEN
      INSERT INTO clients (name, address, phone, services)
      VALUES (
        v_name,
        NEW.address,
        NEW.phone,
        CASE WHEN v_category IS NULL THEN '{}'::text[] ELSE ARRAY[v_category] END
      )
      RETURNING id INTO v_client_id;
    END IF;

    -- 2. lead (gagné, issu du porte-à-porte)
    INSERT INTO leads (
      client_id, name, phone, source, service, service_category,
      stage, rep_id, price, door_id, notes
    )
    VALUES (
      v_client_id, v_name, NEW.phone, 'd2d', NEW.service_type, v_category,
      'won', NEW.user_id, NEW.contract_value, NEW.id, NEW.notes
    )
    RETURNING id INTO v_lead_id;

    -- 3. liaison retour sur la porte (ne refait pas feu : UPDATE OF status)
    UPDATE doors SET lead_id = v_lead_id, client_id = v_client_id
    WHERE id = NEW.id;
  END IF;

  RETURN NULL; -- AFTER trigger : valeur de retour ignorée
END;
$$;

DROP TRIGGER IF EXISTS trg_door_to_pipeline ON doors;
CREATE TRIGGER trg_door_to_pipeline
  AFTER INSERT OR UPDATE OF status ON doors
  FOR EACH ROW
  EXECUTE FUNCTION mw_door_to_pipeline();

-- ============================================================
-- FIN
-- ============================================================
