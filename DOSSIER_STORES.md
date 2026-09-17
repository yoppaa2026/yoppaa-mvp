# Dossier de préparation aux stores

État au **16 septembre 2026**. Ce document est le point d'entrée du dépôt de
Yoppaa sur Google Play et l'App Store. Il dit ce qui est fait, ce qui manque, et
ce qui dépend d'Alex.

> 🔴 **On publie Yoppaa, jamais Yoppaa Pro.** L'app des habitants ne vend que des
> biens physiques et des services réels, que les deux stores excluent
> expressément de leur facturation. Le tableau de bord commerçant vend un
> **abonnement**, donc un service numérique : publié dans une app, il devrait
> passer par la facturation des stores et leurs **15 à 30 %** de commission sur
> chaque 19,90 ou 49,90 € mensuel. Yoppaa Pro reste une PWA installée depuis le
> navigateur, donc hors store et hors règle de commission.

---

## 1. Comment l'application est construite

**L'app ne contient pas Yoppaa, elle le pointe.** Le site a 100 routes serveur et
un middleware : un export statique est impossible. `capacitor.config.ts` vise
donc `https://www.yoppaa.app`.

| Conséquence | Détail |
|---|---|
| ✅ Les modifications passent sans resoumission | un déploiement Vercel est immédiatement dans l'app installée |
| 🔴 Un déploiement raté casse l'app | ce qui n'était qu'une page blanche sur le site devient une application morte sur des téléphones |
| ✅ Aucun secret dans les paquets | ni Supabase ni Stripe ne transitent par les builds |

⚠️ **`app.yoppaa.client` est figé et unique sur tout Google Play.** Déposé le
11/08, il laisse `app.yoppaa.pro` libre. Le changer, c'est perdre la fiche.

---

## 2. Ce qui est fait

- ✅ **Capacitor 8.5.2**, projets `android/` et `ios/` générés et versionnés.
- ✅ **Push natifs branchés** (`onesignal-cordova-plugin` 5.5.7).
  🔴 Le plugin natif s'expose sous `window.OneSignal`, **le même nom que le SDK
  web**, avec des méthodes différentes (`initialize` contre `init`). Sans
  l'aiguillage de `lib/push-natif.js`, l'app aurait cru parler au web, sans
  lever la moindre erreur, et **personne n'aurait jamais reçu de notification**.
- ✅ **`webDir` minimal** : 1,2 Mo d'icônes ne sont plus recopiés dans chaque
  paquet à chaque synchronisation.
- ✅ **Deux chaînes de build GitHub Actions**, déclenchées à la main
  (`Paquet Android`, `Paquet iOS`). Rien n'est constructible sous Windows :
  Xcode n'y existe pas, et ni Java ni le SDK Android ne sont installés.
- ✅ **Banc `verif:push-natif`**, 42 vérifications exécutées, dans `npm run verif`.

---

## 3. Ce qui dépend d'Alex

### 3.1 Les secrets GitHub

| Secret | Pour quoi | Où le trouver |
|---|---|---|
| `CLE_ANDROID_B64` | signer le bundle | la clé de signature, encodée en base64 |
| `CLE_ANDROID_MDP` | son mot de passe | |
| `CLE_ANDROID_ALIAS` | son alias | |
| `CERTIFICAT_P12_B64` | signer l'app iOS | certificat de **distribution**, exporté du trousseau |
| `CERTIFICAT_MDP` | son mot de passe | |
| `PROFIL_MOBILEPROVISION_B64` | profil de provisionnement App Store | portail développeur Apple |

🔴 **Une clé de signature Android perdue, c'est une application qu'on ne peut
plus jamais mettre à jour.** Trois clés sont déjà enregistrées chez Google : il
faut identifier laquelle correspond à `app.yoppaa.client`, ou activer la
signature par Google Play si elle ne l'est pas déjà.

### 3.2 Les visuels, à produire

**Google Play**

| Élément | Format exact | Quantité |
|---|---|---|
| Icône | **512 × 512** PNG, sans transparence | 1 |
| Image de bandeau | **1024 × 500** PNG ou JPEG | 1 |
| Captures téléphone | min **320 px**, max **3840 px**, ratio entre 16:9 et 9:16 | **2 minimum**, 8 max |
| Captures tablette 7" et 10" | mêmes règles | facultatif, mais recommandé |

**App Store**

| Élément | Format exact | Quantité |
|---|---|---|
| Icône | **1024 × 1024** PNG, sans transparence ni coins arrondis | 1 |
| Captures iPhone 6.9" | **1290 × 2796** ou 1320 × 2868 | **3 minimum**, 10 max |
| Captures iPhone 6.5" | **1242 × 2688** ou 1284 × 2778 | 3 minimum |
| Captures iPad 13" | **2064 × 2752** | requis seulement si l'app est proposée sur iPad |

⚠️ **Décider si on propose l'app sur iPad.** Dire non supprime tout un jeu de
captures et une surface de test ; dire oui demande que l'affichage tienne sur
grand écran. L'app est déclarée `portrait` dans son manifeste.

### 3.3 Les écrans à capturer

Les cinq qui racontent l'histoire, dans cet ordre :

1. **La liste des commerces** avec la géolocalisation active — c'est la promesse.
2. **Une fiche commerce** avec ses horaires et son bouton de commande.
3. **Le panier ou le tunnel de commande**, au moment du choix du créneau.
4. **La carte de fidélité** avec sa jauge.
5. **Les bons cadeaux** ou la réservation de table, selon ce qu'on veut mettre en avant.

