-- ============================================================================
-- CONTRÔLE DE SÉCURITÉ DE LA BASE (12/09/2026)
--
-- ⚠️ CE FICHIER NE MODIFIE RIEN. Aucun CREATE, aucun ALTER, aucun DROP. Il ne
-- lit que des MÉTADONNÉES (catalogue Postgres) : jamais une ligne de commande,
-- de client, de réservation. On peut le coller sans aucun risque, et le relancer
-- autant de fois qu'on veut.
--
-- POURQUOI IL EXISTE. L'audit du 12/09 a couvert le CODE : les routes, les
-- gardes, les clés, les tâches planifiées. Le code ne dit rien de l'état réel
-- de la base, et c'est pourtant là que vivent les données. Ces contrôles
-- répondent à la seule question qui compte : si quelqu'un prend la clé publique
-- de l'application, qu'est-ce qu'il peut lire et écrire ?
--
-- COMMENT LIRE. Une ligne par contrôle, avec sa VALEUR et son ATTENDU, tout en
-- texte. Tout ce qui n'est pas conforme se voit d'un coup d'œil dans la colonne
-- `verdict`. Coller TOUT le bloc d'un coup dans l'éditeur SQL de Supabase.
-- ============================================================================

WITH
-- Les tables ordinaires du schéma public.
t AS (
  SELECT c.oid, c.relname::text AS nom, c.relrowsecurity AS rls, c.relforcerowsecurity AS rls_forcee
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
),
-- Les vues du schéma public, avec leurs options.
v AS (
  SELECT c.oid, c.relname::text AS nom,
         COALESCE(array_to_string(c.reloptions, ','), '') AS options
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'v'
),
-- Les tables qui contiennent des données personnelles. Cette liste est la même
-- que celle des consignes de travail : on ne les lit jamais avec la clé de
-- service, et personne d'autre que leur propriétaire ne doit les lire du tout.
perso(nom) AS (
  VALUES ('clients'), ('commandes'), ('rdv_reservations'), ('favoris'), ('avis'),
         ('abonnements'), ('client_preferences'), ('fidelite_cartes'),
         ('fidelite_mouvements'), ('bons_cadeaux'), ('pre_inscriptions'),
         ('rdv_attente'), ('suggestions_commercants'), ('admin_impersonations'),
         ('demandes_commande')
),
-- Droits d'ÉCRITURE accordés au rôle public/anonyme sur une table.
ecriture_anon AS (
  SELECT DISTINCT table_name::text AS nom
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND grantee IN ('anon', 'PUBLIC')
    AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
),
-- Droits de LECTURE accordés au rôle anonyme sur une table.
lecture_anon AS (
  SELECT DISTINCT table_name::text AS nom
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND grantee IN ('anon', 'PUBLIC')
    AND privilege_type = 'SELECT'
)

-- ─── A. La protection par ligne (RLS) ───────────────────────────────────────
SELECT 'A01'::text AS ordre,
       'Tables du schema public sans RLS activee'::text AS controle,
       COALESCE(string_agg(nom, ', ' ORDER BY nom), 'aucune')::text AS valeur,
       'aucune'::text AS attendu,
       CASE WHEN count(*) = 0 THEN 'OK' ELSE '>>> A REGARDER' END::text AS verdict
FROM t WHERE NOT rls

UNION ALL
SELECT 'A02',
       'Tables a donnees personnelles sans RLS activee',
       COALESCE(string_agg(t.nom, ', ' ORDER BY t.nom), 'aucune'),
       'aucune',
       CASE WHEN count(*) = 0 THEN 'OK' ELSE '>>> GRAVE' END
FROM t JOIN perso p ON p.nom = t.nom WHERE NOT t.rls

UNION ALL
SELECT 'A03',
       'Tables avec RLS mais AUCUNE policy (tout est refuse, ou rien ne filtre)',
       COALESCE(string_agg(t.nom, ', ' ORDER BY t.nom), 'aucune'),
       'aucune',
       CASE WHEN count(*) = 0 THEN 'OK' ELSE '>>> A REGARDER' END
