# AUDIT TECHNIQUE — YOPPAA MVP

**Date de l'audit** : 2026-05-30
**Cible** : `c:\Users\HP\yoppaa-mvp\`
**Objectif** : Préparer l'intégration du module **Services (RDV coiffeur / esthéticienne / barbier / etc.)** sans duplication ni régression.

**Méthode** : Lecture du code source via grep + reads. **Aucune supposition** — toute info manquante est marquée `❓ À vérifier manuellement`. Niveau de certitude indiqué par section : ✅ Vérifié · ⚠️ Partiel · ❓ Manquant.

---

## 1. STRUCTURE GÉNÉRALE DU PROJET — ✅

### 1.1 Arborescence `/app`

| Route | Statut | Description |
|---|---|---|
| `/` (page.tsx) | ✅ Actif | Redirect → `/commander` |
| `/login` | ✅ Actif | Auth commerçant (magic link + password) |
| `/signup` | ✅ Actif | Onboarding commerçant 5 étapes |
| `/auth/confirm` | ✅ Actif | Confirm email Supabase |
| `/auth/session` | ✅ Actif | Gestion session |
| `/dashboard` | ✅ Actif | Dashboard commerçant |
| `/dashboard/ConfigDashboard.js` | ✅ Actif | Config (2987 lignes) |
| `/admin` | ✅ Actif | Console admin (valider/rejeter) |
| `/commander` | ✅ Actif | App client : recherche commerçants |
| `/commander/[slug]` | ✅ Actif | Fiche commerçant + panier C&C |
| `/commander/auth` | ✅ Actif | Auth client (signup/signin/magic) |
| `/commander/auth/confirm` | ✅ Actif | Confirm magic link client |
| `/commander/services/[slug]` | ✅ Actif | **Fiche services PUBLICS** (commune, police, etc.) — ⚠️ collision possible avec module RDV |
| `/commander/morning` | ✅ Actif | Good Morning Yoppers (push 7h30) |
| `/api/admin/valider` | ✅ Actif | Validation commerçant + email Resend |
| `/api/admin/rejeter` | ✅ Actif | Rejet commerçant + email Resend |
| `/api/notify-yoppaa` | ✅ Actif | Webhook notification interne |
| `/legal` | ✅ Actif | Mentions légales + CGU + DPA |
| `/onboarding-public` | ❌ **N'EXISTE PAS** | Brief existe mais non implémenté |
| `/dashboard-public` | ❌ **N'EXISTE PAS** | Non implémenté |
| `/preview/[token]` | ❌ **N'EXISTE PAS** | Non implémenté |

### Composants (inline dans `/app/commander/`)

- `ConfirmCommune.js` — autocomplete communes
- `CTAUpgrade.js` — bouton upgrade plan
- `ModalAvis.js` — modal avis post-commande
- `ModalSignalement.js` — signalement commerçant
- `PillsStatut.js` — pills statut (EN LIGNE / DEAL / ACTU / COMMANDE / LIVRAISON)

### `/lib`

| Fichier | Description |
|---|---|
| `supabase.js` | Client Supabase (anon key) |
| `resend.js` | Wrapper email + templates HTML inline |
| `plans.js` | Plans tarifaires + `canDo()` + `plansDispoPourCategorie()` |
| `morning/_reference.jsx` | Référence visuelle Good Morning Yoppers (non routée) |

### `/public`

```
/sounds/notification.mp3 (alerte commande)
/sounds/yop.mp3 (son retrait client)
/manifest.json (PWA client)
/manifest-dashboard.json (PWA dashboard)
/icon-192.png /icon-512.png /icon-pro-192.png /icon-pro-512.png
```

### `/supabase`

❓ **Aucun dossier `supabase/` dans le repo.** Migrations passées manuellement par Alexandre via dashboard.

### 1.2 Versions exactes (package.json)

```json
{
  "next": "16.2.4",
  "react": "19.2.4",
  "react-dom": "19.2.4",
  "@supabase/supabase-js": "^2.103.3",
  "stripe": "^22.0.2",
  "@stripe/stripe-js": "^9.2.0",
  "resend": "^6.12.4",
  "jspdf": "^4.2.1",
  "qrcode": "^1.5.4",
  "tailwindcss": "^4",
  "@tailwindcss/postcss": "^4",
  "typescript": "^5",
  "eslint": "^9",
  "eslint-config-next": "16.2.4"
}
```

Node engine : ≥18 (implicite Next.js 16).

---

## 2. BASE DE DONNÉES SUPABASE — ⚠️

**Important** : Aucun fichier `schema.sql` ou migration dans le repo. Schéma déduit du code via `supabase.from('TABLE').select/insert/update`. **Vérification finale dans le dashboard Supabase recommandée.**

### 2.1 Tables identifiées (18 tables)

#### A. Authentification & Utilisateurs

**`auth.users`** (Supabase Auth native) — email + password + OTP magic link.

**`commercants`** — colonnes déduites :
```
id (uuid PK)
auth_user_id (uuid FK → auth.users)
email (text unique)
nom (text)
slug (text unique)
type (text)              -- "Boulangerie", "Coiffeur", etc.
categorie (text)         -- 'alimentaire' | 'vitrine'
description (text)       -- ≥20 caractères
telephone (text)
adresse (text)
latitude, longitude (float)
logo_url (text)
statut (text)            -- 'en_cours_onboarding' | 'valide'
statut_publication (text)-- 'brouillon' | 'en_attente' | 'publie' | 'refuse'
motif_rejet (text NULL)
plan (text)              -- 'on' | 'live' | 'boost' | 'max'
plan_actif_depuis (timestamp)
horaires_detail (jsonb)  -- { lundi: { ouvert, debut, fin }, ... }
heure_ouverture_resa (time) -- défaut 21:00
url_reservation (text NULL) -- Optios/Doctolib
label_reservation (text NULL)
horizon_commande (int)   -- 1-30 jours
mode_capacite (text)     -- 'par_temps' | 'par_commandes'
est_service (boolean NULL) -- future
created_at, updated_at
```

**`clients`** — après migration 2026-05-29 :
```
id (uuid PK)
email (text unique lowercase)
prenom (text)
nom (text)
telephone (text)   -- obligatoire depuis 2026-05-30
auth_user_id (uuid FK NULL)
created_at, updated_at
```

#### B. Onboarding Commerçant

**`onboarding_commercants`** :
```
id, commercant_id (FK)
statut (text)            -- 'en_cours' | 'valide'
etape_actuelle (int)     -- 1-5
infos_ok, photo_ok, horaires_ok (boolean)
plan_choisi (text)
validation_auto_score (int) -- 0-100
success_pack_choisi (text NULL)
completed_at (timestamp NULL)
created_at, updated_at
```

**`admin_validations`** :
```
id, commercant_id (FK), action (text), motif (text NULL),
validated_by_email (text), created_at
```

#### C. Commandes (Click & Collect)

**`commandes`** :
```
id, commercant_id (FK), client_id (FK NULL)
client_email, client_nom, client_telephone (text)
date_commande (date)
creneau_id (FK creneaux)
statut (text)  -- 'en_attente' | 'en_preparation' | 'pret' | 'recupere' | 'non_retire'
total (decimal)
numero_commande (int NULL)
rgpd_commande, rgpd_marketing (boolean)
created_at, updated_at
```

**`commande_articles`** :
```
id, commande_id (FK), article_id (FK)
quantite (int), prix_unitaire (decimal)
options (jsonb[])  -- [{groupe_nom, valeur_nom, prix_supplement}]
```

**`creneaux`** :
```
id, commercant_id (FK)
jour_semaine (text NULL)
heure_debut, heure_fin (time)
max_commandes (int NULL)
capacite_temps (int NULL)  -- minutes
delta_minutes (int)
mode_capacite (text NULL)  -- 'temps' | 'commandes'
actif (boolean)
created_at, updated_at
```

#### D. Catalogue produits

**`articles`** :
```
id, commercant_id (FK)
nom, description, categorie (text)
prix (decimal), photo_url (text NULL)
temps_prepa (int NULL)  -- minutes
stock_jour (int NULL)
est_vitrine (boolean)   -- "à partir de X €" ou "Prix sur demande"
actif (boolean)
order (int NULL)
created_at
```

**`article_stock_jour`** : `(article_id, jour_semaine, stock_max, actif)`

**`article_options_groupes`** : `(article_id, nom, type, obligatoire)`

**`article_options_valeurs`** : `(groupe_id, nom, prix_supplement)`

#### E. Contenu commerçant

**`yoppaa_deals`** :
```
id, commercant_id (FK)
titre, description (text)
article_id (FK NULL)      -- lien article promo
prix_deal (decimal NULL)
date_deal (date NULL)
date_debut, date_fin (timestamp)
inclus_morning (boolean)   -- Good Morning Yoppers
cta_appeler_reserver (boolean)
actif (boolean)
created_at
```

**`actualites`** :
```
id, commercant_id (FK NULL)
service_id (FK services_publics NULL)
titre, contenu (text)
type (text)              -- 'actu' | 'alerte'
urgence (boolean)
date_debut, date_fin (date NULL)
actif (boolean)
created_at
```

**`fermetures_exceptionnelles`** : `(commercant_id, date_debut, date_fin, motif)`

**`commercant_photos`** : `(commercant_id, type, url, ordre)`

#### F. Engagement client

**`avis`** :
```
id, commercant_id (FK), client_id (FK NULL), commande_id (FK NULL)
note (int 1-5)
titre (text NULL), contenu (text)
reponse_commercant (text NULL)
created_at
```

**`favoris`** : `(client_id, commercant_id)` UNIQUE — table de liaison

**`signalements`** : `(commercant_id, client_id NULL, motif, description, statut, created_at)`

**`suggestions_commercants`** : `(client_id NULL, nom_commerce, adresse, type_commerce, commentaire)`

**`upgrade_requests`** : `(commercant_id, plan_demande, raison, created_at)`

#### G. Services publics (Plan PUBLIC)

**`services_publics`** :
```
id (uuid PK)
nom, slug, description (text)
type (text)              -- 'commune' | 'cpas' | 'police' | 'pompiers'
                         -- | 'ecole' | 'urgence' | 'medecin_garde'
                         -- | 'pharmacie_garde' | 'autre'
