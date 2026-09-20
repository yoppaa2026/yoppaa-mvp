# Passer Stripe en live

État au **17 septembre 2026**. Yoppaa tourne aujourd'hui **entièrement en mode
test** : la clé de la plateforme commence par `sk_test_`, et les onze comptes
connectés sont des comptes de test. Aucun euro réel n'a jamais transité.

> 🔴 **Le mode est une propriété de la PLATEFORME, pas du commerçant.** On ne
> peut pas avoir L'Arrosoir en live et La Table d'Essai en test : le jour où la
> clé bascule, **tous** les comptes de test deviennent invalides d'un coup.

## Qui passe en live

| Fiche | Après bascule |
|---|---|
| **L'Arrosoir** | vrai commerçant → refait son parcours **en live** |
| **Centre Respire** (Emily Woine) | vrai commerçant → parcours en live |
| **Le Bistrologue** | vrai commerçant → parcours en live |
| **Kebabistro, le NOUVEAU** (pas encore inscrit) | s'inscrira **après** la bascule, donc directement en live |
| Tout le reste | fiches de test, **dépubliées au 1er octobre** |

✅ **Aucun n'a terminé son parcours Stripe**, donc personne ne refait un travail
déjà fait. L'Arrosoir l'a seulement commencé, et s'est arrêtée sur consigne
d'Alex.

🔴 **LE « Kebabistro » PRÉSENT EN BASE EST LA FICHE DE TEST**
(`kebabistro@yoppaa.app`, publiée). Le vrai n'est pas encore inscrit. Le SQL de
détachement ne le nomme donc **pas** : le nommer reviendrait à détacher la fiche
de test en croyant préparer la vraie.

---

## 1. Avant de basculer : finir les essais

🔴 **Les blocs H à L doivent être terminés AVANT.** H1 et H2 portent sur une
table **garantie** : poser une empreinte demande un Stripe qui fonctionne. Une
fois en live, La Table d'Essai n'aura plus de compte valide et ces essais
deviendront impossibles.

---

## 2. Dans Stripe, en mode live

Passer l'interrupteur « Mode test » sur **off**, puis :

1. **Créer les deux tarifs d'abonnement** (Communiquer 19,90 · Vendre 49,90) et
   relever leurs identifiants `price_…`. 🔴 **Les montants sont HTVA** : 19,90 et
   49,90, jamais 24,08 ni 60,38. Un Price qui porterait déjà la TVA la ferait
   compter deux fois (24,08 + 21 % = 29,14 €).
2. 🔴 **Créer le taux de taxe** (Produits → Taux de taxe → Créer), et relever son
   identifiant `txr_…` : nom affiché `TVA`, **21 %**, pays **Belgique**, et
   **« inclus dans le prix » = NON**.
   ⚠️ **Ce « non » décide de la marge.** Un taux inclusif déclarerait que les
   19,90 € contenaient déjà la TVA : Avcotech en reverserait 3,45 € et il
   resterait 16,45 €, soit 17,4 % de la recette d'abonnement.
   🔴 **Un TaxRate de test ne vaut rien en production**, il faut le recréer ici.
3. **Créer les deux webhooks** vers la production :
   - `https://www.yoppaa.app/api/stripe/webhook` — les paiements et les comptes
     connectés. ⚠️ Cocher aussi les événements **Connect**.
   - `https://www.yoppaa.app/api/stripe/billing/webhook` — les abonnements.
4. Relever les **deux secrets** `whsec_…`, un par webhook.

---

## 3. Dans Vercel, les variables de production

⚠️ **Quatre changent, quatre se remplissent, et le reste ne bouge pas.**

**À remplacer** (test → live)

| Variable | Avant | Après |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_…` | `sk_live_…` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_test_…` | `pk_live_…` |
| `STRIPE_CONNECT_CLIENT_ID` | `ca_test_…` | `ca_live_…` |
| `STRIPE_WEBHOOK_SECRET` | secret test | **secret du webhook live** |

