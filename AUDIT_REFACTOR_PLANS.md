# 🔍 Audit Refactor noms de plans — Yoppaa MVP

**Date :** 2026-06-02
**Branche :** `master`
**Périmètre étendu :** Refactor plans + élargi à dashboard admin, onboarding, Stripe Connect, manifests, emails, signaux Yoppers, pour zéro casse.

---

## 0. Avertissement préalable

Ce que cet audit **ne peut PAS faire seul** (et que tu devras valider/exécuter) :
- Les requêtes SQL Supabase (sections 2.1-2.4) — je n'ai pas accès à ta DB depuis le code. Je te les fournis prêtes à coller.
- L'exécution des migrations DB — par convention `feedback-migrations-sql`, tu lances les SQL manuellement.

Tout le reste est sourcé du code lu directement.

---

## 1. État actuel de `lib/plans.js`

### 1.1 Exports actuels ✅

[lib/plans.js](lib/plans.js) exporte :

| Export | Type | Rôle |
|---|---|---|
| `PLANS` | array | `['on', 'live', 'boost', 'max', 'pro', 'proplus']` |
| `PLAN_FEATURES` | object | Matrice plan × feature (booleans) — 6 plans × 11 features |
| `PLAN_LABEL` | object | Slug → label affiché (`'live'` → `'LIVE'`) |
| `PLAN_PRIX` | object | Tarifs `{ annuel, mensuel, label_annuel, label_mensuel }` par plan |
| `canDo(plan, feature)` | fn | Lit `PLAN_FEATURES[plan]?.[feature] ?? false` |
| `getPlanLabel(plan)` | fn | Retourne `PLAN_LABEL[plan] || 'ON'` |
| `isService(commercant)` | fn | `commercant?.est_service === true` |
| `isVitrine(commercant)` | fn | `commercant?.categorie === 'vitrine'` |
| `isAlimentaire(commercant)` | fn | `categorie === 'alimentaire'` ou absent |
| `plansDispoPourCategorie(categorie)` | fn | `'vitrine' → ['on','pro','proplus']` sinon `['on','live','boost','max']` |
| `detecterProviderReservation(url)` | fn | Détecte Optios/Doctolib/Planity/etc. depuis l'URL |
| `PROVIDERS_RESERVATION` | const local | Patterns regex providers réservation externe |
| `planRequisPour(feature)` | fn | Plus petit plan qui débloque la feature |
| `getPillsStatut(commercant, ...)` | fn | Calcule les 5 pills d'affichage selon plan+catégorie |

### 1.2 Valeurs de `plan` reconnues ✅

**Toutes** : `'on'`, `'live'`, `'boost'`, `'max'`, `'pro'`, `'proplus'`. C'est l'array `PLANS` qui est la source de vérité.

### 1.3 Signature `canDo(plan, feature)` ✅

```js
canDo(plan: string, feature: string): boolean
```

Features gérées (clés de `PLAN_FEATURES[plan]`) : `prix`, `photos`, `deals`, `actus`, `commande`, `livraison`, `fidelite`, `hardware`, `morning`, `rdv`, `multi_praticiens`.

### 1.4 Signature `plansDispoPourCategorie(categorie)` ✅

```js
plansDispoPourCategorie(categorie: 'vitrine' | 'alimentaire' | string): string[]
```

- `'vitrine'` → `['on', 'pro', 'proplus']`
- autre / défaut → `['on', 'live', 'boost', 'max']`

### 1.5 Autres helpers ✅

- `detecterProviderReservation(url)` — utilisé pour le bouton CTA "Réserver via Optios/Doctolib/..."
- `getPillsStatut(commercant, opts)` — pills statut affichées sur les cards client (`EN LIGNE`, `DEAL`, `ACTU`, `COMMANDE/RDV`, `LIVRAISON/FIDÉLITÉ`)
- `planRequisPour(feature)` — utilisé jamais en runtime visible (à confirmer en grep cross-impact)

⚠️ Note : `PROVIDERS_RESERVATION` n'est PAS exporté mais utilisé en interne par `detecterProviderReservation`.

---

