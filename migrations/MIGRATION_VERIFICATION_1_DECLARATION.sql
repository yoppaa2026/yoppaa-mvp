-- ════════════════════════════════════════════════════════════════════════════
-- LA VÉRIFICATION DES COMMERÇANTS, MIGRATION 1 SUR 2 : LA DÉCLARATION
-- Décision d'Alex, 09/10 (tableau) : « Socle minimal », plus de carte d'identité
-- ════════════════════════════════════════════════════════════════════════════
--
-- POURQUOI. La carte d'identité ne prouvait rien (personne ne la comparait à
-- rien), elle faisait abandonner des inscriptions, et elle nous obligeait à
-- garder 43 pièces d'identité. Elle est remplacée par :
--   1. le numéro BCE contrôlé (modulo 97) et vérifié par l'admin sur le
--      registre public ;
--   2. une DÉCLARATION SUR L'HONNEUR, prouvée : qui, quel texte exact, quelle
--      entreprise, quand, depuis quelle adresse IP et quel navigateur.
--
-- CE QUE FAIT CETTE MIGRATION (rien n'est retiré ici, tout s'ajoute) :
--   A. trois colonnes sur `commercants` (dernière déclaration, carte supprimée),
--      écrites par le serveur seul ;
--   B. le journal `declarations_honneur`, fermé à tous sauf au serveur ;
--   C. l'IP et le navigateur dans `cgu_acceptations` ;
--   D. les deux journaux SURVIVENT à la suppression du compte (conservation :
--      vie du compte + 5 ans) ;
--   E. le journal de l'admin admet enfin `kyb_valide` et `kyb_rejete` ;
--   F. deux motifs de signalement : « usurpation » et « trompeur ».
--
-- ⚠️ E ET F LISENT LA BASE AVANT D'ÉCRIRE : si la contrainte en place n'est pas
-- celle attendue, la migration S'ARRÊTE (rien n'est appliqué) et le message dit
-- ce qui a été trouvé.
--
-- À passer sur l'ESSAI puis la PROD, AVANT le code (le tableau de bord lit
-- `declaration_version`). Idempotent. Date : 2026-10-09
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── A. LES COLONNES DE LA FICHE ───────────────────────────────────────────
ALTER TABLE public.commercants
  ADD COLUMN IF NOT EXISTS declaration_version text,
  ADD COLUMN IF NOT EXISTS declaration_acceptee_at timestamptz,
  ADD COLUMN IF NOT EXISTS carte_supprimee_at timestamptz;

COMMENT ON COLUMN public.commercants.declaration_version IS
  'Derniere version de la declaration sur l honneur acceptee (lib/declaration.js). Ecrite par le serveur seul.';
COMMENT ON COLUMN public.commercants.declaration_acceptee_at IS
  'Instant (horloge du serveur) de la derniere declaration sur l honneur.';
COMMENT ON COLUMN public.commercants.carte_supprimee_at IS
  'Ce commercant avait envoye une carte d identite, supprimee le 09/10/2026 : l ecran le lui dit une fois.';

GRANT SELECT (declaration_version, declaration_acceptee_at, carte_supprimee_at)
  ON public.commercants TO authenticated;

CREATE OR REPLACE FUNCTION public.commercants_declaration_par_serveur()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Clé de service (route serveur, éditeur SQL) : pas de JWT, donc pas d'auth.uid().
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.declaration_version IS NOT NULL OR NEW.declaration_acceptee_at IS NOT NULL
       OR NEW.carte_supprimee_at IS NOT NULL THEN
      RAISE EXCEPTION 'La declaration sur l''honneur est enregistree par le serveur'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.declaration_version IS DISTINCT FROM OLD.declaration_version
     OR NEW.declaration_acceptee_at IS DISTINCT FROM OLD.declaration_acceptee_at
     OR NEW.carte_supprimee_at IS DISTINCT FROM OLD.carte_supprimee_at THEN
    RAISE EXCEPTION 'La declaration sur l''honneur est enregistree par le serveur'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.commercants_declaration_par_serveur() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_commercants_declaration_par_serveur ON public.commercants;
