-- ============================================================
-- Migration : Run fermeture (saison de fermeture des terrains)
-- (demande client 2026-09-28)
-- À exécuter dans Supabase > SQL Editor > New Query (coller le CONTENU)
--
-- Idempotente — peut être relancée sans risque.
-- Pré-requis : migration_crm_core.sql (clients, profiles, set_updated_at)
--              et migration_crm_rls.sql (mw_is_admin).
--
-- Le code déployé TOLÈRE l'absence de cette migration : la page
-- /fermeture affiche un bandeau et reste vide, le calendrier fonctionne.
--
--   - fermeture_clients : les clients de la run, classés par ville (selon
--     le code postal, cf. lib/fermeture.ts) puis par journée (#1, #2…).
--     Une journée « Longueuil #2 » est envoyée au calendrier Paysagement
--     comme job de type 'fermeture' (jobs.route_name = « Longueuil #2 »).
--   - fermeture_villes : villes ajoutées à la main par l'admin (bouton
--     « + Ville » de Réorganiser) avec leurs préfixes de code postal.
-- ============================================================

-- ------------------------------------------------------------
-- 1. fermeture_clients
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fermeture_clients (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id       UUID        REFERENCES clients(id) ON DELETE SET NULL,
  name            TEXT        NOT NULL,
  address         TEXT,
  city            TEXT,                          -- ville de l'adresse (fiche client)
  postal_code     TEXT,
  phone           TEXT,
  email           TEXT,
  ville           TEXT        NOT NULL DEFAULT '', -- groupe de la run ('' = sans ville)
  journee         INTEGER,                       -- #1, #2… dans la ville ; NULL = à planifier
  position        INTEGER     DEFAULT 0,         -- ordre de passage dans la journée
  superficie_pi2  INTEGER,
  notes           TEXT,                          -- consignes pour l'équipe
  photos          TEXT[]      DEFAULT '{}',      -- chemins Storage (bucket mw-photos)
  a_eviter        BOOLEAN     DEFAULT false,     -- admin : « à ne pas faire »
  status          TEXT,                          -- NULL | fait | evite
  status_note     TEXT,                          -- raison d'un « À éviter »
  done_by         UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  done_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fermeture_clients_run_idx ON fermeture_clients (ville, journee, position);

DROP TRIGGER IF EXISTS trg_fermeture_clients_updated ON fermeture_clients;
CREATE TRIGGER trg_fermeture_clients_updated BEFORE UPDATE ON fermeture_clients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- 2. fermeture_villes
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fermeture_villes (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT        NOT NULL UNIQUE,
  prefixes    TEXT[]      DEFAULT '{}',          -- « J4L », « J4M »… (sans espace)
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------
-- 3. RLS — toute l'équipe voit la run et coche FAIT / À ÉVITER ;
--    supprimer un client et gérer les villes = admin.
-- ------------------------------------------------------------
ALTER TABLE fermeture_clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fermeture_clients_select ON fermeture_clients;
CREATE POLICY fermeture_clients_select ON fermeture_clients FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS fermeture_clients_insert ON fermeture_clients;
CREATE POLICY fermeture_clients_insert ON fermeture_clients FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS fermeture_clients_update ON fermeture_clients;
CREATE POLICY fermeture_clients_update ON fermeture_clients FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS fermeture_clients_delete ON fermeture_clients;
CREATE POLICY fermeture_clients_delete ON fermeture_clients FOR DELETE TO authenticated USING (mw_is_admin());

ALTER TABLE fermeture_villes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fermeture_villes_select ON fermeture_villes;
CREATE POLICY fermeture_villes_select ON fermeture_villes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS fermeture_villes_insert ON fermeture_villes;
CREATE POLICY fermeture_villes_insert ON fermeture_villes FOR INSERT TO authenticated WITH CHECK (mw_is_admin());

DROP POLICY IF EXISTS fermeture_villes_update ON fermeture_villes;
CREATE POLICY fermeture_villes_update ON fermeture_villes FOR UPDATE TO authenticated USING (mw_is_admin());

DROP POLICY IF EXISTS fermeture_villes_delete ON fermeture_villes;
CREATE POLICY fermeture_villes_delete ON fermeture_villes FOR DELETE TO authenticated USING (mw_is_admin());

-- ------------------------------------------------------------
-- 4. Temps réel — un coéquipier coche FAIT → tout le monde le voit.
--    (déjà publiée, ou publication FOR ALL TABLES → on ignore l'erreur)
-- ------------------------------------------------------------
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE fermeture_clients;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE fermeture_villes;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================
-- FIN
-- ============================================================
