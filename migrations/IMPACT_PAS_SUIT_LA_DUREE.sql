-- MESURE D'IMPACT : LE PAS DE RÉSERVATION SUIVRA LA DURÉE (18/09)
--
-- DÉCIDÉ AVEC ALEX : la granularité disparaît de l'écran pour les services
-- vitrine, et le pas suit alors la durée de la prestation. Les TABLES gardent
-- leur réglage : chez un restaurant, un pas de 30 minutes sur un service de
-- 18h à 23h est exactement ce qui fabrique la grille.
--
-- 🔴 CE QUE CETTE REQUÊTE MESURE, ET POURQUOI AVANT ET PAS APRÈS. Là où le pas
-- réglé est PLUS PETIT que la durée, le commerce propose aujourd'hui des
-- départs intermédiaires (9h00, 9h15, 9h30 pour une prestation de 30 minutes).
-- Après le changement, il en proposera MOINS. Ce n'est pas un défaut, c'est le
-- comportement voulu, mais il faut savoir qui ça déplace avant de le livrer.
--
-- ⚠️ AUCUNE DONNÉE DE CLIENT. Ni réservations, ni commandes, ni comptes.
-- LECTURE SEULE.

WITH plages AS (
  SELECT cr.commercant_id,
         COALESCE(cr.pas_minutes, 15) AS pas
  FROM rdv_creneaux cr
  WHERE cr.actif IS TRUE AND cr.deleted_at IS NULL
),
duree_services AS (
  -- ⚠️ LES TABLES SONT ÉCARTÉES : elles gardent leur réglage, elles ne sont
  -- donc pas concernées par la comparaison.
  SELECT pr.commercant_id,
         MIN(pr.duree_minutes) AS duree_mini,
         MAX(pr.duree_minutes) AS duree_maxi,
         COUNT(*)              AS nb
  FROM rdv_prestations pr
  WHERE pr.actif IS TRUE AND pr.deleted_at IS NULL
    AND COALESCE(pr.par_couverts, false) IS FALSE
  GROUP BY pr.commercant_id
),
touches AS (
  SELECT co.nom,
         MIN(p.pas)  AS pas_mini,
         MAX(p.pas)  AS pas_maxi,
         d.duree_mini, d.duree_maxi, d.nb
  FROM plages p
  JOIN duree_services d ON d.commercant_id = p.commercant_id
  JOIN commercants co   ON co.id = p.commercant_id
  GROUP BY co.nom, d.duree_mini, d.duree_maxi, d.nb
)
SELECT 'A. commerces a services concernes'::text AS controle,
       (SELECT COUNT(*)::text FROM touches)::text AS valeur,
       'tous ceux qui ont des plages ET des prestations hors table'::text AS attendu

UNION ALL
-- 🔴 CEUX-CI CHANGENT : leur pas le plus fin est plus petit que leur
-- prestation la plus courte, donc ils perdent des departs intermediaires.
SELECT 'B. commerces qui proposeront MOINS de departs'::text,
       COALESCE((SELECT string_agg(nom || ' (pas=' || pas_mini::text
                                   || ', duree la plus courte=' || duree_mini::text || 'min)', ' | ' ORDER BY nom)
                 FROM touches WHERE pas_mini < duree_mini), 'aucun')::text,
       'la liste exacte de ce que le changement deplace'::text

UNION ALL
-- ✅ CEUX-LA NE BOUGENT PAS : leur pas vaut deja leur duree.
SELECT 'C. commerces ou rien ne change'::text,
       COALESCE((SELECT string_agg(nom || ' (pas=' || pas_mini::text || '=' || duree_mini::text || 'min)', ' | ' ORDER BY nom)
                 FROM touches WHERE pas_mini >= duree_mini), 'aucun')::text,
       'pas deja egal ou superieur a la duree'::text

UNION ALL
-- ⚠️ UN COMMERCE AUX DURÉES MÉLANGÉES mérite un regard : le pas suivra CHAQUE
-- prestation, donc sa grille ne sera plus la meme d'une prestation a l'autre.
-- C'est voulu, mais autant savoir qui c'est.
SELECT 'D. commerces aux durees melangees'::text,
       COALESCE((SELECT string_agg(nom || ' (' || duree_mini::text || ' a ' || duree_maxi::text
                                   || 'min sur ' || nb::text || ' prestations)', ' | ' ORDER BY nom)
                 FROM touches WHERE duree_mini <> duree_maxi), 'aucun')::text,
       'informatif'::text

UNION ALL
-- 🔴 LA PAUSE, ET C'EST ELLE QUI DÉCIDE. Avec un pas égal à la durée, la
-- grille part du début du créneau et ne se RECALE PAS après la pause : une
-- prestation de 90 minutes sur 9h-18h avec pause de midi passerait de 13h00 à
-- 13h30, et la demi-heure serait perdue tous les jours.
--
-- ⚠️ CE DÉFAUT N'EXISTE CHEZ PERSONNE AUJOURD'HUI. Il n'a été vu que dans un
-- banc, sur un créneau fictif, et seulement parce qu'on s'apprête à changer le
-- pas. Cette ligne dit chez QUI il apparaîtrait.
SELECT 'F. plages AVEC PAUSE (les seules ou le recalage compte)'::text,
       COALESCE((SELECT string_agg(DISTINCT co.nom, ' | ' ORDER BY co.nom)
                 FROM rdv_creneaux cr
                 JOIN commercants co ON co.id = cr.commercant_id
                 WHERE cr.actif IS TRUE AND cr.deleted_at IS NULL
                   AND cr.pause_debut IS NOT NULL AND cr.pause_fin IS NOT NULL), 'aucun')::text,
       'si aucun, le recalage apres pause peut attendre'::text

UNION ALL
-- ⚠️ LES TABLES, QUI NE BOUGENT PAS, pour verifier qu'on les a bien ecartees.
SELECT 'E. commerces a tables (reglage conserve)'::text,
       COALESCE((SELECT string_agg(DISTINCT co.nom, ' | ' ORDER BY co.nom)
                 FROM rdv_prestations pr
                 JOIN commercants co ON co.id = pr.commercant_id
                 WHERE COALESCE(pr.par_couverts, false) IS TRUE
                   AND pr.actif IS TRUE AND pr.deleted_at IS NULL), 'aucun')::text,
       'ceux-la gardent leur granularite'::text

ORDER BY 1;