FROM t
WHERE t.rls AND NOT EXISTS (SELECT 1 FROM pg_policy pol WHERE pol.polrelid = t.oid)

-- ─── B. Ce que l'anonyme peut faire ─────────────────────────────────────────
UNION ALL
SELECT 'B01',
       'Tables a donnees personnelles LISIBLES par anon (droit accorde)',
       COALESCE(string_agg(l.nom, ', ' ORDER BY l.nom), 'aucune'),
       'la RLS doit alors filtrer chaque ligne',
       CASE WHEN count(*) = 0 THEN 'OK' ELSE 'A JUSTIFIER' END
FROM lecture_anon l JOIN perso p ON p.nom = l.nom

UNION ALL
SELECT 'B02',
       'Tables a donnees personnelles ECRIVABLES par anon',
       COALESCE(string_agg(e.nom, ', ' ORDER BY e.nom), 'aucune'),
       'seulement celles ou un invite depose (commandes, rdv, avis)',
       CASE WHEN count(*) = 0 THEN 'OK' ELSE 'A JUSTIFIER' END
FROM ecriture_anon e JOIN perso p ON p.nom = e.nom

UNION ALL
SELECT 'B03',
       'Toutes les tables ecrivables par anon',
       COALESCE(string_agg(nom, ', ' ORDER BY nom), 'aucune'),
       'liste courte et assumee',
       'A LIRE'
FROM ecriture_anon

-- ─── C. Les vues, qui contournent la RLS quand elles sont mal reglees ───────
--
-- ⚠️ UNE VUE SANS `security_invoker` S'EXECUTE AVEC LES DROITS DE SON
-- PROPRIETAIRE : elle IGNORE la RLS des tables qu'elle lit. C'est le defaut
-- trouve le 27/08 (quatre vues publiques ecrivables).
UNION ALL
SELECT 'C01',
       'Vues LISIBLES par anon SANS security_invoker',
       COALESCE(string_agg(v.nom, ', ' ORDER BY v.nom), 'aucune'),
       'aucune, sauf agregats publics sans donnee personnelle',
       CASE WHEN count(*) = 0 THEN 'OK' ELSE 'A JUSTIFIER' END
FROM v JOIN lecture_anon l ON l.nom = v.nom
WHERE v.options NOT LIKE '%security_invoker=on%' AND v.options NOT LIKE '%security_invoker=true%'

UNION ALL
SELECT 'C02',
       'Vues ECRIVABLES par anon (insert/update/delete accorde)',
       COALESCE(string_agg(e.nom, ', ' ORDER BY e.nom), 'aucune'),
       'aucune',
       CASE WHEN count(*) = 0 THEN 'OK' ELSE '>>> GRAVE' END
FROM v JOIN ecriture_anon e ON e.nom = v.nom

-- ─── D. Les fonctions qui s'executent en tant que leur proprietaire ─────────
--
-- ⚠️ UNE FONCTION `SECURITY DEFINER` SANS `search_path` FIXE peut etre detournee
-- en placant un objet de meme nom dans un schema que l'appelant controle.
UNION ALL
SELECT 'D01',
       'Fonctions SECURITY DEFINER sans search_path fixe',
       COALESCE(string_agg(p.proname::text, ', ' ORDER BY p.proname::text), 'aucune'),
       'aucune',
       CASE WHEN count(*) = 0 THEN 'OK' ELSE '>>> A REGARDER' END
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef
  AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%')

-- ─── E. Reperes de volume, pour lire les resultats ci-dessus ────────────────
UNION ALL
SELECT 'E01', 'Nombre de tables dans public', count(*)::text, 'pour memoire', 'INFO' FROM t
UNION ALL
SELECT 'E02', 'Nombre de vues dans public', count(*)::text, 'pour memoire', 'INFO' FROM v
UNION ALL
SELECT 'E03', 'Nombre de policies au total', count(*)::text, 'pour memoire', 'INFO'
FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'

ORDER BY 1;
