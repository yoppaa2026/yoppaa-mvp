-- CE QUE LE RELECTEUR POURRA VOIR, FONCTIONNALITE PAR FONCTIONNALITE (17/09)
--
-- ⚠️ LECTURE SEULE. Ne modifie rien. Aucune donnee personnelle en sortie : des
-- noms d enseignes, des drapeaux de configuration et des comptages.
--
-- POURQUOI. Les descriptions Google Play et App Store annoncent huit choses.
-- 🔴 UNE FONCTIONNALITE ANNONCEE QUE LE RELECTEUR NE TROUVE NULLE PART EST UN
-- MOTIF DE REJET, et il coute un cycle entier. Ce controle dit, pour chacune,
-- QUELLE FICHE la porte. Une ligne « (AUCUNE) » est un trou a combler avant de
-- deposer.
--
-- ⚠️ ET IL NOMME LES FICHES, il ne les compte pas. Un compte dit « c est
-- couvert » ; seul un nom permet d aller completer la bonne fiche.
--
-- Rappel : seules les fiches PUBLIEES existent pour le relecteur. Une fiche
-- parfaite en brouillon ne couvre rien du tout.

WITH jour AS (SELECT (now() AT TIME ZONE 'Europe/Brussels')::date AS j),
-- 🔴 UNE FICHE NE SE JUGE PAS SANS SON FORFAIT (leçon d Alex, 17/09). Le premier
-- jet signalait Sushi Yuki comme « sans aucun moyen de paiement », alarme rouge.
-- Elle est en EXISTER : le palier gratuit ne donne ni commande ni encaissement,
-- donc elle est exactement conforme a ce qu elle a achete. Un controle qui
-- ignore le forfait transforme une regle du produit en defaut, et envoie
-- corriger ce qui marche.
--
-- ⚠️ LES ALIAS HERITES COMPTENT : `on` vaut exister et `full` vaut vendre
-- (LEGACY_PLAN_ALIASES, lib/plans.js:45). Les oublier classerait d anciennes
-- fiches en « forfait inconnu ».
pub AS (
  SELECT id, nom, categorie, rdv_actif, livraison_actif, fidelite_actif,
         bons_cadeaux_actif, stripe_account_charges_enabled, stripe_account_mode,
         accepte_paiement_cash, boutique_mode_vente, boutique_retrait_paiement,
         logo_url, description, telephone,
         CASE coalesce(plan, 'exister')
           WHEN 'on' THEN 'exister' WHEN 'full' THEN 'vendre'
           ELSE coalesce(plan, 'exister') END AS forfait
    FROM commercants
   WHERE statut_publication = 'publie'
),
-- ⚠️ `categorie` VIDE VAUT « alimentaire » : c est la regle de `isAlimentaire`
-- dans lib/plans.js. L oublier classerait des fiches du mauvais cote et ferait
-- croire a un trou qui n existe pas.
ali AS (SELECT * FROM pub WHERE coalesce(categorie, 'alimentaire') = 'alimentaire'),
srv AS (SELECT * FROM pub WHERE coalesce(categorie, 'alimentaire') <> 'alimentaire'),
art AS (
  SELECT commercant_id, count(*) AS n
    FROM articles WHERE actif IS TRUE GROUP BY commercant_id
),
-- 🔴 UN SALON NE VEND PAS DES ARTICLES, IL VEND DES PRESTATIONS. Le premier jet
-- de ce controle comptait les `articles` chez tout le monde et signalait « Salon
-- Nathalie (1) » comme un catalogue trop maigre, alors que son catalogue vit
-- dans `rdv_prestations`. Une regle de catalogue produit appliquee a un metier
-- de service invente un trou qui n existe pas, et envoie Alex remplir la
-- mauvaise page.
pres AS (
  SELECT commercant_id, count(*) AS n
    FROM rdv_prestations WHERE actif IS TRUE AND deleted_at IS NULL
   GROUP BY commercant_id
),
-- 🔴 UN DEAL « ACTIF » N EST PAS UN DEAL VISIBLE, et c est le piege de cette
-- table. `dealActifCeJour` (lib/deals.js:53) exige, EN PLUS de `actif`, soit une
-- `date_deal` qui tombe aujourd hui, soit un COUPLE debut+fin qui l encadre.
-- Un deal coche sans aucune date n est jamais rendu : il ne s affiche nulle
-- part, et rien dans le tableau de bord ne le dit.
deal_vu AS (
  SELECT d.commercant_id, d.heure_debut, d.heure_fin
    FROM yoppaa_deals d, jour
   WHERE d.actif IS TRUE
     AND (d.date_deal::date = jour.j
       OR (d.date_debut IS NOT NULL AND d.date_fin IS NOT NULL
           AND d.date_debut::date <= jour.j AND d.date_fin::date >= jour.j))
),
-- ⚠️ L ANTI-GASPI N A PAS DE DRAPEAU EN BASE, ET C EST DELIBERE : la PRESENCE
-- DE LA FENETRE FAIT L OFFRE (lib/anti-gaspi.js, `porteUneFenetre`). Un booleen
-- a cote des heures aurait pu dire « oui » pendant que les heures disent non.
gaspi AS (SELECT * FROM deal_vu WHERE heure_debut IS NOT NULL AND heure_fin IS NOT NULL)

