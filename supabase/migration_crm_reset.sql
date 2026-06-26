-- ============================================================
-- Migration RESET : supprime les anciennes tables CRM legacy
-- ------------------------------------------------------------
-- ⚠️ DESTRUCTIF — efface définitivement ces tables et leurs données.
-- À exécuter UNIQUEMENT sur le projet mw-crm qui contient l'ancien schéma CRM,
-- car on repart à zéro. À lancer ENTRE migration_00_base.sql et migration_crm_core.sql.
--
-- Ne touche PAS aux tables du socle porteaporte (profiles, doors, objectifs,
-- app_settings) déjà créées par migration_00_base.sql.
-- ============================================================

DROP TABLE IF EXISTS sms_messages CASCADE;
DROP TABLE IF EXISTS commissions  CASCADE;
DROP TABLE IF EXISTS timesheets   CASCADE;
DROP TABLE IF EXISTS quotes       CASCADE;
DROP TABLE IF EXISTS jobs         CASCADE;
DROP TABLE IF EXISTS leads        CASCADE;
DROP TABLE IF EXISTS clients      CASCADE;

-- ============================================================
-- FIN — exécuter ensuite migration_crm_core.sql
-- ============================================================
