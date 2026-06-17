# Master Features Yoppaa

> **Source unique de vérité** pour toutes les fonctionnalités Yoppaa, leurs descriptions officielles, leur disponibilité par plan, et le vocabulaire de marque associé.
>
> 📌 À mettre à jour à chaque ajout ou modification d'une feature dans `lib/plans.js`.
> 📌 Toutes les UI (signup, dashboard, fiche `/commander/[slug]`, emails, landing, pitch deck, slides commerciales) doivent référencer ce document.
> 📌 Document maintenu par : Alex Verstappen (Avcotech SRL). Dernière révision : 2026-06-17.

---

## 1. Glossaire fondamentaux Yoppaa

Les concepts de base que tout le monde (commerçant, équipe, partenaire) doit comprendre de la même façon.

### Yoppaa
La plateforme. Application mobile + tableau de bord web qui connecte les commerces locaux à leurs clients d'un même quartier. Belgique, démarrage Mettet.

### Yopper
Le client final. Un habitant qui utilise l'application Yoppaa pour découvrir, suivre et soutenir les commerces de son quartier. Les Yoppers voient les fiches commerçants, mettent en favori, envoient des signaux, reçoivent des notifications, passent commande ou réservent.

### Yoppé
Confirmation contextuelle pour Click & Collect : *"Ta commande est Yoppée !"*. Pour les RDV on dit *"C'est noté !"*. Toujours violet 🟣.

### Commerçant
L'utilisateur professionnel. Crée son compte, choisit une formule (Exister, Communiquer, Vendre), configure sa fiche, reçoit ses Yoppers.

### Favori
Quand un Yopper met un commerçant en favori, il choisit de le suivre. Le commerçant voit ses favoris dans ses statistiques. Le favori est le canal d'engagement principal : les actus, deals et push ciblés sont envoyés en priorité aux favoris.

### Signal
Un Yopper envoie un signal au commerçant pour exprimer un intérêt sans commander tout de suite : *"j'aimerais ce produit"*, *"je passerais bien demain"*, *"tenez-moi au courant"*. Le commerçant reçoit le signal dans son tableau de bord et peut y répondre.

### Good Morning Yoppers (GMY)
Push notification quotidien envoyé chaque matin à **7h30** aux Yoppers de la zone du commerçant. Variable selon le plan :
- **Exister** : le commerçant apparaît dans le GMY avec sa fiche basique + peut publier 1 actu visible
- **Communiquer / Vendre** : le commerçant peut faire remonter deals, actus et créneaux du jour
- **Public** : la commune ou administration publie ses propres infos/alertes pour les habitants

Pour qu'un contenu apparaisse dans le GMY du lendemain, il doit être publié avant **23h00 la veille**.

### Actualité
Une nouvelle publiée par le commerçant : nouveau produit, événement, créneau libre, changement d'horaires, etc. Affichée en bandeau sur la fiche du commerçant. Envoyée en push aux Yoppers favoris (selon plan).

### Deal
Une promotion limitée dans le temps (durée définie par le commerçant). Affichée en bandeau sur la fiche, envoyée en push aux Yoppers favoris. Peut être catégorisée *"Bonne affaire"* pour apparaître dans la section dédiée de l'app.

### Alerte
Information urgente : fermeture exceptionnelle, rupture, indisponibilité. Bandeau rouge prioritaire sur la fiche, push immédiat aux Yoppers favoris.

### Bonnes affaires
Section spécifique de l'app Yoppaa qui regroupe tous les deals des commerçants marqués comme *"Bonnes affaires"*. Pour Communiquer et Vendre uniquement.

