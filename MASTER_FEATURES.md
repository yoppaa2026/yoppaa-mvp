# Master Features Yoppaa

> **Source unique de vérité** pour toutes les fonctionnalités Yoppaa, leurs descriptions officielles, leur disponibilité par plan, et le vocabulaire de marque associé.
>
> **À mettre à jour** à chaque ajout ou modification d'une feature dans `lib/plans.js`.
> **Référencé partout** : toutes les UI (signup, dashboard, fiche `/commander/[slug]`, emails, landing, pitch deck, slides commerciales) doivent s'aligner sur ce document.
> **Maintenu par** : Alex Verstappen (Avcotech SRL). Dernière révision : 2026-06-17.

---

## 1. Glossaire fondamentaux Yoppaa

Les concepts de base que tout le monde (commerçant, équipe, partenaire) doit comprendre de la même façon. **Section validée par Alex le 17/06/2026.**

### Yoppaa
La plateforme. Application mobile + tableau de bord web qui connecte les commerces locaux à leurs clients d'un même quartier. Belgique, démarrage Mettet.

### Yopper
Tout utilisateur de l'application Yoppaa, **incluant les commerçants eux-mêmes**. La tribu Yoppers est unique : un commerçant est aussi un Yopper qui découvre, met en favori et soutient d'autres commerces de son quartier.

Les Yoppers voient les fiches commerçants, mettent en favori, envoient des signaux, reçoivent des notifications, passent commande ou réservent. **Connexion (login) obligatoire** pour mettre en favori, envoyer un signal, commander ou réserver.

### Yoppé !
**Confirmation universelle Yoppaa**, utilisée pour TOUTES les actions de validation transactionnelle :
- *"Ta commande est Yoppée !"* (Click & Collect alimentaire)
- *"Ton RDV est Yoppé !"* (service)
- *"Ta table est Yoppée !"* (réservation restaurant)
- *"Ton article est Yoppé !"* (réservation produit détail)