telephone, email_public, site_web, adresse (text)
latitude, longitude (float)
photo_couverture_url, logo_url (text)
horaires_detail (jsonb)
codes_postaux (text[])   -- CPs couverts par le service
national (boolean)       -- couverture Belgique entière
statut (text)            -- 'valide' | 'brouillon' | 'en_attente' | 'refuse'
created_at, updated_at
```

#### H. Communes (référentiel)

**`communes`** : `(id, nom, codes_postaux text[], province, active)`

### 2.2 RPC Functions Supabase

❓ **Aucune RPC `supabase.rpc(...)` détectée dans le code.** À vérifier manuellement dans le dashboard Supabase.

### 2.3 Edge Functions

❓ **Aucun dossier `supabase/functions/`.** À vérifier manuellement.

### 2.4 Storage buckets

| Bucket | Usage | Public |
|---|---|---|
| `logos` | Logos + couvertures commerçants + services publics | ✅ |

### 2.5 RLS & Policies

❓ **À vérifier dans le dashboard Supabase.** Le code suggère :
- `auth_user_id` est la clé pour les politiques RLS sur `commercants`
- `clients` accessible par email + auth_user_id
- `avis`, `favoris` filtrés par client_id

Memory `feedback-supabase-grants` indique : depuis 2026-10-30, GRANT explicite requis dans toute migration création table.

---

## 3. AUTHENTIFICATION — ✅

### 3.1 Types d'utilisateurs

| Type | Table | Identifiant | Notes |
|---|---|---|---|
| Admin | `auth.users` | email = `verstappenalexandre@gmail.com` **hardcodé** (3+ endroits) | Pas de table dédiée |
| Commerçant | `commercants` | `auth_user_id` FK | Multi-commerces supporté via localStorage |
| Client (Yopper) | `clients` | `email` unique + `auth_user_id` NULL | Peut être anonyme |

### 3.2 Routes d'auth

#### `/login` (commerçant + admin)
- Modes : Magic link OTP + Password
- Détecte `?next=/admin` pour masquer lien `/signup`
- Redirect : `nextPath` → `/dashboard` ou `/admin`

#### `/signup` (commerçant — 5 étapes — voir section 8.2)

#### `/commander/auth` (client/Yopper)
- 3 modes : Magic link + Password + Inscription
- Champs signup OBLIGATOIRES : prenom, nom, email, **telephone** (ajouté 2026-05-30), password
- Stockage localStorage : `yoppaa_email`, `yoppaa_prenom`, `yoppaa_nom`, `yoppaa_telephone`, `yoppaa_client_id`
- Redirect : `?redirect=/commander`

#### `/commander/auth/confirm`
- Vérification magic link Supabase → redirect `?next=`

### 3.3 Redirections post-auth

| Route | Cas | Redirect |
|---|---|---|
| `/login` OK commerçant | → `/dashboard` |
| `/login` OK admin | → `/admin` |
| `/signup` étape 5 OK | Affichage confirm |
| `/dashboard` non connecté | → `/login` |
| `/admin` non admin | "Accès refusé" |
| `/commander/auth` OK | → `redirect` param |

---

## 4. MODULE COMMERÇANT (ALIMENTAIRE) — ✅

### 4.1 Table `commercants`

Voir section 2.1 / A.

**Champs clés alimentaire** :
- `categorie = 'alimentaire'` → accès C&C, articles, créneaux, livraison si MAX
- `statut_publication = 'publie'` → visible sur `/commander`
- `plan ∈ {on, live, boost, max}` → `canDo(plan, 'commande')` true seulement pour BOOST/MAX
- `horizon_commande` → jours d'avance (1-30)
- `mode_capacite ∈ {par_temps, par_commandes}` → calcul capacité créneaux

### 4.2 Dashboard commerçant (`/dashboard`)

**Architecture** :
- `app/dashboard/page.js` (1026 lignes) — onglets Commandes / Paramètres
- `app/dashboard/ConfigDashboard.js` (2987 lignes) — toute la config

**Onglet Commandes** :
- Stats cards (Nouvelles, En prépa, Prêtes, CA jour)
- Sélecteur jours (horizon)
- Filtres statut (Actives, Nouvelles, En prépa, Prêtes, Récupérées, Non retirés, Tout)
- Mode historique
- Grille adaptative (1/2/4 cols selon viewport)
- Polling 5s + notifications système (Notification API + sons)
- Transitions statut : `en_attente → en_preparation → pret → recupere` ou `non_retire`
- ❓ QR code (jspdf + qrcode présents mais UI non visible)

**Onglet Paramètres (ConfigDashboard)** — Tabs :
1. **Menu** : articles, catégories, options (groupes + valeurs + prix_supplement)
2. **Deals** : yoppaa_deals + intégration Morning (1 max/jour, deadline avant 23h veille)
3. **Actus** : actualites + alertes
4. **Créneaux** : creneaux + fermetures exceptionnelles + horizon + mode_capacite
5. **Signalements** : 8 types (ferme, horaires, adresse, telephone, articles, site_web, doublon, autre)

**Hacks documentés** :
- `ConfigDashboard.js:1674,1684` — suppression créneaux **un par un** (bug `.in()` Supabase ou RLS)

### 4.3 Client app `/commander`

**Recherche** :
- Géolocalisation : `navigator.geolocation` + Nominatim reverse geocoding + cache localStorage (3 décimales ≈ 100m)
- Distance Haversine
- Filtres catégorie (15 types) — scroll horizontal avec chevrons cliquables PC
- Filtre `statut_publication = 'publie'`
- Affichage : couverture, logo, nom, type, distance, étoiles, 5 pills statut, badges type, horaires

**Favoris** :
- Coeur clickable → `favoris` (UNIQUE (client_id, commercant_id))
- Toast feedback : "X ajouté à tes favoris · tu recevras ses deals et actus"
- Notif (mention en mémoire : favori = notification deal/actu)

### 4.4 Module commandes

**Statuts workflow** :
```
en_attente (ROUGE)
  → "Démarrer la prépa" (commerçant)
