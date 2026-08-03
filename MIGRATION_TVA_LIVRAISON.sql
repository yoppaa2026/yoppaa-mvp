-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_TVA_LIVRAISON.sql
-- Taux de TVA des frais de livraison, figé sur la commande.
--
-- Fait suite à MIGRATION_TVA_EXPORT.sql et MIGRATION_TVA_REFERENCE.sql, toutes
-- deux déjà passées.
--
-- POURQUOI UNE COLONNE DÉDIÉE. Les frais de livraison ne sont pas une
-- prestation autonome : ce sont des frais accessoires à la vente. L'article 26
-- du Code de la TVA inclut dans la base d'imposition tout ce que le
-- fournisseur obtient en contrepartie, transport compris, et ce même lorsque
-- ces frais sont facturés séparément. L'accessoire suit donc le principal.
--
-- Quand la commande mélange plusieurs taux, l'administration admet que les
-- frais subissent LE TAUX LE PLUS BAS de la commande. Ce taux se calcule à
-- l'achat et doit être FIGÉ, exactement comme celui des lignes d'articles :
-- sans cela, changer le taux d'un article réécrirait le taux de livraison de
-- toutes les commandes passées.
--
-- Aucune table créée : uniquement une colonne, donc aucun GRANT à ajouter.
-- Idempotente : ré-exécutable sans effet de bord.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE commandes
  ADD COLUMN IF NOT EXISTS tva_taux_livraison numeric(5,2);

COMMENT ON COLUMN commandes.tva_taux_livraison IS
  'Taux de TVA appliqué aux frais de livraison AU MOMENT DE LA VENTE : le taux le plus bas des lignes de la commande (tolérance administrative sur les frais accessoires). NULL si la commande n''a pas de frais de livraison, ou si elle est antérieure à cette règle.';

-- Historique : on reprend le taux le plus bas réellement figé sur les lignes
-- de chaque commande qui a des frais de livraison. Les commandes dont aucune
-- ligne n'a de taux restent à NULL, et l'export les signalera comme telles
-- plutôt que de leur inventer une valeur.
UPDATE commandes c
   SET tva_taux_livraison = sous.taux_min
  FROM (
    SELECT ca.commande_id, MIN(ca.tva_taux) AS taux_min
      FROM commande_articles ca
     WHERE ca.tva_taux IS NOT NULL
     GROUP BY ca.commande_id
  ) AS sous
 WHERE c.id = sous.commande_id
   AND c.tva_taux_livraison IS NULL
   AND COALESCE(c.frais_livraison, 0) > 0;

-- ─── Vérification ──────────────────────────────────────────────────────────
-- Commandes avec des frais de livraison mais sans taux : ce sont les commandes
-- antérieures au figement des taux. Le chiffre doit rester stable.
SELECT count(*) AS livraisons_sans_taux
  FROM commandes
 WHERE COALESCE(frais_livraison, 0) > 0
   AND tva_taux_livraison IS NULL;
