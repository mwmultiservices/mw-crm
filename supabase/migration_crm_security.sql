-- ============================================================
-- Migration : durcissement sécurité (Phase 7)
-- Ferme deux trous d'auto-promotion vers admin :
--   1. handle_new_user faisait confiance à raw_user_meta_data->>'role'
--      → un self-signup pouvait demander role='admin'.
--   2. profiles_update permettait à l'employé de changer SES champs sensibles
--      (role, commission_*, hourly_rate) → escalade de privilèges / paye.
--
-- À exécuter APRÈS migration_00_base (+ crm_*). Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Self-signup : rôle borné à un ensemble NON privilégié.
--    L'élévation vers admin/lead se fait via /api/signup (service role,
--    après validation du code manager côté serveur).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  requested TEXT := NEW.raw_user_meta_data ->> 'role';
  safe_role TEXT;
BEGIN
  -- jamais admin/lead/manager depuis un self-signup
  safe_role := CASE WHEN requested IN ('rep', 'tech', 'terrain') THEN requested ELSE 'rep' END;
  INSERT INTO profiles (id, full_name, email, role, color)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.email,
    safe_role,
    NEW.raw_user_meta_data ->> 'color'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- 2. Anti-escalade : un utilisateur normal ne peut PAS modifier
--    role / commission_type / commission_value / hourly_rate sur son profil.
--    Admins et service role (scripts, /api/signup) gardent tous les droits.
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

  IF NEW.role            IS DISTINCT FROM OLD.role
     OR NEW.commission_type  IS DISTINCT FROM OLD.commission_type
     OR NEW.commission_value IS DISTINCT FROM OLD.commission_value
     OR NEW.hourly_rate      IS DISTINCT FROM OLD.hourly_rate THEN
    RAISE EXCEPTION 'Champs sensibles du profil réservés à un administrateur';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_fields ON profiles;
CREATE TRIGGER trg_protect_profile_fields
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_profile_fields();

-- ============================================================
-- FIN
-- ============================================================