en_preparation (ORANGE)
  → "Marquer prête" (commerçant)
pret (VERT)
  → swipe retrait client
recupere (BLEU) [FINAL]

OU créneau passé :
pret → non_retire (GRIS, possibilité annuler)
```

**Validation `passerCommande`** :
- Vérifie : creneauChoisi, prenom, nom, email, telephone, rgpdCommande, commercant
- 3 queries parallèles via `Promise.all` (stock check, max numero_commande, getOuCreerClient)
- Insert `commandes` puis `commande_articles`
- Email confirmation client via Resend
- setEtape(4) → page confirmation

**Numéro de commande** : position du jour pour le commerçant (recalculé via `numero_commande` ou tri created_at)

---

## 5. STRIPE — ⚠️ INTÉGRATION INCOMPLÈTE

### 5.1 État actuel

✅ **SDK installé** : `stripe@^22.0.2` + `@stripe/stripe-js@^9.2.0` (côté server + client)

❌ **Implémentation absente** :
- Aucune route `/api/stripe/*`
- Aucun appel `stripe.paymentIntents.*` ou `stripe.subscriptions.*` dans le code
- Aucun webhook Stripe configuré
- Aucune table `subscriptions` / `payments` / `stripe_customers`

### 5.2 Mentions code

**`/app/signup/page.js:437`** :
> "Tablette + imprimante thermique. 399€ HTVA comptant ou **3×133€ (Stripe ou Alma)**. Réservé BOOST/MAX."

→ Kit hardware **non implémenté** dans MVP.

### 5.3 Variables ENV

❓ Fichier `.env.local` présent mais contenu non accessible. Probablement `STRIPE_SECRET_KEY` + `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` à venir.

### 5.4 Stratégie planifiée (memory `project_paiement_stripe`)

- Stripe Subscriptions pour plans BOOST/MAX
- Stripe Connect Express Direct Charge pour paiement client → commerçant (BOOST/MAX = paiement en ligne **obligatoire**)
- Plan ON gratuit (pas de Stripe)
- Plan LIVE = abonnement simple

**Conclusion** : Stripe pré-positionné mais **non activé pour MVP**. Réservé Phase 2.

---

## 6. NOTIFICATIONS PUSH / EMAIL — ⚠️

### 6.1 Resend — ✅ Opérationnel

**Configuration** (`lib/resend.js`) :
```javascript
const FROM = process.env.RESEND_FROM || 'Yoppaa <onboarding@resend.dev>'
const ADMIN_EMAIL = 'alexandre@avcotech.be'
const RESEND_API_KEY = process.env.RESEND_API_KEY
```

**Wrappers** :
```javascript
envoyerAuAdmin({ subject, html })
envoyerAuCommercant({ to, subject, html })
```

**Templates** (déduits) :
- `emailNouveauCommercantAValider()` → admin
- `emailValidationCommercant()` → commerçant (validation OK)
- `emailRejetCommercant()` → commerçant (rejet + motif)
- `emailConfirmationCommande()` → client
- `emailCommandePreparation()` → commerçant (nouvelle commande)

**Design** : palette canonique YOPPAA, layout max 560px, CTA stylisés, inline styles (pas MJML).

**Routes API** : `/api/admin/valider`, `/api/admin/rejeter`. Direct : `/signup/page.js` étape 5, `/commander/[slug]/page.js` après commande.

**Erreurs** : non-bloquantes (log console, continue).

### 6.2 Push notifications — ⚠️ Partiel

✅ **Browser Notification API** dans dashboard commerçant :
- `dashboard/page.js:78-132` : `demanderPermissionNotif()`, `envoyerNotification(titre, body)`, `jouerSon()`, `jouerSonRetrait()`
- Sons : `/sounds/notification.mp3` + `/sounds/yop.mp3`
- Persistance localStorage `notifs = true/false`
- Polling 5s détecte changements

❌ **OneSignal / WebPush API** : non implémenté. Manque pour PWA mobile production.

❌ **Service Worker** : `manifest.json` + `manifest-dashboard.json` présents, mais pas de `sw.js` détecté.

### 6.3 SMS — ❌ Non implémenté

Aucune référence Twilio / Vonage / MessageBird.

---

## 7. SERVICES PUBLICS (Plan PUBLIC) — ⚠️

### 7.1 Module

✅ **Côté client** : `/commander/services/[slug]` opérationnel (lecture seule)
- Fiche : logo, couverture 16:9, type (commune/cpas/police/pompiers/ecole/urgence/medecin_garde/pharmacie_garde/autre)
- Infos : nom, description, téléphone, email_public, site_web, adresse (Google Maps), horaires_detail
- Périmètre : codes_postaux + flag `national` (Belgique entière)
- Alertes & Actualités : urgence=true → rouge prioritaire
- Bouton signalement discret

✅ **Onglet Officiel** sur `/commander` : liste services publics filtrés par commune + nationaux

❌ **Onboarding self-service** `/onboarding-public` : **N'EXISTE PAS**. Services publics sont créés manuellement par admin.

❌ **Dashboard public** `/dashboard-public` : **N'EXISTE PAS**.

### 7.2 Table `actualites`

```
id, commercant_id (FK NULL), service_id (FK services_publics NULL)
titre, contenu (text)
type ('actu' | 'alerte')
urgence (boolean)
date_debut, date_fin (date NULL)
actif (boolean)
created_at
```

**Logique d'affichage** :
- `urgence DESC, date_debut DESC` (priorité alertes)
- `actif=true` + dates valides aujourd'hui

❓ **Push immédiat** sur alertes : pas de mécanisme broadcast détecté dans le code client. À vérifier (Supabase Realtime ? Resend mass ?).

---

## 8. PRÉ-CRÉATION & ONBOARDING SELF-SERVICE — ✅

### 8.1 Drafts commerçants

`commercants.statut_publication ∈ { 'brouillon', 'en_attente', 'publie', 'refuse' }`
+ `motif_rejet` (text NULL)
+ `commercants.statut ∈ { 'en_cours_onboarding', 'valide' }`

❓ Champs `bce` / `numero_bce` / logique fusion BCE : **non détectés**. À vérifier en DB.

### 8.2 Tunnel `/signup` (5 étapes) — ✅ Complet

1. **Compte** : email + password (6+ char) + catégorie ('alimentaire'/'vitrine') + plan
   - `signUp()` + fallback `signInWithPassword()` (email verification OFF)
   - Insert `commercants` + `onboarding_commercants` + `plan_actif_depuis = NOW()`
   - `statut = 'en_cours_onboarding'`, `statut_publication = 'brouillon'`

2. **Infos** : nom, type, adresse (Nominatim Belgique), telephone, description (20+ char), lat/lng
   - Sauvegarde auto-debounce 600ms
   - Flag `onboarding_commercants.infos_ok = true`

3. **Visuels** : couverture + logo
   - Upload bucket `logos`
   - Validation : JPG/PNG/WEBP, 800px min, 8MB max
   - Warning portrait non-bloquant

4. **Horaires** : grille 7 jours `horaires_detail` jsonb
   - Bouton "Copier lundi → tous"
   - ≥1 jour ouvert requis

5. **Validation** : récap + soumission
   - `statut_publication = 'en_attente'`
   - Email Resend admin + commerçant
   - Admin manuel review via `/admin` → `'publie'` + email "Page live"

**Tracking** : `onboarding_commercants` (etape_actuelle, infos_ok, photo_ok, horaires_ok, completed_at)

### 8.3 Preview draft `/preview/[token]`

❌ **N'EXISTE PAS** dans le code.

---

## 9. GOOD MORNING YOPPERS — ✅

### 9.1 Module Phase 1 opérationnel

**Route** : `/commander/morning/page.js`

**Fonctionnalités** :
- ✅ Écran quotidien 7h30 (push backend à confirmer)
- ✅ Sélecteur commune (multisite)
- ✅ 2 onglets : Deals + Actualités
- ✅ Données **RÉELLES** depuis DB :
  - `yoppaa_deals` : `actif=true, inclus_morning=true, date_deal=today`
  - `actualites` : `actif=true, dates valides aujourd'hui`
  - Filtres commerçants : `statut_publication='publie'` + plan ∈ [LIVE, BOOST, MAX]
  - Filtre géo : codes postaux commune
- ✅ Animations cascade stagger 55ms
- ✅ Wordmark tricolore canonique (yo Ink / pp Main / ers Mid sur fond clair)
- ✅ CTA footer "Rendez-vous demain à 07h30" + Explorer

**Stockage** :
- `localStorage.morning_last_shown` : jour dernier affichage
- `sessionStorage.morning_commune_switch` : commune session

**Note code** : `morning/page.js:6` mentionne "données mockées" — ⚠️ **commentaire obsolète**, les données sont réelles.

### 9.2 Cron 07h30

❓ **Pas de cron job détecté dans le repo.** Probablement :
- Edge Function Supabase scheduled
- OU GitHub Actions
- OU service externe (Vercel Cron, Inngest, etc.)

**À vérifier manuellement.**

---

## 10. CONFIGURATION DASHBOARD COMMERÇANT — ✅

### 10.1 ConfigDashboard.js

`app/dashboard/ConfigDashboard.js` (2987 lignes) — **5 onglets complets** :

**Tab Menu** :
- Sous-tabs : Articles | Catégories | Personnalisation
- CRUD articles + catégories + options
- Stock par jour (interface 7 jours inline)
- Mode vitrine (masque stock + temps_prepa)
- `est_vitrine` → "à partir de X €" ou "Prix sur demande"

**Tab Deals** :
- CRUD yoppaa_deals
- Lien article optionnel (badge appliqué)
- Checkbox "Inclure dans Good Morning Yoppers"
- Deadline veille avant `heure_limite_morning` (défaut 23:00)
- Règle : max 1 deal/jour Morning (autres décochées auto)
- CTA "Appeler pour réserver" optionnel

**Tab Actus** :
- type ('actu' | 'alerte')
- date_debut / date_fin (permanente si vide)
- Affichage client filtré dates

**Tab Créneaux** :
- Config globale : `horizon_commande` (1-7j), `mode_capacite` ('commandes' | 'temps')
- Grille 7 jours : création manuelle ou génération auto
- Champs : heure_debut, heure_fin, max_commandes, capacite_temps, actif
- Copie vers autres jours
- Fermetures exceptionnelles (date_debut, date_fin, motif)
- **Fix** : suppression 1 par 1 pour éviter bug `.in()`

**Tab Signalements** :
- 8 types : ferme, horaires, adresse, telephone, articles, site_web, doublon, autre
- Statut : nouveau / enquete / resolu

### 10.2 Horaires détaillés (jsonb)

Format :
```json
{
  "lundi":    { "ouvert": true,  "debut": "09:00", "fin": "18:00" },
  "mardi":    { "ouvert": true,  "debut": "09:00", "fin": "18:00" },
  ...
  "dimanche": { "ouvert": false, "debut": null,    "fin": null }
}
```

UI config : Étape 4 signup + Tab Créneaux dashboard + sélecteur "Copier lundi → tous".

### 10.3 Table `creneaux`

Voir section 2.1 / C.

**Logique disponibilité côté client** :
- Affiché si : `actif=true` ET `heure_debut > now` (aujourd'hui) ET jour_semaine matche ET horaires commerçant ouvert
- Fermé si : `count(commandes) ≥ max_commandes` (par_commandes) ou `sum(temps_prepa) ≥ capacite_temps` (par_temps)

---

## 11. BUGS CONNUS / TODOs — ✅

### 11.1 TODO / FIXME

✅ **Zéro TODO/FIXME détecté** dans `app/**/*.{js,jsx,ts,tsx}` via grep.

### 11.2 Hacks documentés (commentaires `// FIX :`)

