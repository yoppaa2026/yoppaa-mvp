-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_DEALS_CATEGORIE.sql
-- Une remise peut viser une CATÉGORIE entière, pas seulement un article.
--
-- CONTEXTE. Aujourd'hui un deal cible un article précis (`article_id`) et
-- s'affiche en carte séparée, à côté de l'article resté au prix plein. Pour un
-- lot « 3 + 1 offert » c'est juste : l'offre est un autre objet que l'unité.
-- Pour une simple remise de 10 % sur un shampoing, c'est incompréhensible :
-- le même produit apparaît deux fois, à deux prix différents, sur le même
-- écran.
--
-- La correction, décidée le 03/08 : le comportement dépend du TYPE de deal.
--   • lot et duo          → restent des offres séparées (une unité ≠ un lot) ;
--   • remise % et prix promo → s'appliquent AU PRODUIT lui-même, qui affiche
--     son prix barré et son prix remisé, sans carte parallèle.
--
-- Cette migration ajoute la seule brique manquante : pouvoir viser une
-- catégorie entière (« -20 % sur tous les shampoings ») plutôt qu'un article.
--
-- Aucune table créée : aucun GRANT à ajouter.
-- Idempotente : ré-exécutable sans effet de bord.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE yoppaa_deals
  ADD COLUMN IF NOT EXISTS categorie_cible text;

COMMENT ON COLUMN yoppaa_deals.categorie_cible IS
  'Catégorie d''articles visée par la remise (valeur de articles.categorie). Alternative à article_id : une remise vise soit UN article, soit TOUTE une catégorie, jamais les deux.';

-- Un deal vise un article OU une catégorie, jamais les deux à la fois : sans
-- cette garantie, on ne saurait pas quel prix appliquer à un article qui
-- serait visé deux fois.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'yoppaa_deals_cible_check'
  ) THEN
    ALTER TABLE yoppaa_deals
      ADD CONSTRAINT yoppaa_deals_cible_check
      CHECK (NOT (article_id IS NOT NULL AND categorie_cible IS NOT NULL));
  END IF;
END $$;

-- Index de recherche : la fiche demande « quelles remises visent la catégorie
-- de cet article ? » à chaque affichage.
CREATE INDEX IF NOT EXISTS idx_yoppaa_deals_categorie
  ON yoppaa_deals (commercant_id, categorie_cible)
  WHERE categorie_cible IS NOT NULL;

-- ─── Vérification ──────────────────────────────────────────────────────────
SELECT count(*) FILTER (WHERE article_id IS NOT NULL)      AS deals_sur_article,
       count(*) FILTER (WHERE categorie_cible IS NOT NULL) AS deals_sur_categorie,
       count(*) FILTER (WHERE article_id IS NULL AND categorie_cible IS NULL) AS deals_generiques
  FROM yoppaa_deals;
