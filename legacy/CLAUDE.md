# MW Multiservices CRM — Claude Notes

## Projet
CRM interne pour MW Multiservices (fenêtres + paysagement). SPA vanilla JS, single-origin, déployée depuis iCloud Drive.

## Structure fichiers
- `index.html` — HTML uniquement (pas de JS ni CSS inline)
- `styles.css` — tout le CSS
- `script.js` — tout le JS
- CDN Supabase JS v2 chargé avant `script.js` dans `<head>`

## Supabase
- URL: `https://tvnphodfkfmsbvsvmayy.supabase.co`
- Clé anon: à remplacer dans `script.js` à la constante `SUPA_KEY` (cherche `ANON_KEY_ICI`)
- RLS: désactivé pour l'instant (activer après tests)
- Auth: locale uniquement (objet `USERS` avec mots de passe). Supabase anon key sert uniquement aux données.

## Patterns importants
- `supa(fn)` — wrapper async qui swallow toutes les erreurs Supabase, retourne null si échec
- `FB_*` constants — données fallback si Supabase vide ou clé manquante
- `_clients` / `_leads` — caches en mémoire mis à jour après chaque fetch
- `weekStart()` — retourne la date ISO du lundi de la semaine courante (utilisé dans tous les filtres hebdo)
- `build*()` shims — wrappers sync qui appellent les fonctions `load*()` async (compat onclick HTML)
- `window._rt` — canal Realtime Supabase, désinscrit au logout via `doLogout()`

## Tables Supabase attendues
| Table | Colonnes clés |
|---|---|
| `leads` | id, name, phone, source, service, stage, rep_username, rep_name, price, created_at |
| `clients` | id, name, address, phone, email, services[], notes, num_vitres, superficie_pi2, contrats[] |
| `sms_messages` | id, lead_id, direction, message, phone, created_at |
| `commissions` | id, username, name, type (rep/tech), week_of, sales_amount, commission_amount, rate, jobs_count, doors_knocked, deals_closed, bonus, paid, paid_at |
| `timesheets` | id, user_name, user_username, date, clock_in, clock_out, hours, job_note, paid, paid_at |
| `quotes` | id, client_name, service_type, plan, price, notes, status (draft/sent/signed), type, rep_username, rep_name, created_at |
| `jobs` | id, created_at (pour count dashboard) |

## Ce qui reste à faire
- Brancher la vraie clé anon Supabase (`ANON_KEY_ICI` dans script.js)
- Twilio: les SMS sont sauvegardés en DB mais l'envoi réel nécessite un backend/Edge Function (clés API ne peuvent pas être en JS client)
- QuickBooks: les soumissions sauvent en DB mais l'API QB (OAuth2) nécessite un backend
- Google Maps: la carte D2D est un mock CSS — intégration Maps JS API à faire
- Activer RLS Supabase après validation des données

## Obsidian vault
Pas encore créé pour ce projet (2026-04-30).