CREATE TRIGGER trg_commercants_declaration_par_serveur
  BEFORE INSERT OR UPDATE OF declaration_version, declaration_acceptee_at, carte_supprimee_at
  ON public.commercants
  FOR EACH ROW EXECUTE FUNCTION public.commercants_declaration_par_serveur();

-- ─── B. LE JOURNAL DES DÉCLARATIONS ────────────────────────────────────────
-- ⚠️ TOUT EST RECOPIÉ, RIEN N'EST RELIÉ : le texte exact, le numéro, les noms,
-- le nom du commerce. La preuve doit tenir après une modification de la fiche,
-- et après sa suppression (la clé étrangère passe alors à NULL).
CREATE TABLE IF NOT EXISTS public.declarations_honneur (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  commercant_id       uuid REFERENCES public.commercants(id) ON DELETE SET NULL,
  auth_user_id        uuid NOT NULL,
  commerce_nom        text NOT NULL,
  version             text NOT NULL,
  texte               text NOT NULL,
  bce                 text NOT NULL,
  representant_prenom text NOT NULL,
  representant_nom    text NOT NULL,
  ip                  text,
  navigateur          text,
  acceptee_at         timestamptz NOT NULL DEFAULT now(),
  compte_supprime_at  timestamptz
);
CREATE INDEX IF NOT EXISTS idx_declarations_honneur_commercant
  ON public.declarations_honneur (commercant_id, acceptee_at DESC);

COMMENT ON TABLE public.declarations_honneur IS
  'Preuve des declarations sur l honneur des commercants. Conservation : vie du compte + 5 ans (compte_supprime_at).';

-- Fermé à tous sauf au serveur (clé de service) : aucune règle d'accès.
ALTER TABLE public.declarations_honneur ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.declarations_honneur FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.declarations_honneur TO service_role;

-- ─── C. L'IP ET LE NAVIGATEUR DES CGU ──────────────────────────────────────
ALTER TABLE public.cgu_acceptations
  ADD COLUMN IF NOT EXISTS ip text,
  ADD COLUMN IF NOT EXISTS navigateur text,
  ADD COLUMN IF NOT EXISTS compte_supprime_at timestamptz;