1. **`ConfigDashboard.js:1674-1684`** — Suppression créneaux 1 par 1 pour éviter bug `.in()` Supabase
2. **`commander/[slug]/page.js`** — Logique stock complexe : `article_stock_jour` source de vérité, fallback `articles.stock_jour` global, `commandes` du jour soustraites
3. **`commander/morning/page.js:6`** — Commentaire obsolète "Données encore mockées" (faux, c'est réel)
4. **`signup/page.js:392-394`** — Logique exclusion plan par catégorie

### 11.3 Bugs identifiés en cours de session

Corrigés pendant la refonte UI (commits récents) :
- ✅ Bug colonne `nom` recevait juste le prénom → corrigé après migration `clients` (prenom + telephone séparés)
- ✅ Perf `passerCommande` : 3 queries séquentielles → parallel via `Promise.all` (gain ~5-7s)
- ✅ Perf `getOuCreerClient` UPDATE inconditionnelle → conditionnelle (gain 1 RTT/commande)
- ✅ Detection iPad/tablet classifiée comme desktop → matchMedia `(hover) and (pointer: fine)`

---

## 12. POINTS D'ATTENTION POUR L'INTÉGRATION DU MODULE SERVICES (RDV) — 🟣

### 12.1 ⚠️ Collision de route critique

**`/commander/services/[slug]`** est **DÉJÀ UTILISÉE** pour les services PUBLICS (commune, police, pompiers, urgences).

**Options pour le module RDV (coiffeur, esthéticienne, barbier)** :

| Option | Pattern | Avantage | Inconvénient |
|---|---|---|---|
| A | `/commander/rdv/[slug]` | Distinction claire | Nouvelle route à créer |
| B | `/commander/[slug]` (réutiliser le slug existant des commerçants vitrine) | 0 nouvelle route, le slug commerçant a déjà toute l'info | Logique conditionnelle dans la page existante selon `categorie='vitrine'` |
| C | `/commander/services/[slug]` avec discriminateur DB | Réutilise nom logique | Risque énorme de confusion services PUBLICS vs services RDV |

**Recommandation : Option B** — exploiter le slug commerçant existant. Le commerçant vitrine (catégorie='vitrine') a déjà sa fiche `/commander/[slug]`. Le module RDV s'intègre dedans avec un sélecteur de prestation + créneau. Pas de nouvelle route.

### 12.2 Schéma DB — Tables RDV proposées

**Réutiliser** la table `creneaux` existante = ❌ déconseillé (mélange C&C alimentaire / RDV vitrine, statuts différents, logique différente).

**Nouvelles tables proposées** :

```sql
CREATE TABLE rdv_prestations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commercant_id uuid NOT NULL REFERENCES commercants(id) ON DELETE CASCADE,
  nom text NOT NULL,                       -- ex. "Coupe homme + barbe"
  description text,
  duree_minutes int NOT NULL,              -- ex. 30, 45, 60
  prix decimal(8,2),                       -- prix fixe (NULL = sur demande)
  prix_min decimal(8,2),                   -- fourchette si variable
  prix_max decimal(8,2),
  actif boolean DEFAULT true,
  ordre int,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE rdv_creneaux (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commercant_id uuid NOT NULL REFERENCES commercants(id) ON DELETE CASCADE,
  jour_semaine text,                       -- 'lundi'..'dimanche' OU NULL pour 1-off
  date_specifique date,                    -- pour exception ou planning ponctuel
  heure_debut time NOT NULL,
  heure_fin time NOT NULL,
  pas_minutes int DEFAULT 15,              -- granularité des slots (5/10/15/30)
  prestation_ids uuid[],                   -- prestations dispos sur ce créneau
  actif boolean DEFAULT true,
  created_at timestamp DEFAULT now()
);

CREATE TABLE rdv_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commercant_id uuid NOT NULL REFERENCES commercants(id),
  client_id uuid REFERENCES clients(id),
  client_email text NOT NULL,
  client_nom text NOT NULL,
  client_prenom text,
  client_telephone text NOT NULL,
  prestation_id uuid NOT NULL REFERENCES rdv_prestations(id),
  date_rdv date NOT NULL,
  heure_debut time NOT NULL,
  duree_minutes int NOT NULL,              -- copié de prestation (immutable)
  prix_estime decimal(8,2),
  statut text DEFAULT 'confirme',          -- 'confirme'|'annule_client'|'annule_commercant'|'honore'|'no_show'
  notes_client text,
  rgpd_marketing boolean DEFAULT true,
  numero_rdv int,                          -- numéro du jour (UX coiffeur)
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- Indexes recommandés
CREATE INDEX idx_rdv_reservations_commercant_date ON rdv_reservations(commercant_id, date_rdv);
CREATE INDEX idx_rdv_reservations_client ON rdv_reservations(client_id);
CREATE INDEX idx_rdv_creneaux_commercant ON rdv_creneaux(commercant_id);

-- RLS + GRANTS (cf memory feedback-supabase-grants)
GRANT SELECT ON rdv_prestations TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON rdv_prestations TO authenticated;
GRANT SELECT ON rdv_creneaux TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON rdv_creneaux TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON rdv_reservations TO authenticated;
```

### 12.3 Composants réutilisables

| Existant | Réutilisable pour RDV ? | Adaptations |
|---|---|---|
| `PillsStatut.js` | ✅ Oui | Étendre avec pill RDV (`canDo(plan, 'rdv')`) |
| `ConfirmCommune.js` | ✅ Oui (verbatim) | — |
| `ModalAvis.js` | ✅ Oui | Trigger post-RDV honoré (anti-troll, cf memory) |
| `ModalSignalement.js` | ✅ Oui | Ajouter type 'rdv_pas_honore' éventuellement |
| Créneau picker fiche commerce | ⚠️ Adapter | Pas de stock article ; granularité minutes au lieu d'heure ronde ; durée prestation variable |
| `SwipeRetrait` | ❌ Pas pertinent | Pas de retrait pour RDV (le client se présente, le commerçant marque "Honoré") |
| `ArticleRow` + `OptionsSelector` | ⚠️ Pattern réutilisable | Adapter en `PrestationRow` (prix, durée au lieu de quantité + options) |
| `RecapPanier` | ❌ Pas pertinent | RDV = 1 prestation, pas de panier multi-articles |
| `EditablePrenom` | ✅ Profil Yopper inchangé | — |

### 12.4 Conflits potentiels avec le système commandes

**Statuts** :
- C&C : `en_attente | en_preparation | pret | recupere | non_retire`
- RDV : `confirme | annule_client | annule_commercant | honore | no_show`

→ **Tables séparées** = pas de conflit, traitement dashboard distinct.

**Notifications** :
- C&C : email confirmation + push retrait commerçant
- RDV : email confirmation + iCal attachement (idéalement) + rappel J-1 SMS (futur)

→ Étendre `lib/resend.js` avec `emailConfirmationRdv()`, `emailRappelRdv()`, etc.

**Dashboard commerçant** :
- Onglet "Commandes" reste C&C
- ➕ Nouvel onglet "RDV" (visible si `categorie='vitrine'`)
- ConfigDashboard : tab "Prestations" + tab "Créneaux RDV" (visibles si `categorie='vitrine'`)

**Client app /commander** :
- Filtre catégorie distingue vitrines (RDV) vs alimentaire (C&C)
- Fiche commerçant vitrine : section "Prendre RDV" remplaçant section "Menu"

### 12.5 Plans tarifaires — Où placer le module RDV ?

**État actuel** (`lib/plans.js`) :
| Plan | Prix annuel | Catégorie | Features clés |
|---|---|---|---|
| ON | Gratuit | les 2 | présence + actus |
| LIVE | 299€ | les 2 | + photos + deals |
| BOOST | 799€ | alimentaire | + C&C + fidélité |
| MAX | 1290€ | alimentaire | + livraison |

**3 options pour le RDV** :

| Option | Description | Pros | Cons |
|---|---|---|---|
| A | RDV uniquement plan LIVE (vitrine) | Cohérent : vitrine paie pour features avancées | Frein adoption coiffeurs gratuits |
| B | **RDV gratuit dans ON pour vitrine** | Acquisition massive coiffeurs/esthé (vs Optios payant ~50€/mois) | Charge serveur, doit limiter (X RDV/mois ?) |
| C | RDV sur ON+LIVE vitrine | Compromis | Complexité UI tarification |

**Recommandation : Option B** (RDV gratuit dans ON pour vitrine) — alignée avec la stratégie d'acquisition Yoppaa (cf mémoire `project-brief-complet` et l'esprit "communauté locale"). Limite envisageable : 30 RDV/mois en plan ON, illimité en LIVE.