## 2. État actuel DB Supabase (à exécuter par Alex)

### 2.1 Requête comptage par plan ❓ (à lancer)

```sql
SELECT plan, COUNT(*) as nb_commercants
FROM commercants
GROUP BY plan
ORDER BY nb_commercants DESC;
```

Cette info est **critique** pour décider la stratégie de migration. Si tu as 1 seul commerçant en prod (Dermaé en test), Big Bang OK. Si tu as > 10 commerçants en LIVE/BOOST/MAX, Façades obligatoires.

### 2.2 Vitrines avec lien externe ❓ (à lancer)

```sql
SELECT id, nom, slug, url_reservation, label_reservation, categorie, plan
FROM commercants
WHERE url_reservation IS NOT NULL OR label_reservation IS NOT NULL;
```

Suppression `url_reservation`/`label_reservation` confirmée → audit les commerçants qui en bénéficient AVANT suppression (perte fonctionnelle). En théorie remplacé par le module RDV natif.

### 2.3 Contraintes CHECK sur la colonne `plan` ✅

**Aucune contrainte CHECK trouvée** dans les migrations SQL (`MIGRATION_RDV.sql`, `MIGRATION_STRIPE.sql`, `MIGRATION_ADMIN_RLS.sql`, `SEED_DERMAE.sql`). Le grep `CHECK.*plan|plan IN \(|plan VARCHAR|plan TEXT` ne retourne rien. La colonne est probablement `text` libre côté DB.

→ **Pas de blocage DB pour ajouter `'full'`**, mais aussi pas de garde-fou. À voir si on veut ajouter une CHECK constraint à la migration finale (recommandé pour intégrité).

### 2.4 Indexes / RLS qui référencent `plan` ❓ (à vérifier en Supabase)

À vérifier manuellement dans Supabase :
```sql
-- Indexes
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND indexdef LIKE '%plan%';

-- Policies
SELECT tablename, policyname, qual, with_check
FROM pg_policies
WHERE qual LIKE '%plan%' OR with_check LIKE '%plan%';
```

D'après ce que j'ai grepé dans le code SQL local, je ne vois **aucune RLS policy qui filtre sur `plan`**. Les policies actuelles filtrent sur `auth.uid()`, `statut_publication`, `is_yoppaa_admin()`. Probablement zéro impact RLS. ⚠️ À confirmer en prod.

---

## 3. Fichiers impactés par les noms de plans

### 3.1 Mapping exhaustif des fichiers

