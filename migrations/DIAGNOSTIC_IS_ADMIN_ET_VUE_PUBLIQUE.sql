-- ═══════════════════════════════════════════════════════════════════════════
-- LES TROIS QUESTIONS QUE LE PREMIER DIAGNOSTIC A OUVERTES
-- 22/09/2026 — LECTURE SEULE, AUCUNE DONNÉE PERSONNELLE AFFICHÉE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- CE QU'ON SAIT DÉJÀ :
--   • `anon` a DELETE, INSERT, SELECT, UPDATE sur `commercants`, au niveau
--     TABLE, donc sur toute colonne présente et à venir ;
--   • la seule policy qui le vise est `admin_all_commercants [ALL, PERMISSIVE]`
--     avec la condition `is_admin()` ;
--   • `commercants_public` n'est PAS en `security_invoker` ;
--   • elle expose 60 colonnes, contre 56 au dernier relevé.
--
-- 🔴 TOUTE LA SÉCURITÉ DE CETTE TABLE TIENT DONC À `is_admin()`. Ce n'est pas
-- une figure de style : avec `ALL` et `PERMISSIVE`, une fonction qui rendrait
-- `true` à tort ouvre la lecture, l'écriture ET la suppression de tous les
-- commerçants, à un visiteur non connecté. On va donc la lire, pas la croire.
--
-- ⚠️ ET LES QUATRE COLONNES DE PLUS DANS LA VUE. Une vue publique qui grandit
-- sans qu'on l'ait noté, c'est le défaut le plus discret qui soit : rien ne
-- casse, personne ne le voit, et une colonne de trop est servie au monde
-- entier à son adresse exacte. On les liste.

-- ─── 1. LA FONCTION QUI TIENT TOUT ─────────────────────────────────────────

SELECT '1. is_admin() existe'::text AS controle,
       COALESCE((SELECT 'oui, dans ' || n.nspname::text
                   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE p.proname = 'is_admin' LIMIT 1), '🔴 ABSENTE')::text AS valeur,
       'oui'::text AS attendu

UNION ALL
-- ⚠️ SECURITY DEFINER veut dire qu'elle s'exécute avec les droits de son
-- créateur. C'est normal pour une fonction de contrôle d'accès, mais ça veut
-- dire qu'elle doit être IRRÉPROCHABLE : elle est le mur.
SELECT '2. est-elle SECURITY DEFINER'::text,
       COALESCE((SELECT CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END
                   FROM pg_proc p WHERE p.proname = 'is_admin' LIMIT 1), 'ABSENTE')::text,
       'DEFINER pour une fonction de contrôle d''accès'::text

UNION ALL
-- 🔴 LE `search_path` D'UNE FONCTION SECURITY DEFINER EST UNE FAILLE CLASSIQUE.
-- Sans `search_path` figé, un appelant peut faire pointer un nom de table vers
-- un objet à lui et détourner la fonction.
SELECT '3. 🔴 son search_path est-il figé'::text,
       COALESCE((SELECT COALESCE(array_to_string(p.proconfig, ', '), '🔴 NON FIGÉ')
                   FROM pg_proc p WHERE p.proname = 'is_admin' LIMIT 1), 'ABSENTE')::text,
       'search_path=... figé'::text

UNION ALL
-- 🔴 SA DÉFINITION, EN ENTIER. C'est la seule ligne qui répond vraiment.
SELECT '4. 🔴 ce que is_admin() fait exactement'::text,
       COALESCE((SELECT pg_get_functiondef(p.oid)::text
                   FROM pg_proc p WHERE p.proname = 'is_admin' LIMIT 1), 'ABSENTE')::text,
       'elle doit lire une identité PROUVÉE (auth.uid / auth.jwt), jamais un paramètre'::text

UNION ALL
-- ⚠️ QUI PEUT L'APPELER. Une fonction de contrôle d'accès exécutable par
-- `anon` n'est pas anormale : la policy l'évalue pour lui. On le note.
SELECT '5. qui peut exécuter is_admin()'::text,
       COALESCE((SELECT string_agg(DISTINCT grantee::text, ', ' ORDER BY grantee::text)
                   FROM information_schema.routine_privileges
                  WHERE routine_name = 'is_admin' AND privilege_type = 'EXECUTE'), 'personne')::text,
       'anon et authenticated, évaluée par la policy'::text

-- ─── 2. LES SEPT POLICIES, EN ENTIER ───────────────────────────────────────

UNION ALL
SELECT ('6. policy « ' || policyname || ' »')::text,
       (cmd || ' · ' || permissive || ' · rôles: ' || array_to_string(roles, '+')
        || ' · USING: ' || COALESCE(qual, '(aucune)')
        || ' · WITH CHECK: ' || COALESCE(with_check, '(aucune)'))::text,
       'une condition qui vérifie une identité'::text
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'commercants'

-- ─── 3. LA VUE PUBLIQUE ────────────────────────────────────────────────────

UNION ALL
-- 🔴 SANS `security_invoker`, LA VUE LIT AVEC LES DROITS DE SON PROPRIÉTAIRE
-- et contourne la RLS de `commercants`. Pour une vue de LECTURE publique qui
-- filtre elle-même, c'est un choix tenable ; encore faut-il que son filtre
-- existe, et qu'on ne puisse pas ÉCRIRE au travers.
SELECT '7. 🔴 anon peut-il ÉCRIRE dans la vue publique'::text,
       COALESCE((SELECT string_agg(DISTINCT privilege_type::text, ', ' ORDER BY privilege_type::text)
                   FROM information_schema.role_table_grants
                  WHERE table_schema = 'public' AND table_name = 'commercants_public'
                    AND grantee = 'anon' AND privilege_type <> 'SELECT'), 'non, SELECT seulement')::text,
       'non, SELECT seulement'::text

UNION ALL
SELECT '8. la vue filtre-t-elle sur la publication'::text,
       (SELECT CASE WHEN pg_get_viewdef('public.commercants_public'::regclass) ILIKE '%statut_publication%'
                    THEN 'oui, elle cite statut_publication'
                    ELSE '🔴 NON : elle sert tout ce qu''elle contient' END)::text,
       'oui'::text

UNION ALL
-- ⚠️ LES 60 COLONNES, NOMMÉES. Quatre de plus qu'au dernier relevé, et
-- personne ne sait lesquelles : c'est exactement comme ça qu'une colonne de
-- facturation ou de contact se retrouve servie publiquement.
SELECT '9. 🔴 les colonnes servies par la vue publique'::text,
       (SELECT string_agg(column_name::text, ', ' ORDER BY column_name::text)
          FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'commercants_public')::text,
       'aucune colonne de facturation, de paiement ni de contact privé'::text

UNION ALL
-- 🔴 ET LE CONTRÔLE QUI COMPTE VRAIMENT : est-ce que des colonnes sensibles
-- connues ont traversé ? On les nomme une par une plutôt que d'espérer les
-- reconnaître dans une liste de soixante.
SELECT '10. 🔴 colonnes sensibles présentes dans la vue'::text,
       COALESCE((SELECT string_agg(column_name::text, ', ' ORDER BY column_name::text)
                   FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'commercants_public'
                    AND column_name IN ('tva_numero', 'bce', 'email', 'telephone',
                                        'stripe_customer_id', 'stripe_account_id',
                                        'subscription_status', 'billing_exempt',
                                        'auth_user_id', 'iban')), 'aucune')::text,
       'aucune'::text;
