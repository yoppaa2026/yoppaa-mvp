-- POURQUOI LA CARTE DE FIDELITE NE SE REMPLIT PAS (17/09)
--
-- ⚠️ LECTURE SEULE. Ne modifie rien.
-- ⚠️ AUCUNE DONNEE PERSONNELLE EN SORTIE : pas un numero, pas un email, pas un
-- nom de client. Uniquement des comptages et des oui/non.
--
-- CE QUE LE CODE EXIGE POUR CREDITER UNE COMMANDE
-- (lib/fidelite-server.js, crediterFideliteCommande) :
--
--   1. la commande est au statut 'recupere'. C est le tableau de bord qui le
--      pose, quand le commercant marque la commande remise, livree ou expediee.
--      Tant qu elle est « prete », RIEN ne se credite ;
--   2. `fidelite_actif` est vrai ;
--   3. 🔴 le FORFAIT ouvre `fidelite_auto`, et SEUL « vendre » l ouvre.
--      Exister et Communiquer donnent la fidelite au COMPTOIR (le commercant
--      pointe le GSM a la main) mais JAMAIS le credit automatique ;
--   4. la commande porte un TELEPHONE. Le GSM est la cle de la carte : sans
--      lui, `crediterFidelite` rend `telephone_invalide` et s arrete.
--
-- 🔴 ET AUCUN DE CES QUATRE REFUS NE SE VOIT. Le tableau de bord appelle la
-- route en `postPro(...).catch(...)`, qui ne se declenche jamais sur un code
-- HTTP ; et la route rend 200 avec `ok:false` quand le credit est refuse. Le
-- commercant voit sa commande passer au vert et croit la carte remplie.

WITH com AS (
  SELECT id, nom,
         CASE coalesce(plan, 'exister')
           WHEN 'on' THEN 'exister' WHEN 'full' THEN 'vendre'
           ELSE coalesce(plan, 'exister') END AS forfait,
         fidelite_actif, fidelite_mecanique,
         fidelite_taux_cagnotte, fidelite_seuil_cagnotte, fidelite_seuil_passages
    FROM commercants
   WHERE statut_publication = 'publie'
),
-- Les commandes qui ONT atteint le statut final : ce sont les seules que le
-- code essaie de crediter.
finales AS (
  SELECT c.id, c.commercant_id,
         (coalesce(c.client_telephone, '') <> '') AS a_un_telephone
    FROM commandes c
   WHERE c.statut = 'recupere'
),
-- Celles qui attendent encore : elles n ont jamais ete presentees au credit.
en_cours AS (
  SELECT commercant_id, count(*) AS n
    FROM commandes WHERE statut <> 'recupere' GROUP BY commercant_id
),
cartes AS (SELECT commercant_id, count(*) AS n FROM fidelite_cartes GROUP BY commercant_id),
-- Les mouvements reellement ecrits par une commande.
mvt AS (
  SELECT fc.commercant_id, count(*) AS n
    FROM fidelite_mouvements m
    JOIN fidelite_cartes fc ON fc.id = m.carte_id
   WHERE m.commande_id IS NOT NULL
   GROUP BY fc.commercant_id
)

SELECT 'A. commerces a fidelite ACTIVE, avec leur forfait'::text AS controle,
       coalesce((SELECT string_agg(nom || ' [' || forfait || ' · ' || coalesce(fidelite_mecanique, '?') || ']', ' · ' ORDER BY nom)
                   FROM com WHERE fidelite_actif IS TRUE), '(aucun)') AS valeur,
       'le forfait decide : seul « vendre » credite automatiquement'::text AS attendu
UNION ALL
-- 🔴 LE PREMIER SUSPECT. Une fiche en Communiquer affiche sa carte de fidelite
-- au client et ne la remplira jamais toute seule : c est la regle du palier, pas
-- une panne, mais rien a l ecran ne le dit.
SELECT '🔴 B. fidelite ACTIVE mais forfait SANS credit automatique'::text,
       coalesce((SELECT string_agg(nom || ' [' || forfait || ']', ' · ' ORDER BY nom)
                   FROM com WHERE fidelite_actif IS TRUE AND forfait <> 'vendre'), '(aucun)'),
       '(aucun) : sinon leur carte ne se remplit QUE par le pointage au comptoir'::text