### Push ciblé
Notification push envoyée par le commerçant uniquement à ses Yoppers favoris. Le commerçant choisit le moment et peut segmenter (par centre d'intérêt, par ancienneté du favori, par dernière interaction).

### Newsletter ciblée
Email envoyé par le commerçant à ses Yoppers favoris, avec possibilité de segmentation. Idéal pour les communications plus longues qu'un push.

### IA Yoppaa
- **IA bridée** (Communiquer) : reformulation de textes, suggestions d'idées d'actus, correction orthographique. Limites de tokens par mois.
- **IA avancée** (Vendre) : rédaction complète de textes, segmentation automatique des Yoppers, analyse de performance, benchmarking concurrentiel. Limites étendues.

### Plans Yoppaa
- **Exister** (gratuit à vie) : présence simple
- **Communiquer** (19,90 € HTVA/mois, essai 30 jours) : communication active
- **Vendre** (49,90 € HTVA/mois, essai 30 jours) : transactionnel complet
- **Public** (gratuit à vie, sur invitation) : administrations communales et services publics

### Catégories de commerce
- **Alimentaire** : Click & Collect, livraison, réservation table (boulangerie, friterie, traiteur, restaurant…)
- **Service** (= "vitrine" dans le code) : RDV, prestations (coiffeur, opticien, esthéticienne, garagiste…)
- **Détail** : réservation produit, retrait en magasin (vêtements, chaussures, fleuriste, librairie…)
- **Publique** : services et administrations communales (mairie, CPAS, syndicat d'initiative…)

---

## 2. Matrice synthétique des features par plan

Légende : ✅ inclus · ❌ non inclus · 🎯 plan recommandé · 📦 boutique optionnelle

| Feature | Exister | Communiquer | Vendre | Public |
|---|:-:|:-:|:-:|:-:|
| **Visibilité** | | | | |
| Fiche commerce (vitrine) | ✅ | ✅ | ✅ | ✅ |
| Prix affichés sur la fiche | ✅ | ✅ | ✅ | ❌ |
| Photos + galerie illimitée | ✅ | ✅ | ✅ | ✅ |
| Horaires détaillés (jour par jour) | ✅ | ✅ | ✅ | ✅ |
| Description longue | ✅ | ✅ | ✅ | ✅ |
| **Référencement** | | | | |
| Apparition dans `/commander` | ✅ | ✅ | ✅ | ✅ |
| Référencement Google (SEO + sitemap + schema.org) | ✅ | ✅ | ✅ | ✅ |
| Recherche par catégorie | ✅ | ✅ | ✅ | ✅ |
| **Engagement client** | | | | |
| Favoris (Yoppers te suivent) | ✅ | ✅ | ✅ | ✅ |
| Signaux des Yoppers | ✅ | ✅ | ✅ | ❌ |
| **Statistiques** | | | | |
| Stats de base (vues, favoris) | ✅ | ✅ | ✅ | ✅ |
| Historique d'activité | ✅ | ✅ | ✅ | ✅ |
| Stats signaux | ✅ | ✅ | ✅ | ❌ |
| Stats détaillées (engagement push, ouvertures, etc.) | ❌ | ✅ | ✅ | ❌ |
| **Good Morning Yoppers** | | | | |
| Apparition automatique dans GMY | ✅ | ✅ | ✅ | ✅ |
| Publier 1 actu/jour dans GMY | ✅ | ✅ | ✅ | ❌ |
| Apparition prioritaire dans GMY | ❌ | ✅ | ✅ | ❌ |
| **Communication** | | | | |
| Actualités illimitées (page fiche + push) | ❌ | ✅ | ✅ | ✅ |
| Deals (promotions limitées) | ❌ | ✅ | ✅ | ❌ |
| Mise en avant Bonnes affaires | ❌ | ✅ | ✅ | ❌ |
| Push ciblés aux Yoppers favoris | ❌ | ✅ | ✅ | ❌ |
| Newsletter ciblée + segmentation | ❌ | ✅ | ✅ | ❌ |
| Alertes (bandeau rouge prioritaire) | ❌ | ✅ | ✅ | ✅ |
| **IA Yoppaa** | | | | |
| IA bridée (reformulation, suggestions, correction) | ❌ | ✅ | ✅ | ❌ |
| IA avancée (rédaction, segmentation auto, benchmarking) | ❌ | ❌ | ✅ | ❌ |
| **Transactionnel** | | | | |
| Click & Collect *(catégorie alimentaire)* | ❌ | ❌ | ✅ | ❌ |
| Livraison *(catégorie alimentaire)* | ❌ | ❌ | ✅ | ❌ |
| Réservation de table *(restaurant alimentaire)* | ❌ | ❌ | ✅ | ❌ |
| RDV natif *(catégorie service)* | ❌ | ❌ | ✅ | ❌ |
| Multi-praticiens *(catégorie service)* | ❌ | ❌ | ✅ | ❌ |
| Réservation produit *(catégorie détail)* | ❌ | ❌ | ✅ | ❌ |
| Paiement en ligne (Stripe Connect, 0 % commission) | ❌ | ❌ | ✅ | ❌ |
| Encaissement cash en boutique | ❌ | ❌ | ✅ | ❌ |
| Fidélité configurable | ❌ | ❌ | ✅ | ❌ |
| Export comptable (CSV / PDF) | ❌ | ❌ | ✅ | ❌ |
| **Spécifique Public** | | | | |
| Push notifications de zone (code postal) | ❌ | ❌ | ❌ | ✅ |
| Alertes urgentes (sécurité, coupures, etc.) | ❌ | ❌ | ❌ | ✅ |

---

## 3. Boutique Yoppaa (4 produits cumulables)

Disponibles à l'inscription **ET** à tout moment depuis le tableau de bord.

### Success Pack on-site (199 € HTVA)
- **Type** : Service humain
- **Pour qui** : tous les commerçants qui veulent un coup de pouce au démarrage
- **Contenu** :
  - Photos pro du commerce (intérieur, extérieur, équipe, produits)
  - Setup complet du menu (alimentaire) ou des prestations (service) ou du catalogue (détail)
  - Formation équipe (1 heure)
  - Suivi à J+30 pour ajustements
- **Délai** : intervention sous 7 jours ouvrés
- **Zone** : rayon 50 km autour de Mettet pour démarrer

### Kit Yoppaa Pro (399 € HTVA)
- **Type** : Hardware complet
- **Contenu** : Tablette tactile + imprimante thermique + connecteur
- **Pour qui** : surtout les commerces alimentaires avec retrait fréquent (Click & Collect). Plug-and-play livré prêt à l'emploi.
- **Note importante** : les commerces de service et de détail peuvent gérer leur activité depuis n'importe quel téléphone, tablette ou PC. Le Kit Pro est totalement optionnel.

### Kit Yoppaa Light (179 € HTVA)
- **Type** : Hardware light
- **Contenu** : Imprimante thermique seule (à connecter au téléphone ou tablette existants)
- **Pour qui** : surtout les commerces alimentaires. Imprime tickets de commande, bons de retrait, étiquettes produits.

### Rouleau d'étiquettes (44,90 € HTVA)
- **Type** : Consommable
- **Contenu** : Recharge papier thermique compatible Kit Pro et Kit Light
- **À commander** : quand le commerçant est à court, depuis son tableau de bord

---

## 4. Détail par feature (description officielle)

Cette section sert de copywriting de référence pour toutes les UI.

### 🪟 Visibilité & présence

#### Fiche commerce (vitrine en ligne)
**Description officielle** : Ta page publique sur Yoppaa. Elle affiche ton nom, ton activité, tes horaires, tes photos, ta description et toutes tes informations de contact. Accessible depuis l'application Yoppaa, depuis Google et depuis n'importe quel navigateur web.
**Flag `lib/plans.js`** : `vitrine`
**Disponible avec** : Exister · Communiquer · Vendre · Public

#### Prix affichés
**Description officielle** : Tu peux afficher les prix de tes produits ou prestations directement sur ta fiche. Les Yoppers savent exactement combien ils vont payer avant même de te contacter.
**Flag** : `prix_affiches`
**Disponible avec** : Exister · Communiquer · Vendre (PAS Public car secteur non marchand)

#### Photos & galerie illimitée
**Description officielle** : Ajoute autant de photos que tu veux à ta fiche : photo principale (vue extérieure recommandée), galerie produit, ambiance, équipe.
**Flag** : `photos`, `galerie_illimitee`
**Disponible avec** : tous les plans

#### Horaires détaillés
**Description officielle** : Configure tes horaires jour par jour, avec pauses déjeuner si tu veux. Tu peux aussi gérer les exceptions ponctuelles (jour férié, fermeture exceptionnelle, événement spécial).
**Flag** : `horaires_detail`
**Disponible avec** : tous les plans

#### Description longue
**Description officielle** : Présente ton commerce, ton histoire, tes valeurs. Champ libre jusqu'à 2000 caractères, formaté en paragraphes.
**Flag** : `description`
**Disponible avec** : tous les plans

### 🔍 Référencement & diffusion

#### Apparition dans `/commander`
**Description officielle** : Ton commerce est listé dans le moteur de recherche public de Yoppaa, accessible à tous les Yoppers.
**Flag** : `apparition_commander`
**Disponible avec** : tous les plans

#### Référencement Google
**Description officielle** : Ta fiche Yoppaa est indexée par Google (SEO, sitemap, schema.org). Quand un client cherche ton commerce sur Google, ta fiche Yoppaa peut apparaître dans les résultats.
**Flag** : `seo_google`, `sitemap`, `schema_org`
**Disponible avec** : tous les plans

#### Recherche par catégorie
**Description officielle** : Les Yoppers peuvent te trouver en filtrant par catégorie d'activité (boulangerie, coiffeur, fleuriste, etc.).
**Flag** : `recherche_categorie`
**Disponible avec** : tous les plans

### ❤️ Engagement client

#### Favoris
**Description officielle** : Les Yoppers qui aiment ton commerce te mettent en favori. Tu vois le nombre de favoris dans tes statistiques et tu peux leur envoyer des actus, deals et notifications (selon ton plan).
**Flag** : `favoris`
**Disponible avec** : tous les plans

#### Signaux
**Description officielle** : Un Yopper t'envoie un signal pour t'exprimer un intérêt sans commander tout de suite : *"j'aimerais ce produit"*, *"je passerais bien demain"*. Tu reçois ses signaux dans ton tableau de bord et tu peux y répondre.
**Flag** : `signaux_yoppers`
**Disponible avec** : Exister · Communiquer · Vendre (PAS Public)

### 📊 Statistiques

#### Stats de base
**Description officielle** : Compteur des vues de ta fiche, du nombre de favoris, du nombre de signaux reçus. Mis à jour en temps réel.
**Flag** : `stats_vues`, `stats_favoris`, `stats_signaux`
**Disponible avec** : tous les plans (sauf signaux pour Public)

#### Historique d'activité
**Description officielle** : Liste chronologique de toutes les interactions sur ta fiche : vues, favoris, signaux, commandes, RDV.
**Flag** : `stats_historique`
**Disponible avec** : tous les plans

#### Stats détaillées
**Description officielle** : Taux d'ouverture des push, performance des newsletters, engagement par segment, conversion par action. Analyse complète pour piloter ta communication.
**Flag** : `stats_detaillees`
**Disponible avec** : Communiquer · Vendre

### ☀️ Good Morning Yoppers (GMY)

#### Apparition automatique
**Description officielle** : Chaque matin à 7h30, ta fiche apparaît dans le push notification GMY envoyé aux Yoppers de ta zone.
**Flag** : `morning`
**Disponible avec** : tous les plans

#### Publier 1 actu/jour dans GMY
**Description officielle** : Tu peux faire remonter 1 actualité dans le GMY du lendemain matin, à soumettre avant 23h la veille.
**Flag** : `actu_gmy`
**Disponible avec** : Exister · Communiquer · Vendre (Public publie via `actus_illimitees`)

#### Apparition prioritaire dans GMY
**Description officielle** : Tes contenus apparaissent en tête de liste dans le GMY, devant les commerçants au plan Exister.
**Flag** : `morning_prioritaire`
**Disponible avec** : Communiquer · Vendre

### 📢 Communication

#### Actualités illimitées
**Description officielle** : Publie autant d'actus que tu veux. Chaque actu apparaît sur ta fiche et envoie un push aux Yoppers qui t'ont mis en favori.
**Flag** : `actus_illimitees`
**Disponible avec** : Communiquer · Vendre · Public

#### Deals
**Description officielle** : Crée une promotion limitée dans le temps. Affichée en bandeau sur ta fiche, envoyée en push aux favoris.
**Flag** : `deals`
**Disponible avec** : Communiquer · Vendre

#### Mise en avant Bonnes affaires
**Description officielle** : Marque ton deal comme *"Bonne affaire"* pour qu'il apparaisse dans la section dédiée de l'application Yoppaa, visible par tous les Yoppers (pas seulement tes favoris).
**Flag** : `bonnes_affaires`
**Disponible avec** : Communiquer · Vendre

#### Push ciblés aux favoris
**Description officielle** : Envoie des notifications push manuelles à tes Yoppers favoris quand tu veux. Tu choisis le moment, tu segmentes si tu veux.
**Flag** : `push_cibles_favoris`
**Disponible avec** : Communiquer · Vendre

#### Newsletter ciblée
**Description officielle** : Envoie un email à tes Yoppers favoris. Plus long et structuré qu'un push, idéal pour communications éditoriales.
**Flag** : `newsletter_ciblee`
**Disponible avec** : Communiquer · Vendre

#### Segmentation favoris
**Description officielle** : Découpe ta base de Yoppers favoris par centre d'intérêt, ancienneté, dernière interaction, panier moyen. Envoie tes pushs et newsletters de façon ultra-ciblée.
**Flag** : `segmentation_favoris`
**Disponible avec** : Communiquer · Vendre

#### Alertes urgentes
**Description officielle** : Bandeau rouge prioritaire sur ta fiche + push immédiat à tes favoris. Pour les fermetures exceptionnelles, ruptures, indisponibilités.
**Flag** : `alertes_urgentes` (le flag est nommé ainsi pour Public, mais les commerçants Communiquer/Vendre ont la même fonctionnalité via le système d'actus/deals)
**Disponible avec** : Communiquer · Vendre · Public

### 🤖 IA Yoppaa

#### IA bridée
**Description officielle** : Une intelligence artificielle qui t'aide à rédiger. Elle reformule tes textes, te suggère des idées d'actus, corrige tes fautes. Limite de tokens par mois pour éviter les abus.
**Flag** : `ia_bridee`
**Disponible avec** : Communiquer · Vendre

#### IA avancée
**Description officielle** : Une IA plus puissante : rédaction complète, segmentation automatique de tes Yoppers, analyse de performance, benchmarking par rapport aux autres commerces de ta catégorie.
**Flag** : `ia_avancee`
**Disponible avec** : Vendre uniquement

### 🛒 Transactionnel (catégorie alimentaire)

#### Click & Collect
**Description officielle** : Le Yopper commande tes produits à l'avance et choisit son créneau de retrait. Tu reçois la commande dans ton tableau de bord, tu valides, tu marques *"prête"*. C'est le cœur de l'expérience Yoppaa alimentaire.
**Flag** : `commande`
**Catégorie requise** : alimentaire
**Disponible avec** : Vendre

#### Livraison
**Description officielle** : Module livraison complet : tu définis ta zone géographique, tes frais de livraison, tes créneaux dédiés. Le Yopper suit sa commande en temps réel.
**Flag** : `livraison`
**Catégorie requise** : alimentaire
**Disponible avec** : Vendre

#### Réservation de table
**Description officielle** : Pour les restaurateurs : tes Yoppers réservent leur table directement depuis ta fiche, choisissent l'horaire et le nombre de personnes. Tu valides ou tu ajustes.
**Flag** : `reservation_table`
**Catégorie requise** : alimentaire (sous-type restaurant)
**Disponible avec** : Vendre

### 📅 Transactionnel (catégorie service)

#### RDV natif
**Description officielle** : Le Yopper choisit une prestation, une date et un créneau, valide en 3 clics. Tu reçois la notification dans ton tableau de bord. Fichier iCal joint à l'email du Yopper pour son agenda.
**Flag** : `rdv`
**Catégorie requise** : service (vitrine)
**Disponible avec** : Vendre

#### Multi-praticiens
**Description officielle** : Tu ajoutes tes praticiens avec photo et spécialités. Chaque RDV est associé à une personne. Planning et statistiques par praticien. Le Yopper peut choisir un praticien ou laisser *"premier disponible"*.
**Flag** : `multi_praticiens`
**Catégorie requise** : service
**Disponible avec** : Vendre

### 📦 Transactionnel (catégorie détail)

#### Réservation produit
**Description officielle** : Le Yopper réserve un article à venir chercher en magasin. Tu le mets de côté, tu reçois la notification, tu confirmes la disponibilité. Parfait pour vêtements, livres, fleurs, jouets, etc.
**Flag** : `reservation_produit`
**Catégorie requise** : détail
**Disponible avec** : Vendre

### 💳 Paiement & encaissement

#### Paiement en ligne
**Description officielle** : Stripe Connect intégré : le Yopper paie son acompte ou sa commande directement sur ta fiche. **0 % de commission Yoppaa, jamais**. Ton argent va directement sur ton compte bancaire.
**Flag** : `paiement_ligne`
**Disponible avec** : Vendre

#### Encaissement cash en boutique
**Description officielle** : Tu peux marquer une commande comme *"payée en cash"* depuis ton tableau de bord, pour les Yoppers qui préfèrent payer sur place.
**Flag** : `paiement_cash`
**Disponible avec** : Vendre

### ⭐ Fidélité

#### Fidélité configurable
**Description officielle** : Programme à points entièrement paramétrable : règle de gain (X € = Y points), seuils de récompense, type de récompense (% de remise, produit offert). Statistiques fidélité dans ton tableau de bord.
**Flag** : `fidelite`
**Disponible avec** : Vendre

### 📤 Comptabilité

#### Export comptable
**Description officielle** : Exporte tes ventes, RDV ou réservations en CSV ou PDF mensuel pour ta comptabilité. Conservation des données 7 ans (loi belge).
**Flag** : `export_comptable`
**Disponible avec** : Vendre

### 🏛️ Spécifique Public

#### Push notifications de zone
**Description officielle** : La commune ou administration peut envoyer un push à tous les Yoppers d'un code postal donné, indépendamment des favoris.
**Flag** : `notifications_push_zone`
**Disponible avec** : Public

#### Alertes urgentes Public
**Description officielle** : Alertes prioritaires (rouge) pour les coupures d'eau, problèmes de sécurité, événements urgents communaux. Push immédiat à tous les Yoppers de la zone.
**Flag** : `alertes_urgentes`
**Disponible avec** : Public · Communiquer · Vendre

### 📱 Compatibilité matériel

#### Tableau de bord Android & iOS
**Description officielle** : Ton tableau de bord Yoppaa fonctionne sur n'importe quel téléphone, tablette ou ordinateur. Android, iPhone, iPad, Mac, PC : pas besoin de matériel spécifique pour démarrer.
**Disponible avec** : tous les plans

---

## 5. Conventions de copy (à respecter partout)

### Vocabulaire bancaire belge
- ✅ *"informations de paiement"* / *"moyen de paiement"* / *"carte de paiement"*
- ✅ *"Bancontact"* (à privilégier comme exemple)
- ✅ *"carte de crédit"* uniquement pour les vraies cartes de crédit
- ❌ Jamais *"CB"* (francisme inadapté au marché belge)

### Ponctuation française
- ❌ Pas de tirets cadratins `—` (em-dash) en français
- ✅ Utiliser virgules, deux-points, parenthèses ou points

### Habitants de Mettet
- ✅ *"habitants de Mettet"* ou *"Djobin / Djobine"*
- ❌ Jamais *"Mettetois"*

### Ton
- Tutoiement systématique
- Chaleureux, communautaire, pas froid SaaS américain
- Confirmations contextuelles : *"Yoppé !"* pour Click & Collect, *"C'est noté !"* pour RDV
- Emoji violet 🟣 comme signature visuelle (parfois)

### Tarification
- Toujours préciser **HTVA** (et non TTC) car notre cible est B2B
- *"19,90 €"* pas *"19.90 €"* (virgule décimale française)
- Mention systématique : *"Sans engagement, résiliable à tout moment"* pour les plans payants

### Noms de plans
- **Exister** (capitale initiale)
- **Communiquer** (capitale initiale)
- **Vendre** (capitale initiale)
- **Public** (capitale initiale)
- Jamais en majuscules complètes (EXISTER) sauf si raison stylistique forte

---

## 6. Mapping vocabulaire interne ↔ vocabulaire client

Certains termes techniques du code ne sont pas montrés au client.

| Code (`lib/plans.js`) | Mot client (UI) |
|---|---|
| `vitrine` (catégorie) | *Service* (dans le signup) ou *Commerce de service* |
| `detail` (catégorie) | *Détail* (dans le signup) ou *Commerce de produits* |
| `alimentaire` | *Alimentaire* |
| `publique` | *Service public / Administration* |
| `on` (legacy) | mapping vers *Exister* |
| `full` (legacy) | mapping vers *Vendre* |
| `commande` | *Click & Collect* (jamais *"commande"* en UI client) |
| `rdv` | *RDV* ou *Prise de rendez-vous* |
| `signaux_yoppers` | *Signaux* |
| `morning` | *Good Morning Yoppers* (GMY) |
| `morning_prioritaire` | *Apparition prioritaire dans Good Morning Yoppers* |

---

## 7. Procédure de mise à jour

Quand on ajoute, modifie ou retire une feature :

1. **Source** : modifier `lib/plans.js` (matrice + helpers `canDo`, `canDoAvecCategorie`)
2. **Master** : mettre à jour ce document (`MASTER_FEATURES.md`)
3. **UI signup** : adapter `app/signup/page.js` (cards plan + glossaire features)
4. **UI dashboard** : adapter `app/dashboard/ConfigDashboard.js` (gating des onglets)
5. **UI fiche publique** : adapter `app/commander/[slug]/page.js` (affichage conditionnel)
6. **Emails** : adapter `lib/resend.js` et `lib/billing-emails.js` si features mentionnées
7. **Landing** : adapter la Landing Reveal (à venir)
8. **Pitch / slides** : adapter les supports commerciaux Mettet et démos

Vérification finale : aucune UI ne doit dire *"tu auras X"* si `canDo(plan, X)` retourne `false`.

---

## 8. Références croisées

- Source technique : [`lib/plans.js`](./lib/plans.js)
- Refonte 4 paliers (15/06/2026) : voir `project_refonte_modele_on_full.md` dans la mémoire
- Brief Phase 1 lancement (08/06/2026) : voir `project_briefs_lancement_phase1.md`
- Sprint planning : voir `project_sprint_planning_phase1.md`
- Stratégie paiement Stripe : voir `project_paiement_stripe.md`