| Fichier | Lignes | Ce qu'il fait | Action refactor |
|---|---|---|---|
| **[lib/plans.js](lib/plans.js)** | 8, 10-90, 92-99, 103-110, 113-119, 139-142 | Source de vérité unique : `PLANS`, `PLAN_FEATURES`, `PLAN_LABEL`, `PLAN_PRIX`, helpers. | 🔴 **Réécriture totale** — réduire à 3 plans (`on`, `full` alimentaire/vitrine, `public` si géré ici). Mais attention : `full` est-il un slug unique pour les 2 catégories ou 2 slugs différents (`full_alim`/`full_vitrine`) ? **À décider** (voir §7.1). |
| **[app/signup/page.js](app/signup/page.js)** | 5 (import), 237, 1177, 1401-1402, 1405-1411 | Etape1 propose les plans via `plansDispoPourCategorie`. Card affiche prix/label par plan. Etape5 récap "Plan choisi". | 🔴 Adapter `CardPlan` : retirer LIVE/BOOST/MAX/PRO/PRO+ feature descriptions, mettre 2 cards : ON (gratuit) + FULL (39,90 ou 59,90 selon catégorie). Renommer textes "Yoppaa Pro" si présents. |
| **[app/dashboard/ConfigDashboard.js](app/dashboard/ConfigDashboard.js)** | 4 (import), 2146 (url_resa), 2175, 2240-2256 (UI), 2315, 2931-2954 (peutPaiements) | Form profil : champs `url_reservation`/`label_reservation`. Onglet Paiements visible si `plan IN ('pro','proplus','boost','max')`. | 🟠 Retirer les blocs `url_reservation`/`label_reservation` du form + ApercuReservation. Adapter `peutPaiements` : `categorie==='vitrine' ? plan==='full' : plan==='full'` (juste `full`). |
| **[app/admin/page.js](app/admin/page.js)** | 61, 74, 321 | Affichage plan dans la liste admin (`c.plan.toUpperCase()`). | 🟢 Trivial : le `.toUpperCase()` continuera à marcher pour `'full'` → `'FULL'`. Vérifier qu'aucun mapping hardcodé. |
| **[app/admin/SectionTousCommercants.js](app/admin/SectionTousCommercants.js)** | 31-38 (`BADGE_PLAN`), 54 (select), 80 (filtre), 168, 193 | Filtre par plan, badge couleur par plan, affichage label. | 🟠 Remplacer `BADGE_PLAN` par mapping 3 plans. Le filtre "filtrePlan" recalibrer ses options. |
| **[app/admin/ModalEditCommercant.js](app/admin/ModalEditCommercant.js)** | 26 (PLANS local), 43, 66, 119, 208-211 | Définit `const PLANS = [...]` **dupliqué** (ne réimporte pas de plans.js !) + select dropdown. | 🔴 Important : retirer la duplication, **importer depuis `lib/plans.js`** pour cohérence. |
| **[app/commander/page.js](app/commander/page.js)** | 880 | `peutCommander = canDo(c.plan, 'commande')` côté homepage Yopper. | 🟢 Trivial : `canDo('full', 'commande')` doit retourner `true` → assurer dans `PLAN_FEATURES` refactorée. |
| **[app/commander/[slug]/page.js](app/commander/[slug]/page.js)** | 5 (import), 1292, 1295-1296, 1627, 1647, 1756, 1774, 1809, 1818 | Affichage fiche commerce client. `peutCommander`, `urlResa`/`labelResa`, conditions deals/actus/prix/livraison. | 🟠 Retirer `urlResa`/`labelResa` (suppression confirmée). Vérifier que toutes les `canDo()` matchent encore la nouvelle matrice. |
| **[app/commander/morning/page.js](app/commander/morning/page.js)** | 98 | **HARDCODÉ** : `const PLANS_OK = new Set(['live', 'boost', 'max'])` filtre Good Morning Yoppers (alimentaire payants). | 🔴 Critique : remplacer par `['full']` ou utiliser `canDo(plan, 'morning')` (cohérent avec `PLAN_FEATURES`). |
| **[lib/resend.js](lib/resend.js)** | 107, 156 | 2 emails mentionnent "**Yoppaa Pro**" (validation + rejet). | 🟠 Remplacer par "Yoppaa Business". Adapter aussi le tableau "Plan" ligne 113 (affichage upper). |
| **[public/manifest-dashboard.json](public/manifest-dashboard.json)** | 2, 3 | PWA manifest dashboard : `"name": "Yoppaa Pro"`, `"short_name": "Yoppaa Pro"`. | 🟠 Renommer en "Yoppaa Business". Les icônes `icon-pro-192.png` / `icon-pro-512.png` continuent à fonctionner mais pourraient être renommées plus tard. |
| **[app/login/page.js](app/login/page.js)** | 224 | Texte "Découvrir Yoppaa Pro →" en lien vers signup. | 🟢 Trivial : renommer texte. |
| **[app/auth/session/page.js](app/auth/session/page.js)** | 93, 98, 103 | 3 mentions "Yoppaa Pro" dans UI d'aide PWA. | 🟢 Trivial : renommer texte. |
| **[app/dashboard/layout.tsx](app/dashboard/layout.tsx)** | 36 | `appTitle.setAttribute('content', 'Yoppaa Pro')` (PWA `apple-mobile-web-app-title`). | 🟢 Trivial : renommer texte. |
| **[app/dashboard/page.js](app/dashboard/page.js)** | 919 | `<meta name="apple-mobile-web-app-title" content="Yoppaa Pro"/>`. | 🟢 Trivial : renommer texte. |
| **[app/legal/page.js](app/legal/page.js)** | 171, 174 | **Mention du forfait démarrage 125€ HTVA** dans CGV (article tarification). | 🔴 Critique légal : retirer mention du forfait 125€ + article 2 "Forfait démarrage" entier. Adapter le bénéfice Ambassadeurs en conséquence. |
| **[app/api/notify-yoppaa/route.js](app/api/notify-yoppaa/route.js)** | 13, 21 | API route reçoit `plan, success_pack` et les transmet au template email. | 🟢 Trivial : aucun changement de logique, juste s'assurer que la valeur transmise est bien `'full'` après refactor. |
| **[app/legal/page.js (sécurité légale)](app/legal/page.js)** | (à scanner) | Tarifs précis dans la page ? | ❓ Vérifier toutes mentions de prix dans `/legal/page.js` (29,90 / 79,90 / 129,90 / 34,90 / 49,90 → remplacer par 39,90 / 59,90 ou nouveaux tarifs). |

