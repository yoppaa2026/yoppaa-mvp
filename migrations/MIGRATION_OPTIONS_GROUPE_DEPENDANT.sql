-- ════════════════════════════════════════════════════════════════════════════
-- LE GROUPE D'OPTIONS DÉPENDANT (21/10, choix A d'Alex au tableau)
-- Captures de la 7 Abbayes : « avec crudités » coûte 0,50 € quel que soit le
-- nombre de crudités. Un groupe (« Choix de crudités ») ne s'affiche, et n'est
-- exigé, que si une option précise d'un autre groupe du MÊME article est
-- cochée (« Avec crudités »). Sert aussi aux formules (« Menu +3 € » →
-- « Boisson du menu »).
-- ════════════════════════════════════════════════════════════════════════════
--
-- Lu le 21/10 (LECTURE_OPTIONS_DEPENDANTS_21_10, essai ET prod, identiques) :
-- aucun déclencheur sur les 3 tables ; valeurs.groupe_id et groupes.article_id
-- en CASCADE ; aucun doublon de nom (groupes par article, options par groupe).
--
-- ⚠️ À LANCER APRÈS la mise en ligne du commit qui NOMME les embeds
-- groupes ↔ valeurs (`!article_options_valeurs_groupe_id_fkey`). Ce lien-ci est
-- un SECOND chemin entre les deux tables : sans le nom, l'API refuse TOUTE
-- lecture jointe des options (PGRST201, vécu le 12/10 avec les prix par
-- taille), donc la fiche, le paiement et le tableau de bord.
--
-- Décisions d'Alex :
--   - l'option parente supprimée EMPORTE le sous-groupe (CASCADE ; l'écran
--     prévient et fait confirmer avant) ;
--   - un seul niveau : un sous-groupe n'a pas lui-même de sous-groupe.
-- La base garantit en plus : le parent est une option du MÊME article et d'un
-- AUTRE groupe (la RLS ne l'empêche pas : le propriétaire possède les deux).
-- Contrôles DIFFÉRÉS à la fin de la transaction : une copie peut écrire le
-- groupe avant son option parente.
--
-- VIDE PAR DÉFAUT : aucun groupe existant ne change. Idempotent.
-- Date : 2026-10-21
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. LA COLONNE ET SON LIEN ─────────────────────────────────────────────
ALTER TABLE public.article_options_groupes
  ADD COLUMN IF NOT EXISTS depend_de_valeur_id uuid;

ALTER TABLE public.article_options_groupes
  DROP CONSTRAINT IF EXISTS article_options_groupes_depend_de_valeur_id_fkey;
ALTER TABLE public.article_options_groupes
  ADD CONSTRAINT article_options_groupes_depend_de_valeur_id_fkey
  FOREIGN KEY (depend_de_valeur_id) REFERENCES public.article_options_valeurs(id)
  ON DELETE CASCADE
  DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX IF NOT EXISTS article_options_groupes_depend_idx
  ON public.article_options_groupes (depend_de_valeur_id)
  WHERE depend_de_valeur_id IS NOT NULL;

COMMENT ON COLUMN public.article_options_groupes.depend_de_valeur_id IS
  'Option (meme article, autre groupe) qui fait apparaitre ce groupe. Vide = toujours affiche.';

-- ─── 2. LES RÈGLES QUE LA RLS NE TIENT PAS ─────────────────────────────────
-- Vérifie un groupe dépendant : parent du même article, d'un autre groupe,
-- un seul niveau (ni le groupe parent n'est dépendant, ni ce groupe n'est
-- lui-même parent).
CREATE OR REPLACE FUNCTION public.verifier_groupe_dependant(gid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g  record;
  pg record;
BEGIN
  SELECT id, article_id, depend_de_valeur_id INTO g
    FROM public.article_options_groupes WHERE id = gid;
  IF NOT FOUND THEN RETURN; END IF;

  IF g.depend_de_valeur_id IS NOT NULL THEN
    SELECT gp.id, gp.article_id, gp.depend_de_valeur_id INTO pg
      FROM public.article_options_valeurs v
      JOIN public.article_options_groupes gp ON gp.id = v.groupe_id
     WHERE v.id = g.depend_de_valeur_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Option parente introuvable.' USING ERRCODE = '23503';
    END IF;
    IF pg.id = g.id THEN
      RAISE EXCEPTION 'Un groupe ne peut pas dependre de sa propre option.' USING ERRCODE = '23514';
    END IF;
    IF pg.article_id IS DISTINCT FROM g.article_id THEN
      RAISE EXCEPTION 'L option parente doit etre du meme article.' USING ERRCODE = '23514';
    END IF;
    IF pg.depend_de_valeur_id IS NOT NULL THEN
      RAISE EXCEPTION 'Un seul niveau : le groupe parent depend deja d une autre option.' USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Ce groupe est-il parent d'un autre ? Alors il ne peut pas dépendre.
  IF g.depend_de_valeur_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.article_options_groupes c
      JOIN public.article_options_valeurs v ON v.id = c.depend_de_valeur_id
     WHERE v.groupe_id = g.id
  ) THEN
    RAISE EXCEPTION 'Un seul niveau : ce groupe fait deja apparaitre un autre groupe.' USING ERRCODE = '23514';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.verifier_groupe_dependant(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_groupe_dependant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.verifier_groupe_dependant(NEW.id);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_groupe_dependant() FROM PUBLIC, anon, authenticated;

-- Une option parente déplacée dans un autre groupe : ses sous-groupes sont
-- revérifiés.
CREATE OR REPLACE FUNCTION public.trg_valeur_parente_deplacee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c record;
BEGIN
  FOR c IN SELECT id FROM public.article_options_groupes WHERE depend_de_valeur_id = NEW.id LOOP
    PERFORM public.verifier_groupe_dependant(c.id);
  END LOOP;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_valeur_parente_deplacee() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS groupe_dependant_verifie ON public.article_options_groupes;
CREATE CONSTRAINT TRIGGER groupe_dependant_verifie
  AFTER INSERT OR UPDATE OF depend_de_valeur_id, article_id ON public.article_options_groupes
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.trg_groupe_dependant();

DROP TRIGGER IF EXISTS valeur_parente_deplacee ON public.article_options_valeurs;
CREATE CONSTRAINT TRIGGER valeur_parente_deplacee
  AFTER UPDATE OF groupe_id ON public.article_options_valeurs
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.trg_valeur_parente_deplacee();

-- ─── 3. LES DROITS, ÉCRITS EN CLAIR ────────────────────────────────────────
-- Inchangés dans l'esprit : anon lit, le connecté écrit (borné par les
-- policies existantes), le serveur aussi. Rien de plus.
REVOKE ALL ON public.article_options_groupes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.article_options_groupes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.article_options_groupes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.article_options_groupes TO service_role;

COMMIT;

-- Deux chemins entre groupes et valeurs désormais : l'API relit.
NOTIFY pgrst, 'reload schema';

-- ─── CONTRÔLE : une ligne par vérification, valeur ET attendu ──────────────
SELECT * FROM (
  SELECT 1 AS n, 'colonne depend_de_valeur_id'::text AS controle,
         (SELECT data_type || ':' || is_nullable FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'article_options_groupes' AND column_name = 'depend_de_valeur_id')::text AS valeur,
         'uuid:YES'::text AS attendu
  UNION ALL SELECT 2, 'le lien : cascade, differe',
         (SELECT confdeltype::text || ':' || condeferrable::text || ':' || condeferred::text FROM pg_constraint
           WHERE conname = 'article_options_groupes_depend_de_valeur_id_fkey')::text,
         'c:true:true'
  UNION ALL SELECT 3, 'index du lien',
         (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'article_options_groupes_depend_idx')::text,
         '1'
  UNION ALL SELECT 4, 'les deux declencheurs, differes',
         (SELECT string_agg(tgname || ':' || tgdeferrable::text || ':' || tginitdeferred::text, ', ' ORDER BY tgname) FROM pg_trigger
           WHERE tgname IN ('groupe_dependant_verifie', 'valeur_parente_deplacee') AND NOT tgisinternal)::text,
         'groupe_dependant_verifie:true:true, valeur_parente_deplacee:true:true'
  UNION ALL SELECT 5, 'groupes existants : aucun dependant (rien ne change)',
         (SELECT count(*) FROM public.article_options_groupes WHERE depend_de_valeur_id IS NOT NULL)::text,
         '0'
  UNION ALL SELECT 6, 'anon lit, n ecrit pas',
         (has_table_privilege('anon', 'public.article_options_groupes', 'SELECT')::text || '/'
          || has_table_privilege('anon', 'public.article_options_groupes', 'INSERT')::text || '/'
          || has_table_privilege('anon', 'public.article_options_groupes', 'UPDATE')::text),
         'true/false/false'
  UNION ALL SELECT 7, 'le connecte ecrit (borne par les policies), le serveur aussi',
         (has_table_privilege('authenticated', 'public.article_options_groupes', 'INSERT')
          AND has_table_privilege('authenticated', 'public.article_options_groupes', 'DELETE')
          AND has_table_privilege('service_role', 'public.article_options_groupes', 'UPDATE'))::text,
         'true'
  UNION ALL SELECT 8, 'aucun TRUNCATE / TRIGGER pour anon et authenticated',
         (has_table_privilege('anon', 'public.article_options_groupes', 'TRUNCATE')
          OR has_table_privilege('authenticated', 'public.article_options_groupes', 'TRUNCATE')
          OR has_table_privilege('authenticated', 'public.article_options_groupes', 'TRIGGER'))::text,
         'false'
  UNION ALL SELECT 9, 'les 3 fonctions : SECURITY DEFINER, search_path fige',
         (SELECT string_agg(proname || ':' || prosecdef::text || ':' || coalesce(array_to_string(proconfig, ' '), '-'), ', ' ORDER BY proname)
           FROM pg_proc WHERE pronamespace = 'public'::regnamespace
            AND proname IN ('verifier_groupe_dependant', 'trg_groupe_dependant', 'trg_valeur_parente_deplacee'))::text,
         'trg_groupe_dependant:true:search_path=public, trg_valeur_parente_deplacee:true:search_path=public, verifier_groupe_dependant:true:search_path=public'
  UNION ALL SELECT 10, 'fonctions fermees a anon et authenticated',
         (has_function_privilege('anon', 'public.verifier_groupe_dependant(uuid)', 'EXECUTE')
          OR has_function_privilege('authenticated', 'public.verifier_groupe_dependant(uuid)', 'EXECUTE'))::text,
         'false'
  UNION ALL SELECT 11, 'policies des groupes inchangees, et leur type',
         (SELECT string_agg(policyname || ':' || cmd || ':' || permissive, ', ' ORDER BY policyname COLLATE "C") FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'article_options_groupes')::text,
         'Admin Yoppaa FULL:ALL:PERMISSIVE, Commercant gere ses groupes options:ALL:PERMISSIVE, article_options_groupes_lecture_publique:SELECT:PERMISSIVE, zz_commerce_ouvert:ALL:RESTRICTIVE'
) t ORDER BY n;