**Spécification visuelle obligatoire** : un check vert ✓ (V en vert) systématiquement affiché au-dessus du texte de confirmation pour imager visuellement la validation. Signature de marque dans les couleurs canoniques violet Yoppaa (main #6B35C4 / mid #9660E0).

### Commerçant
L'utilisateur professionnel. Crée son compte, choisit une formule (Exister, Communiquer, Vendre), configure sa fiche, reçoit ses Yoppers. **Le commerçant est aussi un Yopper** et fait partie de la même tribu.

### Favori
Quand un Yopper met un commerçant en favori, il choisit de le suivre.

**Mécanique technique validée 17/06** :
- **Login Yopper obligatoire** pour mettre en favori
- **Données transférées au commerçant** : prénom (si fourni), code postal (zone, pas adresse précise), date d'ajout en favori. **PAS d'email direct** : le commerçant envoie ses push et newsletters via Yoppaa qui relaie. Le commerçant ne voit jamais l'email individuel d'un Yopper.
- **Quand un Yopper retire le favori** : soft-delete avec `unfavorited_at` timestamp. La ligne reste en DB pour stats historiques, mais le Yopper disparaît immédiatement des listes du commerçant.
- **Plus aucun contact possible** après retrait : ni push, ni newsletter. Le retrait est un signal RGPD clair de non-consentement.
- **Exception newsletter de relance** : seulement si le Yopper a opt-in explicitement à une newsletter "info commerce" séparée du favori (consentement distinct).

Le favori est le canal d'engagement principal : les actus, deals et push ciblés sont envoyés en priorité aux favoris.

### Signal
Mécanisme de feedback léger pour qu'un Yopper exprime un intérêt envers un commerçant sans commander tout de suite.

**Mécanique technique validée 17/06** :
- **Login Yopper obligatoire** pour envoyer un signal
- **Signaux pré-enregistrés** : le Yopper choisit dans un catalogue fixe, **pas de rédaction libre**. Évite le côté messagerie/chat (qui n'est PAS le but de Yoppaa).
- **Catalogue par catégorie de commerce** : alimentaire / service / détail / public ont chacun leurs propres options pertinentes (voir section 4 *Catalogue des signaux* ci-dessous).
- **Objectif business** : créer de la preuve sociale pour pousser le commerçant Exister/Communiquer vers Vendre. Exemple : *"Tu as reçu 12 signaux 'Je voudrais commander à l'avance' ce mois → passe à Vendre pour activer Click & Collect"*.

Le commerçant reçoit ses signaux dans son tableau de bord, voit le compteur par type, et peut répondre rapidement (réponse pré-enregistrée également, type "Merci, on te recontacte").

### Good Morning Yoppers (GMY)
Push notification quotidien envoyé chaque matin à **7h30** aux Yoppers de la zone du commerçant. Différenciation claire par plan :

- **Exister** : le commerçant apparaît dans le GMY avec sa fiche basique. Peut publier **1 actu basique par jour** (texte court non cliquable, pas de page actu détaillée). **Pas de deal possible** sur Exister.
- **Communiquer / Vendre** : le commerçant peut publier des deals **et** des actus enrichies (avec photo + description détaillée + lien). Les deals peuvent être liés à un produit ou un service. **Différence Communiquer vs Vendre** : sur Communiquer, les deals NE SONT PAS commandables/réservables (pas de bouton "commander" ou "réserver"). Sur Vendre, oui.
- **Public** : full access pour les actus et alertes enrichies. La commune publie ses propres infos/alertes pour les habitants de la zone.

**Deadline de publication** : pour qu'un contenu apparaisse dans le GMY du lendemain, il doit être publié avant **23h00 la veille**.

### Actualité
Une nouvelle publiée par le commerçant : nouveau produit, événement, créneau libre, changement d'horaires, etc.

**Différenciation par plan** :
- **Exister** : actu basique (texte court, pas cliquable). Visible dans GMY uniquement, 1 par jour maximum.
- **Communiquer / Vendre** : actu enrichie (titre + texte long + photo + lien CTA optionnel). Apparaît sur la fiche du commerçant + envoyée en push aux Yoppers favoris. Actus illimitées.
- **Public** : actu enrichie illimitée. Visible sur la fiche commune + push aux Yoppers de la zone par code postal.

### Deal
Promotion limitée dans le temps publiée par le commerçant.
- **Durée** : configurable par le commerçant (de 1 heure à plusieurs semaines)
- **Visibilité** : affichée en bandeau sur la fiche du commerçant + envoyée en push aux Yoppers favoris
- **Disponible avec** : Communiquer · Vendre (pas Exister)
- **Différence Communiquer vs Vendre** : sur Communiquer, le deal est informatif (le Yopper voit la promo mais doit passer en magasin). Sur Vendre, le Yopper peut commander/réserver/payer directement depuis le deal.

### Bonne affaire (jour J uniquement)
**Définition validée 17/06** : une *"Bonne affaire"* est une promotion publiée par le commerçant **le jour J pour le jour J uniquement**. Elle est valable du moment de sa publication jusqu'à minuit le même jour. **Impossible de programmer une bonne affaire pour demain ou plus tard.**

**Pourquoi cette mécanique** :
- Crée une **urgence forte** (le Yopper a quelques heures pour en profiter)
- Pousse les Yoppers à **ouvrir l'app tous les jours** (sinon ils ratent les bonnes affaires du jour)
- Bénéfice business pour le commerçant : écoulement de stock du jour, créneau du soir, fin de production, etc.
- Différencie clairement Deal (durée libre) de Bonne affaire (jour J uniquement)

**Comment ça se passe en pratique** :
- Le commerçant crée une *"Bonne affaire"* à n'importe quel moment de la journée (matin, midi, fin d'après-midi)
- Elle est immédiatement visible dans la section *"Bonnes affaires"* de l'app
- À minuit, elle bascule automatiquement en archive (plus visible côté Yopper, accessible en stats côté commerçant)
- Le commerçant peut créer **plusieurs bonnes affaires dans la même journée** (1 le matin pour le service midi, 1 le soir pour écouler ce qui reste)

**Section dédiée dans l'app** : *"Bonnes affaires"* est une section transverse de l'app Yoppaa qui agrège TOUTES les bonnes affaires du jour pour la zone, peu importe le commerçant. Visible par tous les Yoppers (pas seulement les favoris). Crée la découverte de nouveaux commerces.

**Disponible avec** : Communiquer · Vendre.

**Différence clé avec un Deal classique** :
- **Deal** : promotion à durée libre (heures, jours, semaines) configurée par le commerçant. Visible sur la fiche du commerçant et envoyée en push aux favoris.
- **Bonne affaire** : promotion strictement jour J pour jour J. Visible dans la section "Bonnes affaires" transverse à toute l'app. Apparaît dans le GMY du matin si publiée avant 7h30.

### Alerte
Information urgente : fermeture exceptionnelle, rupture, indisponibilité. Bandeau rouge prioritaire sur la fiche, push immédiat aux Yoppers favoris.

**Disponible avec** : Communiquer · Vendre · Public. **PAS Exister** (validation Alex 17/06).

### Push ciblé
Notification push envoyée par le commerçant uniquement à ses Yoppers favoris. Le commerçant choisit le moment et peut segmenter (par centre d'intérêt, par ancienneté du favori, par dernière interaction).

**Architecture technique** : voir section 9 *Architecture technique Push / Newsletter / IA*.

### Newsletter ciblée
Email envoyé par le commerçant à ses Yoppers favoris, avec possibilité de segmentation. Idéal pour les communications plus longues qu'un push (édito, dossier produit, événement).

**Architecture technique** : voir section 9 *Architecture technique Push / Newsletter / IA*.

### IA Yoppaa
Assistant IA intégré pour aider le commerçant à rédiger ses actus, deals, newsletters.

- **IA bridée** (Communiquer) : reformulation de textes, suggestions d'idées d'actus, correction orthographique. ~50 000 tokens / mois (≈30-50 générations).
- **IA avancée** (Vendre) : rédaction complète, segmentation automatique des Yoppers, analyse de performance, benchmarking concurrentiel. ~150 000 tokens / mois (≈30-100 générations).

**Architecture technique** : voir section 9 *Architecture technique Push / Newsletter / IA*.

### Plans Yoppaa
- **Exister** (gratuit à vie) : présence simple
- **Communiquer** (19,90 € HTVA/mois, essai 30 jours) : communication active
- **Vendre** (49,90 € HTVA/mois, essai 30 jours) : transactionnel complet
- **Public** (gratuit à vie, sur **invitation et validation manuelle par Alex**) : services et administrations communales sélectionnés selon l'intérêt et la pertinence

### Catégories de commerce
- **Alimentaire** : Click & Collect, livraison, réservation table (boulangerie, friterie, traiteur, restaurant, snack…)
- **Service** (= "vitrine" dans le code) : RDV, prestations (coiffeur, opticien, esthéticienne, garagiste, pressing…)
- **Détail** : réservation produit, retrait en magasin (vêtements, chaussures, fleuriste, librairie, jouets…)
- **Publique** : services et administrations communales validés manuellement par Yoppaa. Exemples : **commune**, **CPAS**, **services communaux** (bibliothèque, piscine, parc, etc.). **Pas de syndicat d'initiative**. Le terme "mairie" n'existe pas en Belgique, on dit toujours **commune**.

---

## 2. Matrice synthétique des features par plan

Légende : ✓ inclus · — non inclus · *(à venir : badge "plan recommandé" et "boutique optionnelle" en SVG dans l'UI)*

| Feature | Exister | Communiquer | Vendre | Public |
|---|:-:|:-:|:-:|:-:|
| **Visibilité** | | | | |
| Fiche commerce (vitrine) | ✓ | ✓ | ✓ | ✓ |
| Prix affichés sur la fiche | ✓ | ✓ | ✓ | — |
| Photos + galerie illimitée | ✓ | ✓ | ✓ | ✓ |
| Horaires détaillés (jour par jour) | ✓ | ✓ | ✓ | ✓ |
| Description longue | ✓ | ✓ | ✓ | ✓ |
| **Référencement** | | | | |
| Apparition dans `/commander` | ✓ | ✓ | ✓ | ✓ |
| Référencement Google (SEO + sitemap + schema.org) | ✓ | ✓ | ✓ | ✓ |
| Recherche par catégorie | ✓ | ✓ | ✓ | ✓ |
| **Engagement client** | | | | |
| Favoris (Yoppers te suivent) | ✓ | ✓ | ✓ | ✓ |
| Signaux des Yoppers | ✓ | ✓ | ✓ | — |
| **Statistiques** | | | | |
| Stats de base (vues, favoris) | ✓ | ✓ | ✓ | ✓ |
| Historique d'activité | ✓ | ✓ | ✓ | ✓ |
| Stats signaux | ✓ | ✓ | ✓ | — |
| Stats détaillées (engagement push, ouvertures, etc.) | — | ✓ | ✓ | — |
| **Good Morning Yoppers** | | | | |
| Apparition automatique dans GMY | ✓ | ✓ | ✓ | ✓ |
| Publier 1 actu/jour dans GMY | ✓ | ✓ | ✓ | — |
| Apparition prioritaire dans GMY | — | ✓ | ✓ | — |
| **Communication** | | | | |
| Actualités illimitées (page fiche + push) | — | ✓ | ✓ | ✓ |
| Deals (promotions limitées) | — | ✓ | ✓ | — |
| Mise en avant Bonnes affaires | — | ✓ | ✓ | — |
| Push ciblés aux Yoppers favoris | — | ✓ | ✓ | — |
| Newsletter ciblée + segmentation | — | ✓ | ✓ | — |
| Alertes (bandeau rouge prioritaire) | — | ✓ | ✓ | ✓ |
| **IA Yoppaa** | | | | |
| IA bridée (reformulation, suggestions, correction) | — | ✓ | ✓ | — |
| IA avancée (rédaction, segmentation auto, benchmarking) | — | — | ✓ | — |
| **Transactionnel** | | | | |
| Click & Collect *(catégorie alimentaire)* | — | — | ✓ | — |
| Livraison *(catégorie alimentaire)* | — | — | ✓ | — |
| Réservation de table *(restaurant alimentaire)* | — | — | ✓ | — |
| RDV natif *(catégorie service)* | — | — | ✓ | — |
| Multi-praticiens *(catégorie service)* | — | — | ✓ | — |
| Réservation produit *(catégorie détail)* | — | — | ✓ | — |
| Paiement en ligne (Stripe Connect, 0 % commission) | — | — | ✓ | — |
| Encaissement cash en boutique | — | — | ✓ | — |
| Fidélité configurable | — | — | ✓ | — |
| Export comptable (CSV / PDF) | — | — | ✓ | — |
| **Spécifique Public** | | | | |
| Push notifications de zone (code postal) | — | ✗ | — | ✓ |
| Alertes urgentes (sécurité, coupures, etc.) | — | ✗ | — | ✓ |

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

### Visibilité & présence

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

### Référencement & diffusion

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

### Engagement client

#### Favoris
**Description officielle** : Les Yoppers qui aiment ton commerce te mettent en favori. Tu vois le nombre de favoris dans tes statistiques et tu peux leur envoyer des actus, deals et notifications (selon ton plan).
**Flag** : `favoris`
**Disponible avec** : tous les plans

#### Signaux
**Description officielle** : Un Yopper t'envoie un signal pour t'exprimer un intérêt sans commander tout de suite : *"j'aimerais ce produit"*, *"je passerais bien demain"*. Tu reçois ses signaux dans ton tableau de bord et tu peux y répondre.
**Flag** : `signaux_yoppers`
**Disponible avec** : Exister · Communiquer · Vendre (PAS Public)

### Statistiques

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

### Good Morning Yoppers (GMY) — soleil (seule exception emoji autorisée pour la signature visuelle du push matinal)

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

### Communication

#### Actualités illimitées
**Description officielle** : Publie autant d'actus que tu veux. Chaque actu apparaît sur ta fiche et envoie un push aux Yoppers qui t'ont mis en favori.
**Flag** : `actus_illimitees`
**Disponible avec** : Communiquer · Vendre · Public

#### Deals
**Description officielle** : Crée une promotion limitée dans le temps. Affichée en bandeau sur ta fiche, envoyée en push aux favoris.
**Flag** : `deals`
**Disponible avec** : Communiquer · Vendre

#### Mise en avant Bonnes affaires (jour J uniquement)
**Description officielle** : Crée une *"Bonne affaire"* publiée **le jour J pour le jour J uniquement**. Valable de l'instant de publication jusqu'à minuit. Elle apparaît dans la section *"Bonnes affaires"* de l'application Yoppaa, visible par tous les Yoppers de la zone (pas seulement tes favoris). Si publiée avant 7h30, elle remonte aussi dans le Good Morning Yoppers du matin.
**Flag** : `bonnes_affaires`
**Disponible avec** : Communiquer · Vendre
**Règles** :
- **Impossible de programmer pour demain** : la création d'une Bonne affaire la rend immédiatement active jusqu'à 23h59 du jour même
- **Archivage automatique à minuit** : disparaît de l'app côté Yopper, reste en stats côté commerçant
- **Plusieurs par jour autorisées** : 1 le matin pour le midi, 1 l'après-midi pour le soir, etc.
- **Différence avec un Deal classique** : un Deal a une durée libre (heures, jours, semaines). Une Bonne affaire est strictement jour J pour jour J.

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
**Description officielle** : Bandeau rouge prioritaire sur ta fiche + push immédiat à tes favoris. Pour les fermetures exceptionnelles, ruptures, indisponibilités. Pour Public : alertes communales (coupure d'eau, événement sécurité).
**Flag** : `alertes_urgentes`
**Disponible avec** : Communiquer · Vendre · Public. **PAS Exister**.

### IA Yoppaa

#### IA bridée
**Description officielle** : Une intelligence artificielle qui t'aide à rédiger. Elle reformule tes textes, te suggère des idées d'actus, corrige tes fautes. Limite de tokens par mois pour éviter les abus.
**Flag** : `ia_bridee`
**Disponible avec** : Communiquer · Vendre

#### IA avancée
**Description officielle** : Une IA plus puissante : rédaction complète, segmentation automatique de tes Yoppers, analyse de performance, benchmarking par rapport aux autres commerces de ta catégorie.
**Flag** : `ia_avancee`
**Disponible avec** : Vendre uniquement

### Transactionnel (catégorie alimentaire)

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
**Description officielle** : Module complet de réservation pour les restaurateurs. Tes Yoppers réservent leur table directement depuis ta fiche, choisissent l'horaire, le nombre de personnes et reçoivent une confirmation Yoppée.
**Flag** : `reservation_table`
**Catégorie requise** : alimentaire (sous-type restaurant)
**Disponible avec** : Vendre

**Configuration côté restaurateur** (dashboard) :
- **Capacités de tables** : encoder le nombre de tables par capacité. Exemple : 4 tables de 2, 6 tables de 4, 2 tables de 6, 1 table de 8.
- **Optimisation remplissage** : une table de 4 accepte aussi les groupes de 3 (3 personnes minimum sur une table de 4 pour ne pas perdre de capacité).
- **Créneaux par service** : définir les services (midi 12h-14h, soir 18h-22h) avec créneaux de 15/30 min. Possibilité de bloquer un service certains jours.
- **Acompte optionnel** : le restaurateur peut exiger un acompte (montant fixe ou % du prix moyen) au moment de la réservation. Si annulation par le Yopper, politique de remboursement configurable.
- **Confirmations** : *"Ta table est Yoppée !"* côté Yopper + email avec rappel J-1.
- **MVP V1** : pas de plan de table graphique. Juste le compteur par capacité. Plan de table interactif = V2.

### Transactionnel (catégorie service)

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

### Transactionnel (catégorie détail)

#### Réservation produit
**Description officielle** : Le Yopper réserve un article à venir chercher en magasin. Tu le mets de côté, tu reçois la notification, tu confirmes la disponibilité. Parfait pour vêtements, livres, fleurs, jouets, etc.
**Flag** : `reservation_produit`
**Catégorie requise** : détail
**Disponible avec** : Vendre

### Paiement & encaissement

#### Paiement en ligne
**Description officielle** : Stripe Connect intégré : le Yopper paie son acompte ou sa commande directement sur ta fiche. **0 % de commission Yoppaa, jamais**. Ton argent va directement sur ton compte bancaire.
**Flag** : `paiement_ligne`
**Disponible avec** : Vendre

#### Encaissement cash en boutique
**Description officielle** : Tu peux marquer une commande comme *"payée en cash"* depuis ton tableau de bord, pour les Yoppers qui préfèrent payer sur place.
**Flag** : `paiement_cash`
**Disponible avec** : Vendre

### Fidélité

#### Fidélité configurable
**Description officielle** : Programme à points entièrement paramétrable : règle de gain (X € = Y points), seuils de récompense, type de récompense (% de remise, produit offert). Statistiques fidélité dans ton tableau de bord.
**Flag** : `fidelite`
**Disponible avec** : Vendre

### Comptabilité

#### Export comptable
**Description officielle** : Exporte tes ventes, RDV ou réservations en CSV ou PDF mensuel pour ta comptabilité. Conservation des données 7 ans (loi belge).
**Flag** : `export_comptable`
**Disponible avec** : Vendre

### Spécifique Public

#### Push notifications de zone
**Description officielle** : La commune ou administration peut envoyer un push à tous les Yoppers d'un code postal donné, indépendamment des favoris.
**Flag** : `notifications_push_zone`
**Disponible avec** : Public

#### Alertes urgentes Public
**Description officielle** : Alertes prioritaires (rouge) pour les coupures d'eau, problèmes de sécurité, événements urgents communaux. Push immédiat à tous les Yoppers de la zone.
**Flag** : `alertes_urgentes`
**Disponible avec** : Public · Communiquer · Vendre

### Compatibilité matériel

#### Tableau de bord Android & iOS
**Description officielle** : Ton tableau de bord Yoppaa fonctionne sur n'importe quel téléphone, tablette ou ordinateur. Android, iPhone, iPad, Mac, PC : pas besoin de matériel spécifique pour démarrer.
**Disponible avec** : tous les plans

---

## 5. Conventions de copy (à respecter partout)

### Vocabulaire bancaire belge
- ✓ *"informations de paiement"* / *"moyen de paiement"* / *"carte de paiement"*
- ✓ *"Bancontact"* (à privilégier comme exemple)
- ✓ *"carte de crédit"* uniquement pour les vraies cartes de crédit
- ✗ Jamais *"CB"* (francisme inadapté au marché belge)

### Ponctuation française
- ✗ Pas de tirets cadratins `—` (em-dash) en français
- ✓ Utiliser virgules, deux-points, parenthèses ou points

### Habitants de Mettet
- ✓ *"habitants de Mettet"* ou *"Djobin / Djobine"*
- ✗ Jamais *"Mettetois"*

### Ton
- Tutoiement systématique
- Chaleureux, communautaire, pas froid SaaS américain
- **Confirmation universelle "Yoppé !"** pour TOUTES les actions transactionnelles :
  - *"Ta commande est Yoppée !"* (Click & Collect)
  - *"Ton RDV est Yoppé !"* (service)
  - *"Ta table est Yoppée !"* (réservation restaurant)
  - *"Ton article est Yoppé !"* (réservation produit détail)
  - **Check vert ✓ obligatoire** au-dessus du texte de confirmation pour imager visuellement la validation

### Iconographie : pas d'emojis, SVG uniquement
**Règle stricte Yoppaa** : aucun emoji n'est utilisé dans les UI, les emails, les supports commerciaux ou la documentation produit. Tout signe visuel passe par un SVG aligné sur la charte graphique Yoppaa (couleurs canoniques : ink #1A0840, main #6B35C4, mid #9660E0, light #C4A0F4, pale #EDE0FF).

**Pourquoi cette règle** :
- Les emojis ne sont pas rendus de la même façon selon les OS (Apple, Android, Windows) et cassent la cohérence visuelle
- Les SVG s'alignent sur la palette Yoppaa et sont contrôlables (couleur, taille, animation)
- Cohérent avec la charte canonique Yoppaa (logo, 5 dots V2-B, wordmark Plus Jakarta Sans)

**2 exceptions autorisées** :

1. **L'icône soleil dans le Good Morning Yoppers (GMY)** : exception culturelle, le soleil incarne le push matinal de 7h30. Préférer un SVG soleil custom plutôt que l'emoji `☀️` quand c'est possible.

2. **Le rond violet `🟣`** : signature identitaire Yoppaa. Représente l'un des 5 dots du logo. Autorisé uniquement comme **élément de signature** (fin d'une phrase Yoppé, accroche de bandeau, footer de marque), **pas comme bullet décoratif** dans une liste. Règle : si tu peux le remplacer par un tiret ou un point sans perdre l'identité, fais-le.

**Bibliothèque d'icônes recommandée** : Lucide Icons ou Heroicons (libres, propres, alignées sur design system). À intégrer comme composants SVG inline pour pouvoir customiser la couleur via `currentColor`.

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

## 8. Catalogue des signaux par catégorie de commerce

Les signaux sont **pré-enregistrés** et adaptés à la catégorie du commerce. Le Yopper sélectionne dans la liste, pas de rédaction libre. Objectif : feedback léger qui pousse le commerçant Exister/Communiquer vers Vendre.

### Signaux Alimentaire
- *"Je voudrais commander à l'avance"* (push vers Click & Collect)
- *"Vous livrez ?"* (push vers Livraison)
- *"Vous prenez les groupes ?"* (push vers Réservation table)
- *"Quel est le menu du jour ?"* (push vers Actu / publication)
- *"Vous êtes ouvert ce soir ?"* (push vers Horaires détaillés)
- *"Avez-vous des allergènes ?"* (push vers Description détaillée)

### Signaux Service
- *"Je voudrais un RDV"* (push vers RDV natif)
- *"Vous prenez sans RDV ?"* (push vers Horaires détaillés)
- *"Combien coûte cette prestation ?"* (push vers Prix affichés)
- *"Avez-vous des disponibilités cette semaine ?"* (push vers RDV)
- *"Vous êtes ouvert le samedi ?"* (push vers Horaires détaillés)

### Signaux Détail
- *"Avez-vous cet article en stock ?"* (push vers Réservation produit)
- *"Je voudrais réserver"* (push vers Réservation produit)
- *"Cette taille est-elle disponible ?"* (push vers Catalogue + Réservation produit)
- *"Cette couleur est-elle disponible ?"* (push vers Catalogue)
- *"Vous faites des retouches / réparations ?"* (push vers Description / Services)

### Signaux Public
**Pas de signaux pour la catégorie Public** (la commune publie des infos, ne reçoit pas de signaux individuels). Si besoin d'un retour citoyen, ce sera traité par d'autres canaux (formulaire de contact, signalement, etc., hors périmètre Yoppaa MVP).

### Implémentation technique
- Table `signal_templates(id, categorie, label, ordre, plan_recommande)` qui contient le catalogue
- Table `signaux(id, yopper_id, commercant_id, signal_template_id, created_at, vu_par_commercant_at)` qui stocke les signaux envoyés
- Le commerçant voit dans son dashboard : compteur par template avec lien direct vers la feature qui débloque ("12 Yoppers veulent commander à l'avance → Active Click & Collect avec Vendre")
- Réponse pré-enregistrée du commerçant (type "Merci, on vous recontacte") pour ne pas tomber dans la messagerie chat

---

## 9. Architecture technique Push / Newsletter / IA

**Section validée par Alex le 17/06/2026.** Détaille les choix techniques pour implémenter les fonctionnalités de communication avancées de Communiquer et Vendre.

### Push ciblé (OneSignal)
**Stack** : OneSignal (gratuit jusqu'à 10 000 abonnés, ensuite ~9 $ / mois). Yoppaa absorbe le coût (compris dans Communiquer / Vendre).

**Flux** :
1. Quand un Yopper met un commerçant en favori, ligne créée dans la table `favoris(yopper_id, commercant_id, created_at)`
2. Le commerçant compose un push dans son dashboard (titre + corps + lien optionnel)
3. Au clic "Envoyer", le backend Yoppaa appelle l'API OneSignal avec la liste des `yopper_id` favoris
4. OneSignal envoie le push sur les téléphones (via les tokens Apple / Google)
5. Tracking : taux d'ouverture, taux de clic, désabonnements remontés en webhook OneSignal → stockés en DB → affichés dans le dashboard commerçant

**Ce que le commerçant voit** : stats agrégées uniquement (nombre de favoris, taux d'engagement, performance par push). **Jamais l'email ou l'identité individuelle d'un Yopper**. Conformité RGPD.

### Newsletter ciblée (Brevo)
**Stack** : Brevo (anciennement Sendinblue, basé en France, ~25 € / mois pour ~20 000 emails). Yoppaa absorbe le coût.

**Flux** :
1. Le commerçant compose son email dans le dashboard (éditeur WYSIWYG, template Yoppaa pré-configuré avec logo / couleurs)
2. Il choisit son segment (tous les favoris, ou segment ciblé)
3. Yoppaa appelle l'API Brevo avec la liste des emails Yoppers favoris (récupérée via la jointure `favoris` ↔ `yoppers`)
4. Brevo envoie les emails et tracke (ouverture, clic, désabonnement)
5. Webhook Brevo remonte les stats → stockées en DB → affichées dans le dashboard
6. Lien de désabonnement obligatoire géré automatiquement par Brevo (conforme RGPD)

**À coder** :
- Composant éditeur WYSIWYG dans le dashboard (probablement TipTap ou Lexical)
- API route `/api/newsletter/send` qui appelle Brevo
- Webhook `/api/brevo/webhook` pour recevoir les stats
- Table `newsletters(id, commercant_id, subject, body_html, sent_at, brevo_message_id, stats_json)`

### IA Yoppaa (Anthropic Claude)
**Stack** : API Anthropic Claude. Deux modèles selon le plan :
- **Haiku 4.5** pour IA bridée Communiquer (rapide, peu cher)
- **Sonnet 4.6** pour IA avancée Vendre (plus puissant)

**Flux** :
1. Le commerçant tape son brouillon dans le champ "actu" du dashboard
2. Au clic "Aide IA", le backend Yoppaa envoie à Claude un prompt structuré incluant le contexte (nom commerce, catégorie, dernière actu publiée, brouillon en cours)
3. Claude renvoie 2 à 3 suggestions
4. Le commerçant choisit ou édite avant de publier

**Cas d'usage MVP (Communiquer)** :
- Reformulation d'un texte existant pour le rendre plus engageant
- Correction orthographique et grammaticale
- Suggestion d'idées d'actus selon la saison ou la catégorie

**Cas d'usage avancé (Vendre)** :
- Génération complète d'une newsletter à partir d'un brief court
- Segmentation automatique des Yoppers favoris (par centre d'intérêt, engagement)
- Analyse de performance avec insights ("Tes Yoppers ouvrent plus tes pushs le jeudi matin")
- Benchmarking anonyme avec des commerces de même catégorie

**Limites par plan** :
- Communiquer (Haiku) : ~50 000 tokens / mois ≈ 30-50 générations
- Vendre (Sonnet) : ~150 000 tokens / mois ≈ 30-100 générations
- Au-delà : message *"Tu as utilisé ton quota IA du mois. Quota remis à zéro le 1er du mois prochain."*

**Coût Anthropic estimé pour Yoppaa** :
- Haiku : ~0,80 $ / 1M tokens. À 50k tokens × 100 commerçants = 5M tokens = **4 $ / mois global**.
- Sonnet : ~3 $ / 1M tokens. À 150k × 50 commerçants = 7,5M tokens = **22 $ / mois global**.
- **Total ~30 $ / mois** côté Anthropic pour 150 commerçants actifs. Marge ultra confortable.

**À coder** :
- Endpoints `/api/ai/reformulate`, `/api/ai/suggest-actu`, `/api/ai/generate-newsletter`
- Composant React `<BoutonAideIA>` réutilisable dans le dashboard
- Compteur de tokens par commerçant par mois (table `ai_usage(commercant_id, mois, tokens_utilises)`)
- Toujours afficher en UI : *"L'IA propose, tu valides toujours avant de publier"*. Le commerçant garde le contrôle.

**Faisabilité confirmée** : 8 à 12 h de coding pour le MVP. Pas de magie, l'IA reformule et suggère uniquement à partir du contexte fourni. On démarre par les cas safe (reformulation, correction) avant la génération complète Vendre.

---

## 10. Références croisées

- Source technique : [`lib/plans.js`](./lib/plans.js)
- Refonte 4 paliers (15/06/2026) : voir `project_refonte_modele_on_full.md` dans la mémoire
- Brief Phase 1 lancement (08/06/2026) : voir `project_briefs_lancement_phase1.md`
- Sprint planning : voir `project_sprint_planning_phase1.md`
- Stratégie paiement Stripe : voir `project_paiement_stripe.md`