**Fichiers à dupliquer pour mémoire**: La constante `const PLANS = [...]` est définie 2× :
1. `lib/plans.js` ligne 8 (source de vérité, exportée)
2. `app/admin/ModalEditCommercant.js` ligne 26 (duplication locale, à supprimer)

### 3.2 Total impact

- **17 fichiers** identifiés contenant logique ou affichage liés aux plans
- **2 fichiers** PWA manifest concernés ("Yoppaa Pro")
- **6 fichiers** UI mentionnent "Yoppaa Pro" textuellement
- **1 fichier** SQL legal (CGV) avec mention forfait 125€
- **0 fichier de test** (aucun test automatisé dans le projet sauf node_modules)

---

## 4. Emails Resend et templates

### 4.1 Mentions de plans/tarifs dans `lib/resend.js` ✅

| Fonction email | Ligne | Mention |
|---|---|---|
| `emailNouveauCommercantAValider` | 107 | Phrase d'intro : « soumettre son inscription **Yoppaa Pro** » |
| `emailNouveauCommercantAValider` | 113 | Tableau récap : ligne "Plan" affiche `${(plan \|\| 'on').toUpperCase()}` — fonctionnera pour `'FULL'` |
| `emailNouveauCommercantAValider` | 115 | Tableau récap : ligne "Success Pack" si `success_pack` présent — à conserver ou supprimer selon le nouveau modèle |
| `emailRejetCommercant` | 156 | « ta demande **Yoppaa Pro** nécessite quelques ajustements » |

### 4.2 Autres templates email ✅

- `emailValidationCommercant` (ligne 126) — ne mentionne aucun plan, OK.

Les **6 templates email RDV** mentionnés dans la todo RDV-9 **ne sont pas encore écrits**. Quand on les écrira, attention à n'utiliser que le nouveau nommage.

---

## 5. Pages UI à modifier

### 5.1 `/signup/page.js` — proposition des plans ✅

