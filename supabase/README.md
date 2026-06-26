# Supabase — migrations & setup

**Projet cible = celui de mw-crm** (`tvnphodfkfmsbvsvmayy`), utilisé aussi pour le Vercel.
On y reconstruit tout le schéma à zéro (l'app Next.js porteaporte devient l'hôte).

## Ordre d'exécution des migrations

Coller **le contenu** de chaque fichier (pas son nom) dans **Supabase → SQL Editor → New Query**, dans cet ordre :

1. **`migration_00_base.sql`** — socle porte-à-porte : `profiles, doors, objectifs, app_settings`, vue `vendeur_stats`, RLS, trigger auto-profil *(nouveau)*
1b. **`migration_crm_reset.sql`** — ⚠️ DESTRUCTIF : supprime les anciennes tables CRM legacy du projet mw-crm (on repart à zéro). À sauter si le projet est déjà vierge *(nouveau)*
2. **`migration_crm_core.sql`** — tables CRM (`clients, leads, sms_messages, jobs, quotes, commissions, timesheets`) + extensions `profiles` + relations `doors`
3. **`migration_crm_rls.sql`** — politiques RLS des tables CRM
4. **`migration_crm_roles_normalize.sql`** — recrée `vendeur_stats` + policies `doors` (no-op sur projet neuf, mais inoffensif)
5. **`migration_crm_d2d_link.sql`** — Phase 6 : trigger `doors` 'vendu' → crée client + lead (source `d2d`, stage `won`) et lie la porte *(nouveau)*
6. **`migration_crm_automations.sql`** — Phase 3.4 : colonnes `leads.needs_follow_up` + `follow_up_at` (relances d'inactivité) *(nouveau)*
7. **`migration_crm_security.sql`** — Phase 7 : self-signup borné à rep/tech/terrain + trigger anti-escalade des champs sensibles du profil (role/commission/hourly) *(nouveau)*
8. **`migration_crm_quickbooks.sql`** — Phase 7 : table `quickbooks_connection` (tokens OAuth2, RLS verrouillée service-role). À exécuter seulement quand on branche QuickBooks *(nouveau)*

> ⚠️ Les anciennes migrations `migration_profil.sql`, `migration_objectifs.sql`,
> `migration_dashboard.sql`, `migration_coach_ia.sql` sont **fondues dans
> `migration_00_base.sql`** — NE PAS les exécuter séparément sur le projet mw-crm.
>
> Toutes les migrations sont **idempotentes** (relançables sans casse) et écrites
> directement dans le modèle de rôles unifié (`admin | lead | rep | tech | terrain`).

## Migration des employés (auth)

Après l'étape 5, créer les comptes des ~20 employés du CRM :

```bash
# remplir .env.local d'abord (cf. .env.local.example) — il faut SUPABASE_SERVICE_ROLE_KEY
node --env-file=.env.local scripts/migrate-crm-users.mjs
```

Le script est idempotent et imprime les mots de passe temporaires à distribuer.
⚠️ Les emails sont des placeholders `username@mwmultiservices.ca` — éditer la map
`EMAILS` dans le script avec les vrais courriels avant de distribuer les accès.

## Modèle de rôles unifié

`admin` · `lead` · `rep` · `tech` · `terrain`
(legacy `manager` ≈ admin, `vendeur` ≈ rep — encore tolérés via `mw_is_admin()`).
Équipes via `profiles.teams[]` (ex. `{ventes,paysagement}`), capacité secondaire via `secondary_role`.
