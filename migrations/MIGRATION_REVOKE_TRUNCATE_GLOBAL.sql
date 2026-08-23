-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION : RETIRER TRUNCATE, REFERENCES ET TRIGGER À anon ET authenticated
-- SUR TOUT LE SCHÉMA PUBLIC
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ À PASSER DANS L'ÉDITEUR SQL SUPABASE, PUIS ME DIRE QUE C'EST FAIT.
--
-- CE QUE LE RELEVÉ D'ALEX A MONTRÉ (24/08). En contrôlant les droits des deux
-- tables de fidélité, on a découvert que `anon` et `authenticated` possèdent
-- TRUNCATE, REFERENCES et TRIGGER sur **plus de soixante tables**, c'est-à-dire
-- sur la totalité du schéma. C'est le `GRANT ALL` que Supabase applique par
-- défaut à toute table nouvellement créée : personne ne l'a demandé, personne
-- ne l'a vu.
--
-- ⚠️ GRAVITÉ RÉELLE, ET IL FAUT LE DIRE HONNÊTEMENT : ce n'est PAS une porte
-- ouverte aujourd'hui. TRUNCATE n'est exposé par aucune route de PostgREST, et
-- les rôles `anon` / `authenticated` ne peuvent pas ouvrir de connexion directe
-- à Postgres. C'est un droit LATENT.
--
-- Ce qui le rend inacceptable quand même :
--   • **TRUNCATE IGNORE COMPLÈTEMENT RLS.** Tout le travail de policies de
--     l'été ne protège rien contre lui : il ne supprime pas des lignes, il
--     vide la table. Sur `commandes` ou `fidelite_cartes`, c'est la perte
--     sèche, sans journal et sans recours.
--   • Il suffirait d'UNE fonction `SECURITY INVOKER` appelable en RPC, ou
--     d'un accès direct un jour ouvert pour du reporting, pour que le droit
--     latent devienne un droit exerçable. On ne veut pas que la sécurité de
--     la base dépende de ce qu'on n'a pas encore construit.
--   • REFERENCES et TRIGGER permettent d'accrocher quelque chose à une table
--     qu'on ne possède pas. Aucun usage légitime ici.
--
-- ⚠️ AUCUN RISQUE DE RÉGRESSION : l'application ne fait que du CRUD. Ces trois
-- droits ne servent à rien de ce qu'elle exécute. SELECT, INSERT, UPDATE et
-- DELETE ne sont PAS touchés par cette migration.
--
-- `service_role` n'est pas concerné : il garde tout.

BEGIN;

-- ── 1) L'existant, d'un coup ──────────────────────────────────────────────
REVOKE TRUNCATE, REFERENCES, TRIGGER
  ON ALL TABLES IN SCHEMA public
  FROM anon, authenticated;

-- ── 2) Et les tables À VENIR ──────────────────────────────────────────────
--
-- ⚠️ SANS CE SECOND BLOC, LE CORRECTIF NE TIENT PAS UNE SEMAINE : la prochaine
-- table créée reprendrait les mêmes droits, et on aurait « corrigé » un état
-- au lieu de corriger une règle. C'est exactement la différence entre réparer
-- l'endroit signalé et réparer le défaut.
--
-- `FOR ROLE postgres` : ce sont les privilèges par défaut posés au nom du
-- propriétaire du schéma, c'est-à-dire ceux que Supabase applique.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRÔLE — à lancer APRÈS, et à me renvoyer tel quel
-- ═══════════════════════════════════════════════════════════════════════════

-- a) 🔴 LE CONTRÔLE QUI COMPTE : il ne doit plus rien rendre du tout.
SELECT count(*) AS droits_restants
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated')
  AND privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER');
-- attendu : 0

-- b) Et le CRUD n'a pas bougé : on doit retrouver les SELECT / INSERT /
--    UPDATE / DELETE habituels, table par table.
SELECT privilege_type, count(*) AS tables
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated')
GROUP BY privilege_type
ORDER BY privilege_type;
-- attendu : plus que SELECT, INSERT, UPDATE, DELETE — et AUCUNE ligne
-- TRUNCATE / REFERENCES / TRIGGER.

-- c) Le défaut pour les tables futures
SELECT defaclrole::regrole AS pose_par, defaclacl AS droits_par_defaut
FROM pg_default_acl
WHERE defaclnamespace = 'public'::regnamespace AND defaclobjtype = 'r';