### 12.6 Intégrations externes existantes à respecter

- **Optios / Doctolib / Planity** : `commercants.url_reservation` + `label_reservation` permettent déjà un lien externe. Le module RDV natif **remplace** cette option pour ceux qui basculent (ne pas casser pour les autres).
- **Nominatim** : déjà intégré pour adresses, réutilisable.
- **Resend** : étendre avec templates RDV.
- **Notification API** : étendre dashboard avec son spécifique RDV (différencier du son commande).

### 12.7 Wishlist UX (basée sur les principes Yoppaa)

- ✅ **Esprit ODOO 3 clics max** (memory `feedback-zero-friction`) : prestation → date+heure → confirmation (avec coordonnées pré-remplies depuis Yopper)
- ✅ **Pas d'avis spontané** (memory `feedback-avis-anti-troll`) : avis uniquement après statut `honore`
- ✅ **Design system canonique** : bande 3px Ink→Main→Light, wordmark tricolore, SVG only, palette stricte
- ✅ **Confirmation à la "Yoppé !"** : écran type confirmation commande adapté ("RDV pris ! 🟣")
- ✅ **Pré-remplissage** : prenom/nom/email/telephone Yopper (data flow déjà en place)

### 12.8 Liste finale des risques à briefer à l'autre assistant

