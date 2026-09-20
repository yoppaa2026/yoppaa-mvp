-- ═══════════════════════════════════════════════════════════════════════════
-- SIGNALER UN AVIS (20/09)
--
-- POURQUOI. Apple demande, pour toute application qui publie du contenu écrit
-- par ses utilisateurs, un moyen de SIGNALER ce contenu (guideline 1.2). Les
-- avis de Yoppaa sont publics sur les fiches, et les huit motifs de
-- `ModalSignalement` visent tous la FICHE d'un commerce : fermé, horaires,
-- adresse, téléphone, articles, site web, doublon, autre. Aucun ne parle du
-- contenu, et rien ne permet de signaler un avis.
--
-- CE QUE LA TABLE SAVAIT DÉJÀ FAIRE. `signalements` porte `commercant_id` et
-- `service_id` : elle distingue déjà DEUX cibles. Il en manque une troisième.
--
-- ⚠️ POURQUOI PAS DE REPLI DANS `description`. Ranger l'identifiant d'un avis
-- dans un champ de texte libre paraît économiser une migration. Mais personne
-- ne pourrait ensuite retrouver l'avis de façon fiable, ni le supprimer, ni
-- compter les signalements d'un même avis. Un identifiant se range dans une
-- colonne qui sait ce qu'elle référence.
--
-- ⚠️ `ON DELETE CASCADE` ET C'EST VOULU : un avis supprimé emporte ses
-- signalements. Ils ne visent plus rien, et les garder ferait remonter dans la
-- file de modération des lignes qui ne mènent nulle part.
--
-- ⚠️ AUCUNE CONTRAINTE `CHECK` N'EST POSÉE sur « exactement une cible ». Les
-- lignes déjà en base n'ont pas été relues, et une contrainte qui échoue à la
-- pose ferait échouer toute la migration pour une règle que la route applique
-- déjà. Le contrôle ci-dessous compte les lignes existantes pour qu'on sache
-- sur quoi on écrit.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. La colonne
ALTER TABLE public.signalements
  ADD COLUMN IF NOT EXISTS avis_id uuid;

-- 2. La clé étrangère, posée seulement si elle n'existe pas déjà
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'signalements_avis_id_fkey'
      AND conrelid = 'public.signalements'::regclass
  ) THEN
    ALTER TABLE public.signalements
      ADD CONSTRAINT signalements_avis_id_fkey
      FOREIGN KEY (avis_id) REFERENCES public.avis(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 3. L'index : la file de modération lit « les signalements de cet avis », et
--    l'écran de l'avis lit « cet avis a-t-il déjà été signalé par ce Yopper ».
CREATE INDEX IF NOT EXISTS idx_signalements_avis_id
  ON public.signalements (avis_id)
  WHERE avis_id IS NOT NULL;

-- 4. LES DROITS, RÉAFFIRMÉS. Une colonne neuve hérite des droits de sa table
--    tant qu'aucun droit par colonne n'a été posé, mais on ne le suppose pas :
--    la route écrit avec la clé de service, et c'est `service_role` qui doit
--    pouvoir lire et écrire cette colonne.
--    ⚠️ `anon` et `authenticated` n'obtiennent RIEN ici : la table s'écrit
--    uniquement par la route serveur, qui valide et limite le débit. Lui ouvrir
--    l'insertion directe rouvrirait la porte aux robots, exactement le défaut
--    que cette route a été écrite pour fermer.
GRANT SELECT, INSERT, UPDATE ON public.signalements TO service_role;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRÔLE — une ligne par vérification, la valeur ET l'attendu, tout en text.
-- ═══════════════════════════════════════════════════════════════════════════
SELECT 'C01 colonne avis_id présente'::text AS controle,
       COALESCE((SELECT data_type FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='signalements'
                   AND column_name='avis_id'), 'ABSENTE')::text AS valeur,
       'uuid'::text AS attendu
UNION ALL
SELECT 'C02 colonne avis_id nullable'::text,
       COALESCE((SELECT is_nullable FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='signalements'
                   AND column_name='avis_id'), 'ABSENTE')::text,
       'YES'::text
UNION ALL
SELECT 'C03 clé étrangère vers avis'::text,
       COALESCE((SELECT confrelid::regclass::text FROM pg_constraint
                 WHERE conname='signalements_avis_id_fkey'
                   AND conrelid='public.signalements'::regclass), 'ABSENTE')::text,
       'avis'::text
UNION ALL
SELECT 'C04 la suppression d un avis emporte ses signalements'::text,
       COALESCE((SELECT confdeltype::text FROM pg_constraint
                 WHERE conname='signalements_avis_id_fkey'
                   AND conrelid='public.signalements'::regclass), 'ABSENTE')::text,
       'c'::text
UNION ALL
SELECT 'C05 index sur avis_id'::text,
       COALESCE((SELECT indexname FROM pg_indexes
                 WHERE schemaname='public' AND tablename='signalements'
                   AND indexname='idx_signalements_avis_id'), 'ABSENT')::text,
       'idx_signalements_avis_id'::text
UNION ALL
SELECT 'C06 service_role peut insérer'::text,
       COALESCE((SELECT 'oui' FROM information_schema.role_table_grants
                 WHERE table_schema='public' AND table_name='signalements'
                   AND grantee='service_role' AND privilege_type='INSERT' LIMIT 1), 'NON')::text,
       'oui'::text
UNION ALL
SELECT 'C07 anon ne peut PAS insérer'::text,
       COALESCE((SELECT 'PEUT' FROM information_schema.role_table_grants
                 WHERE table_schema='public' AND table_name='signalements'
                   AND grantee='anon' AND privilege_type='INSERT' LIMIT 1), 'ne peut pas')::text,
       'ne peut pas'::text
UNION ALL
SELECT 'C08 RLS active sur signalements'::text,
       (SELECT CASE WHEN relrowsecurity THEN 'active' ELSE 'INACTIVE' END
        FROM pg_class WHERE oid='public.signalements'::regclass)::text,
       'active'::text
UNION ALL
SELECT ('C09 policy « ' || policyname || ' » · ' || cmd || ' · pour ' || array_to_string(roles, ','))::text,
       CASE WHEN permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END::text,
       'à lire'::text
FROM pg_policies WHERE schemaname='public' AND tablename='signalements'
UNION ALL
SELECT 'C10 signalements déjà en base'::text,
       (SELECT count(*)::text FROM public.signalements),
       'pour information'::text
UNION ALL
SELECT 'C11 signalements visant un avis'::text,
       (SELECT count(*)::text FROM public.signalements WHERE avis_id IS NOT NULL),
       '0'::text
UNION ALL
SELECT 'C12 avis en base, donc signalables'::text,
       (SELECT count(*)::text FROM public.avis),
       'pour information'::text
ORDER BY 1;
