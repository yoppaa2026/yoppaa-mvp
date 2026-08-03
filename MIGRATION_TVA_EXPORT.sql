-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_TVA_EXPORT.sql
-- TVA par article et par prestation + frais Stripe, pour l'export comptable.
--
-- Deux principes qui commandent tout le reste :
--
-- 1) DEUX TAUX PAR ARTICLE. En Belgique, la denrée alimentaire à emporter est
--    à 6 %, la même consommée sur place relève de la restauration à 12 %, et
--    les boissons alcoolisées restent à 21 % dans tous les cas. Un seul taux
--    par article ne peut donc pas décrire la réalité d'un restaurant.
--    `tva_taux` = vente normale (à emporter, retrait, livraison, expédition).
--    `tva_taux_sur_place` = consommation en salle. NULL signifie « même taux ».
--
-- 2) LE TAUX EST FIGÉ À LA VENTE. On recopie le taux appliqué sur la ligne de
--    commande et sur le rendez-vous. Sans cela, changer un taux réécrirait
--    rétroactivement les exports des années précédentes, ce qui est
--    inacceptable pour une comptabilité.
--
-- Aucune table créée : uniquement des colonnes, donc aucun GRANT à ajouter.
-- Idempotente : ré-exécutable sans effet de bord.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Taux de TVA sur le catalogue ───────────────────────────────────────

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS tva_taux            numeric(5,2),
  ADD COLUMN IF NOT EXISTS tva_taux_sur_place  numeric(5,2);

COMMENT ON COLUMN articles.tva_taux IS
  'Taux de TVA en pourcentage pour la vente à emporter, en livraison ou en expédition (6, 12, 21...). NULL = taux par défaut du commerce.';
COMMENT ON COLUMN articles.tva_taux_sur_place IS
  'Taux de TVA en pourcentage pour la consommation sur place (restauration). NULL = identique à tva_taux.';

ALTER TABLE rdv_prestations
  ADD COLUMN IF NOT EXISTS tva_taux numeric(5,2);

COMMENT ON COLUMN rdv_prestations.tva_taux IS
  'Taux de TVA en pourcentage de la prestation. NULL = taux par défaut du commerce.';

-- Taux par défaut du commerce : filet de sécurité quand un article n'a rien
-- de renseigné, et valeur pré-remplie proposée à la création d'un article.
ALTER TABLE commercants
  ADD COLUMN IF NOT EXISTS tva_taux_defaut numeric(5,2),
  ADD COLUMN IF NOT EXISTS tva_assujetti   boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN commercants.tva_taux_defaut IS
  'Taux de TVA appliqué quand un article ou une prestation n''en précise aucun.';
COMMENT ON COLUMN commercants.tva_assujetti IS
  'false pour un commerce en franchise de TVA (petites entreprises) : l''export n''affiche alors aucune ventilation.';

-- ─── 2. Taux figé au moment de la vente ────────────────────────────────────

ALTER TABLE commande_articles
  ADD COLUMN IF NOT EXISTS tva_taux numeric(5,2);

COMMENT ON COLUMN commande_articles.tva_taux IS
  'Taux de TVA effectivement appliqué à cette ligne AU MOMENT DE LA VENTE. Ne jamais recalculer depuis articles : les taux évoluent.';

ALTER TABLE rdv_reservations
  ADD COLUMN IF NOT EXISTS tva_taux numeric(5,2);

COMMENT ON COLUMN rdv_reservations.tva_taux IS
  'Taux de TVA appliqué à ce rendez-vous au moment de la réservation.';

-- ─── 3. Frais Stripe et montant net réellement reçu ────────────────────────
-- Renseignés par le webhook à partir de la balance transaction Stripe. Le
-- commerçant rapproche ainsi l'export du virement qu'il voit sur son compte.

ALTER TABLE commandes
  ADD COLUMN IF NOT EXISTS stripe_frais numeric(10,2),
  ADD COLUMN IF NOT EXISTS stripe_net   numeric(10,2);

COMMENT ON COLUMN commandes.stripe_frais IS
  'Frais Stripe réels de la transaction, en euros. NULL si paiement au comptoir ou frais pas encore connus.';
COMMENT ON COLUMN commandes.stripe_net IS
  'Montant net versé au commerçant après frais Stripe, en euros.';

ALTER TABLE rdv_reservations
  ADD COLUMN IF NOT EXISTS stripe_frais numeric(10,2),
  ADD COLUMN IF NOT EXISTS stripe_net   numeric(10,2);

-- ─── 4. Valeurs de départ raisonnables par catégorie ───────────────────────
-- Le commerçant reste maître de ses taux, mais partir d'une page blanche
-- garantit un catalogue sans TVA. On ne touche qu'aux valeurs non renseignées.

UPDATE commercants
   SET tva_taux_defaut = CASE categorie
         WHEN 'alimentaire' THEN 6.00   -- denrées à emporter
         ELSE 21.00                     -- services et détail
       END
 WHERE tva_taux_defaut IS NULL;

UPDATE articles a
   SET tva_taux = c.tva_taux_defaut
  FROM commercants c
 WHERE a.commercant_id = c.id
   AND a.tva_taux IS NULL;

UPDATE rdv_prestations p
   SET tva_taux = c.tva_taux_defaut
  FROM commercants c
 WHERE p.commercant_id = c.id
   AND p.tva_taux IS NULL;

-- ─── 5. Vérification ───────────────────────────────────────────────────────
-- Doit renvoyer 0 article sans taux.
SELECT count(*) AS articles_sans_taux FROM articles WHERE tva_taux IS NULL;