1. ❌ **NE PAS** créer `/commander/services/[slug]` pour RDV (collision services publics)
2. ❌ **NE PAS** mélanger `creneaux` (C&C) et `rdv_creneaux` (RDV) dans une seule table
3. ❌ **NE PAS** réutiliser `commandes` pour les RDV (statuts différents, logique différente)
4. ❌ **NE PAS** afficher l'option "RDV" sur les commerçants alimentaires (filtre `categorie='vitrine'`)
5. ❌ **NE PAS** casser `url_reservation` / `label_reservation` existant (vitrines actuelles avec Optios)
6. ✅ **DOIT** étendre `lib/plans.js` avec `rdv: true/false` par plan
7. ✅ **DOIT** respecter règle migration SQL séparée (memory `feedback-migrations-sql`) : fournir SQL à Alexandre, attendre son go
8. ✅ **DOIT** appliquer GRANT explicite (memory `feedback-supabase-grants`)
9. ✅ **DOIT** appliquer design system canonique (memory `feedback-visuel-yoppaa`)
10. ✅ **DOIT** prévoir avis post-RDV avec `commande_id` adapté (extension table `avis` pour `rdv_id` ?)

---

## RÉSUMÉ EXÉCUTIF

✅ **Le MVP Yoppaa est solide et fonctionnel** sur les axes principaux :
- Auth (3 types users)
- Onboarding commerçant 5 étapes
- Click & Collect alimentaire complet (commandes, créneaux, articles, options, deals, actus)
- Services publics côté client (lecture seule)
- Good Morning Yoppers (push 7h30)
- Dashboard commerçant complet
- Emails Resend
- Notifications système desktop

⚠️ **Gaps à compléter** :
- Stripe (SDK installé, pas activé — Phase 2)
- SMS (non implémenté)
- WebPush / Service Worker (manifests présents seulement)
- Onboarding services publics (`/onboarding-public` absent)
- Tests automatisés (zéro)
- RLS / Edge Functions / RPC : à vérifier dashboard Supabase

🟣 **Pour le module Services (RDV)** :
- **Route** : utiliser `/commander/[slug]` existant pour les vitrines (Option B), ne pas créer de nouvelle base de route
- **DB** : 3 nouvelles tables séparées (`rdv_prestations`, `rdv_creneaux`, `rdv_reservations`)
- **Plan tarifaire** : RDV gratuit dans plan ON pour vitrines (acquisition massive)
- **Composants réutilisables** : ~60% du code existant (pills, modales, signup data flow, design system canonique)
- **Migration SQL** : fournir à Alexandre pour qu'il la passe manuellement (memory)

---

**Document généré par audit code statique. Toutes les colonnes DB sont déduites du code source — schema SQL non disponible dans le repo.**
