-- CONTROLE : LE JOURNAL DES « VOIR DASHBOARD » (admin_impersonations)
--
-- 🔴 POURQUOI (15/09 au soir). « Voir Dashboard » vit désormais dans l'onglet,
-- et le serveur le confirme à chaque chargement en LISANT puis, à l'expiration,
-- en FERMANT les lignes de `admin_impersonations`, AVEC LE JETON DE L'ADMIN et
-- jamais la clé de service. Or aucune migration du dépôt ne crée cette table :
-- ses droits sont inconnus du code.
--
--   • si la base refuse la LECTURE à l'admin : « Voir Dashboard » ne s'ouvre
--     plus du tout. Refus sûr, rien ne s'ouvre à tort, mais à corriger ;
--   • si elle refuse la FERMETURE : les lignes restent ouvertes en silence côté
--     base. L'accès, lui, est refusé quand même après deux heures.
--
-- ⚠️ LECTURE SEULE. Aucune ligne n'est lue en contenu : des nombres, des noms de
-- policies et des droits.

SELECT 'C01' AS ordre,
       'la RLS est active sur le journal' AS controle,
       (SELECT CASE WHEN c.relrowsecurity THEN 'oui' ELSE 'NON' END
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname = 'admin_impersonations')::text AS valeur,
       'oui'::text AS attendu
UNION ALL
-- 🔴 SANS LA COLONNE `permissive`, CE CONTRÔLE NE PROUVAIT RIEN (corrigé le 15/09
-- après le premier passage). Une policy de restriction posée en PERMISSIVE
-- ouvre au lieu de fermer, et `qual` ne le montre pas.
SELECT 'C02', 'les policies du journal (nom : type commande, rôles)',
       (SELECT COALESCE(string_agg(policyname || ' : ' || permissive || ' ' || cmd || ' ' || array_to_string(roles, ','), ' | ' ORDER BY policyname), 'AUCUNE')
          FROM pg_policies WHERE schemaname = 'public' AND tablename = 'admin_impersonations')::text,
       'a lire : de quoi LIRE, INSERER et FERMER pour l admin'::text
UNION ALL
SELECT 'C03', 'au moins une policy permet de LIRE (SELECT ou ALL)',
       (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'admin_impersonations'
          AND cmd IN ('SELECT', 'ALL'))::text,
       'au moins 1'::text
UNION ALL
SELECT 'C04', 'au moins une policy permet de FERMER une ligne (UPDATE ou ALL)',
       (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'admin_impersonations'
          AND cmd IN ('UPDATE', 'ALL'))::text,
       'au moins 1, sinon les lignes restent ouvertes'::text
UNION ALL
SELECT 'C05', 'les conditions des policies (USING / WITH CHECK)',
       (SELECT COALESCE(string_agg(policyname || ' : USING ' || COALESCE(qual, '-') || ' / CHECK ' || COALESCE(with_check, '-'), ' | ' ORDER BY policyname), 'AUCUNE')
          FROM pg_policies WHERE schemaname = 'public' AND tablename = 'admin_impersonations')::text,
       'a lire : chaque condition limitee a l admin'::text
UNION ALL
SELECT 'C06', 'les droits d anon sur le journal',
       (SELECT COALESCE(string_agg(privilege_type, ', ' ORDER BY privilege_type), 'AUCUN')
          FROM information_schema.role_table_grants
         WHERE table_schema = 'public' AND table_name = 'admin_impersonations' AND grantee = 'anon')::text,
       'AUCUN'::text
UNION ALL
SELECT 'C07', 'les colonnes lues par le code existent',
       (SELECT COALESCE(string_agg(column_name::text, ', ' ORDER BY column_name), 'AUCUNE')
          FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'admin_impersonations'
           AND column_name IN ('id', 'admin_email', 'commercant_id', 'started_at', 'ended_at'))::text,
       'admin_email, commercant_id, ended_at, id, started_at'::text
UNION ALL
SELECT 'D01', 'lignes encore ouvertes (un nombre, aucun contenu)',
       (SELECT count(*) FROM public.admin_impersonations WHERE ended_at IS NULL)::text,
       'a lire : 0 a 2, au-dela des lignes oubliees'::text
UNION ALL
SELECT 'D02', 'dont ouvertes depuis plus de deux heures',
       (SELECT count(*) FROM public.admin_impersonations
         WHERE ended_at IS NULL AND started_at < now() - interval '2 hours')::text,
       'a lire : elles se fermeront au prochain Voir Dashboard'::text
ORDER BY 1;
