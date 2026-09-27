-- ============================================================
-- Migration : Gazon — coordonnées GPS des terrains (« Prochain client »)
-- À exécuter dans Supabase > SQL Editor > New Query (coller le CONTENU)
--
-- Idempotente — peut être relancée sans risque.
-- Pré-requis : migration_crm_gazon_paye.sql (table gazon_terrains).
--
-- Le bouton « Prochain client » ouvre Google Maps vers UNE destination en
-- « lat,lng ». Les coordonnées sont remplies par POST /api/gazon/geocode
-- (Geocoding API Google, clé serveur GOOGLE_MAPS_API_KEY) la première fois
-- qu'un terrain est affiché.
--
-- geocoded_address = l'adresse COMPLÈTE (fullTerrainAddress) qui a été
-- géocodée. Les coordonnées ne valent que si elle est identique à l'adresse
-- actuelle : modifier l'adresse (ou transférer le terrain dans une autre run)
-- les rend périmées et déclenche un nouveau géocodage, sans code à ajouter.
-- lat/lng NULL avec geocoded_address rempli = adresse déjà essayée, sans
-- résultat précis → le bouton retombe sur l'adresse texte (pas de rappel payant).
--
-- Le code déployé TOLÈRE l'absence de cette migration (destination = adresse texte).
-- ============================================================

ALTER TABLE gazon_terrains ADD COLUMN IF NOT EXISTS lat              DOUBLE PRECISION;
ALTER TABLE gazon_terrains ADD COLUMN IF NOT EXISTS lng              DOUBLE PRECISION;
ALTER TABLE gazon_terrains ADD COLUMN IF NOT EXISTS geocoded_address TEXT;
