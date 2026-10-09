-- ════════════════════════════════════════════════════════════════════════════
-- LA VÉRIFICATION DES COMMERÇANTS, MIGRATION 2 SUR 2 : LES VERROUS, LA FIN DE
-- LA CARTE
-- ════════════════════════════════════════════════════════════════════════════
--
-- 🔴 CE QUE LE RELEVÉ DU 09/10 A MONTRÉ (ligne 10 de LECTURE_VERIFICATION) :
-- un commerçant connecté pouvait écrire lui-même, depuis son navigateur,
--   - ses indicateurs Stripe (`stripe_account_charges_enabled`, l'identifiant
--     du compte, la date d'ouverture...) : se déclarer « paiements actifs »
--     sans l'être, ou pointer vers le compte Stripe d'un autre ;
--   - son BCE et son représentant légal APRÈS la validation par Yoppaa :
--     faire valider une entreprise, puis en afficher une autre ;
--   - les traces de la décision de Yoppaa (`kyb_valide_at`, `kyb_valide_par`).
--
-- ⚠️ UN DÉCLENCHEUR À PART, ET C'EST VOLONTAIRE. `commercants_colonnes_reservees`
-- et `commercants_creation_sure` ne sont PAS modifiés : les réécrire à partir
-- d'un texte relu ailleurs risquerait d'effacer une garde ajoutée depuis. Celui-
-- ci s'ajoute, et ne fait que refuser.
--
-- ⚠️ ORDRE : cette migration passe APRÈS le code. Avant lui, les routes
-- /api/stripe/connect/* écrivaient les colonnes Stripe avec le jeton du
-- commerçant : elles seraient refusées. Depuis, elles passent par le serveur.
--
-- LA FIN DE LA CARTE :
--   - les trois règles d'accès au bucket `kyb_documents` sont supprimées (plus
--     personne, admin compris, n'ouvre une carte depuis un navigateur) ;
--   - les commerçants concernés sont marqués (`carte_supprimee_at`) : leur
--     tableau de bord le leur dira une fois ;
--   - les deux colonnes de chemins sont supprimées.
-- Les FICHIERS eux-mêmes ne se suppriment pas en SQL (Supabase l'interdit) :
-- c'est le script `npm run cartes:supprimer`, lancé par Alex, juste après.
--
-- Idempotent. Date : 2026-10-09
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 0. LES COLONNES QUE LE VERROU NOMME EXISTENT TOUTES ───────────────────
-- 🔴 Une fonction plpgsql se crée même si elle nomme une colonne absente, et
-- échoue ENSUITE à chaque écriture sur `commercants` : plus personne ne
-- pourrait rien enregistrer. On vérifie donc avant, et on s'arrête sinon.
DO $$
DECLARE
  manquantes text;
BEGIN
  SELECT string_agg(c, ', ') INTO manquantes
    FROM unnest(ARRAY['stripe_account_id', 'stripe_account_id_precedent', 'stripe_account_mode',
                      'stripe_account_charges_enabled', 'stripe_account_details_submitted',
                      'stripe_account_payouts_enabled', 'stripe_onboarding_done_at',
                      'kyb_valide_at', 'kyb_valide_par', 'kyb_motif_rejet', 'kyb_statut',
                      'bce', 'representant_legal_nom', 'representant_legal_prenom',
                      'carte_supprimee_at']) AS c
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema = 'public' AND table_name = 'commercants' AND column_name = c);
  IF manquantes IS NOT NULL THEN
    RAISE EXCEPTION 'Colonnes absentes de commercants : % (la migration 1 est-elle passee ?)', manquantes;
  END IF;
END $$;

-- ─── 1. LE VERROU ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.commercants_colonnes_serveur()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Clé de service : pas de JWT, donc pas d'auth.uid(). Le webhook Stripe, les
  -- routes /api/stripe/connect/* et la déclaration passent par là.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Une fiche créée depuis un navigateur naît sans compte de paiement et sans
    -- décision de Yoppaa, quoi qu'elle demande (même règle que creation_sure).
    NEW.stripe_account_id                := NULL;
    NEW.stripe_account_id_precedent      := NULL;
    NEW.stripe_account_mode              := NULL;
    NEW.stripe_account_charges_enabled   := false;
    NEW.stripe_account_details_submitted := false;
    NEW.stripe_account_payouts_enabled   := false;
    NEW.stripe_onboarding_done_at        := NULL;
    NEW.kyb_valide_at                    := NULL;
    NEW.kyb_valide_par                   := NULL;
    NEW.kyb_motif_rejet                  := NULL;
    RETURN NEW;
  END IF;

  -- L'admin garde la main sur l'identité (corriger une faute de frappe au
  -- téléphone), jamais sur le compte de paiement : celui-là, seul Stripe le dit.
  IF NEW.stripe_account_id                IS DISTINCT FROM OLD.stripe_account_id
     OR NEW.stripe_account_id_precedent   IS DISTINCT FROM OLD.stripe_account_id_precedent
     OR NEW.stripe_account_mode           IS DISTINCT FROM OLD.stripe_account_mode
     OR NEW.stripe_account_charges_enabled   IS DISTINCT FROM OLD.stripe_account_charges_enabled
     OR NEW.stripe_account_details_submitted IS DISTINCT FROM OLD.stripe_account_details_submitted
     OR NEW.stripe_account_payouts_enabled   IS DISTINCT FROM OLD.stripe_account_payouts_enabled
     OR NEW.stripe_onboarding_done_at     IS DISTINCT FROM OLD.stripe_onboarding_done_at THEN
    RAISE EXCEPTION 'Le compte de paiement est enregistre par le serveur'
      USING ERRCODE = '42501';
  END IF;

  IF public.is_yoppaa_admin() THEN
    RETURN NEW;
  END IF;

  -- La décision de Yoppaa ne s'écrit pas depuis le navigateur. Le motif d'un
  -- refus peut seulement être effacé : c'est ce que fait le renvoi du dossier.
  IF NEW.kyb_valide_at IS DISTINCT FROM OLD.kyb_valide_at
     OR NEW.kyb_valide_par IS DISTINCT FROM OLD.kyb_valide_par
     OR (NEW.kyb_motif_rejet IS DISTINCT FROM OLD.kyb_motif_rejet AND NEW.kyb_motif_rejet IS NOT NULL) THEN
    RAISE EXCEPTION 'La decision de verification est reservee a Yoppaa'
      USING ERRCODE = '42501';
  END IF;

  -- Une entreprise vérifiée ne change plus d'identité depuis le navigateur.
  -- Pour corriger : passer par Yoppaa, qui vérifie de nouveau.
  IF coalesce(OLD.kyb_statut, '') = 'valide'
     AND (NEW.bce IS DISTINCT FROM OLD.bce
          OR NEW.representant_legal_nom IS DISTINCT FROM OLD.representant_legal_nom
          OR NEW.representant_legal_prenom IS DISTINCT FROM OLD.representant_legal_prenom) THEN
    RAISE EXCEPTION 'Le numero d''entreprise et le representant legal d''une entreprise verifiee se changent en contactant Yoppaa'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.commercants_colonnes_serveur() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_commercants_colonnes_serveur ON public.commercants;
CREATE TRIGGER trg_commercants_colonnes_serveur
  BEFORE INSERT OR UPDATE ON public.commercants
  FOR EACH ROW EXECUTE FUNCTION public.commercants_colonnes_serveur();

-- ─── 2. PLUS AUCUN ACCÈS AUX CARTES ────────────────────────────────────────
DROP POLICY IF EXISTS kyb_insert_own ON storage.objects;
DROP POLICY IF EXISTS kyb_delete_own ON storage.objects;
DROP POLICY IF EXISTS kyb_select_own_or_admin ON storage.objects;

-- ─── 3. LES CONCERNÉS SONT MARQUÉS, PUIS LES CHEMINS DISPARAISSENT ─────────
-- ⚠️ Le marquage AVANT la suppression des colonnes, dans la même transaction.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'commercants'
                AND column_name = 'kyb_id_recto_url') THEN
    EXECUTE 'UPDATE public.commercants SET carte_supprimee_at = now()
              WHERE carte_supprimee_at IS NULL
                AND (kyb_id_recto_url IS NOT NULL OR kyb_id_verso_url IS NOT NULL)';
  END IF;
END $$;

ALTER TABLE public.commercants DROP COLUMN IF EXISTS kyb_id_recto_url;
ALTER TABLE public.commercants DROP COLUMN IF EXISTS kyb_id_verso_url;

COMMIT;

-- ─── CONTRÔLE : une ligne par vérification, valeur ET attendu ──────────────
SELECT * FROM (
  SELECT 1 AS n, 'declencheur colonnes serveur present et actif'::text AS controle,
         (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.commercants'::regclass
             AND tgname = 'trg_commercants_colonnes_serveur' AND tgenabled = 'O')::text AS valeur,
         '1'::text AS attendu
  UNION ALL SELECT 2, 'il garde aussi la creation (INSERT et UPDATE)',
         (SELECT CASE WHEN (tgtype & 4) <> 0 AND (tgtype & 16) <> 0 THEN 'oui' ELSE 'NON' END
            FROM pg_trigger WHERE tgrelid = 'public.commercants'::regclass
             AND tgname = 'trg_commercants_colonnes_serveur'), 'oui'
  UNION ALL SELECT 3, 'les verrous d avant sont toujours la',
         (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.commercants'::regclass AND tgenabled = 'O'
             AND tgname IN ('trg_commercants_colonnes_reservees', 'trg_commercants_creation_sure',
                            'trg_commercants_cgu_par_serveur', 'trg_commercants_kyb_avant_ouverture'))::text, '4'
  UNION ALL SELECT 4, 'fonction fermee a authenticated',
         has_function_privilege('authenticated', 'public.commercants_colonnes_serveur()', 'EXECUTE')::text, 'false'
  UNION ALL SELECT 5, 'regles d acces aux cartes restantes',
         coalesce((SELECT string_agg(policyname || ':' || permissive, ', ') FROM pg_policies
                    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname ILIKE 'kyb%'), '(aucune)'), '(aucune)'
  UNION ALL SELECT 6, 'colonnes de chemins de carte restantes',
         (SELECT count(*) FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'commercants'
             AND column_name IN ('kyb_id_recto_url', 'kyb_id_verso_url'))::text, '0'
  UNION ALL SELECT 7, 'commercants marques carte supprimee (prod : 15)',
         (SELECT count(*) FROM public.commercants WHERE carte_supprimee_at IS NOT NULL)::text, '15 en prod'
  UNION ALL SELECT 8, 'fichiers encore dans le bucket (le script les supprime ensuite)',
         (SELECT count(*) FROM storage.objects WHERE bucket_id = 'kyb_documents')::text, 'prod : 43 avant le script, 0 apres'
) t ORDER BY n;
