-- ════════════════════════════════════════════════════════════════════════════
-- LES VUES PUBLIQUES REDEVIENNENT EN LECTURE SEULE — 27/08
-- ════════════════════════════════════════════════════════════════════════════
--
-- 🔴 CE QUI A ÉTÉ TROUVÉ, ET PROUVÉ. `commercants_public` portait
-- GRANT INSERT, UPDATE, DELETE pour `anon`. La vue est AUTOMATIQUEMENT
-- MODIFIABLE (colonnes nues, une seule table, ni agrégat ni jointure), et elle
-- n'a PAS `security_invoker` : l'écriture arrivait donc dans `commercants`
-- AVEC LES DROITS DU PROPRIÉTAIRE DE LA VUE, c'est-à-dire en contournant la
-- RLS. Et cette vue expose `plan`.
--
-- Un visiteur non connecté, avec la seule clé publique, pouvait écrire dans la
-- table des commerçants. C'est la porte de service du forfait en libre-service
-- du 26/08 : j'avais verrouillé la TABLE sans jamais regarder CE QUI LA DONNE
-- À LIRE.
--
-- ⚠️ PROUVÉ, PAS DÉDUIT, et pas non plus par un refus après coup : un `42501`
-- obtenu APRÈS le REVOKE ne dit rien de l'état d'avant. Un GRANT étant
-- TRANSACTIONNEL, on rejoue l'état d'avant sans rouvrir plus d'une
-- transaction (bloc 3 ci-dessous).
--
-- ⚠️ ET CE N'EST PAS NOUS QUI AVONS POSÉ CES DROITS. Toutes nos migrations
-- n'accordent que `GRANT SELECT`. Ils viennent des privilèges PAR DÉFAUT de
-- Supabase sur le schéma `public`, et un `GRANT SELECT` explicite s'AJOUTE à
-- ces droits, il ne les restreint pas. Conséquence : **chaque vue que nous
-- créerons naîtra ouverte**, y compris celle que recrée
-- MIGRATION_RETRAIT_COLONNES_RDV_FIDELITE.sql. Le bloc 4 sert à le constater.
--
-- ⚠️ AUCUN CODE N'ÉCRIT DANS CES VUES : les huit usages du dépôt sont des
-- `.select`. Retirer ces droits ne peut donc rien casser.


-- ─── BLOC 1 — LE VERROU ─────────────────────────────────────────────────────
--
-- `commercants_public` y figure aussi : la retirer à la main le 27/08 ne suffit
-- pas, la migration doit être rejouable telle quelle sur une base neuve.

REVOKE INSERT, UPDATE, DELETE ON public.commercants_public FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.avis_public        FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.commandes_stats    FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.commune_stats      FROM anon, authenticated;

-- Et on garantit la lecture, qui est la seule raison d'être de ces vues.
GRANT SELECT ON public.commercants_public TO anon, authenticated;
GRANT SELECT ON public.avis_public        TO anon, authenticated;
GRANT SELECT ON public.commandes_stats    TO anon, authenticated;
GRANT SELECT ON public.commune_stats      TO anon, authenticated;


-- ─── BLOC 2 — CONTRÔLE : PLUS AUCUNE VUE ÉCRIVABLE ──────────────────────────
--
-- ⚠️ ATTENDU : ZÉRO LIGNE. Cette requête balaie TOUT le schéma, pas seulement
-- les quatre vues ci-dessus : c'est elle qui a trouvé les trois dernières.

SELECT c.relname AS vue, g.grantee,
       string_agg(g.privilege_type, ', ' ORDER BY g.privilege_type) AS droits,
       c.reloptions
FROM information_schema.role_table_grants g
JOIN pg_class c ON c.relname = g.table_name
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = g.table_schema
WHERE g.table_schema = 'public' AND c.relkind = 'v'
  AND g.grantee IN ('anon', 'authenticated')
  AND g.privilege_type <> 'SELECT'
GROUP BY c.relname, g.grantee, c.reloptions
ORDER BY c.relname, g.grantee;

-- Et la lecture, elle, doit être intacte : quatre vues qui rendent des lignes.
SELECT (SELECT count(*) FROM commercants_public) AS commerces_visibles,
       (SELECT count(*) FROM avis_public)        AS avis_visibles,
       (SELECT count(*) FROM commandes_stats)    AS stats_commandes,
       (SELECT count(*) FROM commune_stats)      AS communes;


-- ─── BLOC 3 — LA PREUVE HISTORIQUE (facultatif, rien n'est modifié) ─────────
--
-- ⚠️ À JOUER APRÈS LE BLOC 1, jamais avant : on ferme d'abord, on documente
-- ensuite. Chaque transaction rouvre le droit, pose la question, et annule tout.
-- `WHERE false` ne touche aucune ligne ; seul le DROIT est vérifié.
--
--   « Rollback Success » sans erreur  → la vue ÉTAIT écrivable (porte ouverte)
--   « 42501 » ou « cannot update view » → elle ne l'était pas
--
-- Ce que ça décide : `avis_public` écrivable par `authenticated` signifierait
-- qu'un Yopper connecté pouvait réécrire ou supprimer l'avis d'un autre.

BEGIN;
  GRANT UPDATE ON public.avis_public TO authenticated;
  SET LOCAL ROLE authenticated;
  UPDATE public.avis_public SET note = note WHERE false;
ROLLBACK;

BEGIN;
  GRANT UPDATE ON public.commandes_stats TO anon;
  SET LOCAL ROLE anon;
  UPDATE public.commandes_stats SET statut = statut WHERE false;
ROLLBACK;

BEGIN;
  GRANT UPDATE ON public.commune_stats TO anon;
  SET LOCAL ROLE anon;
  UPDATE public.commune_stats SET nom = nom WHERE false;
ROLLBACK;


-- ─── BLOC 4 — LA CAUSE, POUR QUE ÇA NE REVIENNE PAS ─────────────────────────
--
-- ⚠️ NE RIEN MODIFIER ICI, C'EST UNE LECTURE. Si `anon` ou `authenticated`
-- apparaissent avec autre chose que `r` (SELECT) dans `defaclacl`, alors toute
-- vue future naîtra écrivable, et le bloc 2 devra être rejoué après CHAQUE
-- création de vue. Colle-moi le résultat.

SELECT defaclrole::regrole  AS role_createur,
       defaclnamespace::regnamespace AS schema,
       defaclobjtype        AS type_objet,
       defaclacl            AS privileges_par_defaut
FROM pg_default_acl;
