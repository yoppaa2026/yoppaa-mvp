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
-- plus de réservation en ligne, sans le moindre message d'erreur. Le bloc 1
-- convertit ces prestations en prix fixe pour que personne ne tombe dans ce
-- trou.
--
-- ⚠️ LA CONVERSION PREND LE MINIMUM, pas le maximum ni la moyenne. C'est le
-- seul montant que le commerçant a réellement annoncé comme « à partir de », et
-- l'annoncer plus cher qu'il ne l'a dit serait une faute envers son client. Il
-- pourra le corriger depuis son tableau de bord.
--
-- ⚠️ AUCUN OBJET CRÉÉ : aucun GRANT à poser.


-- ─── BLOC 0 — CE QUI VA CHANGER, à lire AVANT d'exécuter la suite ───────────

SELECT * FROM (
  SELECT 1 AS n, 'prestations en fourchette (a convertir)' AS controle,
    (SELECT count(*)::text FROM rdv_prestations
      WHERE prix IS NULL AND (prix_min IS NOT NULL OR prix_max IS NOT NULL)) AS valeur, '' AS attendu
  UNION ALL SELECT 2, 'dont AUCUN prix_min (deviendront sans prix)',
    (SELECT count(*)::text FROM rdv_prestations
      WHERE prix IS NULL AND prix_min IS NULL AND prix_max IS NOT NULL), '0'
  UNION ALL SELECT 3, 'prestations sans aucun prix (devis, inchangees)',
    (SELECT count(*)::text FROM rdv_prestations
      WHERE prix IS NULL AND prix_min IS NULL AND prix_max IS NULL), ''
  UNION ALL SELECT 4, 'prestations au total',
    (SELECT count(*)::text FROM rdv_prestations), ''
) t ORDER BY n;


-- ─── BLOC 1 — CONVERSION, puis RETRAIT ──────────────────────────────────────

UPDATE rdv_prestations
SET prix = prix_min
WHERE prix IS NULL AND prix_min IS NOT NULL;

ALTER TABLE rdv_prestations
  DROP COLUMN IF EXISTS prix_min,
  DROP COLUMN IF EXISTS prix_max;


-- ─── BLOC 2 — CONTRÔLE APRÈS ────────────────────────────────────────────────
--
-- Attendu : 0 colonne restante, et le même nombre de prestations qu'avant.

SELECT * FROM (
  SELECT 1 AS n, 'colonnes prix_min / prix_max restantes' AS controle,
    (SELECT count(*)::text FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'rdv_prestations'
        AND column_name IN ('prix_min', 'prix_max')) AS valeur, '0' AS attendu
  UNION ALL SELECT 2, 'prestations au total',
    (SELECT count(*)::text FROM rdv_prestations), ''
  UNION ALL SELECT 3, 'prestations avec un prix ferme',
    (SELECT count(*)::text FROM rdv_prestations WHERE prix IS NOT NULL), ''
  UNION ALL SELECT 4, 'prestations SANS prix (a completer au tableau de bord)',
    (SELECT count(*)::text FROM rdv_prestations WHERE prix IS NULL), ''
) t ORDER BY n;
