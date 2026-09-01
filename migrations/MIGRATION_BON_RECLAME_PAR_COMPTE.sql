-- ═══════════════════════════════════════════════════════════════════════════
-- UN BON PEUT SUIVRE UN COMPTE DONT L'ADRESSE DIFFÈRE  (décision d'Alex, 01/09)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 🔴 LE DÉFAUT : `mes-bons` ne retrouve un bon que par l'adresse PROUVÉE de la
-- session. Un bon offert sur une adresse est donc invisible à qui a son compte
-- sur une autre. Il peut le dépenser avec son code, il ne le voit jamais, et un
-- bon qu'on ne voit pas est un bon qu'on oublie.
--
-- 🔴 ON GARDE L'ADRESSE, PAS UN `client_id`. Une même adresse peut porter
-- PLUSIEURS lignes `clients` (commande en invité, puis compte), la route de
-- suppression de compte le dit et les traite toutes. Un identifiant client
-- désignerait donc l'une des lignes au hasard. L'adresse prouvée, elle, est
-- exactement ce que la session garantit, et la lecture reste une `.eq()`
-- simple : aucune chaîne construite à la main, comme les deux autres.
--
-- ⚠️ RATTACHER MONTRE, N'APPROPRIE PAS. Rien ici ne touche `beneficiaire_email`
-- ni `acheteur_email` : le porteur d'origine garde son bon et son code continue
-- de fonctionner. Sans ça, le premier qui lit un code par-dessus une épaule
-- verrouillerait le bon de quelqu'un d'autre.
--
-- ⚠️ AUCUN GRANT ICI, ET C'EST VOULU : cette migration ne crée aucun objet
-- grantable. Une colonne hérite des droits de sa table, un index ne se donne
-- pas. `bons_cadeaux` garde ses droits et sa RLS inchangés, et la lecture
-- continue de passer par la clé de service, jamais par le navigateur.

ALTER TABLE public.bons_cadeaux
  ADD COLUMN IF NOT EXISTS reclame_par_email text,
  ADD COLUMN IF NOT EXISTS reclame_le        timestamptz;

COMMENT ON COLUMN public.bons_cadeaux.reclame_par_email IS
  'Adresse PROUVÉE du compte qui a rattaché ce bon à son profil. Sert uniquement à l''AFFICHER : le porteur d''origine et son code restent valables.';

-- Index partiel : la très grande majorité des bons ne sera jamais réclamée.
CREATE INDEX IF NOT EXISTS idx_bons_cadeaux_reclame_par_email
  ON public.bons_cadeaux (reclame_par_email)
  WHERE reclame_par_email IS NOT NULL;

-- ─── CONTRÔLE : une ligne par vérification, valeur ET attendu, tout en text ──
SELECT 'colonne reclame_par_email' AS controle,
       COALESCE((SELECT data_type FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'bons_cadeaux'
                   AND column_name = 'reclame_par_email'), 'ABSENTE')::text AS valeur,
       'text'::text AS attendu
UNION ALL
SELECT 'colonne reclame_le',
       COALESCE((SELECT data_type FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'bons_cadeaux'
                   AND column_name = 'reclame_le'), 'ABSENTE')::text,
       'timestamp with time zone'::text
UNION ALL
SELECT 'index partiel sur reclame_par_email',
       COALESCE((SELECT indexname FROM pg_indexes
                 WHERE schemaname = 'public' AND tablename = 'bons_cadeaux'
                   AND indexname = 'idx_bons_cadeaux_reclame_par_email'), 'ABSENT')::text,
       'idx_bons_cadeaux_reclame_par_email'::text
UNION ALL
SELECT 'aucun bon reclame pour l instant',
       (SELECT count(*) FROM public.bons_cadeaux WHERE reclame_par_email IS NOT NULL)::text,
       '0'::text
UNION ALL
SELECT 'aucun beneficiaire_email touche',
       (SELECT count(*) FROM public.bons_cadeaux
        WHERE reclame_par_email IS NOT NULL AND reclame_par_email = beneficiaire_email)::text,
       '0'::text
UNION ALL
SELECT 'RLS toujours active sur bons_cadeaux',
       (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.bons_cadeaux'::regclass)::text,
       'true'::text
UNION ALL
SELECT 'aucun droit rendu a anon',
       (SELECT count(*) FROM information_schema.role_table_grants
        WHERE table_schema = 'public' AND table_name = 'bons_cadeaux' AND grantee = 'anon')::text,
       '0'::text;
