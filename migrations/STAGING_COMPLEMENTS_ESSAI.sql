-- SITE D'ESSAI : CE QUE LA COPIE DE LA STRUCTURE N'A PAS PRIS (02/10/2026)
--
-- 🔴 À COLLER DANS L'ÉDITEUR SQL DU PROJET yoppaa-test (nmkvizwxoebevjxkfhkx),
-- JAMAIS EN PRODUCTION. Le premier bloc s'arrête net si la base contient déjà
-- des commerces : en production, rien ne serait fait.
--
-- AVANT : créer les deux dossiers dans Storage, à la main (l'éditeur SQL
-- refuse d'écrire dans `storage.buckets`) :
--   logos          public, sans limite
--   kyb_documents  privé, 5 Mo, image/jpeg, image/png, application/pdf
--
-- La copie `pg_dump --schema=public` a pris les tables, vues, fonctions,
-- règles et déclencheurs du schéma public. Il manquait, relevé en production
-- le 02/10 (DIAGNOSTIC_STAGING_HORS_PUBLIC et _STOCKAGE_COMPLET) :
--   1. l'extension `btree_gist`, sans laquelle la garde contre la DOUBLE
--      RÉSERVATION d'un praticien (`rdv_no_overlap_praticien`) n'a pas pu
--      être créée ;
--   2. le temps réel : en production, SEULE `commandes` est suivie ;
--   3. les neuf règles d'accès aux photos et aux pièces d'identité, dont cinq
--      créées à la main (aucune migration ne les contient), recopiées mot
--      pour mot ;
--   4. le déclencheur sur `auth.users` qui recopie un changement d'email vers
--      la fiche du commerce.
-- Les deux dossiers `Logos` (majuscule) et `signalements-photos` de la
-- production sont des restes d'anciens modules : pas recopiés.
--
-- Pas de GRANT ici : aucune table n'est créée. L'extension va dans le schéma
-- `extensions`, déjà ouvert aux rôles de Supabase (en production elle est dans
-- `public` ; la contrainte trouve son opérateur quel que soit le schéma).
--
-- Une seule transaction : une erreur annule tout.

-- ─── 0. GARDE-FOU : UNE BASE VIDE, DONC PAS LA PRODUCTION ──────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.commercants) THEN
    RAISE EXCEPTION 'Cette base contient des commerces : ce script ne se lance que sur yoppaa-test, avant la copie des commerces. Rien n''a été fait.';
  END IF;
END $$;

-- ─── 1. LA GARDE CONTRE LA DOUBLE RÉSERVATION ──────────────────────────────
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

ALTER TABLE ONLY public.rdv_reservations
  DROP CONSTRAINT IF EXISTS rdv_no_overlap_praticien;
ALTER TABLE ONLY public.rdv_reservations
  ADD CONSTRAINT rdv_no_overlap_praticien EXCLUDE USING gist (praticien_id WITH =, tsrange((date_rdv + heure_debut), (date_rdv + heure_fin)) WITH &&) WHERE (((praticien_id IS NOT NULL) AND (capacite_creneau = 1) AND (statut = ANY (ARRAY['confirme'::text, 'honore'::text])) AND (deleted_at IS NULL)));

-- ─── 2. LE TEMPS RÉEL, COMME EN PRODUCTION ─────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                  WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'commandes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.commandes;
  END IF;
END $$;

-- ─── 3. LES RÈGLES DU STOCKAGE, MOT POUR MOT ───────────────────────────────
DROP POLICY IF EXISTS "Lecture logos public" ON storage.objects;
CREATE POLICY "Lecture logos public" ON storage.objects AS PERMISSIVE FOR SELECT TO public
  USING (bucket_id = 'logos'::text);

DROP POLICY IF EXISTS "Lecture publique bucket logos" ON storage.objects;
CREATE POLICY "Lecture publique bucket logos" ON storage.objects AS PERMISSIVE FOR SELECT TO anon, authenticated
  USING (bucket_id = 'logos'::text);

DROP POLICY IF EXISTS "Logos public read" ON storage.objects;
CREATE POLICY "Logos public read" ON storage.objects AS PERMISSIVE FOR SELECT TO public
  USING (bucket_id = 'logos'::text);

DROP POLICY IF EXISTS kyb_delete_own ON storage.objects;
CREATE POLICY kyb_delete_own ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated
  USING ((bucket_id = 'kyb_documents'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text));

DROP POLICY IF EXISTS kyb_insert_own ON storage.objects;
CREATE POLICY kyb_insert_own ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'kyb_documents'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text));

DROP POLICY IF EXISTS kyb_select_own_or_admin ON storage.objects;
CREATE POLICY kyb_select_own_or_admin ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
  USING ((bucket_id = 'kyb_documents'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR public.is_yoppaa_admin()));

DROP POLICY IF EXISTS logos_envoi_mon_dossier ON storage.objects;
CREATE POLICY logos_envoi_mon_dossier ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'logos'::text) AND (((storage.foldername(name))[1] IN (SELECT (c.id)::text AS id FROM public.commercants c WHERE (c.auth_user_id = auth.uid()))) OR public.is_yoppaa_admin()));

DROP POLICY IF EXISTS logos_remplacement_mon_dossier ON storage.objects;
CREATE POLICY logos_remplacement_mon_dossier ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((bucket_id = 'logos'::text) AND (((storage.foldername(name))[1] IN (SELECT (c.id)::text AS id FROM public.commercants c WHERE (c.auth_user_id = auth.uid()))) OR public.is_yoppaa_admin()))
  WITH CHECK ((bucket_id = 'logos'::text) AND (((storage.foldername(name))[1] IN (SELECT (c.id)::text AS id FROM public.commercants c WHERE (c.auth_user_id = auth.uid()))) OR public.is_yoppaa_admin()));

