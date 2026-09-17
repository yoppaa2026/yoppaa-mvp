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
   relever leurs identifiants `price_…`.
2. **Créer les deux webhooks** vers la production :
   - `https://www.yoppaa.app/api/stripe/webhook` — les paiements et les comptes
     connectés. ⚠️ Cocher aussi les événements **Connect**.
   - `https://www.yoppaa.app/api/stripe/billing/webhook` — les abonnements.
3. Relever les **deux secrets** `whsec_…`, un par webhook.

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

**À renseigner s'ils sont vides** — le code les choisit tout seul dès que la clé
est en `sk_live_`, mais il ne peut pas les inventer :

| Variable | Contenu |
|---|---|
| `STRIPE_PRICE_COMMUNIQUER_LIVE` | le `price_…` créé à l'étape 2 |
| `STRIPE_PRICE_VENDRE_LIVE` | idem |
| `STRIPE_BILLING_WEBHOOK_SECRET_LIVE` | le `whsec_…` du webhook de facturation |

🔴 **C'est l'oubli le plus coûteux de toute la procédure.** Si
`STRIPE_BILLING_WEBHOOK_SECRET_LIVE` reste vide, les abonnements ne se
confirment plus et personne ne le voit avant le premier paiement raté.

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

C'est **la seule étape qu'Alex ne contrôle pas**, et elle commande le
calendrier : vérification d'identité, IBAN, validation par Stripe. Compte
plusieurs jours, davantage si un document manque.

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

- **Dépublier les fiches de test** avant le 1er octobre.
- **Monter le bac à sable** : une fois la production en live, il n'y a plus
  d'endroit où essayer sans conséquence. Ce n'est plus un confort.
- **Une bannière « mode test »** dans le tableau de bord : aujourd'hui rien ne
  signale le mode, et c'est exactement ce qui a fait écrire à l'assistant que
  G5 avait encaissé 120 € réels alors que c'était de la monnaie de test.