⚠️ **Aucune capture ne doit montrer un commerce de test.** Il y a aujourd'hui
plusieurs fiches de démonstration publiées : elles doivent être retirées ou
évitées au cadrage. Un relecteur qui tombe sur « La mie de test » comprend qu'il
regarde un brouillon.

---

## 4. Le check de conformité

### ✅ Déjà en règle

- **Politique de confidentialité atteignable depuis l'app** : `/legal`, lié dans
  le Profil du Yopper, **affiché même sans compte**. Motif de rejet classique.
- **Sous-traitants déclarés** et vérifiés par un banc qui les cherche dans le
  CODE : Nominatim, OpenRouteService, Upstash, Brevo, Supabase, Stripe,
  OneSignal, Resend.
- **URL publique de suppression de compte**, utilisable sans installer l'app.
- **Suppression de compte DANS l'app** : onglet Profil, bouton « Supprimer mon
  compte ». Exigence 5.1.1(v) d'Apple, motif de rejet fréquent.
- **Sign in with Apple non requis** : aucune connexion tierce n'est proposée.
- **Aucun paiement de service numérique** dans l'app publiée.

### ✅ La suppression de compte bloquée par un solde — traité

**Le constat de départ était faux, et c'est une erreur de lecture de ma part.**
J'avais jugé l'écran en lisant le serveur : `app/api/yopper/supprimer-compte`
rend bien un 409 sans proposer de voie, mais l'écran, lui, affichait déjà
« Reviens quand ce sera terminé, ou écris-nous à dpo@yoppaa.app ».

Le risque de rejet était donc **bien plus faible** qu'annoncé. Ce qui restait
perfectible était modeste et a été corrigé : l'adresse **se clique** désormais,
avec un sujet pré-rempli. Un relecteur Apple qui doit recopier une adresse à la
main, c'est une friction inutile au moment précis où il vérifie la règle
5.1.1(v).

⚠️ Reste un choix, si l'on veut aller plus loin : **supprimer quand même en
prévenant que le solde est perdu**. Plus simple pour le relecteur, plus coûteux
pour le Yopper. À trancher seulement si Apple objecte.

### ⏳ À préparer

- **Déclarations de données** : formulaire « Sécurité des données » de Google et
  étiquettes de confidentialité d'Apple. ⚠️ Elles doivent correspondre à ce que
  `/legal` déclare, sinon la divergence se paie au dépôt. Données collectées :
  adresse email, nom, téléphone, **position approximative**, historique d'achat,
  identifiants d'appareil (notifications).
- **Compte de démonstration pour le relecteur** : Apple exige un identifiant qui
  fonctionne. Prévoir un compte Yopper avec un commerce ouvert à proximité,
  sinon le relecteur voit une liste vide et rejette pour « contenu incomplet ».
  ⚠️ **Il teste depuis la Californie** : la géolocalisation ne montrera aucun
  commerce belge. Prévoir la phrase qui explique comment choisir une commune à
  la main, dans les notes de revue.
- **Classification du contenu** (questionnaire Google) et **âge minimum**.

---

## 5. Les textes de fiche

### Google Play

**Titre** (30 caractères max)
> `Yoppaa - Commerces locaux`

**Description courte** (80 caractères max)
> `Commande chez tes commerçants du coin, et récupère sans faire la file.`

**Description longue** (4000 caractères max)

> Yoppaa rassemble les commerçants de ta commune en un seul endroit.
>
> Tu vois qui est ouvert autour de toi, ce qu'ils proposent aujourd'hui, et tu
> commandes avant d'arriver. Ta commande t'attend, tu ne fais pas la file.
>
> **Ce que tu peux faire**
>
> • Trouver les commerces ouverts près de chez toi
> • Commander et payer à l'avance, ou payer sur place
> • Réserver une table, un rendez-vous, un créneau
> • Te faire livrer quand le commerçant le propose
> • Cumuler ta fidélité, sans carte en carton à retrouver
> • Offrir un bon cadeau valable chez ton commerçant préféré
> • Repérer les invendus à prix réduit, avant la fermeture
>
> **Pourquoi c'est différent**
>
> Yoppaa ne remplace pas ton commerçant, il lui donne les mêmes outils que les
> grandes enseignes. Tu commandes chez lui, tu payes chez lui, et c'est lui que
> tu retrouves au comptoir.
>
> Yoppaa est développé en Belgique, à Mettet.

### App Store

**Nom** (30 caractères max)
> `Yoppaa`

**Sous-titre** (30 caractères max)
> `Tes commerces, à portée`

**Mots-clés** (100 caractères max, séparés par des virgules, sans espaces)
> `commerce,local,commande,click,collect,boulangerie,restaurant,fidélité,belgique,livraison`

**Texte promotionnel** (170 caractères max, modifiable sans revue)
> `Commande chez tes commerçants du coin et récupère sans attendre. Fidélité, bons cadeaux et réservations, tout au même endroit.`

---

## 6. L'ordre de marche

1. **Trancher la suppression de compte** (§4) — c'est le seul point qui peut
   coûter un cycle de revue entier.
2. **Poser les secrets GitHub** (§3.1), en commençant par Android.
3. **Lancer `Paquet Android`** depuis l'onglet Actions, version `1.0.0`, build `1`.
4. **Déposer le bundle** sur la fiche Play, déjà à 9 tâches sur 11.
5. **Produire les captures** (§3.2 et §3.3).
6. **Remplir les déclarations de données**, en relisant `/legal` en parallèle.
7. **Lancer `Paquet iOS`** une fois les certificats posés, puis déposer.

⚠️ **Le lancement officiel est le 14 novembre**, l'ouverture aux Yoppers le
1er octobre. Un aller-retour de revue Apple prend plusieurs jours : déposer tôt
laisse le temps d'encaisser un refus sans que la date bouge.