SELECT 'A. fiches PUBLIEES, le total'::text AS controle,
       (SELECT count(*)::text FROM pub) AS valeur,
       '6 a 8. En dessous de 5, une place de marche ressemble a une maquette'::text AS attendu
UNION ALL
SELECT 'B. et lesquelles'::text,
       coalesce((SELECT string_agg(nom, ' · ' ORDER BY nom) FROM pub), '(aucune)'),
       'aucune ne doit se dire « test », « demo » ou « provisoire »'::text
UNION ALL
-- ═══ LES HUIT FONCTIONNALITES ANNONCEES ═══════════════════════════════════
SELECT 'C. COMMANDER ET RETIRER (alimentaire avec des articles)'::text,
       coalesce((SELECT string_agg(a.nom, ' · ' ORDER BY a.nom)
                   FROM ali a JOIN art ON art.commercant_id = a.id WHERE art.n > 0), '(AUCUNE)'),
       'au moins une, sinon le coeur de l app n est pas demontrable'::text
UNION ALL
SELECT 'D. PAYER A L AVANCE (compte Stripe qui encaisse)'::text,
       coalesce((SELECT string_agg(nom, ' · ' ORDER BY nom) FROM pub
                  WHERE stripe_account_charges_enabled IS TRUE), '(AUCUNE)'),
       'au moins une : la description annonce le paiement a l avance'::text
UNION ALL
SELECT 'E. RESERVER UNE TABLE (alimentaire, reservation allumee)'::text,
       coalesce((SELECT string_agg(nom, ' · ' ORDER BY nom) FROM ali
                  WHERE rdv_actif IS TRUE), '(AUCUNE)'),
       'au moins un restaurant'::text
UNION ALL
SELECT 'F. PRENDRE RENDEZ-VOUS (service, agenda allume)'::text,
       coalesce((SELECT string_agg(nom, ' · ' ORDER BY nom) FROM srv
                  WHERE rdv_actif IS TRUE), '(AUCUNE)'),
       'au moins un salon ou centre de bien-etre'::text
UNION ALL
SELECT 'G. LIVRAISON'::text,
       coalesce((SELECT string_agg(nom, ' · ' ORDER BY nom) FROM pub
                  WHERE livraison_actif IS TRUE), '(AUCUNE)'),
       'au moins une'::text
UNION ALL
SELECT 'H. FIDELITE'::text,
       coalesce((SELECT string_agg(nom, ' · ' ORDER BY nom) FROM pub
                  WHERE fidelite_actif IS TRUE), '(AUCUNE)'),
       'au moins une'::text
UNION ALL
-- ⚠️ LES DEUX CONDITIONS. Le bouton d achat d un bon exige l interrupteur ET un
-- compte qui encaisse : un bon cadeau ne se paie pas au comptoir.
SELECT 'I. BONS CADEAUX (interrupteur ET compte qui encaisse)'::text,
       coalesce((SELECT string_agg(nom, ' · ' ORDER BY nom) FROM pub
                  WHERE bons_cadeaux_actif IS TRUE
                    AND stripe_account_charges_enabled IS TRUE), '(AUCUNE)'),
       'au moins une : sans compte Stripe, le bouton n apparait meme pas'::text
UNION ALL
SELECT 'J. BONNES AFFAIRES visibles AUJOURD HUI (dates comprises)'::text,
       coalesce((SELECT string_agg(DISTINCT p.nom, ' · ')
                   FROM pub p JOIN deal_vu v ON v.commercant_id = p.id), '(AUCUNE)'),
       'au moins une : la description annonce les bonnes affaires'::text
