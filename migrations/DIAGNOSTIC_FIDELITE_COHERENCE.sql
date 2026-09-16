-- DIAGNOSTIC — QUI UTILISE QUOI DANS LA FIDELITE (16/09)
--
-- Decision d Alex : la cagnotte rend LA CAGNOTTE (seuil atteint = ce montant en
-- remise), les passages donnent un POURCENTAGE. Le montant fixe en euros
-- disparait : c est lui qui faisait couter 25 % a un cafe et 1,4 % a un
-- traiteur pour le meme reglage « 10 passages, 5 € ».
--
-- ⚠️ ON NE RETIRE PAS UN REGLAGE SANS SAVOIR QUI S EN SERT. Retirer une option
-- qu un commercant utilise, c est changer sa promesse sans le prevenir, et ses
-- clients ont peut-etre une carte en cours.
--
-- Lecture SEULE, aucune ecriture. AUCUNE donnee personnelle en sortie : que des
-- comptes et des reglages de commercants, jamais un nom de client, un telephone
-- ou un email.

SELECT 'A. fiches avec la fidelite ALLUMEE'::text AS controle,
       (SELECT count(*)::text FROM commercants WHERE fidelite_actif IS TRUE),
       'le perimetre reel du changement'::text AS attendu
UNION ALL
SELECT 'B. dont en CAGNOTTE'::text,
       (SELECT count(*)::text FROM commercants
         WHERE fidelite_actif IS TRUE AND fidelite_mecanique = 'cagnotte'),
       'elles gardent taux + seuil, la valeur disparait'::text
UNION ALL
SELECT 'C. dont en PASSAGES'::text,
       (SELECT count(*)::text FROM commercants
         WHERE fidelite_actif IS TRUE AND coalesce(fidelite_mecanique, 'passages') <> 'cagnotte'),
       'elles gardent le nombre de passages + un %'::text
UNION ALL
-- 🔴 LE COEUR DU DIAGNOSTIC : les reglages qui deviennent impossibles.
SELECT 'D. PASSAGES avec un montant en EUROS (a convertir)'::text,
       (SELECT count(*)::text FROM commercants
         WHERE fidelite_actif IS TRUE
           AND coalesce(fidelite_mecanique, 'passages') <> 'cagnotte'
           AND coalesce(fidelite_recompense_type, 'remise_montant') = 'remise_montant'),
       'chacune doit recevoir un % choisi par Alex, pas devine'::text
UNION ALL
SELECT 'E. PASSAGES deja en pourcentage (rien a faire)'::text,
       (SELECT count(*)::text FROM commercants
         WHERE fidelite_actif IS TRUE
           AND coalesce(fidelite_mecanique, 'passages') <> 'cagnotte'
           AND fidelite_recompense_type = 'remise_pct'),
       'elles sont deja conformes a la nouvelle regle'::text
UNION ALL
-- ⚠️ EN CAGNOTTE : la valeur annoncee correspond-elle au seuil ? Chaque ecart
-- est un commercant qui donne plus ou moins qu il ne croit.
SELECT 'F. CAGNOTTE dont la recompense DIFFERE du seuil'::text,
       (SELECT count(*)::text FROM commercants
         WHERE fidelite_actif IS TRUE AND fidelite_mecanique = 'cagnotte'
           AND coalesce(fidelite_recompense_valeur, 0) IS DISTINCT FROM coalesce(fidelite_seuil_cagnotte, 0)),
       '0 espere ; sinon ce sont des promesses qui ne collent pas'::text
UNION ALL
SELECT 'G. CAGNOTTE en POURCENTAGE (incoherent par nature)'::text,
       (SELECT count(*)::text FROM commercants
         WHERE fidelite_actif IS TRUE AND fidelite_mecanique = 'cagnotte'
           AND fidelite_recompense_type = 'remise_pct'),
       '0 espere : une cagnotte en euros ne rend pas un pourcentage'::text
UNION ALL
-- ⚠️ COMBIEN DE VRAIS CLIENTS SONT DEJA DANS LE PROGRAMME. C est ce chiffre qui
-- dit si l on change une maquette ou la promesse faite a quelqu un.
SELECT 'H. cartes de fidelite existantes'::text,
       (SELECT count(*)::text FROM fidelite_cartes),
       'des cartes en cours = une promesse deja faite'::text
UNION ALL
SELECT 'I. cartes avec un solde en cours (passages ou cagnotte)'::text,
       (SELECT count(*)::text FROM fidelite_cartes
         WHERE coalesce(passages, 0) > 0 OR coalesce(cagnotte, 0) > 0),
       'celles-la verraient leur objectif changer'::text
UNION ALL
-- 🔴 LES RECOMPENSES DEJA GAGNEES SONT FIGEES A L OBTENTION (type + valeur
-- copies dans `fidelite_recompenses`) : elles ne doivent PAS bouger. Ce compte
-- sert a le verifier apres coup.
SELECT 'J. recompenses gagnees et pas encore utilisees'::text,
       (SELECT count(*)::text FROM fidelite_recompenses WHERE utilisee_at IS NULL),
       'elles gardent leur valeur d origine, quoi qu on change'::text
UNION ALL
-- Le detail des reglages a convertir, sans aucune donnee personnelle : le nom
-- du COMMERCE et ses chiffres, pour qu Alex choisisse le % de chacun.
SELECT 'K. detail des PASSAGES en euros'::text,
       coalesce((SELECT string_agg(
                  nom || ' : ' || coalesce(fidelite_seuil_passages, 10)::text || ' passages → '
                      || coalesce(fidelite_recompense_valeur, 0)::text || ' €', ' · ' ORDER BY nom)
                 FROM commercants
                WHERE fidelite_actif IS TRUE
                  AND coalesce(fidelite_mecanique, 'passages') <> 'cagnotte'
                  AND coalesce(fidelite_recompense_type, 'remise_montant') = 'remise_montant'),
                '(aucune)')::text,
       'la liste exacte a convertir, un % par ligne'::text;
