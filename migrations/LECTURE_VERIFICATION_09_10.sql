-- LECTURE SEULE (09/10) : avant la refonte de la vérification des commerçants.
-- Aucune écriture, aucune donnée personnelle : des comptes, des dates, des
-- droits et le texte des règles. À lancer sur la PROD (puis l'essai).

SELECT '01 cartes : fichiers dans kyb_documents'::text AS controle,
       (SELECT count(*) FROM storage.objects WHERE bucket_id = 'kyb_documents')::text AS valeur
UNION ALL SELECT '02 cartes : plus ancien / plus recent',
       (SELECT COALESCE(min(created_at)::date || ' / ' || max(created_at)::date, 'aucun') FROM storage.objects WHERE bucket_id = 'kyb_documents')::text
UNION ALL SELECT '03 cartes : taille totale (Mo)',
       (SELECT COALESCE(round(sum((metadata->>'size')::bigint) / 1048576.0, 1)::text, '0') FROM storage.objects WHERE bucket_id = 'kyb_documents')::text
UNION ALL SELECT '04 cartes : comptes distincts',
       (SELECT count(DISTINCT split_part(name, '/', 1)) FROM storage.objects WHERE bucket_id = 'kyb_documents')::text
UNION ALL SELECT '05 cartes : dossiers dont le compte n existe plus',
       (SELECT count(DISTINCT split_part(o.name, '/', 1)) FROM storage.objects o
         WHERE o.bucket_id = 'kyb_documents'
           AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id::text = split_part(o.name, '/', 1)))::text
UNION ALL SELECT '06 commercants avec un chemin de carte',
       (SELECT count(*) FROM public.commercants WHERE kyb_id_recto_url IS NOT NULL OR kyb_id_verso_url IS NOT NULL)::text
UNION ALL SELECT '07 fichiers recto/verso hors de kyb_documents',
       (SELECT count(*) FROM storage.objects WHERE bucket_id <> 'kyb_documents' AND (name ILIKE '%recto%' OR name ILIKE '%verso%'))::text
UNION ALL SELECT '08 regles d acces sur kyb_documents',
       (SELECT COALESCE(string_agg(policyname || ' (' || cmd || ', ' || permissive || ')', ', ' ORDER BY policyname), 'aucune')
          FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname ILIKE 'kyb%')::text
UNION ALL SELECT '09 dossiers KYB par statut',
       (SELECT string_agg(COALESCE(kyb_statut, 'null') || ' = ' || n, ', ' ORDER BY kyb_statut)
          FROM (SELECT kyb_statut, count(*)::text AS n FROM public.commercants GROUP BY kyb_statut) s)::text
UNION ALL SELECT '10 authenticated peut ecrire (colonnes sensibles)',
       (SELECT COALESCE(string_agg(DISTINCT column_name, ', ' ORDER BY column_name), 'aucune')
          FROM information_schema.column_privileges
         WHERE table_schema = 'public' AND table_name = 'commercants' AND grantee = 'authenticated'
           AND privilege_type = 'UPDATE'
           AND column_name IN ('stripe_account_id', 'stripe_account_charges_enabled', 'stripe_account_details_submitted',
                               'stripe_account_payouts_enabled', 'stripe_onboarding_done_at', 'stripe_account_mode',
                               'bce', 'representant_legal_nom', 'representant_legal_prenom', 'kyb_id_recto_url', 'kyb_id_verso_url'))::text
UNION ALL SELECT '11 declencheurs sur commercants',
       (SELECT string_agg(tgname || ' -> ' || p.proname, ', ' ORDER BY tgname)
          FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
         WHERE t.tgrelid = 'public.commercants'::regclass AND NOT t.tgisinternal)::text
UNION ALL SELECT '12 contrainte des actions du journal admin',
       (SELECT COALESCE(string_agg(pg_get_constraintdef(oid), ' | '), 'aucune')
          FROM pg_constraint WHERE conrelid = 'public.admin_validations'::regclass AND contype = 'c')::text
UNION ALL SELECT '13 texte du verrou des colonnes reservees',
       (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'commercants_colonnes_reservees')::text;
