-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION : LA CARTE DE FIDÉLITÉ NE S'ÉCRIT PLUS DEPUIS LE NAVIGATEUR
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ À PASSER DANS L'ÉDITEUR SQL SUPABASE, PUIS ME DIRE QUE C'EST FAIT.
-- Aucun repli n'est écrit dans le code.
--
-- ⚠️ ORDRE IMPÉRATIF : cette migration RETIRE au navigateur le droit d'écrire
-- sur les deux tables de fidélité. Elle ne doit donc passer QU'APRÈS le
-- déploiement du code qui passe par l'API (`/api/fidelite/mouvement`). Entre
-- les deux, le comptoir du tableau de bord ne pourrait plus rien créditer.
--
-- LE DÉFAUT QU'ELLE FERME. Le tableau de bord calculait la carte DANS LE
-- NAVIGATEUR (`appliquerCredit`), puis écrivait passages, cagnotte et
-- récompenses EN VALEUR BRUTE. Le journal partait dans un second appel, sans
-- transaction : si celui-là échouait, la carte avait bougé sans laisser la
-- moindre trace. Et rien n'empêchait d'y écrire une valeur inventée.
--
-- ⚠️ RLS PROTÈGE LA LIGNE, PAS LA VALEUR. Une policy peut garantir qu'un
-- commerçant ne touche que SES cartes ; elle ne peut pas garantir que le
-- nombre de passages qu'il y écrit est celui qu'il vient de compter. Le seul
-- endroit où cette garantie existe, c'est le serveur.

BEGIN;

-- ── 1) La clé d'idempotence du comptoir ───────────────────────────────────
--
-- Les crédits automatiques ont déjà leur ancre : `commande_id`, `rdv_id`,
-- `bon_cadeau_id`, chacun sous index unique, ce qui absorbe un webhook rejoué.
-- LE COMPTOIR N'EN A AUCUNE : un commerçant qui tape deux fois sur « +1
-- passage », ou dont le réseau renvoie la requête, crédite deux fois. Le geste
-- est physique, il n'y a rien pour le dédoublonner.
--
-- La clé est fabriquée par le navigateur à chaque CLIC (pas à chaque envoi) et
-- renvoyée telle quelle si la requête est rejouée.
ALTER TABLE public.fidelite_mouvements
  ADD COLUMN IF NOT EXISTS cle_idempotence text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_fidelite_mvt_cle_idempotence
  ON public.fidelite_mouvements(cle_idempotence)
  WHERE cle_idempotence IS NOT NULL;

-- ── 2) Le navigateur perd le droit d'écrire ───────────────────────────────
--
-- ⚠️ IL GARDE LA LECTURE : le comptoir doit toujours pouvoir afficher les
-- dernières cartes du commerçant. C'est l'ÉCRITURE, et elle seule, qui remonte
-- au serveur.
--
-- `service_role` n'est pas concerné : il conserve ses droits propres, et c'est
-- lui qu'utilisent l'API et les crons.
REVOKE INSERT, UPDATE, DELETE ON public.fidelite_cartes     FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.fidelite_mouvements FROM authenticated, anon;

-- Et on rend la lecture EXPLICITE plutôt que subie : le jour où quelqu'un
-- resserre les droits par défaut, cette ligne dit ce dont le comptoir a besoin.
GRANT SELECT ON public.fidelite_cartes     TO authenticated;
GRANT SELECT ON public.fidelite_mouvements TO authenticated;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRÔLE — à lancer APRÈS, et à me renvoyer tel quel
-- ═══════════════════════════════════════════════════════════════════════════

-- a) La colonne et son index existent
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'fidelite_mouvements'
  AND column_name = 'cle_idempotence';
-- attendu : cle_idempotence | text | YES

SELECT indexname FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'fidelite_mouvements'
  AND indexname = 'idx_fidelite_mvt_cle_idempotence';
-- attendu : une ligne

-- b) 🔴 LE CONTRÔLE QUI COMPTE : plus aucune écriture ouverte au navigateur.
--    Doit rendre UNIQUEMENT des lignes « SELECT » pour authenticated et anon.
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('fidelite_cartes', 'fidelite_mouvements')
  AND grantee IN ('authenticated', 'anon')
ORDER BY table_name, grantee, privilege_type;
-- attendu : que des SELECT. Toute ligne INSERT / UPDATE / DELETE ici est un
-- trou qui reste ouvert.

-- c) Et pendant qu'on y est, l'état RLS des deux tables (jamais vérifié)
SELECT relname, relrowsecurity AS rls_active
FROM pg_class
WHERE relname IN ('fidelite_cartes', 'fidelite_mouvements');

SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('fidelite_cartes', 'fidelite_mouvements')
ORDER BY tablename, cmd;
