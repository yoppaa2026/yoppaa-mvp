-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_COMMANDE_ARTICLE_NOM.sql
--
-- La ligne de commande garde enfin le nom de ce qu'elle a vendu.
--
-- ⚠️ LE DÉFAUT, ET IL A DEUX CONSÉQUENCES.
-- `construireLignesCommande` calcule déjà `article_nom` pour chaque ligne, en
-- retenant le titre du DEAL quand la vente en est un (« Lot de 3 », « Duo »).
-- Cette valeur est ensuite JETÉE : l'insertion n'écrit que `article_id`, et le
-- tableau de bord retrouve le nom par jointure sur `articles`.
--
--   1. UN DEAL PERD SON NOM. Le commerçant voit le nom de l'article de base et
--      ne sait pas que le client a pris le lot.
--   2. UN ARTICLE RETIRÉ EMPORTE L'HISTORIQUE AVEC LUI. En boutique de détail,
--      une collection qui part, c'est le quotidien : la jointure ne rend plus
--      rien, la vignette affiche « 1× » suivi de RIEN, et la commande devient
--      illisible pour toujours. Y compris en comptabilité, où un justificatif
--      doit rester lisible des années.
--
-- Le nom est donc FIGÉ À LA VENTE, exactement comme l'a été le taux de TVA pour
-- les mêmes raisons : ce qui a été vendu ne doit pas changer rétroactivement
-- parce que le catalogue a bougé.
--
-- La colonne est NULLABLE : les commandes déjà passées gardent `NULL` et
-- continuent de s'afficher par la jointure, comme aujourd'hui. Aucune rupture.
--
-- Aucune donnée personnelle : un nom d'article, rien d'autre.
--
-- Idempotente : ré-exécutable sans effet de bord.
--
-- ⚠️ À PASSER AVANT le déploiement du code qui écrit la colonne : une insertion
-- vers une colonne inexistante est refusée par PostgREST, et AUCUNE commande ne
-- passerait plus. Dans ce sens-là, il n'y a aucune fenêtre de casse : la
-- colonne peut exister des jours avant que quoi que ce soit l'écrive.
--
-- Vérification attendue en fin de script : colonne_creee = 1
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE commande_articles
  ADD COLUMN IF NOT EXISTS article_nom text;

COMMENT ON COLUMN commande_articles.article_nom IS
  'Nom de ce qui a été vendu, figé à la vente (titre du deal si la vente en est un). Sans lui, un article retiré du catalogue rend la commande illisible.';

-- Les droits suivent ceux de la table : la colonne s''ajoute à des GRANT déjà
-- posés sur `commande_articles`, il n''y a rien de neuf à ouvrir. On les
-- réaffirme malgré tout, règle projet sur toute migration de structure.
GRANT SELECT ON commande_articles TO anon, authenticated;
GRANT INSERT ON commande_articles TO anon, authenticated;
GRANT ALL    ON commande_articles TO service_role;

-- ─── Vérification ──────────────────────────────────────────────────────────
-- Interroge l'état réel de la base, jamais une tautologie.
SELECT COUNT(*) AS colonne_creee
FROM information_schema.columns
WHERE table_name = 'commande_articles' AND column_name = 'article_nom';