-- ─── D. LES PREUVES SURVIVENT AU COMPTE ────────────────────────────────────
-- 🔴 `cgu_acceptations` était en ON DELETE CASCADE : supprimer un commerçant
-- effaçait la preuve de ce qu'il avait accepté, au moment précis où un litige
-- peut naître. Elle passe en SET NULL, comme le journal des déclarations.
ALTER TABLE public.cgu_acceptations ALTER COLUMN commercant_id DROP NOT NULL;

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.cgu_acceptations'::regclass AND contype = 'f'
  LOOP
    EXECUTE format('ALTER TABLE public.cgu_acceptations DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.cgu_acceptations
  ADD CONSTRAINT cgu_acceptations_commercant_id_fkey
  FOREIGN KEY (commercant_id) REFERENCES public.commercants(id) ON DELETE SET NULL;

-- La date de suppression du compte, notée AVANT que la clé passe à NULL
-- (un déclencheur BEFORE DELETE passe avant les actions des clés étrangères).
-- C'est elle qui fera courir les 5 ans.
CREATE OR REPLACE FUNCTION public.preuves_noter_suppression_compte()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.declarations_honneur SET compte_supprime_at = now() WHERE commercant_id = OLD.id;
  UPDATE public.cgu_acceptations     SET compte_supprime_at = now() WHERE commercant_id = OLD.id;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.preuves_noter_suppression_compte() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_commercants_preuves_suppression ON public.commercants;
CREATE TRIGGER trg_commercants_preuves_suppression
  BEFORE DELETE ON public.commercants
  FOR EACH ROW EXECUTE FUNCTION public.preuves_noter_suppression_compte();

-- ─── E. LE JOURNAL DE L'ADMIN ADMET LES DÉCISIONS KYB ──────────────────────
-- 🔴 Les routes /api/admin/kyb/valider et /rejeter écrivent `kyb_valide` et
-- `kyb_rejete` : la contrainte les refusait, et l'erreur n'était pas lue.
-- Aucune décision KYB n'a jamais été journalisée.
DO $$
DECLARE
  def text;
  n int;
BEGIN
  SELECT count(*), max(pg_get_constraintdef(oid)) INTO n, def
    FROM pg_constraint
   WHERE conrelid = 'public.admin_validations'::regclass AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%action%';
  IF n <> 1 OR def NOT LIKE '%''valide''%' OR def NOT LIKE '%''rejete''%' OR def NOT LIKE '%''publie''%'
     OR (def LIKE '%kyb_%' AND def NOT LIKE '%''kyb_valide''%') THEN
    RAISE EXCEPTION 'admin_validations : contrainte inattendue (% contrainte(s)) : %', n, def;
  END IF;
END $$;

-- ⚠️ QUEL QUE SOIT SON NOM : si l'ancienne restait sous un autre nom, elle
-- continuerait de refuser `kyb_valide` à côté de la nouvelle.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.admin_validations'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%action%'
  LOOP
    EXECUTE format('ALTER TABLE public.admin_validations DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.admin_validations
  ADD CONSTRAINT admin_validations_action_check
  CHECK (action IN ('valide', 'rejete', 'publie', 'kyb_valide', 'kyb_rejete'));

-- ─── F. DEUX MOTIFS DE SIGNALEMENT ─────────────────────────────────────────
-- ⚠️ LA LISTE DOIT RESTER L'IMAGE EXACTE DE `MOTIFS_FICHE` + `MOTIFS_AVIS`
-- (lib/signaux.js). On vérifie d'abord que la base porte bien la liste du 20/09.
DO $$
DECLARE
  def text;
  m text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
   WHERE conrelid = 'public.signalements'::regclass AND conname = 'signalements_type_check';
  IF def IS NULL THEN
    RAISE EXCEPTION 'signalements_type_check absente';
  END IF;
  FOREACH m IN ARRAY ARRAY['ferme','horaires','adresse','telephone','articles','site_web','doublon',
                           'haineux','faux','personnel','illegal','hors_sujet','autre'] LOOP
    IF def NOT LIKE '%''' || m || '''%' THEN
      RAISE EXCEPTION 'signalements_type_check : motif % absent, definition trouvee : %', m, def;
    END IF;
  END LOOP;
END $$;

ALTER TABLE public.signalements DROP CONSTRAINT signalements_type_check;
ALTER TABLE public.signalements
  ADD CONSTRAINT signalements_type_check CHECK (
    type = ANY (ARRAY[
      -- les dix motifs d'une FICHE (commerce ou service public)
      'ferme'::text, 'horaires'::text, 'adresse'::text, 'telephone'::text,
      'articles'::text, 'site_web'::text, 'doublon'::text,
      'usurpation'::text, 'trompeur'::text,
      -- les cinq motifs d'un CONTENU, plus « autre » commun aux deux
      'haineux'::text, 'faux'::text, 'personnel'::text, 'illegal'::text,
      'hors_sujet'::text, 'autre'::text
    ])
  );

COMMIT;

-- ─── CONTRÔLE : une ligne par vérification, valeur ET attendu ──────────────
SELECT * FROM (
  SELECT 1 AS n, 'colonnes declaration et carte sur commercants'::text AS controle,
         (SELECT count(*) FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'commercants'
             AND column_name IN ('declaration_version', 'declaration_acceptee_at', 'carte_supprimee_at'))::text AS valeur,
         '3'::text AS attendu
  UNION ALL SELECT 2, 'authenticated lit declaration_version',
         has_column_privilege('authenticated', 'public.commercants', 'declaration_version', 'SELECT')::text, 'true'
  UNION ALL SELECT 3, 'declencheur declaration present et actif',
         (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.commercants'::regclass
             AND tgname = 'trg_commercants_declaration_par_serveur' AND tgenabled = 'O')::text, '1'
  UNION ALL SELECT 4, 'journal declarations : RLS active',
         (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.declarations_honneur'::regclass)::text, 'true'
  UNION ALL SELECT 5, 'journal declarations : regles d acces (nom:permissive)',
         coalesce((SELECT string_agg(policyname || ':' || permissive, ', ') FROM pg_policies
                    WHERE schemaname = 'public' AND tablename = 'declarations_honneur'), '(aucune)'), '(aucune)'
  UNION ALL SELECT 6, 'journal declarations : ferme a anon et authenticated',
         (has_table_privilege('anon', 'public.declarations_honneur', 'SELECT')
          OR has_table_privilege('authenticated', 'public.declarations_honneur', 'SELECT')
          OR has_table_privilege('authenticated', 'public.declarations_honneur', 'INSERT'))::text, 'false'
  UNION ALL SELECT 7, 'service_role ecrit le journal',
         has_table_privilege('service_role', 'public.declarations_honneur', 'INSERT')::text, 'true'
  UNION ALL SELECT 8, 'cgu_acceptations : ip, navigateur, compte_supprime_at',
         (SELECT count(*) FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'cgu_acceptations'
             AND column_name IN ('ip', 'navigateur', 'compte_supprime_at'))::text, '3'
  UNION ALL SELECT 9, 'les deux journaux survivent au compte (confdeltype)',
         (SELECT string_agg(conrelid::regclass::text || ':' || confdeltype::text, ', ' ORDER BY conrelid::regclass::text)
            FROM pg_constraint WHERE contype = 'f' AND confrelid = 'public.commercants'::regclass
             AND conrelid IN ('public.cgu_acceptations'::regclass, 'public.declarations_honneur'::regclass)),
         'cgu_acceptations:n, declarations_honneur:n'
  UNION ALL SELECT 10, 'declencheur de suppression present et actif',
         (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.commercants'::regclass
             AND tgname = 'trg_commercants_preuves_suppression' AND tgenabled = 'O')::text, '1'
  UNION ALL SELECT 14, 'journal admin : une seule contrainte sur action',
         (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.admin_validations'::regclass
             AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%action%')::text, '1'
  UNION ALL SELECT 11, 'journal admin : admet kyb_valide et kyb_rejete',
         (SELECT CASE WHEN pg_get_constraintdef(oid) LIKE '%''kyb_valide''%'
                       AND pg_get_constraintdef(oid) LIKE '%''kyb_rejete''%'
                       AND pg_get_constraintdef(oid) LIKE '%''publie''%' THEN 'oui' ELSE 'NON' END
            FROM pg_constraint WHERE conrelid = 'public.admin_validations'::regclass
             AND conname = 'admin_validations_action_check'), 'oui'
  UNION ALL SELECT 12, 'signalements : usurpation et trompeur admis',
         (SELECT CASE WHEN pg_get_constraintdef(oid) LIKE '%''usurpation''%'
                       AND pg_get_constraintdef(oid) LIKE '%''trompeur''%'
                       AND pg_get_constraintdef(oid) LIKE '%''hors_sujet''%' THEN 'oui' ELSE 'NON' END
            FROM pg_constraint WHERE conrelid = 'public.signalements'::regclass
             AND conname = 'signalements_type_check'), 'oui'
  UNION ALL SELECT 13, 'fonctions fermees a authenticated',
         (has_function_privilege('authenticated', 'public.preuves_noter_suppression_compte()', 'EXECUTE')
          OR has_function_privilege('authenticated', 'public.commercants_declaration_par_serveur()', 'EXECUTE'))::text, 'false'
) t ORDER BY n;
