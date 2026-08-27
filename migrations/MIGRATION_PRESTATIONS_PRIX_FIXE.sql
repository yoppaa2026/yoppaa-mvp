-- ════════════════════════════════════════════════════════════════════════════
-- LE PRIX EST LE PRIX — retrait des fourchettes de prestation, 27/08
-- ════════════════════════════════════════════════════════════════════════════
--
-- Décision d'Alex : « Plus de prestation à fourchette, prix fixe et basta. »
-- Un devis se discute au comptoir, pas dans une application. Ce qu'un
-- commerçant ajoute en cours de prestation, il l'ajoute à sa caisse.
--
-- ⚠️ ORDRE IMPOSÉ : CETTE MIGRATION PASSE **AVANT** LE DÉPLOIEMENT DU CODE.
-- Le code cesse de lire `prix_min` en repli. Déployé d'abord, une prestation
-- restée en fourchette verrait son prix devenir NULL : plus d'acompte, donc
-- plus de réservation en ligne, sans le moindre message d'erreur.
--
-- ⚠️ LA CONVERSION PREND LE MINIMUM, jamais le maximum ni la moyenne. C'est le
-- seul montant que le commerçant a réellement annoncé comme « à partir de » ;
-- l'afficher plus cher qu'il ne l'a dit serait une faute envers son client. Il
-- pourra l'ajuster depuis son tableau de bord.
--
-- ⚠️ UN SEUL COLLER, UN SEUL RÉSULTAT (règle du 27/08). La table temporaire
-- garde le compte des conversions AVANT que les colonnes ne disparaissent :
-- sans elle, on ne pourrait plus dire après coup ce qui a été touché. Elle
-- s'efface toute seule à la fin de la session.
--
-- ⚠️ AUCUN OBJET PERMANENT CRÉÉ : aucun GRANT à poser.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TEMP TABLE _avant AS
SELECT
  (SELECT count(*) FROM rdv_prestations
     WHERE prix IS NULL AND prix_min IS NOT NULL)                        AS a_convertir,
  (SELECT count(*) FROM rdv_prestations
     WHERE prix IS NULL AND prix_min IS NULL AND prix_max IS NOT NULL)   AS max_seul_perdu,
  (SELECT count(*) FROM rdv_prestations)                                 AS total_avant;

UPDATE rdv_prestations
SET prix = prix_min
WHERE prix IS NULL AND prix_min IS NOT NULL;

ALTER TABLE rdv_prestations
  DROP COLUMN IF EXISTS prix_min,
  DROP COLUMN IF EXISTS prix_max;

SELECT * FROM (
  SELECT 1 AS n, 'fourchettes converties en prix fixe' AS controle,
         (SELECT a_convertir::text FROM _avant) AS valeur, '' AS attendu
  UNION ALL SELECT 2, 'fourchettes SANS minimum (prix perdu, a ressaisir)',
         (SELECT max_seul_perdu::text FROM _avant), '0'
  UNION ALL SELECT 3, 'colonnes prix_min / prix_max restantes',
         (SELECT count(*)::text FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'rdv_prestations'
             AND column_name IN ('prix_min', 'prix_max')), '0'
  UNION ALL SELECT 4, 'prestations au total (doit etre inchange)',
         (SELECT count(*)::text FROM rdv_prestations),
         (SELECT total_avant::text FROM _avant)
  UNION ALL SELECT 5, 'prestations avec un prix ferme',
         (SELECT count(*)::text FROM rdv_prestations WHERE prix IS NOT NULL), ''
  UNION ALL SELECT 6, 'prestations SANS prix (affichent Prix sur demande)',
         (SELECT count(*)::text FROM rdv_prestations WHERE prix IS NULL), ''
) t ORDER BY n;