⚠️ **DEUX DE CES QUATRE NE SONT LUES PAR PERSONNE** (vérifié le 20/09).
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` et `STRIPE_CONNECT_CLIENT_ID` alimentent
`STRIPE_CONFIG.publishableKey` et `.connectClientId` (`lib/stripe.js:30-31`), et
**aucun fichier du dépôt ne lit ces deux propriétés**. Tout passe par Checkout
hébergé, il n'y a pas de `loadStripe` côté navigateur, et le commentaire du
fichier dit lui-même du second qu'il n'est « pas utilisé en Express ».
Les remplacer ne coûte rien et garde la porte ouverte ; **ne pas les confondre
avec les deux qui comptent vraiment**, `STRIPE_SECRET_KEY` et
`STRIPE_WEBHOOK_SECRET`, dont l'absence arrête tout.

**À renseigner s'ils sont vides** — le code les choisit tout seul dès que la clé
est en `sk_live_`, mais il ne peut pas les inventer :

| Variable | Contenu |
|---|---|
| `STRIPE_PRICE_COMMUNIQUER_LIVE` | le `price_…` créé à l'étape 2 |
| `STRIPE_PRICE_VENDRE_LIVE` | idem |
| `STRIPE_TAX_RATE_BE_LIVE` | le `txr_…` du taux de taxe créé à l'étape 2 |
| `STRIPE_BILLING_WEBHOOK_SECRET_LIVE` | le `whsec_…` du webhook de facturation |

🔴 **ET HUIT AUTRES QUE CE DOCUMENT OUBLIAIT** (trouvées le 20/09 par un audit
des variables). Ce sont les ventes d'Avcotech : elles passent par le compte
PLATEFORME, donc par des Price que Stripe doit connaître.

| Variable | Produit |
|---|---|
| `STRIPE_PRICE_SMS100_LIVE` | pack 100 SMS de fidélité |
| `STRIPE_PRICE_SMS500_LIVE` | pack 500 SMS |
| `STRIPE_PRICE_SUCCESS_PACK_LIVE` | accompagnement sur place, 199 € |
| `STRIPE_PRICE_SUCCESS_PACK_KIT_LIVE` | accompagnement + installation, 259 € |
| `STRIPE_PRICE_MISE_EN_ROUTE_LIVE` | mise en route à distance, 59 € |
| `STRIPE_PRICE_KIT_PRO_LIVE` | Kit Yoppaa Pro, 469 € |
| `STRIPE_PRICE_KIT_LIGHT_LIVE` | Kit Yoppaa Light, 259 € |
| `STRIPE_PRICE_ROULEAU_LIVE` | pack de 8 rouleaux, 47,90 € |

🔴 **ET LEURS JUMELLES `_TEST` N'EXISTENT PAS NON PLUS** (constaté sur la liste
Vercel du 20/09). Autrement dit, **acheter un pack SMS ou un article de la
boutique rend déjà 500 aujourd'hui**, et pas seulement après la bascule.

⚠️ **UN SEUL PRICE MANQUANT FAIT TOMBER TOUT LE PANIER.**
`app/api/accompagnement/checkout/route.js:71` résout les Price dans un `.map()`
synchrone : le premier produit sans variable fait lever la route entière, et
aucun autre article du panier ne part au paiement. Le commerçant voit un message
technique, jamais lequel des articles pose problème.

🔴 **DEUX OUBLIS COÛTENT CHER ICI, ET ILS NE SE VOIENT PAS DE LA MÊME FAÇON.**

- `STRIPE_BILLING_WEBHOOK_SECRET_LIVE` vide : les abonnements **ne se confirment
  plus**, et personne ne le voit avant le premier paiement raté. Silencieux.
- `STRIPE_TAX_RATE_BE_LIVE` vide : **toute souscription lève immédiatement**
  (« Configuration Stripe incomplète »), côté Checkout comme à la validation
  d'un KYB. Bruyant, donc moins dangereux, mais bloquant tout de suite.
  ⚠️ C'est délibéré : encaisser un abonnement **sans TVA** coûte plus cher que
  de refuser une souscription. Le code refuse plutôt que de deviner.

✅ **`npm run controle:tva` vérifie les trois d'un coup** (le taux, son
`inclusive`, et le montant des deux Price), en **lecture seule**. À lancer juste
après avoir renseigné les variables, avant d'annoncer quoi que ce soit.

⚠️ **Ne pas toucher** aux variables `_TEST` : elles ne servent plus en
production, mais elles resteront utiles le jour où on montera un bac à sable.

---

## 4. En base : détacher les comptes morts

🔴 **Sans cette étape, le parcours Stripe est cassé pour les quatre.** Leur
fiche porte un `stripe_account_id` de test ; en live, Stripe répondra que le
compte est introuvable, et l'écran affichera « Continuer l'onboarding » sur un
compte qui n'existe pas.

`migrations/BASCULE_STRIPE_LIVE.sql` fait exactement deux choses :

1. **détache** le compte Stripe des quatre vrais commerçants, pour que leur
   bouton redevienne « Connecter Stripe » et que le parcours reparte propre ;
2. **contrôle** qu'aucune autre fiche publiée ne garde un compte actif.

⚠️ **À passer JUSTE APRÈS le changement des variables**, pas avant : entre les
deux, la production est en live avec des comptes de test, donc aucun paiement
ne passe. Ce créneau doit être le plus court possible.

---

## 5. Contrôler, tout de suite

Le SQL rend une ligne par vérification. Ce qu'on veut voir :

- les quatre vrais commerçants **sans compte Stripe** et sans encaissement ;
- **aucune fiche publiée** avec un compte de test encore actif ;
- le nombre de fiches de test encore publiées, à dépublier avant le 1er octobre.

Et dans l'application : ouvrir le tableau de bord de L'Arrosoir en mode admin.
Le bouton doit dire **« Connecter Stripe »**, pas « Continuer l'onboarding ».

---

## 6. Le feu vert aux commerçants

C'est **la seule étape qu'Alex ne contrôle pas**, mais elle est plus rapide que
ce que ce document affirmait avant le 17/09.

🔴 **CORRECTION D'UNE AFFIRMATION DE L'ASSISTANT.** J'avais écrit « compte
plusieurs jours » sans l'avoir vérifié, et tout un arbitrage de calendrier en
dépendait. Alex a corrigé : **`charges_enabled` passe à vrai en quelques
minutes.** Stripe vérifie le BCE et l'identité automatiquement, et quand il veut
une pièce en plus, il laisse encaisser d'abord, avec une échéance.

⚠️ **Ce qui peut traîner, ce sont les VERSEMENTS vers l'IBAN, pas la capacité à
encaisser.** `charges_enabled` et `payouts_enabled` sont deux choses
différentes : un commerçant peut vendre bien avant d'être payé. Les confondre
fait croire à un délai qui n'existe pas.

**Le vrai délai est humain** : que les cinq lisent le message, retrouvent leur
IBAN et leur carte d'identité, et s'y mettent. Celui-là peut courir **avant** la
bascule : leur demander de préparer leurs documents ne coûte rien et fait gagner
les jours qui comptent.

Ce qu'il faut leur dire :

> Ton espace Yoppaa est prêt. Il te reste à connecter ton compte bancaire pour
> recevoir les paiements : environ cinq minutes, avec ta pièce d'identité et
> ton IBAN. Tu reçois l'argent directement sur ton compte, Yoppaa ne prélève
> rien sur tes ventes.

⚠️ **Tant qu'un commerçant n'a pas fini, `charges_enabled` est faux et aucun
paiement ne passe chez lui.** Il peut ouvrir quand même, en encaissement sur
place uniquement.

---

## 7. Ce qui reste après

🔴 **RETIRER LA CARTE DE TEST DES INSTRUCTIONS DE REVUE, SUR LES DEUX STORES.**

Le 18/09, la soumission à Google est partie avec ce paragraphe dans
**Contenu de l'application → Informations de connexion** :

> With a payment: Stripe runs in test mode for this review. Use card
> 4242 4242 4242 4242, any future expiry date, any 3-digit CVC, any postal
> code. No real money is charged.

⚠️ **CE TEXTE DEVIENT FAUX À LA SECONDE OÙ ON BASCULE**, et le piège n'est pas
qu'il soit inexact : c'est que **les stores relisent ces instructions bien après
la première revue**. Google comme Apple re-testent une application déjà publiée,
à l'occasion d'une mise à jour ou d'un contrôle. Le relecteur suit la consigne,
la carte `4242` est refusée par le Stripe réel, il voit un **paiement qui
échoue** et il rejette, sans que rien n'ait changé dans le code.

**Le geste** : ne garder que le chemin sans paiement.

> Without paying: open "Chez Momo", add an item, and choose "paiement sur
> place" (pay on site) at checkout.

⚠️ **Et ne pas basculer PENDANT une revue en cours**, pour la même raison. L'ordre
est : soumettre → laisser la revue se faire → basculer → publier. La
**publication gérée** de Play, activée le 18/09, donne exactement ce contrôle :
Google approuve, et c'est Alex qui décide du jour de la mise en ligne.

- **Dépublier les fiches de test** avant le 1er octobre.
- **Monter le bac à sable** : une fois la production en live, il n'y a plus
  d'endroit où essayer sans conséquence. Ce n'est plus un confort.
- **Une bannière « mode test »** dans le tableau de bord : aujourd'hui rien ne
  signale le mode, et c'est exactement ce qui a fait écrire à l'assistant que
  G5 avait encaissé 120 € réels alors que c'était de la monnaie de test.
