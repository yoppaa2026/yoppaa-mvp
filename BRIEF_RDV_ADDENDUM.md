# ADDENDUM — Brief Module Services RDV

**Date** : 2026-05-30
**Contexte** : Corrections et clarifications à appliquer **EN PLUS** du brief original. À lire avant tout dev.
**Migration SQL associée** : `MIGRATION_RDV.sql` (à la racine du projet)

---

## 1. CORRECTIONS BLOQUANTES (toutes intégrées dans `MIGRATION_RDV.sql`)

### ✅ B1 — Ordre de création des tables
**Brief original** : `rdv_prestations` créée avant `rdv_praticiens` qu'elle référence.
**Fix appliqué** : ordre corrigé. `rdv_praticiens` créée en premier.

### ✅ B2 — Policies RLS séparées par action
**Brief original** : `FOR UPDATE, DELETE` (syntaxe PostgreSQL invalide).
**Fix appliqué** : 2 policies distinctes : "Commercant update ses RDV" et "Commercant delete RDV non honores".

### ✅ B3 — Contrainte CHECK avis avec `NOT VALID`
**Brief original** : ALTER TABLE qui peut planter sur données existantes.
**Fix appliqué** : `ADD CONSTRAINT ... NOT VALID` (n'applique qu'aux nouvelles lignes). Une query d'audit (`avis sans commande_id`) est dans l'étape 0. Après cleanup éventuel : `VALIDATE CONSTRAINT`.

