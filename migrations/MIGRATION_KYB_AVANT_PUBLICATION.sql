-- ════════════════════════════════════════════════════════════════════════════
-- Pas d'espace ouvert ni de fiche en ligne sans identité vérifiée (KYB)
-- Décision d'Alex, 06/10 (tableau) : « KYB exigé pour ouvrir et publier »
-- ════════════════════════════════════════════════════════════════════════════
--
-- POURQUOI. Trois portes mettaient un commerce en ligne sans lire `kyb_statut` :
-- la route « Valider », la route « Publier », et la fenêtre « Modifier » de
-- l'admin, qui écrit `statut_publication` directement en base. Le code les
-- ferme toutes les trois (`refusKyb`, lib/statut-commercant.js) ; ce
-- déclencheur dit la même chose EN BASE, pour une requête SQL faite à la main
-- ou un écran oublié.
--
-- ⚠️ IL NE JUGE QUE LE PASSAGE, PAS L'ÉTAT. Un commerce DÉJÀ ouvert ou publié
-- n'est pas touché ; seul le fait de l'OUVRIR (statut → valide/actif) ou de le
-- PUBLIER (statut_publication → publie) exige `kyb_statut = 'valide'`. Le
-- relevé de la prod du 06/10 : un seul commerce dans ce cas (Chez Momo, démo),
-- régularisé par DONNEE_KYB_CHEZ_MOMO_DEMO.sql.
--
-- Idempotent. À passer sur l'ESSAI puis la PROD. Date : 2026-10-06
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.commercants_kyb_avant_ouverture()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF coalesce(NEW.kyb_statut, '') <> 'valide' THEN
    IF NEW.statut IN ('valide', 'actif')
       AND (TG_OP = 'INSERT' OR OLD.statut IS DISTINCT FROM NEW.statut) THEN
      RAISE EXCEPTION 'KYB non valide : impossible d''ouvrir l''espace de ce commerce'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.statut_publication = 'publie'
       AND (TG_OP = 'INSERT' OR OLD.statut_publication IS DISTINCT FROM 'publie') THEN
      RAISE EXCEPTION 'KYB non valide : impossible de publier la fiche de ce commerce'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.commercants_kyb_avant_ouverture() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_commercants_kyb_avant_ouverture ON public.commercants;
CREATE TRIGGER trg_commercants_kyb_avant_ouverture
  BEFORE INSERT OR UPDATE OF statut, statut_publication, kyb_statut ON public.commercants
  FOR EACH ROW EXECUTE FUNCTION public.commercants_kyb_avant_ouverture();

-- ─── Contrôle : une ligne par vérification, valeur ET attendu ───────────────
SELECT * FROM (
  SELECT 1 AS n, 'declencheur present et actif' AS controle,
         (SELECT count(*) FROM pg_trigger
           WHERE tgrelid = 'public.commercants'::regclass
             AND tgname = 'trg_commercants_kyb_avant_ouverture' AND tgenabled = 'O')::text AS valeur,
         '1' AS attendu
  UNION ALL SELECT 2, 'fonction a search_path fixe',
         (SELECT coalesce(array_to_string(proconfig, ','), '(aucun)') FROM pg_proc
           WHERE oid = 'public.commercants_kyb_avant_ouverture()'::regprocedure)::text,
         'search_path=public'
  UNION ALL SELECT 3, 'anon et authenticated ne peuvent pas l''executer',
         (has_function_privilege('anon', 'public.commercants_kyb_avant_ouverture()', 'EXECUTE')
          OR has_function_privilege('authenticated', 'public.commercants_kyb_avant_ouverture()', 'EXECUTE'))::text,
         'false'
  UNION ALL SELECT 4, 'espaces ouverts sans KYB valide (non touches, a lire)',
         (SELECT count(*) FROM public.commercants
           WHERE statut IN ('valide','actif') AND coalesce(kyb_statut,'') <> 'valide')::text,
         'a lire (prod : 0)'
) t ORDER BY n;
