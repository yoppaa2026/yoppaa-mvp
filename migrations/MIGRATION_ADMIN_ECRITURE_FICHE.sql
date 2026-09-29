-- L'ADMIN MODIFIE L'INTÉGRALITÉ D'UNE FICHE EN MODE ADMIN (29/09/2026)
--
-- Alex, 29/09 : « je dois pouvoir modifier l'intégralité de la fiche d'un
-- commerçant depuis le DB admin ».
--
-- DIAGNOSTIC_ADMIN_TABLES_FICHE.sql a montré que dix tables de la fiche ne
-- laissaient l'admin QUE lire (par `commerce_lisible`, ou par la policy
-- « Admin Yoppaa lecture » posée le 29/09) : l'écriture n'y est ouverte qu'au
-- propriétaire (`auth_user_id = auth.uid()`). En mode admin, la session est
-- celle d'Alex : chaque enregistrement y était refusé.
--
-- CE QUE FAIT CETTE MIGRATION : la policy « Admin Yoppaa FULL », la même que
-- sur `articles`, `creneaux`, `commercant_photos` et les autres tables de la
-- fiche, sur ces dix tables. La lecture seule posée le matin est retirée, la
-- FULL la contient. Les policies existantes ne sont PAS réécrites : celle-ci
-- s'ajoute (PERMISSIVE, donc un OU). Les RESTRICTIVES `zz_commerce_ouvert` ne
-- visent que le propriétaire d'un compte non validé : l'admin n'y est pas
-- soumis.
--
-- ⚠️ LE STOCKAGE DES IMAGES N'EST PAS TOUCHÉ ICI. Ajouter une photo pour un
-- commerçant passe par le stockage Supabase, qui a ses propres policies. Le
-- contrôle les LIT (lignes C) : on décide ensuite, sur leur texte.
--
-- 🔴 ET CE POUVOIR APPELLE LA DOUBLE AUTHENTIFICATION. Être admin, c'est
-- aujourd'hui détenir une adresse et un mot de passe. Chantier suivant, voulu
-- par Alex le 29/09.
--
-- Idempotent. Une seule transaction.

BEGIN;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'article_photos', 'article_variantes', 'article_options_groupes', 'article_options_valeurs',
    'commercant_lieux', 'creneaux_blocages',
    'livraison_config', 'livraison_creneaux', 'rdv_fermetures', 'abonnement_formules'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Admin Yoppaa lecture" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Admin Yoppaa FULL" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Admin Yoppaa FULL" ON public.%I AS PERMISSIVE FOR ALL TO authenticated USING (public.is_yoppaa_admin()) WITH CHECK (public.is_yoppaa_admin())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END $$;

COMMIT;

-- ─── CONTRÔLE : une ligne par vérification, la valeur ET l'attendu ─────────
SELECT 'A' || lpad(row_number() OVER (ORDER BY t.nom)::text, 2, '0') AS n,
       'admin modifie ' || t.nom AS controle,
       coalesce((SELECT permissive || ' / ' || cmd || ' / '
                        || CASE WHEN qual LIKE '%is_yoppaa_admin()%' AND with_check LIKE '%is_yoppaa_admin()%' THEN 'oui' ELSE 'NON' END
                   FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = t.nom AND policyname = 'Admin Yoppaa FULL'), 'ABSENTE') AS valeur,
       'PERMISSIVE / ALL / oui' AS attendu
  FROM (VALUES ('abonnement_formules'), ('article_options_groupes'), ('article_options_valeurs'), ('article_photos'),
               ('article_variantes'), ('commercant_lieux'), ('creneaux_blocages'), ('livraison_config'),
               ('livraison_creneaux'), ('rdv_fermetures')) AS t(nom)
UNION ALL
SELECT 'B1', 'plus aucune policy « Admin Yoppaa lecture »',
       (SELECT count(*)::text FROM pg_policies
         WHERE schemaname = 'public' AND policyname = 'Admin Yoppaa lecture' AND permissive = 'PERMISSIVE'),
       '0'
UNION ALL
-- Le stockage des images : POUR LECTURE, on décide sur ce texte.
SELECT 'C' || lpad(row_number() OVER (ORDER BY policyname)::text, 2, '0'),
       'stockage · ' || policyname,
       permissive || ' / ' || cmd || ' / ' || array_to_string(roles, ',')
         || ' / USING: ' || coalesce(left(qual, 300), '-')
         || ' / CHECK: ' || coalesce(left(with_check, 300), '-'),
       'pour information'
  FROM pg_policies
 WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY 1;
