-- DIAGNOSTIC : UNE CONNEXION, PLUSIEURS CASQUETTES (29/09/2026)
--
-- LECTURE SEULE. Aucune écriture, aucune donnée personnelle : la structure des
-- liens vers `auth.users`, et des NOMBRES.
--
-- La question : quand un compte de connexion est effacé (`deleteUser`), que
-- fait la base de ce qui lui est rattaché ? Trois réponses possibles par lien :
--   cascade      la ligne rattachée est EFFACÉE avec le compte ;
--   set null     la ligne reste, détachée de son compte ;
--   no action /  l'effacement du compte ÉCHOUE tant que la ligne existe.
--   restrict
-- Plusieurs liens vers les commerces ont été créés à la main dans Supabase,
-- hors des migrations : seul ce relevé dit la vérité.
--
-- Ensuite, combien de comptes portent déjà plusieurs casquettes.

SELECT 'A' || row_number() OVER (ORDER BY c.conrelid::regclass::text, a.attname) AS n,
       'lien ' || c.conrelid::regclass::text || '.' || a.attname || ' vers auth.users' AS controle,
       CASE c.confdeltype WHEN 'c' THEN 'cascade' WHEN 'n' THEN 'set null' WHEN 'r' THEN 'restrict'
                          WHEN 'a' THEN 'no action' WHEN 'd' THEN 'set default' END AS valeur,
       'pour information' AS attendu
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
 WHERE c.contype = 'f'
   AND c.confrelid = 'auth.users'::regclass
   AND c.connamespace = 'public'::regnamespace
UNION ALL
SELECT 'B1', 'comptes à la fois patron d un commerce ET Yopper',
       (SELECT count(DISTINCT co.auth_user_id)::text FROM public.commercants co
          JOIN public.clients cl ON cl.auth_user_id = co.auth_user_id
         WHERE co.auth_user_id IS NOT NULL),
       'pour information'
UNION ALL
SELECT 'B2', 'comptes patrons de PLUSIEURS commerces',
       (SELECT count(*)::text FROM (SELECT auth_user_id FROM public.commercants
          WHERE auth_user_id IS NOT NULL GROUP BY auth_user_id HAVING count(*) > 1) x),
       'pour information'
UNION ALL
SELECT 'B3', 'comptes membres d une équipe ET Yopper',
       (SELECT count(DISTINCT m.auth_user_id)::text FROM public.equipe_membres m
          JOIN public.clients cl ON cl.auth_user_id = m.auth_user_id
         WHERE m.statut = 'actif'),
       'pour information'
UNION ALL
SELECT 'C' || row_number() OVER (ORDER BY coalesce(type_utilisateur, 'NULL')),
       'préinscriptions de type ' || coalesce(type_utilisateur, 'NULL'),
       count(*)::text,
       'pour information'
  FROM public.pre_inscriptions
 GROUP BY type_utilisateur
ORDER BY 1;
