-- CE QUE LE RELECTEUR POURRA VOIR, FONCTIONNALITE PAR FONCTIONNALITE (17/09)
--
-- ⚠️ LECTURE SEULE. Ne modifie rien. Aucune donnee personnelle : des noms
-- d enseignes, des drapeaux de configuration et des comptages.
--
-- POURQUOI. Les descriptions Google Play et App Store annoncent huit choses.
-- 🔴 UNE FONCTIONNALITE ANNONCEE QUE LE RELECTEUR NE TROUVE NULLE PART EST UN
-- MOTIF DE REJET, et il coute un cycle entier. Ce controle dit, pour chacune,
-- QUELLE FICHE la porte. Une ligne vide est un trou a combler avant de deposer.
--
-- ⚠️ ET IL NOMME LES FICHES, il ne les compte pas. Un compte dit « c est
-- couvert » ; seul un nom permet d aller completer la bonne fiche.
--
-- Rappel : seules les fiches PUBLIEES existent pour le relecteur. Une fiche
-- parfaite en brouillon ne couvre rien du tout.

WITH pub AS (
  SELECT id, nom, categorie, rdv_actif, livraison_actif, fidelite_actif,
         bons_cadeaux_actif, stripe_account_charges_enabled, accepte_paiement_cash,
         boutique_mode_vente, boutique_retrait_paiement,
         logo_url, description, telephone
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
)
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
SELECT 'J. BONNES AFFAIRES ET INVENDUS (deals actifs)'::text,
       coalesce((SELECT string_agg(DISTINCT p.nom, ' · ')
                   FROM pub p JOIN yoppaa_deals d ON d.commercant_id = p.id
                  WHERE d.actif IS TRUE), '(AUCUNE)'),
       'au moins une : la description annonce les invendus a prix reduit'::text
UNION ALL
-- ═══ LES PIEGES QUI COUTENT UN CYCLE ══════════════════════════════════════
-- 🔴 UN COLIS NE SE PAIE PAS AU COMPTOIR : il part avant toute rencontre. Une
-- boutique en expedition sans compte Stripe a un tunnel qui s arrete SANS ISSUE,
-- et rien a l ecran ne le dit.
SELECT '🔴 K. PIEGE : expedition SANS compte qui encaisse'::text,
       coalesce((SELECT string_agg(nom, ' · ' ORDER BY nom) FROM pub
                  WHERE boutique_mode_vente = 'expedition'
                    AND stripe_account_charges_enabled IS NOT TRUE), '(aucune)'),
       '(aucune) : sinon passer ces fiches en retrait, ou les depublier'::text
UNION ALL
-- 🔴 LE DETAIL EN RETRAIT TRANCHE, ET C EST EXCLUSIF : tant que le choix est
-- « en_ligne » sans compte Stripe, aucun moyen de paiement n est ouvert.
SELECT '🔴 L. PIEGE : detail « paiement en ligne » sans compte qui encaisse'::text,
       coalesce((SELECT string_agg(nom, ' · ' ORDER BY nom) FROM pub
                  WHERE coalesce(categorie, 'alimentaire') = 'detail'
                    AND coalesce(boutique_mode_vente, 'retrait') = 'retrait'
                    AND coalesce(boutique_retrait_paiement, 'en_ligne') = 'en_ligne'
                    AND stripe_account_charges_enabled IS NOT TRUE), '(aucune)'),
       '(aucune) : sinon basculer leur reglage sur « magasin »'::text
UNION ALL
-- 🔴 CE QUE LE RELECTEUR LIT EN PREMIER. Une enseigne qui se dit « test » lui
-- annonce qu il regarde un brouillon.
SELECT '🔴 M. PIEGE : une fiche se dit test, demo ou provisoire'::text,
       coalesce((SELECT string_agg(nom, ' · ' ORDER BY nom) FROM pub
                  WHERE nom ~* '(test|demo|démo|provisoire|temoin|témoin|essai|exemple|fictif)'
                     OR coalesce(description, '') ~* '(fiche de test|commerce de test|demonstration|démonstration)'),
                '(aucune)'),
       '(aucune) : a renommer avant les captures'::text
UNION ALL
-- ═══ LA COMPLETUDE, QUI COMPTE PLUS QUE LE NOMBRE ═════════════════════════
-- ⚠️ SIX FICHES SOIGNEES VALENT MIEUX QUE DOUZE BACLEES. Une fiche sans logo,
-- sans description ou sans telephone fait plus de mal que son absence.
SELECT '⚠️ N. fiches publiees INCOMPLETES (logo, description ou telephone)'::text,
       coalesce((SELECT string_agg(nom, ' · ' ORDER BY nom) FROM pub
                  WHERE coalesce(logo_url, '') = ''
                     OR coalesce(description, '') = ''
                     OR coalesce(telephone, '') = ''), '(aucune)'),
       '(aucune) : chacune est une capture ratee'::text
UNION ALL
SELECT '⚠️ O. fiches publiees avec MOINS DE 3 articles actifs'::text,
       coalesce((SELECT string_agg(p.nom || ' (' || coalesce(art.n, 0)::text || ')', ' · ' ORDER BY p.nom)
                   FROM pub p LEFT JOIN art ON art.commercant_id = p.id
                  WHERE coalesce(art.n, 0) < 3), '(aucune)'),
       '(aucune) : un catalogue a deux lignes ne se photographie pas'::text
UNION ALL
SELECT '⚠️ P. fiches publiees SANS aucun moyen de paiement ouvert'::text,
       coalesce((SELECT string_agg(nom, ' · ' ORDER BY nom) FROM pub
                  WHERE stripe_account_charges_enabled IS NOT TRUE
                    AND accepte_paiement_cash IS NOT TRUE), '(aucune)'),
       '(aucune) : leur bouton de commande est desactive, sans explication'::text;