### ✅ B4 — Compteur fidélité démarre à 1 + trigger automatique
**Brief original** : INSERT démarre à 0, premier RDV "perdu". Logique de reset au seuil non spécifiée.
**Fix appliqué** :
- INSERT avec `VALUES (..., 1)` pour la 1ère honoration
- Trigger `incrementer_fidelite_rdv` qui :
  - Incrémente le compteur au passage `→ honore`
  - Reset à 0 quand seuil atteint
  - Incrémente `recompenses_obtenues`
  - Set `recompense_dispo = true` (l'app peut consommer ce flag à la prochaine résa)

### ✅ B5 — Modèle Prestation ↔ Praticien : **N-N via junction table**
**Décision tranchée** : Junction table `rdv_prestation_praticiens`.
**Sémantique** :
- Plan PRO (pas de praticien explicite) → ignorer la junction
- Plan PRO+ avec junction VIDE pour une prestation → tous les praticiens du commerçant peuvent la faire (défaut)
- Plan PRO+ avec junction REMPLIE → seuls les praticiens listés peuvent la faire

**Impact côté app** :
```js
// Récupérer les praticiens autorisés pour une prestation (PRO+)
async function getPraticiensAutorises(prestation_id, commercant_id) {
  const { data: liens } = await supabase
    .from('rdv_prestation_praticiens')
    .select('praticien_id')
    .eq('prestation_id', prestation_id)

  if (liens.length === 0) {
    // junction vide = tous les praticiens du commerçant
    return await supabase.from('rdv_praticiens')
      .select('*').eq('commercant_id', commercant_id).eq('actif', true)
  }
  return await supabase.from('rdv_praticiens')
    .select('*').in('id', liens.map(l => l.praticien_id))
}
```

### ✅ B6 — Vitrines actuellement sur LIVE : **non-problème confirmé**
**Vérifié 2026-05-30** : `SELECT COUNT(*) FROM commercants WHERE categorie='vitrine'` = **0 lignes**.
→ Aucun grandfathering nécessaire. `lib/plans.js` peut purement restreindre `LIVE → categories: ['alimentaire']`.

---

## 2. CORRECTIONS IMPORTANTES (intégrées dans la migration)

### ✅ I1 — Soft delete pour conformité légale belge (7 ans)
**Conflit identifié** : §13.2 (DELETE) vs §11.4 (conservation 7 ans).
**Décision tranchée** : Soft delete avec colonne `deleted_at`.

**Politique DB** :
- Toutes les tables RDV ont une colonne `deleted_at timestamp`
- Tous les indexes sont conditionnels `WHERE deleted_at IS NULL`
- Tous les policies SELECT publiques excluent `deleted_at IS NOT NULL`
- **Hard DELETE bloqué en RLS pour `statut = 'honore'`** (fait économique)
- Hard DELETE autorisé pour les autres statuts (confirme/annule/no_show/reporte)

**Impact côté app** :
- Bouton "Supprimer définitivement" dans le dashboard :
  - Si statut ∈ {`confirme`, `annule_*`, `no_show`, `reporte`} → DELETE direct (la ligne disparaît)
  - Si statut = `honore` → UPDATE `deleted_at = now()` (la ligne reste en DB, invisible dans l'UI)
  - L'UI affiche "Supprimé" identique dans les deux cas — le commerçant ne voit pas la différence

**Argument terrain préservé** : le commerçant a "la main complète", l'agenda "est nickel". Conformité légale assurée en arrière-plan.

### ✅ I2 — Anti double-booking au niveau DB
**Fix appliqué** : `UNIQUE INDEX rdv_no_double_book` sur `(commercant_id, COALESCE(praticien_id, sentinel), date_rdv, heure_debut) WHERE statut IN ('confirme', 'honore') AND deleted_at IS NULL`.

**Impact côté app** :
- L'INSERT échouera avec erreur `23505` (unique_violation) si race condition
- Code app doit catch cette erreur et afficher "Ce créneau vient d'être pris, choisis-en un autre"
- Re-fetch les slots disponibles automatiquement après l'erreur

```js
try {
  await supabase.from('rdv_reservations').insert(payload)
} catch (err) {
  if (err.code === '23505') {
    // Race lost — recharger les slots et notifier user
    await rafraichirSlots()
    showToast('Créneau déjà pris à l\'instant, choisis-en un autre.')
  } else throw err
}
```

---

## 3. CORRECTIONS APPLICATIVES (PAS de SQL — côté code)

### I3 — Auth redirect doit préserver l'état RDV
Quand un Yopper non connecté tente de prendre RDV, l'auth redirect ne doit pas perdre l'état (prestation choisie + date + heure).

**Solution recommandée** :
```js
// Avant redirect vers /commander/auth :
sessionStorage.setItem('rdv_pending', JSON.stringify({
  commercant_slug, prestation_id, praticien_id, date, heure
}))
router.push(`/commander/auth?redirect=/commander/rdv/${slug}`)

// Au retour sur /commander/rdv/[slug] après login :
useEffect(() => {
  const pending = sessionStorage.getItem('rdv_pending')
  if (pending) {
    const state = JSON.parse(pending)
    sessionStorage.removeItem('rdv_pending')
    // Reprendre l'étape 3 (coordonnées) directement
    setEtape(3)
    setPrestationChoisie(state.prestation_id)
    setDateChoisie(state.date)
    setHeureChoisie(state.heure)
    // ...
  }
}, [])
```

### I4 — Refactor `lib/plans.js` : façades obligatoires
Le brief propose une nouvelle structure objet. Tous les usages existants doivent continuer à fonctionner.

**Stratégie** :
1. Faire un grep complet **avant** de toucher : `PLAN_LABEL|PLAN_PRIX|PLANS\[|canDo|plansDispoPourCategorie|isVitrine|isAlimentaire|getPillsStatut`
2. Conserver les exports existants (`PLAN_LABEL`, `PLAN_PRIX`, `PLANS` array) comme **façades** dérivées du nouvel objet :
```js
export const PLANS_OBJ = { on: {...}, live: {...}, ... }
// Façade pour l'existant
export const PLANS       = Object.keys(PLANS_OBJ)
export const PLAN_LABEL  = Object.fromEntries(Object.entries(PLANS_OBJ).map(([k, v]) => [k, v.nom]))
export const PLAN_PRIX   = Object.fromEntries(Object.entries(PLANS_OBJ).map(([k, v]) => [k, v.prix_annuel]))
```
3. `canDo(plan, feature)` et `plansDispoPourCategorie(categorie)` adaptés
4. Test : tous les écrans existants (dashboard, signup, admin, /commander) doivent fonctionner sans changement

### I5 — Good Morning Yoppers : étendre le filtre plan
**Code à modifier** : `app/commander/morning/page.js` — le filtre actuel `plan ∈ [LIVE, BOOST, MAX]` doit devenir `plan ∈ [LIVE, BOOST, MAX, PRO, PROPLUS]`.

Vérifier toutes les références à cette liste dans le code.

---

## 4. RECOMMANDATIONS UX/DESIGN

### R1 — Redirect 404-friendly
Si un user tape `/commander/[slug]` pour un commerçant vitrine (ex: liens externes anciens), faire un redirect serveur 301 → `/commander/rdv/[slug]`. Évite les 404.

### R2 — Onglets dashboard conditionnels
- `categorie='alimentaire'` → onglets ["Commandes", "Paramètres"]
- `categorie='vitrine'` + `rdv_actif=true` → onglets ["RDV", "Paramètres"]
- `categorie='vitrine'` + `rdv_actif=false` → onglets ["Paramètres"] uniquement, avec CTA "Activer le module RDV"

### R3 — Son de notification RDV distinct
Créer `/public/sounds/rdv.mp3` (différent de `notification.mp3` utilisé pour les commandes). Idéalement un son court, mélodique, sans urgence. Le commerçant doit distinguer auditivement "nouvelle commande" vs "nouveau RDV".

### R4 — Slot calculation : edge cases à gérer
Le pseudo-code §6.3 du brief doit gérer :
```js
// Pause : protéger contre pause_fin null
const dansLaPause = creneau.pause_debut && creneau.pause_fin && (
  slot < creneau.pause_fin && slotFin > creneau.pause_debut
)

// Praticien : ne filtrer que si défini (plan PRO ignore)
const filtrePraticien = praticien_id
  ? `praticien_id.eq.${praticien_id},praticien_id.is.null`
  : ''
```

### R5 — iCal timezone obligatoire
```
DTSTART;TZID=Europe/Brussels:20260515T090000
DTEND;TZID=Europe/Brussels:20260515T093000
```
Et inclure le bloc VTIMEZONE en début de fichier .ics pour les clients calendrier qui ne connaissent pas Europe/Brussels :
```
BEGIN:VTIMEZONE
TZID:Europe/Brussels
BEGIN:STANDARD
...
```
Utiliser une lib comme `ical-generator` ou template prêt à l'emploi.

### R6 — Estimation Phase 1 réaliste : 5-7 semaines
Le brief annonce 3-4 semaines. Réaliste : 5-7 semaines en dev concentré avec tests. Communiquer cette fourchette en interne.

### R7 — Sortir les tabs RDV de ConfigDashboard.js
**Fichier actuel** : 2987 lignes. Ajouter 5 tabs RDV → 4500+ lignes → ingérable.

**Stratégie** : créer dès le départ :
```
app/dashboard/tabs/rdv/
  ├─ TabPrestations.js
  ├─ TabPraticiens.js
  ├─ TabCreneauxRdv.js
  ├─ TabFidelite.js
  └─ TabRdvParametres.js
```
Importés dans `ConfigDashboard.js` comme composants externes.

### R8 — Yopper voit ses RDV : section dédiée
Dans `/commander` Profil, ajouter une section "Mes RDV" entre "Mes commandes" et "Mes favoris" :
```
┌─────────────────────────────────┐
│ Mes prochains RDV               │
├─────────────────────────────────┤
│ 🟣 Salon Clémence — Coupe femme  │
│ Jeudi 15 mai · 14h30             │
│ [Annuler]                        │
└─────────────────────────────────┘
```
+ Section historique "Mes RDV passés".

### R9 — RGPD notes commerçant
Ajouter aux CGU/Politique de confidentialité un paragraphe :
> "Le commerçant peut prendre des notes privées sur votre RDV (préférences, allergies, etc.). Ces notes vous sont communiquées sur simple demande à hello@yoppaa.app, conformément à votre droit d'accès RGPD."

### R10 — Acompte annulation (Phase 2 Stripe)
Politique à trancher avant l'activation Stripe :
- Si annulation > 24h : remboursement auto 100%
- Si annulation 0-24h : acompte gardé par le commerçant
- Configurable par commerçant via `rdv_delai_annulation_heures` et un nouveau `rdv_acompte_remboursable_si_delai_ok` (boolean) à ajouter au moment de Phase 2

---

## 5. RÉCAPITULATIF DES FICHIERS À CRÉER/MODIFIER

### Nouveaux fichiers
- `MIGRATION_RDV.sql` ✅ **DÉJÀ CRÉÉ** — à passer manuellement par Alexandre
- `/public/sounds/rdv.mp3` — son notification RDV distinct
- `app/commander/rdv/[slug]/page.js` — fiche RDV publique
- `app/dashboard/tabs/rdv/` — 5 fichiers tabs séparés
- `lib/ical.js` (ou usage `ical-generator`) — génération .ics
- Nouveaux templates dans `lib/resend.js` : `emailConfirmationRdv`, `emailRappelRdv`, `emailAnnulationRdvParCommercant`, `emailReportRdv`, `emailNouveauRdvCommercant`, `emailAnnulationParClient`

### Fichiers à modifier
- `lib/plans.js` — ajout PRO/PRO+ + restriction LIVE alimentaire (façades pour back-compat)
- `app/commander/page.js` — `getLienFiche()` route vers `/commander/rdv/[slug]` pour vitrines
- `app/commander/morning/page.js` — étendre filtre plan à [LIVE, BOOST, MAX, PRO, PROPLUS]
- `app/commander/auth/page.js` — préservation état RDV via sessionStorage (I3)
- `app/dashboard/page.js` — onglets conditionnels (R2)
- `app/dashboard/ConfigDashboard.js` — onglets services vs alimentaire conditionnels
- `app/signup/page.js` — plans PRO/PRO+ proposés pour catégorie vitrine
- `app/commander/[slug]/page.js` — redirect 301 vers /commander/rdv/[slug] si vitrine (R1)
- `app/commander/page.js` Profil — ajouter section "Mes RDV" (R8)

---

## 6. ORDRE D'EXÉCUTION RECOMMANDÉ

1. ✅ **Alexandre passe `MIGRATION_RDV.sql`** dans Supabase SQL Editor
2. Refactor `lib/plans.js` (façades + nouveaux plans PRO/PRO+)
3. Adapter `/signup` pour proposer PRO/PRO+ aux vitrines
4. Créer la page publique `/commander/rdv/[slug]` + routing depuis `/commander`
5. Créer les 5 tabs RDV du dashboard
6. Créer les templates Resend + iCal
7. Onglet RDV dashboard (vues jour/semaine/mois)
8. Notifications + son distinct
9. Section "Mes RDV" Profil Yopper
10. Tests end-to-end + check anti-double-booking en concurrence

---

## 7. VALIDATION FINALE PHASE 1

Reprendre les critères §18 du brief original. Ajouter :
- [ ] Soft delete fonctionne : un RDV honoré "supprimé" reste en DB mais invisible UI
- [ ] Double-booking impossible : 2 clients qui cliquent en même temps → 1 réussit, 1 voit message "déjà pris"
- [ ] Trigger fidélité OK : 10 RDV honorés → `recompense_dispo = true` + compteur reset à 0
- [ ] Cancel client RLS : un Yopper ne peut annuler QUE ses propres RDV au statut confirme
- [ ] Anti-troll avis : impossible de créer un avis sans `commande_id` NI `rdv_reservation_id`

---

🟣 **Document prêt pour transmission à l'autre assistant** avec `MIGRATION_RDV.sql` et le brief original.