- **Etape 1** ([app/signup/page.js:228-325](app/signup/page.js#L228)) : `Etape1Compte` propose `categorie` (alimentaire/vitrine) puis `plan` filtré via `plansDispoPourCategorie(categorie)`.
- **Etape 5** ([app/signup/page.js:1177](app/signup/page.js#L1177)) : récap final affiche `PLAN_LABEL[commercant.plan]`.
- **Composant `CardPlan`** ([app/signup/page.js:1400-1428](app/signup/page.js#L1400)) : carte tarifaire avec `PLAN_PRIX[plan]` + `features[plan]` (description hardcodée par plan).
- ⚠️ **Aucune étape "Paiement" dans l'onboarding actuel** — l'inscription crée juste le commerçant en `statut: 'en_cours_onboarding'` avec son plan choisi, sans abonnement Stripe Subscriptions. La facturation est faite hors-flow (à confirmer). Si STRIPE-FUTUR introduit Stripe Subscriptions pour les plans FULL, étape paiement à ajouter ici.

### 5.2 `/dashboard/page.js` + `ConfigDashboard.js` — affichage plan ✅

- [app/dashboard/page.js](app/dashboard/page.js) : aucune mention `commercant.plan` directe au runtime (sauf l'écran de chargement initial). Le plan est lu via les helpers (`canDo`).
- [app/dashboard/ConfigDashboard.js:2931-2954](app/dashboard/ConfigDashboard.js#L2931) : conditionne les onglets visibles :
  - `peutDeals = canDo(plan, 'deals')`
  - `peutActus = canDo(plan, 'actus')`
  - `peutPaiements = (vitrine && plan IN ['pro','proplus']) || (!vitrine && plan IN ['boost','max'])` ← **dur-codé, à refactor**.

❓ **Aucun CTA d'upgrade visible** trouvé dans le dashboard (genre bouton "Passer à FULL" si plan ON). Probablement à concevoir.

### 5.3 `/commander/[slug]/page.js` — comportements selon plan ✅

10 occurrences `canDo(commercant.plan, ...)` pour conditionner :
- `peutCommander` (ligne 1292)
- Affichage `actualites` (1627)
- Affichage `dealActif` (1647)
- `masquerPrix` (1756, 1774, 1809)
- `livraison` (1818)
- Bouton réservation externe `urlResa`/`labelResa` (1295-1296) ← **à supprimer**

### 5.4 `/commander/morning/page.js` — filtre 🔴 critique ✅

[app/commander/morning/page.js:98](app/commander/morning/page.js#L98) : `const PLANS_OK = new Set(['live', 'boost', 'max'])` filtre les deals et actus du Good Morning Yoppers (seuls les commerçants payants alimentaires apparaissent).

→ **Cause de bug si refactor mal fait** : un commerçant qui passe de `boost` → `full` doit toujours apparaître. Solution propre : `canDo(c.plan, 'morning')` à la place du Set hardcodé.

### 5.5 `/admin` — affichage plans ✅

- [app/admin/page.js:321](app/admin/page.js#L321) : badge `c.plan.toUpperCase()` dans la card "à valider".
- [app/admin/SectionTousCommercants.js](app/admin/SectionTousCommercants.js) : filtre par plan dropdown + badges colorés `BADGE_PLAN`.
- [app/admin/ModalEditCommercant.js](app/admin/ModalEditCommercant.js) : select dropdown édition plan (PLANS dupliqué localement).

### 5.6 Manifests PWA ✅

| Fichier | Nom actuel | Action |
|---|---|---|
| [public/manifest.json](public/manifest.json) | "Yoppaa" / "Yoppaa" | ✅ Aucun changement (c'est le manifest client public, pas pro) |
| [public/manifest-dashboard.json](public/manifest-dashboard.json) | "**Yoppaa Pro**" / "**Yoppaa Pro**" | 🔴 Renommer en "Yoppaa Business" |

⚠️ **Attention iOS PWA** : changer `name`/`short_name` dans le manifest **ne change pas immédiatement** le label sur l'écran d'accueil des utilisateurs qui ont déjà ajouté la PWA. Ils doivent supprimer et réinstaller. Communiquer aux commerçants existants.

---

## 6. Mécanisme signaux Yoppers (`/commander/[slug]`)

### 6.1 Côté Yopper ❌ **NON IMPLÉMENTÉ**

Recherche exhaustive (`grep signaux|demandes_yopper|demande_yopper|signal_yopper|signaler|interesse|interest`) → seuls résultats :
- `app/commander/page.js` (probablement `signalements` = autre feature)
- `app/commander/ModalSignalement.js` = **signalements de contenu abusif** (≠ signaux Yoppers)

→ **Aucune table dédiée**, **aucun composant**, **aucun bouton "Je demande à X d'activer Y"**, **aucun anti-spam**. C'est du **développement à faire from scratch** si Alex veut ce mécanisme.

### 6.2 Côté Dashboard Business ❌ **NON IMPLÉMENTÉ**

Pas de compteur signaux, pas d'email récap. À concevoir si voulu.

---

## 7. Risques et points d'attention

### 7.1 Risques identifiés 🔴

#### Risque 1 — **Ambiguïté du nouveau slug `'full'`**
Si on utilise un seul slug `'full'` pour les 2 catégories (alimentaire 59,90€ ET vitrine 39,90€), il faut **toujours croiser avec `categorie`** pour connaître le prix réel.
- ✅ Avantage : matrice PLAN_FEATURES plus simple
- ❌ Inconvénient : tout le code qui affiche un prix doit lire `categorie` ET `plan`
- Alternative : 2 slugs `'full_alim'` / `'full_vitrine'`. Plus verbeux mais auto-documenté.

⚠️ **Décision à prendre AVANT codage** : `'full'` unique ou `'full_alim'`/`'full_vitrine'` ? Recommandation : **slug unique `'full'`**, prix calculé via helper `getPrixPlan(plan, categorie)`.

#### Risque 2 — **Commerçants en cours d'onboarding avec ancien plan**
Si un commerçant a démarré son signup hier avec `plan_choisi='live'` dans `onboarding_commercants`, il faut soit migrer la valeur, soit conserver l'ancien mapping en lecture.

#### Risque 3 — **Stripe Connect onboarding et abonnement**
**Important pour le sprint Stripe en cours** : la condition `peutPaiements` dans [ConfigDashboard.js:2952-2955](app/dashboard/ConfigDashboard.js#L2952) gate l'onglet "Paiements" sur `plan IN ('pro','proplus','boost','max')`. Après refactor → `plan === 'full'` seulement. Si un commerçant test (Dermaé) a son `plan` figé sur `'pro'` en DB, il **perd l'accès à l'onglet Paiements** au moment du refactor sauf si migration DB simultanée.

→ **Coordonner refactor + migration DB Dermaé** dans une seule transaction logique.

#### Risque 4 — **Good Morning Yoppers**
Si on rate la mise à jour de `PLANS_OK` dans [morning/page.js:98](app/commander/morning/page.js#L98), les commerçants `'full'` n'apparaîtront **plus** dans Good Morning Yoppers. Bug invisible côté admin (les commerçants restent visibles dans /admin et /commander), mais visibles dans la fonction critique 7h30.

#### Risque 5 — **CGV et obligations légales**
[app/legal/page.js:171-174](app/legal/page.js#L171) mentionne le forfait 125€ HTVA. Garder cette mention serait du **faux engagement contractuel**. À retirer en même temps que le refactor.

#### Risque 6 — **PWA "Yoppaa Pro" déjà installée**
Les commerçants existants qui ont la PWA "Yoppaa Pro" sur leur écran d'accueil garderont l'ancien nom jusqu'à réinstallation. Pas critique mais à communiquer.

#### Risque 7 — **`PLAN_PRIX` retiré → CardPlan crash**
Si tu retires `PLAN_PRIX['live']` mais qu'un commerçant existant a `plan='live'`, le signup `Etape5Validation` qui lit `PLAN_LABEL[commercant.plan]` retournera `undefined`. À vérifier dans `CardPlan` (lignes 1401-1402) — protège via fallback ou keep mapping rétrocompatible.

### 7.2 Fichiers de tests automatisés ✅

**Aucun test automatisé Yoppaa** dans le projet (uniquement `node_modules`). Donc aucun test à mettre à jour, mais aussi **aucun filet de sécurité** pour détecter une régression. Recommandation : ajouter au moins un test unitaire `lib/plans.test.js` pour la nouvelle matrice.

### 7.3 Migrations SQL existantes liées aux plans ✅

Aucune des 3 migrations passées (`MIGRATION_RDV.sql`, `MIGRATION_STRIPE.sql`, `MIGRATION_ADMIN_RLS.sql`) **ne contient** de référence à des valeurs spécifiques de `plan`. La colonne `plan` est libre côté DB (pas de CHECK constraint, pas d'enum). Bonne nouvelle : la migration de données sera un simple `UPDATE`.

---

## 8. Recommandations de stratégie

### Mon verdict : **Stratégie B — Façades rétrocompatibles** (avec exception possible)

#### Pourquoi B et pas A
- **17 fichiers impactés** dont 4-5 critiques (signup, dashboard config, morning, admin)
- Aucun test automatisé pour valider la cohérence post-migration
- La synchronisation **code prod + DB Supabase + Stripe Connect (Dermaé)** doit être parfaite, sinon `peutPaiements` peut désactiver l'onglet Paiements en plein milieu d'un test E2E
- Risque #7 : casser `PLAN_LABEL[plan]` pour un commerçant pas encore migré → écran undefined dans CardPlan

#### Sauf si...
**Si la query 2.1 retourne 0 ou 1 commerçant en LIVE/BOOST/MAX/PRO/PRO+** (cas plausible vu que tu es en phase test), alors **Stratégie A (Big Bang)** devient acceptable et bien plus rapide :
1. Migrer DB en UPDATE direct (`live`→`on`, `boost`/`max`/`pro`/`proplus`→`full`)
2. Refactor code en 1 PR
3. Push, tester immédiatement

#### Plan d'exécution B (façades)
1. **Phase 1 — Code rétrocompatible (2-3h)** : `lib/plans.js` accepte les 2 schémas. `PLAN_FEATURES['full']` ajoutée comme alias de `PLAN_FEATURES['max']` (alim) ou `PLAN_FEATURES['proplus']` (vitrine). `getPlanLabel('full')` retourne `'FULL'`. `plansDispoPourCategorie` propose `['on','full']`. UI signup montre seulement `on` + `full`.
2. **Phase 2 — UI nouveaux noms (1-2h)** : Renommer "Yoppaa Pro" → "Yoppaa Business" partout. Retirer `url_reservation`/`label_reservation` du form. Adapter `BADGE_PLAN` admin.
3. **Phase 3 — Migration DB (15 min)** : Tu lances l'UPDATE SQL manuellement après ma fourniture du script.
4. **Phase 4 — Cleanup ancien (1h, après 30 jours)** : Retirer `PLAN_FEATURES['live'/'boost'/'max'/'pro'/'proplus']` et `PLAN_LABEL` correspondants. CGV propre.

---

## ═══════════════════════════════════════════════════════

## 📊 Récapitulatif exécutif

**Commerçants impactés** : ❓ inconnu jusqu'à exécution de la query 2.1. Probable < 5 (tu es en test, Dermaé seul commerçant validé Stripe).

**Fichiers à modifier** : **17 fichiers** + 2 manifests + 1 page légale = **20 fichiers** au total.
- 🔴 4 critiques (`lib/plans.js`, `signup`, `morning`, `legal`)
- 🟠 4 importants (`ConfigDashboard`, `SectionTousCommercants`, `ModalEditCommercant`, `resend.js`)
- 🟢 12 triviaux (renommages Yoppaa Pro → Yoppaa Business, badges)

**Décisions ouvertes** à valider avant code :
1. Slug `'full'` unique ou `'full_alim'`/`'full_vitrine'` ? (recommandé : unique + helper `getPrixPlan(plan, categorie)`)
2. Mécanisme "signaux Yoppers" : à coder from scratch (table + UI Yopper + UI Business + email récap) ou repoussé ?
3. `success_pack` dans onboarding : on garde ou on retire avec le forfait 125€ ?
4. Conserver le slug `live` comme alias rétrocompatible 30 jours, ou hard-deprecate ?

**Stratégie recommandée** : 🟠 **Stratégie B — Façades rétrocompatibles** par défaut, **A (Big Bang) acceptable si query 2.1 < 5 commerçants en plans deprecated**.

**Estimation temps de dev** :
- Stratégie A (Big Bang) : **3-4h** (refactor + migration + tests manuels)
- Stratégie B (Façades) : **5-7h** total répartis sur 2 phases (Phase 1-2 maintenant 4h, Phase 4 cleanup +1-2h dans 30j)
- En supplément : "signaux Yoppers" si décidé = **+4-6h** (table SQL + 2 UI + email).

**À me dire avant que je code** :
1. Le résultat de la query 2.1 (pour choisir A ou B)
2. Décisions 1-4 ci-dessus
3. Ordre de priorité : refactor plans **d'abord** vs continuer STRIPE-7/8/9 **d'abord** ?

---

*Audit produit par Claude Opus 4.7 le 2026-06-02. Sources : lecture directe du code et des migrations SQL locales. Aucune donnée DB live consultée.*
