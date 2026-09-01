-- ═══════════════════════════════════════════════════════════════════════════
-- DIAGNOSTIC : QUE PEUT VRAIMENT FAIRE `anon` SUR LES TABLES PERSONNELLES ?
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 🔴 DÉCLENCHEUR : le contrôle « aucun droit rendu a anon » de
-- MIGRATION_BON_RECLAME_PAR_COMPTE.sql a rendu **4** au lieu de 0, sur
-- `bons_cadeaux`, la table qui porte les CODES des bons, c'est-à-dire de
-- l'argent au porteur.
--
-- ⚠️ CE N'EST PAS ENCORE UNE FUITE, ET IL FAUT LE DIRE PROPREMENT. La RLS est
-- active sur cette table. Un GRANT seul ne lit rien : il faut EN PLUS une
-- policy PERMISSIVE qui atteigne `anon` ou `public`. C'est précisément ce que
-- ce diagnostic mesure, table par table.
--
-- ⚠️ ET ON NE RÉVOQUE RIEN AVANT DE SAVOIR QUI LIT QUOI. Certaines pages
-- publiques lisent peut-être légitimement avec la clé anonyme ; couper à
-- l'aveugle casserait l'application sans rien prouver. On lit d'abord, on
-- décide ensuite, ligne par ligne.
--
-- ⚠️ AUCUNE DONNÉE PERSONNELLE NE SORT D'ICI : que des noms de tables, des
-- noms de droits et des compteurs. Rien du contenu.
--
-- Une ligne par table, la valeur ET l'attendu, tout en text.

SELECT
  ('anon sur ' || t.relname)::text AS controle,
  ( COALESCE((SELECT string_agg(DISTINCT g.privilege_type, '+' ORDER BY g.privilege_type)
              FROM information_schema.role_table_grants g
              WHERE g.table_schema = 'public'
                AND g.table_name = t.relname
                AND g.grantee = 'anon'), 'aucun')
    || ' | rls=' || t.relrowsecurity::text
    || ' | policies_anon=' || (SELECT count(*) FROM pg_policies p
                               WHERE p.schemaname = 'public'
                                 AND p.tablename = t.relname
                                 AND p.permissive = 'PERMISSIVE'
                                 AND ('anon' = ANY(p.roles) OR 'public' = ANY(p.roles)))::text
  )::text AS valeur,
  'aucun | rls=true | policies_anon=0'::text AS attendu
FROM pg_class t
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND t.relkind = 'r'
  AND t.relname IN (
    'bons_cadeaux', 'commandes', 'commande_articles', 'clients',
    'rdv_reservations', 'favoris', 'avis', 'abonnements',
    'client_preferences', 'fidelite_cartes', 'fidelite_recompenses',
    'fidelite_mouvements', 'demandes_commande', 'pre_inscriptions',
    'suggestions_commercants', 'commercants'
  )

UNION ALL

-- Le détail des policies qui atteignent anon, s'il y en a : c'est LA ligne qui
-- transforme un droit dormant en lecture réelle.
SELECT
  ('policy anon: ' || p.tablename || ' / ' || p.policyname)::text,
  (p.cmd || ' | ' || p.permissive || ' | roles=' || array_to_string(p.roles, ','))::text,
  'ne devrait pas exister sur une table personnelle'::text
FROM pg_policies p
WHERE p.schemaname = 'public'
  AND p.permissive = 'PERMISSIVE'
  AND ('anon' = ANY(p.roles) OR 'public' = ANY(p.roles))
  AND p.tablename IN (
    'bons_cadeaux', 'commandes', 'commande_articles', 'clients',
    'rdv_reservations', 'favoris', 'avis', 'abonnements',
    'client_preferences', 'fidelite_cartes', 'fidelite_recompenses',
    'fidelite_mouvements', 'demandes_commande', 'pre_inscriptions',
    'suggestions_commercants'
  )

UNION ALL

-- Le compte global, pour que la conclusion tienne en une ligne.
SELECT
  'TOTAL tables personnelles avec un droit anon'::text,
  (SELECT count(DISTINCT g.table_name)
   FROM information_schema.role_table_grants g
   WHERE g.table_schema = 'public' AND g.grantee = 'anon'
     AND g.table_name IN (
       'bons_cadeaux', 'commandes', 'commande_articles', 'clients',
       'rdv_reservations', 'favoris', 'avis', 'abonnements',
       'client_preferences', 'fidelite_cartes', 'fidelite_recompenses',
       'fidelite_mouvements', 'demandes_commande', 'pre_inscriptions',
       'suggestions_commercants'))::text,
  '0'::text

ORDER BY 1;