DROP POLICY IF EXISTS logos_suppression_mon_dossier ON storage.objects;
CREATE POLICY logos_suppression_mon_dossier ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated
  USING ((bucket_id = 'logos'::text) AND (((storage.foldername(name))[1] IN (SELECT (c.id)::text AS id FROM public.commercants c WHERE (c.auth_user_id = auth.uid()))) OR public.is_yoppaa_admin() OR ((COALESCE(array_length(storage.foldername(name), 1), 0) = 0) AND (EXISTS (SELECT 1 FROM public.commercants c WHERE ((c.auth_user_id = auth.uid()) AND (POSITION(((c.id)::text) IN (objects.name)) > 0)))))));

-- ─── 4. LE CHANGEMENT D'EMAIL D'UN COMPTE SUIT SUR LA FICHE ────────────────
DROP TRIGGER IF EXISTS trg_sync_email_commercant ON auth.users;
CREATE TRIGGER trg_sync_email_commercant AFTER UPDATE OF email ON auth.users
  FOR EACH ROW WHEN (((old.email)::text IS DISTINCT FROM (new.email)::text))
  EXECUTE FUNCTION public.sync_email_commercant();

-- ─── CONTRÔLE : une ligne par vérification, la valeur ET l'attendu ─────────
-- Les nombres S1 à S6 sont ceux de la structure lue en production le 02/10.
SELECT 'G0' AS n, 'base vide, donc yoppaa-test' AS controle,
       (SELECT count(*) FROM public.commercants)::text AS valeur, '0' AS attendu
UNION ALL
SELECT 'S1', 'tables du schema public',
       (SELECT count(*) FROM pg_tables WHERE schemaname = 'public')::text, '62'
UNION ALL
SELECT 'S2', 'vues du schema public',
       (SELECT count(*) FROM pg_views WHERE schemaname = 'public')::text, '6'
UNION ALL
SELECT 'S3', 'fonctions du schema public (hors extensions)',
       (SELECT count(*) FROM pg_proc p
         WHERE p.pronamespace = 'public'::regnamespace
           AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e'))::text, '44'
UNION ALL
-- Le type compte autant que le nombre : une règle restrictive devenue
-- permissive OUVRE au lieu de fermer (43 restrictives dans la copie du 02/10).
SELECT 'S4', 'regles RLS du schema public (total / permissives / restrictives)',
       (SELECT count(*) || ' / ' || count(*) FILTER (WHERE permissive = 'PERMISSIVE')
               || ' / ' || count(*) FILTER (WHERE permissive = 'RESTRICTIVE')
          FROM pg_policies WHERE schemaname = 'public'), '175 / 132 / 43'
UNION ALL
SELECT 'S5', 'declencheurs du schema public',
       (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
         WHERE c.relnamespace = 'public'::regnamespace AND NOT t.tgisinternal)::text, '22'
UNION ALL
SELECT 'S6', 'tables avec RLS active',
       (SELECT count(*) FROM pg_class
         WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND relrowsecurity)::text, '62'
UNION ALL
SELECT 'E1', 'extension btree_gist',
       (EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'btree_gist'))::text, 'true'
UNION ALL
SELECT 'E2', 'garde double reservation praticien',
       (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rdv_no_overlap_praticien'
                  AND conrelid = 'public.rdv_reservations'::regclass AND contype = 'x'))::text, 'true'
UNION ALL
SELECT 'R1', 'tables en temps reel',
       coalesce((SELECT string_agg(schemaname || '.' || tablename, ', ' ORDER BY tablename)
                   FROM pg_publication_tables WHERE pubname = 'supabase_realtime'), 'aucune'),
       'public.commandes'
UNION ALL
SELECT 'B1', 'dossier logos',
       coalesce((SELECT 'public=' || public::text || ' | limite=' || coalesce(file_size_limit::text, 'aucune')
                   FROM storage.buckets WHERE id = 'logos'), 'ABSENT'),
       'public=true | limite=aucune'
UNION ALL
SELECT 'B2', 'dossier kyb_documents',
       coalesce((SELECT 'public=' || public::text || ' | limite=' || coalesce(file_size_limit::text, 'aucune')
                        || ' | types=' || coalesce(array_to_string(allowed_mime_types, ','), 'tous')
                   FROM storage.buckets WHERE id = 'kyb_documents'), 'ABSENT'),
       'public=false | limite=5242880 | types=image/jpeg,image/png,application/pdf'
UNION ALL
SELECT 'P1', 'regles du stockage (nom et type)',
       coalesce((SELECT string_agg(policyname || ' ' || permissive, ', ' ORDER BY policyname COLLATE "C")
                   FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'), 'aucune'),
       'Lecture logos public PERMISSIVE, Lecture publique bucket logos PERMISSIVE, Logos public read PERMISSIVE, kyb_delete_own PERMISSIVE, kyb_insert_own PERMISSIVE, kyb_select_own_or_admin PERMISSIVE, logos_envoi_mon_dossier PERMISSIVE, logos_remplacement_mon_dossier PERMISSIVE, logos_suppression_mon_dossier PERMISSIVE'
UNION ALL
SELECT 'T1', 'changement d email suivi sur la fiche',
       (EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
                 WHERE c.oid = 'auth.users'::regclass AND t.tgname = 'trg_sync_email_commercant'))::text, 'true';
