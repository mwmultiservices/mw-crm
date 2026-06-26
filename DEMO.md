# MW Multiservices — Guide de démonstration

App web unique (CRM + porte-à-porte) pour fenêtres et paysagement.
Utilisable sur ordinateur **et** téléphone (installable comme une app — voir §5).

---

## 1. Lancer la démo

- **En local** : `npm run dev` dans `mw-porteaporte/`, puis ouvrir http://localhost:3000
- **En ligne** (après déploiement Vercel) : l'URL fournie.

**Données de démonstration** (clients, leads, jobs, soumissions fictifs) :
```bash
node --env-file=.env.local scripts/seed-demo.mjs        # charger
node --env-file=.env.local scripts/seed-demo.mjs --wipe # effacer
```

## 2. Se connecter

- **Admin de référence** : `william.yelle@mwmultiservices.ca`
  (définir le mot de passe : `node --env-file=.env.local scripts/set-password.mjs william.yelle@mwmultiservices.ca <motdepasse>`)
- **Créer un compte** : page *S'inscrire*. Rôle « Manager » = code d'accès requis (`MW2024MANAGER` en dev).
- 22 employés sont déjà importés (vendeurs, techs, paysagistes).

## 3. Parcours conseillé pour la démo (rôle Admin)

L'app s'adapte au rôle de chacun (menu différent). En **Admin**, tu vois tout :

| Section | À montrer |
|---|---|
| **Accueil** | Revenus par service (fenêtres / paysagement / projets), demandes du pipeline, jobs du jour, soumissions en attente — tout en un coup d'œil. |
| **Carte D2D** | Carte réelle des portes cognées, statuts par couleur, coach IA de vente, stats vendeurs. |
| **Pipeline** | Tableau kanban des leads (web, Meta, porte-à-porte). Cliquer un lead → fiche + **conversation SMS** + changement d'étape. |
| **Performance** | Tableaux de bord vendeurs (graphiques portes/ventes). |
| **Calendrier — Fenêtres** | Semaine, 2 équipes côte à côte, créneaux libres, assignation des techniciens. |
| **Calendrier — Paysagement** | Routes de gazon + projets, 2 équipes. |
| **Soumissions** | Devis/factures, statuts (brouillon → envoyé → signé → facturé → payé), bouton QuickBooks. |
| **Payes** | Commissions (vendeurs % + techs 18%) calculées automatiquement, heures de paysagement, marquage « payé ». |
| **Profil** | Réglages, employés, commissions, couleurs. |

**Démo « cycle complet » à raconter** :
1. Un vendeur cogne une porte → la marque **vendue** sur la carte.
2. → un **client + un lead** sont créés automatiquement dans le pipeline.
3. → le revenu remonte sur l'**Accueil** et dans les **commissions** du vendeur.
4. L'admin **cédule** la job dans le calendrier et **assigne** une équipe.
5. Une **soumission** est créée et suit son statut jusqu'à *payé*.

## 4. Automatisations déjà en place

- SMS de **bienvenue** automatique sur les leads entrants (web/Meta).
- SMS de **confirmation de rendez-vous** et de **demande d'avis Google** selon l'étape.
- **Relance** automatique des leads sans nouvelles depuis 3 jours (drapeau « à relancer »).

## 5. Sur téléphone (vendeurs terrain)

L'app est un **PWA installable** :
- **iPhone** : Safari → Partager → *Ajouter à l'écran d'accueil*.
- **Android** : Chrome → menu → *Installer l'application*.
- S'ouvre plein écran comme une vraie app, avec icône MW, et garde en cache les pages déjà visitées (utile en zone à faible signal).

---

## 6. Ce qui reste à brancher (dépendances externes)

Tout le logiciel est construit et fonctionnel. Il reste à fournir des **accès/API tiers** pour activer 4 connexions au monde réel :

| À activer | Ce qu'il faut | État |
|---|---|---|
| **Envoi réel des SMS** | Compte **Twilio** (Account SID, Auth Token, numéro). Aujourd'hui les SMS sont enregistrés mais pas envoyés (mode démo). | Code prêt — manque les clés |
| **Leads du site web / Meta Ads** | Brancher le formulaire du site et **Meta Lead Ads** sur l'adresse d'entrée des leads. | Point d'entrée prêt — manque la connexion Meta |
| **QuickBooks** (devis/factures) | Compte **développeur Intuit** + app (Client ID/Secret). Permet de pousser les factures vers QuickBooks. | Connexion OAuth2 prête — manque les credentials Intuit |
| **Mise en ligne** | Déploiement **Vercel** (import du dépôt GitHub) + définir 2 secrets de prod. | Configuration prête (`DEPLOY.md`) |

> Détails techniques de déploiement : voir `DEPLOY.md`.
> Aucune de ces 4 connexions n'empêche de **démontrer** l'app aujourd'hui — elles
> activent l'envoi/la synchro réels une fois les comptes tiers ouverts.

## 7. Idées d'améliorations futures (optionnel)
- Glisser-déposer des jobs dans le calendrier ; positionnement à l'heure précise.
- Routes de gazon récurrentes (génération automatique des occurrences).
- Synchro QuickBooks bidirectionnelle (statuts payés rapatriés).
- Resserrer quelques réglages globaux (sécurité fine).
