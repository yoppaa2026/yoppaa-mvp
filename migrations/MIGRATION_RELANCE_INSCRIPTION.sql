-- MIGRATION — SE SOUVENIR QU ON A DEJA RELANCE UNE INSCRIPTION (16/09)
--
-- Demande d Alex : relancer automatiquement, apres 48 h, le commercant qui a
-- commence son inscription et ne l a jamais terminee.
--
-- 🔴 SANS CETTE COLONNE, LE CRON REEXPEDIE LE MEME EMAIL TOUS LES JOURS. Une
-- relance rend service, sept relances font fuir. La colonne est donc le
-- garde-fou, pas un confort : le code ne sera deploye qu apres elle, et il
-- n existe AUCUN repli qui tournerait sans.
--
-- ⚠️ ELLE NE VA PAS DANS `commercants_public`. Personne au dehors n a a savoir
-- qu un commercant a ete relance, et la vue publique ne s etend jamais « au cas
-- ou ».
--
-- A COLLER EN UNE FOIS. Le bloc DDL d abord, la requete de controle ensuite :
-- l editeur n affiche que le dernier resultat.

-- ═══ DDL ═══════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF to_regclass('public.commercants') IS NULL THEN
    RAISE EXCEPTION 'TABLE_ABSENTE : public.commercants est introuvable, rien n a ete change.';
  END IF;
END
$$;

ALTER TABLE public.commercants
  ADD COLUMN IF NOT EXISTS relance_inscription_envoyee_at timestamptz;

COMMENT ON COLUMN public.commercants.relance_inscription_envoyee_at IS
  'Date de la relance unique envoyee au commercant dont l inscription est restee en brouillon. NULL = jamais relance. Ecrite par /api/cron/relance-inscriptions.';

-- ⚠️ GRANT EXPLICITE. Une colonne ajoutee n herite pas des privileges poses au
-- niveau colonne, et le silence se lit comme une permission jusqu au jour ou il
-- se lit comme un refus.
GRANT SELECT (relance_inscription_envoyee_at) ON public.commercants TO service_role;
GRANT UPDATE (relance_inscription_envoyee_at) ON public.commercants TO service_role;
GRANT SELECT (relance_inscription_envoyee_at) ON public.commercants TO authenticated;

-- ⚠️ POSTGREST GARDE LE SCHEMA EN CACHE : sans ce reveil, la colonne existe en
-- base et reste introuvable depuis l application.
NOTIFY pgrst, 'reload schema';

-- ═══ CONTROLE — une ligne par verification, valeur ET attendu ══════════════
SELECT 'A. la colonne existe'::text AS controle,
       coalesce((SELECT data_type::text FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'commercants'
                    AND column_name = 'relance_inscription_envoyee_at'), 'ABSENTE')::text AS valeur,
       'timestamp with time zone'::text AS attendu
UNION ALL
SELECT 'B. elle accepte NULL (= jamais relance)'::text,
       coalesce((SELECT is_nullable::text FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'commercants'
                    AND column_name = 'relance_inscription_envoyee_at'), 'ABSENTE')::text,
       'YES'::text
UNION ALL
SELECT 'C. service_role peut la LIRE'::text,
       (SELECT count(*)::text FROM information_schema.column_privileges
         WHERE table_schema = 'public' AND table_name = 'commercants'
           AND column_name = 'relance_inscription_envoyee_at'
           AND grantee = 'service_role' AND privilege_type = 'SELECT'),
       '1'::text
UNION ALL
SELECT 'D. service_role peut l ECRIRE'::text,
       (SELECT count(*)::text FROM information_schema.column_privileges
         WHERE table_schema = 'public' AND table_name = 'commercants'
           AND column_name = 'relance_inscription_envoyee_at'
           AND grantee = 'service_role' AND privilege_type = 'UPDATE'),
       '1'::text
UNION ALL
-- ⚠️ ET CE QU ON NE VEUT PAS : la colonne au dehors.
SELECT 'E. ABSENTE de la vue publique'::text,
       (SELECT count(*)::text FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'commercants_public'
           AND column_name = 'relance_inscription_envoyee_at'),
       '0'::text
UNION ALL
SELECT 'F. le cache PostgREST a ete reveille'::text,
       'NOTIFY envoye'::text,
       'sans lui la colonne reste introuvable depuis l application'::text
UNION ALL
-- Ce que le premier passage du cron enverrait AUJOURD HUI, pour qu Alex le
-- sache avant que la tache tourne, et pas apres.
SELECT 'G. relances qui partiraient au premier passage'::text,
       (SELECT count(*)::text FROM commercants
         WHERE statut_publication = 'brouillon'
           AND relance_inscription_envoyee_at IS NULL
           AND email IS NOT NULL
           AND created_at <= now() - interval '48 hours'
           AND created_at >= now() - interval '30 days'),
       'le nombre d emails du premier passage : 1 attendu (La Table du Stock)'::text
UNION ALL
SELECT 'H. brouillons trop vieux, volontairement laisses tranquilles'::text,
       (SELECT count(*)::text FROM commercants
         WHERE statut_publication = 'brouillon'
           AND created_at < now() - interval '30 days'),
       'on ne reveille pas un dossier d il y a plus d un mois'::text;
