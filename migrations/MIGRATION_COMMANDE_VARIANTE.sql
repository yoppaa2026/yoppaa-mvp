-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_COMMANDE_VARIANTE.sql
--
-- La ligne de commande retient QUELLE VERSION a été vendue, pour pouvoir rendre
-- le stock quand la commande n'aboutit pas.
--
-- ⚠️ LE DÉFAUT, ET IL VIDE LES RAYONS TOUT SEUL.
-- En boutique de détail, le stock d'une version (taille M, coloris bleu) vit
-- dans `article_variantes.stock`. Il est DÉCRÉMENTÉ dès la création de la
-- commande, avant même le paiement, et RIEN ne le rend jamais :
--
--   • le client abandonne le paiement Stripe → stock perdu ;
--   • le cron bascule la commande en `annulee_paiement_ko` → stock perdu ;
--   • le client annule sa commande → stock perdu.
--
-- Un abandon de panier est le cas le plus courant du commerce en ligne. À
-- chaque abandon, une pièce disparaît des rayons de Yoppaa sans quitter
-- l'étagère du magasin. Le commerçant finit par afficher « épuisé » sur un
-- article dont il a encore trois exemplaires, et il perd toutes les ventes
-- suivantes sans jamais comprendre pourquoi.
--
-- ⚠️ POURQUOI UNE COLONNE EST NÉCESSAIRE. La version choisie n'existe
-- aujourd'hui QUE sous forme de libellé, rangé dans `options` (« Version :
-- M · Bleu »). Un libellé ne permet pas de rendre le stock : deux versions
-- peuvent porter le même nom après un renommage, et un intitulé n'est pas une
-- clé. Il faut l'identifiant.
--
-- La colonne est NULLABLE : les commandes déjà passées n'en ont pas, et les
-- articles sans version n'en auront jamais. Aucune rupture.
--
-- ON DELETE SET NULL : supprimer une version ne doit pas effacer la commande.
-- Le libellé, lui, reste lisible dans `options`, et le nom vendu dans
-- `article_nom`.
--
-- Aucune donnée personnelle : un identifiant de version, rien d'autre.
--
-- Idempotente : ré-exécutable sans effet de bord.
--
-- ⚠️ À PASSER AVANT le déploiement du code qui écrit la colonne : une insertion
-- vers une colonne inexistante est refusée par PostgREST, et AUCUNE commande ne
-- passerait plus. Dans ce sens-là il n'y a aucune fenêtre de casse : la colonne
-- peut exister des jours avant que quoi que ce soit l'écrive.
--
-- Vérification attendue en fin de script : colonne_creee = 1, index_cree = 1
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE commande_articles
  ADD COLUMN IF NOT EXISTS variante_id uuid
  REFERENCES article_variantes(id) ON DELETE SET NULL;

COMMENT ON COLUMN commande_articles.variante_id IS
  'Version vendue (taille, coloris). Indispensable pour rendre le stock quand la commande est annulée : le libellé rangé dans options ne peut pas servir de clé.';

-- Rendre le stock d''une commande annulée demande de retrouver ses lignes par
-- version. Sans index, ce balayage grossit avec l''historique.
CREATE INDEX IF NOT EXISTS idx_commande_articles_variante
  ON commande_articles (variante_id) WHERE variante_id IS NOT NULL;

-- Droits : la colonne s''ajoute à une table déjà ouverte, on les réaffirme
-- malgré tout (règle projet sur toute migration de structure).
GRANT SELECT ON commande_articles TO anon, authenticated;
GRANT INSERT ON commande_articles TO anon, authenticated;
GRANT ALL    ON commande_articles TO service_role;

-- ─── Vérification ──────────────────────────────────────────────────────────
-- Interroge l'état réel de la base, jamais une tautologie.
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'commande_articles' AND column_name = 'variante_id') AS colonne_creee,
  (SELECT COUNT(*) FROM pg_indexes
    WHERE tablename = 'commande_articles' AND indexname = 'idx_commande_articles_variante') AS index_cree;
