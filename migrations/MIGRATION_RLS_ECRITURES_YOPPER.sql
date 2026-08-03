-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_RLS_ECRITURES_YOPPER.sql
-- Ferme les dernières écritures libres depuis le navigateur.
--
-- ⚠️ À PASSER APRÈS LE DÉPLOIEMENT DU CODE, pas avant. Les écritures viennent
-- d'être déplacées vers des routes serveur (/api/yopper/avis,
-- /api/yopper/favoris, /api/signaux). Tant que l'ancien code tourne encore en
-- production, retirer ces policies casserait les avis, les favoris et les
-- signalements. Vercel déploie en une à deux minutes.
--
-- POURQUOI DES ROUTES SERVEUR PLUTÔT QUE DES POLICIES. Un Yopper n'a pas
-- forcément de compte Supabase Auth : la base ne dispose d'aucun `auth.uid()`
-- pour reconnaître l'auteur d'un avis ou le propriétaire d'un favori. Aucune
-- policy SQL ne pouvait donc distinguer un habitant légitime d'un usurpateur.
-- En passant par le serveur, on récupère l'identité dans un cookie HTTP-only,
-- on limite le débit, et surtout on peut vérifier ce que le SQL ne sait pas
-- exprimer : qu'un avis suit une commande réellement récupérée.
--
-- Ce que chaque fermeture supprime concrètement :
--   • avis        — on pouvait signer un avis du nom d'un autre, ou noter un
--                   commerce où l'on n'a jamais rien acheté.
--   • favoris     — on pouvait lire les favoris de tout le monde et EFFACER
--                   ceux des autres.
--   • signalements et suggestions — insertion en masse par un robot.
--
-- Idempotente : ré-exécutable sans effet de bord.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Avis ───────────────────────────────────────────────────────────────
-- L'insertion passe par /api/yopper/avis, qui vérifie la relation commerciale.
DROP POLICY IF EXISTS "Insert avis" ON avis;

-- Restent : yopper_insert_own_avis (si le Yopper a un compte Auth),
-- yopper_update_own_avis, yopper_delete_own_avis, la réponse du commerçant,
-- la lecture publique des notes, et l'administration.

-- ─── 2. Favoris ────────────────────────────────────────────────────────────
-- Tout passe par /api/yopper/favoris.
DROP POLICY IF EXISTS "Select favori" ON favoris;
DROP POLICY IF EXISTS "Insert favori" ON favoris;
DROP POLICY IF EXISTS "Delete favori" ON favoris;

-- ─── 3. Signalements et suggestions ────────────────────────────────────────
-- Tout passe par /api/signaux, avec limitation de débit par adresse.
DROP POLICY IF EXISTS "signalements_insert_tous" ON signalements;
DROP POLICY IF EXISTS "Insert suggestion" ON suggestions_commercants;

-- ─── 4. Demandes d'activation ──────────────────────────────────────────────
-- L'anti-spam d'une envie par semaine était appliqué dans le navigateur, donc
-- contournable. Il est désormais vérifié côté serveur.
DROP POLICY IF EXISTS "Insert upgrade_request" ON upgrade_requests;
DROP POLICY IF EXISTS "Select upgrade_request" ON upgrade_requests;

-- ─── Vérification ──────────────────────────────────────────────────────────
-- Il ne doit plus rester AUCUNE policy d'écriture {public} inconditionnelle.
SELECT tablename, policyname, cmd, roles::text,
       COALESCE(qual, '—')       AS using_clause,
       COALESCE(with_check, '—') AS with_check_clause
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('avis', 'favoris', 'signalements',
                     'suggestions_commercants', 'upgrade_requests')
 ORDER BY tablename, cmd, policyname;
