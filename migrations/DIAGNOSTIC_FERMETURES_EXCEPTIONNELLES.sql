-- DIAGNOSTIC : LES FERMETURES EXCEPTIONNELLES SONT-ELLES ÉCRIVABLES ? (29/09/2026)
--
-- DIAGNOSTIC_ADMIN_TABLES_FICHE.sql a rendu, pour `fermetures_exceptionnelles`,
-- UNE SEULE policy : `zz_commerce_ouvert`, RESTRICTIVE. Aucune permissive.
-- Sous RLS, sans policy permissive, PERSONNE ne lit ni n'écrit depuis le
-- navigateur : ni le commerçant (onglet Créneaux, « Ajouter une fermeture »),
-- ni la fiche publique. Seul le serveur (clé de service) la lit.
--
-- Avant d'écrire la moindre migration, on mesure : combien de lignes existent,
-- et combien sont encore à venir. (Pas de date de création : la table n'est
-- définie dans aucun fichier du dépôt, une colonne supposée ferait échouer
-- toute la requête.) Et on vérifie que la fonction
-- `commerce_lisible` vivante laisse bien passer l'admin, comme le dépôt le dit.
--
-- LECTURE SEULE. Des nombres et des dates, aucune donnée personnelle.

SELECT 'A1' AS n, 'RLS active sur fermetures_exceptionnelles' AS controle,
       (SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.fermetures_exceptionnelles'::regclass) AS valeur,
       'true' AS attendu
UNION ALL
SELECT 'A2', 'policies permissives sur fermetures_exceptionnelles',
       (SELECT count(*)::text FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'fermetures_exceptionnelles' AND permissive = 'PERMISSIVE'),
       '0 confirme le defaut'
UNION ALL
SELECT 'A3', 'lignes en tout',
       (SELECT count(*)::text FROM public.fermetures_exceptionnelles),
       'pour information'
UNION ALL
SELECT 'A5', 'fermetures encore a venir',
       (SELECT count(*)::text FROM public.fermetures_exceptionnelles WHERE date_fin >= current_date),
       'pour information'
UNION ALL
SELECT 'B1', 'commerce_lisible vivante laisse passer l admin',
       (SELECT CASE WHEN pg_get_functiondef('public.commerce_lisible(uuid)'::regprocedure) LIKE '%is_yoppaa_admin()%'
                    THEN 'oui' ELSE 'NON' END),
       'oui'
ORDER BY 1;
