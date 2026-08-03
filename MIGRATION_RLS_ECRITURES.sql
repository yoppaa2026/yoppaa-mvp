-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_RLS_ECRITURES.sql
-- 🚨 Ferme trois autorisations d'ÉCRITURE ouvertes à tous.
--
-- L'audit du 13/07 avait traité les LECTURES. Le relevé des policies du
-- 03/08 montre que des policies d'ÉCRITURE `USING (true)` pour {public}
-- subsistent. Elles sont exploitables avec la seule clé anon, qui est
-- publique par construction puisqu'elle est livrée dans le JavaScript.
--
-- 1) articles — « Gestion articles », ALL, USING (true)
--    N'importe qui pouvait MODIFIER ou SUPPRIMER le catalogue de n'importe
--    quel commerçant : changer un prix, vider un menu, remettre un stock à
--    zéro un samedi matin. C'est le trou le plus grave de l'application.
--
-- 2) avis — « Update avis », UPDATE, USING (true)
--    N'importe qui pouvait réécrire N'IMPORTE QUEL avis : transformer un
--    cinq étoiles en une étoile, ou modifier la réponse publique d'un
--    commerçant. Atteinte directe à la réputation, et invérifiable.
--
-- 3) commande_articles — « Insert commande_articles », INSERT, WITH CHECK (true)
--    N'importe qui pouvait ajouter des lignes à la commande d'un autre.
--    Vérifié avant fermeture : la création de commande passe par
--    /api/stripe/checkout/create-commande, qui utilise la clé de service et
--    n'est donc pas soumis aux policies. Fermer ne casse rien.
--
-- CE QUI N'EST PAS TRAITÉ ICI, et pourquoi. Les policies d'INSERT ouvertes
-- sur avis, favoris, signalements et suggestions servent des visiteurs SANS
-- compte : le navigateur y écrit avec un identifiant client conservé en
-- localStorage, que la base ne peut pas vérifier. Les fermer maintenant
-- casserait les avis et les favoris des invités. Elles seront reprises quand
-- ces écritures passeront par des routes serveur, comme l'ont fait les
-- commandes en juillet.
--
-- Idempotente : ré-exécutable sans effet de bord.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Le catalogue n'appartient qu'à son commerçant ──────────────────────

DROP POLICY IF EXISTS "Gestion articles" ON articles;

DROP POLICY IF EXISTS "articles_gestion_proprietaire" ON articles;
CREATE POLICY "articles_gestion_proprietaire"
  ON articles FOR ALL
  TO authenticated
  USING (
    commercant_id IN (SELECT id FROM commercants WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    commercant_id IN (SELECT id FROM commercants WHERE auth_user_id = auth.uid())
  );

-- La sous-requête sur `commercants` est ici SANS DANGER, contrairement au
-- piège rencontré sur les prestations de rendez-vous : un commerçant
-- authentifié peut lire sa propre ligne grâce à la policy
-- `commercant_select_own`. La sous-requête renvoie donc bien son identifiant.
-- Ce ne serait PAS le cas pour le rôle anon, qui ne lit rien de cette table.

-- La lecture publique du catalogue reste ouverte : c'est la vitrine.
-- (policy « Lecture publique », SELECT, inchangée)

-- ─── 2. Un avis ne se réécrit pas par un inconnu ───────────────────────────

DROP POLICY IF EXISTS "Update avis" ON avis;

-- Restent en place, et suffisent :
--   • commercant_update_own_avis_reponse : le commerçant répond à SES avis
--   • yopper_update_own_avis             : l'auteur corrige le sien sous 24 h
--   • Admin Yoppaa FULL                  : la modération

-- ─── 3. Les lignes de commande s'écrivent côté serveur uniquement ──────────

DROP POLICY IF EXISTS "Insert commande_articles" ON commande_articles;

-- ─── Vérification ──────────────────────────────────────────────────────────
-- Il ne doit plus rester AUCUNE policy permissive à {public} avec une clause
-- toujours vraie sur ces trois tables, hors lecture publique du catalogue.
SELECT tablename, policyname, cmd, roles::text,
       COALESCE(qual, '—') AS using_clause,
       COALESCE(with_check, '—') AS with_check_clause
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('articles', 'avis', 'commande_articles')
 ORDER BY tablename, cmd, policyname;