UNION ALL
SELECT 'K. RIEN NE SE PERD, offre avec sa fenetre horaire'::text,
       coalesce((SELECT string_agg(DISTINCT p.nom, ' · ')
                   FROM pub p JOIN gaspi g ON g.commercant_id = p.id), '(AUCUNE)'),
       'au moins une : le bandeau « Rien ne se perd » ouvre l accueil'::text
UNION ALL
-- ═══ LES PIEGES QUI COUTENT UN CYCLE ══════════════════════════════════════
-- 🔴 UN DEAL COCHE SANS DATES NE S AFFICHE NULLE PART. Le commercant le croit
-- en ligne, le Yopper ne le verra jamais, et aucun ecran ne le signale.
SELECT '🔴 L. PIEGE : deals coches ACTIFS mais jamais visibles (sans dates)'::text,
       coalesce((SELECT string_agg(DISTINCT p.nom, ' · ')
                   FROM pub p JOIN yoppaa_deals d ON d.commercant_id = p.id, jour
                  WHERE d.actif IS TRUE
                    AND d.date_deal IS NULL
                    AND (d.date_debut IS NULL OR d.date_fin IS NULL)), '(aucun)'),
       '(aucun) : sinon leur poser une date de debut ET de fin'::text
UNION ALL
-- 🔴 UN COLIS NE SE PAIE PAS AU COMPTOIR : il part avant toute rencontre. Une
-- boutique en expedition sans compte Stripe a un tunnel qui s arrete SANS ISSUE,
-- et rien a l ecran ne le dit.
SELECT '🔴 M. PIEGE : expedition SANS compte qui encaisse'::text,
       coalesce((SELECT string_agg(nom, ' · ' ORDER BY nom) FROM pub
                  WHERE boutique_mode_vente = 'expedition'
                    AND stripe_account_charges_enabled IS NOT TRUE), '(aucune)'),
       '(aucune) : sinon passer ces fiches en retrait, ou les depublier'::text
UNION ALL
-- 🔴 LE DETAIL EN RETRAIT TRANCHE, ET C EST EXCLUSIF : tant que le choix est
-- « en_ligne » sans compte Stripe, aucun moyen de paiement n est ouvert.
SELECT '🔴 N. PIEGE : detail « paiement en ligne » sans compte qui encaisse'::text,
       coalesce((SELECT string_agg(nom, ' · ' ORDER BY nom) FROM pub
                  WHERE coalesce(categorie, 'alimentaire') = 'detail'
                    AND coalesce(boutique_mode_vente, 'retrait') = 'retrait'
                    AND coalesce(boutique_retrait_paiement, 'en_ligne') = 'en_ligne'
                    AND stripe_account_charges_enabled IS NOT TRUE), '(aucune)'),
       '(aucune) : sinon basculer leur reglage sur « magasin »'::text
UNION ALL
-- 🔴 CE QUE LE RELECTEUR LIT EN PREMIER. Une enseigne qui se dit « test » lui
-- annonce qu il regarde un brouillon.
SELECT '🔴 O. PIEGE : une fiche se dit test, demo ou provisoire'::text,
       coalesce((SELECT string_agg(nom, ' · ' ORDER BY nom) FROM pub
                  WHERE nom ~* '(test|demo|démo|provisoire|temoin|témoin|essai|exemple|fictif)'
                     OR coalesce(description, '') ~* '(fiche de test|commerce de test|demonstration|démonstration)'),
                '(aucune)'),
       '(aucune) : a renommer avant les captures'::text
UNION ALL
-- ⚠️ LE MODE STRIPE APPARTIENT A LA PLATEFORME : une seule cle, tous les comptes
-- connectes la suivent. Une fiche nee dans l autre monde ne peut plus encaisser,
-- et son commercant devra se reconnecter. On soumet en TEST, on bascule APRES.
SELECT '⚠️ P. modes Stripe des fiches publiees'::text,
       coalesce((SELECT string_agg(m.ligne, ' · ' ORDER BY m.ligne) FROM (
                   SELECT coalesce(stripe_account_mode, '(vide)') || ' : ' || count(*)::text AS ligne
                     FROM pub WHERE stripe_account_charges_enabled IS TRUE
                    GROUP BY coalesce(stripe_account_mode, '(vide)')) m), '(aucun compte connecte)'),
       'tous en « test » tant que la plateforme est en test'::text
