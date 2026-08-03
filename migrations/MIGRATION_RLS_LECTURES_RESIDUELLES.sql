-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_RLS_LECTURES_RESIDUELLES.sql
-- Ferme les deux dernières lectures publiques, sans casser la fiche commerçant.
--
-- ⚠️ À PASSER APRÈS LE DÉPLOIEMENT DU CODE. Les deux lectures concernées sont
-- remplacées par les objets créés ici ; tant que l'ancien code tourne, fermer
-- casserait l'affichage du stock et des avis.
--
-- 1) `commande_articles` était lisible par tous : ce n'est pas une donnée
--    personnelle, mais c'est du renseignement commercial. On y lit ce qui se
--    vend chez chaque commerçant, en quelle quantité et à quel prix. Un
--    concurrent n'a rien à faire là.
--    La fiche en avait pourtant besoin, pour deux calculs honnêtes : le stock
--    déjà consommé sur la journée, et la charge de préparation d'un créneau.
--    Deux fonctions SECURITY DEFINER les fournissent désormais, agrégés, sans
--    jamais exposer une ligne de commande.
--
-- 2) `avis` exposait `client_id` et `commande_id` en plus de la note. Ces
--    identifiants ne disent rien à eux seuls, mais ils relient un avis à une
--    personne et à un achat : c'est une donnée de trop pour un affichage
--    public. Une vue livre exactement ce qu'il faut afficher, et rien d'autre.
--
-- Idempotente : ré-exécutable sans effet de bord.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1a. Stock déjà commandé pour un jour donné ────────────────────────────
-- Renvoie, par article, la quantité déjà commandée ce jour-là. C'est ce qui
-- permet à la fiche d'afficher un stock restant juste, sans lire les commandes.

CREATE OR REPLACE FUNCTION stock_commande_par_article(
  p_commercant_id uuid,
  p_date          date
)
RETURNS TABLE (article_id uuid, quantite bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT ca.article_id, SUM(ca.quantite)::bigint
    FROM commande_articles ca
    JOIN commandes c ON c.id = ca.commande_id
   WHERE c.commercant_id = p_commercant_id
     AND c.date_commande = p_date
     AND c.statut <> 'non_retire'
   GROUP BY ca.article_id;
$$;

REVOKE ALL ON FUNCTION stock_commande_par_article(uuid, date) FROM public;
GRANT EXECUTE ON FUNCTION stock_commande_par_article(uuid, date) TO anon, authenticated;

-- ─── 1b. Charge de préparation par créneau ─────────────────────────────────
-- Somme des temps de préparation des commandes en cours, par créneau. Sert à
-- afficher un créneau comme saturé. Aucune information sur QUI a commandé.

CREATE OR REPLACE FUNCTION charge_preparation_par_creneau(
  p_commercant_id uuid
)
RETURNS TABLE (creneau_id uuid, nb_commandes bigint, temps_total numeric)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT c.creneau_id,
         COUNT(DISTINCT c.id)::bigint,
         COALESCE(SUM(ca.quantite * COALESCE(a.temps_prepa, 1)), 0)::numeric
    FROM commandes c
    LEFT JOIN commande_articles ca ON ca.commande_id = c.id
    LEFT JOIN articles a           ON a.id = ca.article_id
   WHERE c.commercant_id = p_commercant_id
     AND c.creneau_id IS NOT NULL
     AND c.statut NOT IN ('recupere', 'non_retire')
   GROUP BY c.creneau_id;
$$;

-- La jointure est en LEFT : une commande sans ligne (cas théorique) doit tout
-- de même compter dans le nombre de commandes du créneau, sinon la capacité
-- affichée serait trop optimiste.

REVOKE ALL ON FUNCTION charge_preparation_par_creneau(uuid) FROM public;
GRANT EXECUTE ON FUNCTION charge_preparation_par_creneau(uuid) TO anon, authenticated;

-- Les lignes de commande ne sont plus lisibles directement.
DROP POLICY IF EXISTS "Select commande_articles" ON commande_articles;

-- ─── 2. Les avis, sans les identifiants ────────────────────────────────────

CREATE OR REPLACE VIEW avis_public AS
  SELECT id, commercant_id, note, commentaire, reponse_commercant,
         (commande_id IS NOT NULL) AS verifie,
         created_at
    FROM avis;

COMMENT ON VIEW avis_public IS
  'Avis destinés à l''affichage public : la note, le commentaire, la réponse du commerçant et le fait que l''avis suive une commande. Ni client_id ni commande_id : ils relieraient un avis à une personne et à un achat.';

GRANT SELECT ON avis_public TO anon, authenticated;

-- La table reste lisible par son auteur, par le commerçant concerné et par
-- l'administration, via les policies nominatives déjà en place.
DROP POLICY IF EXISTS "Lecture publique" ON avis;
DROP POLICY IF EXISTS "avis_select_public" ON avis;

-- ─── Vérification ──────────────────────────────────────────────────────────
SELECT 'commande_articles' AS objet, count(*) AS policies_select
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'commande_articles' AND cmd = 'SELECT'
UNION ALL
SELECT 'avis (select public)', count(*)
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'avis' AND cmd = 'SELECT'
   AND qual = 'true';
