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

---

## 7. Les notes de revue

C'est le premier texte que le relecteur ouvre, et souvent le seul qu'il lit en
entier. Il se colle dans **App Review Information → Notes** chez Apple, et dans
**Instructions de test** chez Google.

🔴 **Trois choses le décident, et deux sont invisibles depuis un bureau
californien** : il ne verra aucun commerce, il ne pourra pas payer, et il
cherchera les achats intégrés. Chacune est un rejet si la note ne l'a pas dit
d'avance.

### 7.1 Ce que le relecteur doit savoir, dans l'ordre

| Point | Pourquoi il décide |
|---|---|
| **La géolocalisation** | il teste depuis la Californie : sans commune choisie à la main, sa liste est **vide**, et une app vide se rejette pour contenu incomplet |
| **Le paiement** | il cherchera pourquoi ce n'est pas un achat intégré ; la réponse tient en une phrase, mais elle doit y être |
| **Le compte de démonstration** | Apple l'exige dès qu'il y a une connexion, et il doit fonctionner le jour de la revue |

### 7.2 Le paiement, et pourquoi ce n'est pas un achat intégré

Yoppaa vend des **biens et services du monde réel** : un repas retiré au
comptoir, une table au restaurant, une coupe chez le coiffeur, un colis expédié
par la poste. Apple autorise explicitement un moyen de paiement externe pour
ça, et l'achat intégré n'est exigé que pour du contenu numérique consommé dans
l'application.

⚠️ **Le seul point discutable est le bon cadeau.** Il s'achète dans
l'application, mais il ne se consomme que chez un commerçant physique : c'est un
avoir sur un bien réel, pas un contenu. La note le dit d'avance plutôt que
d'attendre la question.

### 7.3 Ce que le relecteur peut réellement faire

🔴 **Le parcours doit aller jusqu'au bout sans carte bancaire.** Les fiches de
démonstration encaissent **au comptoir** : la commande se confirme sans
paiement, et l'écran le dit. Voir `PROCEDURE_BASCULE_STRIPE.md` §2, et le
contrôle D du SQL de bascule, qui compte les fiches dont le tunnel s'arrêterait
sans issue.

⚠️ **Une fiche de détail en expédition ne peut pas encaisser au comptoir** : un
colis part avant toute rencontre. Si une fiche de démonstration est en
expédition, son tunnel meurt. À basculer en retrait avant les captures.

### 7.4 Le texte à coller (anglais)

> **About Yoppaa**
>
> Yoppaa connects people with independent shops in their own town in Belgium:
> bakeries, restaurants, hair salons, grocers. Users browse what is open nearby,
> order ahead, book a table or an appointment, and collect in store.
>
> **Reviewing from outside Belgium**
>
> The app lists shops around the user. The test account below is already
> registered in **Mettet, Belgium**, so shops, menus and booking appear as soon
> as you sign in, with or without location permission. You may decline the
> location prompt.
>
> **Test account**
>
> Email: `<a completer>` — Password: `<a completer>`
>
> **Payments**
>
> Yoppaa is used to buy physical goods and real-world services consumed outside
> the app (food collected in store, restaurant tables, salon appointments,
> parcels shipped by post). Payment for these is handled by the merchant through
> Stripe, in line with App Store Review Guideline 3.1.3(e) for goods and
> services used outside the app. Gift vouchers sold in the app are credit
> redeemable only in a physical shop, not digital content.
>
> **Test card**
>
> The demonstration merchants run in Stripe test mode. To complete a full
> payment, use card number **4242 4242 4242 4242**, any future expiry date, any
> 3-digit CVC, any postcode. No real money is charged. The Stripe payment page
> displays a "TEST MODE" banner, which is expected.
>
> Ordering without payment is also possible: several merchants accept payment on
> collection, and the order is confirmed immediately.
>
> **Account deletion**
>
> Account deletion is available in the app under the **Profile** tab, button
> **Supprimer mon compte**, and also at https://www.yoppaa.app/legal. Deletion is refused only
> while an order or a paid voucher is still outstanding, and the screen then
> explains what remains and gives a contact address.
>
> **Company**
>
> Avcotech, Rue de Prée 9 G, 5640 Mettet, Belgium. Contact: hello@yoppaa.app

⏳ **À compléter avant de coller** : l'identifiant et le mot de passe du compte
de démonstration.

🔴 **LE COMPTE DE DÉMONSTRATION DOIT AVOIR UN VRAI MOT DE PASSE**, décidé le
11/08 et toujours vrai : le lien magique seul est inutilisable, le relecteur n'a
aucun accès à la boîte mail. Un compte qui n'ouvre qu'avec un lien reçu par
courriel est un rejet immédiat.

⚠️ **Deux autres décisions arrêtées le 11/08, à ne pas rouvrir** :
« Autoriser Google à tester avec ces identifiants » reste **désactivé** (le robot
tapote au hasard, atteindrait le bouton de confirmation et créerait de vraies
commandes chez de vrais commerçants) ; et **on n'écrit jamais à un store que
l'application contient des données de test**, ce qui reviendrait à déclarer
qu'elle n'est pas finie.

⚠️ **Une piste notée le 11/08, à vérifier avant de s'en servir** : « refuser la
géolocalisation et saisir le code postal 5640 ». Cette instruction a trois
semaines et l'écran d'accueil a changé depuis. La commune vient aujourd'hui du
profil du client (`clients.commune_id`), pas d'un champ de saisie : c'est
exactement ce que l'essai §7.5 doit trancher. **Ne pas recopier cette phrase
dans les notes sans l'avoir vue fonctionner.**

🔴 **CE TEXTE N'EST VRAI QUE TANT QUE LA PLATEFORME EST EN MODE TEST.** Le jour
de la bascule, la carte `4242` sera refusée, et une note qui l'annonce enverrait
le relecteur droit dans le mur. **Ne bascule pas pendant qu'un dossier est
ouvert chez Apple ou Google** : il reprend son test le lendemain, tombe sur des
comptes morts, et le rejet est de ta main.

⚠️ **L'ordre est donc : soumettre, attendre la validation, puis basculer.** Et
prévenir les commerçants de préparer leur IBAN et leur carte d'identité dès
maintenant : ce délai-là est humain, il peut courir pendant la revue.

### 7.5 L'essai qui valide la note, à faire par Alex

🔴 **Une note de revue qui décrit un chemin faux coûte un cycle entier.** Deux
affirmations de cette note n'ont pas pu être prouvées depuis le code et doivent
donc être vues à l'écran, **en navigation privée**, avec le compte de
démonstration et **rien d'autre** :

1. Refuser la demande de géolocalisation, puis regarder la liste d'accueil.
   **Si elle est vide, la note est fausse** et il faut décrire le geste réel qui
   fait apparaître les commerces. La commune vient du profil du client
   (`clients.commune_id`), pas d'un sélecteur d'écran : je n'ai pas pu établir
   avec certitude que la liste s'en sert quand la position est refusée.
2. Aller jusqu'au bout d'une commande sur une fiche de démonstration, sans
   carte. **Si un écran réclame une carte, le relecteur sera bloqué au même
   endroit.**

⚠️ **Le compte doit fonctionner le jour de la revue, pas le jour du dépôt.**
Apple ouvre parfois le dossier trois jours plus tard ; un compte expiré, un mot
de passe changé ou une fiche dépubliée entre-temps est un rejet sec.