UNION ALL
-- 🔴 LE DEUXIEME SUSPECT, ET LE PLUS PROBABLE. Une commande qui reste « prete »
-- n est jamais presentee au credit : le commercant doit la marquer remise.
SELECT '🔴 C. commandes qui n ont PAS atteint « recupere »'::text,
       coalesce((SELECT string_agg(c.nom || ' : ' || e.n::text, ' · ' ORDER BY c.nom)
                   FROM com c JOIN en_cours e ON e.commercant_id = c.id), '(aucune)'),
       'celles-la n ont jamais ete presentees au credit, c est normal'::text
UNION ALL
SELECT 'D. commandes ARRIVEES a « recupere »'::text,
       coalesce((SELECT string_agg(c.nom || ' : ' || x.n::text, ' · ' ORDER BY c.nom)
                   FROM com c JOIN (SELECT commercant_id, count(*) AS n FROM finales GROUP BY commercant_id) x
                     ON x.commercant_id = c.id), '(aucune)'),
       'ce sont les seules que le code essaie de crediter'::text
UNION ALL
-- 🔴 LE TROISIEME SUSPECT. Le GSM est la cle de la carte.
SELECT '🔴 E. commandes « recupere » SANS telephone'::text,
       coalesce((SELECT string_agg(c.nom || ' : ' || x.n::text, ' · ' ORDER BY c.nom)
                   FROM com c JOIN (SELECT commercant_id, count(*) AS n FROM finales
                                     WHERE a_un_telephone IS FALSE GROUP BY commercant_id) x
                     ON x.commercant_id = c.id), '(aucune)'),
       '(aucune) : sans GSM, le credit s arrete sur telephone_invalide'::text
UNION ALL
SELECT 'F. cartes de fidelite existantes'::text,
       coalesce((SELECT string_agg(c.nom || ' : ' || ca.n::text, ' · ' ORDER BY c.nom)
                   FROM com c JOIN cartes ca ON ca.commercant_id = c.id), '(aucune)'),
       'une carte se cree a la volee au premier credit'::text
UNION ALL
SELECT 'G. mouvements ecrits par une COMMANDE'::text,
       coalesce((SELECT string_agg(c.nom || ' : ' || m.n::text, ' · ' ORDER BY c.nom)
                   FROM com c JOIN mvt m ON m.commercant_id = c.id), '(aucun)'),
       'c est la preuve qu un credit a vraiment eu lieu'::text
UNION ALL
-- ═══ LE CONTROLE QUI TRANCHE ══════════════════════════════════════════════
-- 🔴 Une commande finalisee, avec telephone, chez un commercant en « vendre »
-- dont la fidelite est active, et AUCUN mouvement a son nom : la, ce n est plus
-- une regle du produit, c est un defaut.
SELECT '🔴 H. commandes qui AURAIENT DU crediter et ne l ont pas fait'::text,
       coalesce((SELECT string_agg(c.nom || ' : ' || x.n::text, ' · ' ORDER BY c.nom)
                   FROM com c
                   JOIN (SELECT f.commercant_id, count(*) AS n
                           FROM finales f
                          WHERE f.a_un_telephone IS TRUE
                            AND NOT EXISTS (SELECT 1 FROM fidelite_mouvements m WHERE m.commande_id = f.id)
                          GROUP BY f.commercant_id) x
                     ON x.commercant_id = c.id
                  WHERE c.fidelite_actif IS TRUE AND c.forfait = 'vendre'), '(aucune)'),
       '(aucune) : toute ligne ici est un vrai defaut a corriger'::text
UNION ALL
-- Le reglage lui-meme : une cagnotte a 0 % ne credite rien, meme quand tout
-- le reste fonctionne.
SELECT '⚠️ I. reglages de fidelite qui ne peuvent rien donner'::text,
       coalesce((SELECT string_agg(nom || ' [' || coalesce(fidelite_mecanique, '?') || ']', ' · ' ORDER BY nom)
                   FROM com
                  WHERE fidelite_actif IS TRUE
                    AND ((fidelite_mecanique = 'cagnotte' AND coalesce(fidelite_taux_cagnotte, 0) <= 0)
                      OR (fidelite_mecanique <> 'cagnotte' AND coalesce(fidelite_seuil_passages, 0) <= 0))), '(aucun)'),
       '(aucun) : un taux ou un seuil a zero ne remplit jamais rien'::text;
