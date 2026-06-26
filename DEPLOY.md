# Déploiement — MW Multiservices (Vercel)

App Next.js 16 hôte unique. Dépôt : `willthug77/mw-porteaporte`.

## 1. Pré-requis Supabase
Exécuter les migrations dans l'ordre (SQL Editor, coller le **contenu**) — cf. `supabase/README.md`.
La dernière, **`migration_crm_security.sql`**, est obligatoire avant la prod (anti-escalade de rôle).

## 2. Variables d'environnement (Vercel → Settings → Environment Variables)

| Variable | Requis | Rôle |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | URL projet Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | clé anon (client) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | service role (routes serveur) — **secret** |
| `ANTHROPIC_API_KEY` | ✅ | coach IA |
| `MANAGER_SIGNUP_CODE` | ✅ (prod) | code d'inscription admin/lead — mettre une valeur forte |
| `CRON_SECRET` | ✅ (prod) | protège `/api/automations/run` (Vercel l'envoie en Bearer) |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` | ⬜ | SMS réels (sinon mode stub) |
| `LEADS_WEBHOOK_SECRET` | ⬜ | protège `/api/leads` (header `x-webhook-secret`) |
| `QUICKBOOKS_*` | ⬜ | Phase 7 (soumissions) |

> `NEXT_PUBLIC_*` = exposées au client. Les autres restent serveur uniquement.

## 3. Déploiement
1. Vercel → New Project → importer le dépôt GitHub. Framework détecté : **Next.js**.
2. Renseigner les variables d'env (étape 2) pour *Production* (et *Preview* si voulu).
3. Deploy. (Pas de réglage de build spécial ; `vercel.json` configure déjà le cron.)

## 4. Cron des relances
`vercel.json` planifie `GET /api/automations/run` **tous les jours à 13:00 UTC** (~9h Est).
Vercel envoie `Authorization: Bearer $CRON_SECRET`. Pour changer la fréquence, éditer `vercel.json`.

## 5. Après le 1er déploiement
- **Twilio** : pointer le webhook SMS entrant vers `https://<domaine>/api/sms/webhook`.
- **Site web / Meta** : envoyer les leads en POST JSON vers `https://<domaine>/api/leads`
  (header `x-webhook-secret` si `LEADS_WEBHOOK_SECRET` est défini).
- **1er admin** : `node --env-file=.env.local scripts/set-password.mjs william.yelle@mwmultiservices.ca <mdp>`
  (ou s'inscrire avec le `MANAGER_SIGNUP_CODE`).

## Notes
- L'ancien déploiement « iCloud Drive sans build » est abandonné.
- `next build`/`tsc` dépassent le timeout dans le sandbox de dev : valider le build en local
  (`npm run build`) avant de pousser si possible.