UNION ALL
-- ═══ LA COMPLETUDE, QUI COMPTE PLUS QUE LE NOMBRE ═════════════════════════
-- ⚠️ SIX FICHES SOIGNEES VALENT MIEUX QUE DOUZE BACLEES. Une fiche sans logo,
-- sans description ou sans telephone fait plus de mal que son absence.
SELECT '⚠️ Q. fiches publiees INCOMPLETES (logo, description ou telephone)'::text,
       coalesce((SELECT string_agg(nom, ' · ' ORDER BY nom) FROM pub
                  WHERE coalesce(logo_url, '') = ''
                     OR coalesce(description, '') = ''
                     OR coalesce(telephone, '') = ''), '(aucune)'),
       '(aucune) : chacune est une capture ratee'::text
UNION ALL
-- ⚠️ ON COMPTE LE CATALOGUE REEL : articles POUR le commerce de produits,
-- prestations POUR le metier de service. La somme des deux, parce qu un salon
-- qui revend trois shampoings a bien un catalogue mixte.
SELECT '⚠️ R. fiches publiees au catalogue trop maigre (articles + prestations)'::text,
       coalesce((SELECT string_agg(p.nom || ' (' || coalesce(art.n, 0)::text || ' art + '
                                   || coalesce(pres.n, 0)::text || ' prest)', ' · ' ORDER BY p.nom)
                   FROM pub p
                   LEFT JOIN art ON art.commercant_id = p.id
                   LEFT JOIN pres ON pres.commercant_id = p.id
                  WHERE coalesce(art.n, 0) + coalesce(pres.n, 0) < 3), '(aucune)'),
       '(aucune) : un catalogue a deux lignes ne se photographie pas'::text
UNION ALL
-- ⚠️ RIEN A MONTRER N EST PAS UN DEFAUT, C EST UNE CAPTURE A EVITER. Une fiche
-- en Exister sans catalogue affiche son nom, son logo, ses horaires et son
-- telephone : c est exactement ce que ce palier promet, et ca n a rien
-- d anormal. Mais elle ne fait pas une belle capture d ecran.
SELECT '⚠️ R bis. fiches publiees sans AUCUN contenu a photographier'::text,
       coalesce((SELECT string_agg(p.nom || ' [' || p.forfait || ']', ' · ' ORDER BY p.nom)
                   FROM pub p
                   LEFT JOIN art ON art.commercant_id = p.id
                   LEFT JOIN pres ON pres.commercant_id = p.id
                  WHERE coalesce(art.n, 0) = 0 AND coalesce(pres.n, 0) = 0), '(aucune)'),
       'a ne pas cadrer ; un « exister » ici est conforme, pas casse'::text
UNION ALL
-- 🔴 LA VRAIE ALARME : LA FICHE QUI PROMET ET NE TIENT PAS. Un forfait payant
-- annonce la commande ; sans compte qui encaisse NI paiement au comptoir, son
-- bouton est mort et le client ne sait pas pourquoi.
SELECT '🔴 R ter. fiches a forfait PAYANT sans aucun moyen de paiement'::text,
       coalesce((SELECT string_agg(p.nom || ' [' || p.forfait || ']', ' · ' ORDER BY p.nom)
                   FROM pub p
                  WHERE p.forfait <> 'exister'
                    AND p.stripe_account_charges_enabled IS NOT TRUE
                    AND p.accepte_paiement_cash IS NOT TRUE), '(aucune)'),
       '(aucune) : celles-la promettent la commande sans pouvoir l encaisser'::text
UNION ALL
-- ⚠️ LA REPARTITION PAR FORFAIT, qui explique tout le reste. Les trois paliers
-- font partie de ce qu on montre : une vitrine gratuite a cote d une boutique
-- qui encaisse, c est le modele, pas un trou.
SELECT '⚠️ S. repartition des fiches publiees par forfait'::text,
       coalesce((SELECT string_agg(f.ligne, ' · ' ORDER BY f.ligne) FROM (
                   SELECT forfait || ' : ' || string_agg(nom, ', ' ORDER BY nom) AS ligne
                     FROM pub GROUP BY forfait) f), '(aucune)'),
       'au moins un « exister » et un « vendre » : les paliers sont annonces'::text;
