-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_RLS_LIGNES_COMMERCANT.sql
--
-- Le commerçant peut de nouveau lire les lignes de SES commandes.
--
-- ⚠️ LE DÉFAUT, ET IL REND LE TABLEAU DE BORD INUTILISABLE.
-- `MIGRATION_RLS_LECTURES_RESIDUELLES` a supprimé la policy de lecture de
-- `commande_articles`, à juste titre : elle disait `USING (true)` et laissait
-- n'importe qui lire le contenu des commandes des autres.
--
-- Mais AUCUNE policy de remplacement n'a été posée pour le commerçant. Or la
-- table a RLS activé : sans policy qui l'autorise, il ne lit RIEN. Seuls
-- `service_role` (qui contourne RLS) et l'administration Yoppaa (policy
-- « Admin Yoppaa FULL », déjà en place) y avaient encore accès.
--
-- Conséquence, invisible partout ailleurs :
--   • le tableau de bord lit avec le compte du commerçant, donc soumis à RLS.
--     La requête renvoie une liste VIDE, sans la moindre erreur ;
--   • la vignette d'une commande n'affiche donc que le nom et le téléphone.
--     Le commerçant voit qu'un client a commandé, et pas CE QU'IL A COMMANDÉ.
--     Il ne peut ni préparer, ni servir.
--
-- Les écrans du Yopper passent, eux, par des routes serveur en `service_role`,
-- et les emails aussi : ils n'ont jamais rien vu du problème. C'est exactement
-- pour ça qu'il est passé inaperçu, y compris au banc, qui ne touche pas la base.
--
-- ⚠️ ON NE RÉOUVRE PAS EN GRAND. Cette policy est nominative : le commerçant ne
-- lit que les lignes des commandes QUI LUI SONT ADRESSÉES. `anon` n'est pas
-- servi, et le client non plus : il passe par la route serveur, lui donner un
-- accès direct rouvrirait la fuite que la migration précédente a fermée.
--
-- ⚠️ Une policy dont le USING interroge une table elle-même fermée renverrait
-- ZÉRO ligne SANS erreur (leçon du 03/08). `commandes` et `commercants` sont
-- toutes deux lisibles par leur propriétaire, la sous-requête aboutit donc.
--
-- Idempotente : ré-exécutable sans effet de bord.
--
-- Vérification attendue : policies_lecture = 2
--   (« Lignes de mes commandes » pour le commerçant + « Admin Yoppaa FULL »)
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Lignes de mes commandes" ON commande_articles;
CREATE POLICY "Lignes de mes commandes" ON commande_articles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM commandes c
        JOIN commercants m ON m.id = c.commercant_id
       WHERE c.id = commande_articles.commande_id
         AND m.auth_user_id = auth.uid()
    )
  );

-- GRANT explicite (règle projet). Sans lui, la policy ne servirait à rien : le
-- droit de table et la policy sont deux verrous distincts.
GRANT SELECT ON commande_articles TO authenticated;

-- ─── Vérification ──────────────────────────────────────────────────────────
-- ⚠️ On compte les policies qui PERMETTENT de lire, pas seulement celles
-- déclarées `FOR SELECT` : une policy `FOR ALL` autorise la lecture aussi, et
-- apparaît dans `pg_policies` avec cmd = 'ALL'. C'est ce détail qui faisait
-- afficher « 0 » à la vérification de la migration précédente alors que
-- l'administration, elle, lisait toujours.
SELECT COUNT(*) AS policies_lecture
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'commande_articles'
  AND cmd IN ('SELECT', 'ALL');
