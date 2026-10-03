-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_ABONNEMENT_EN_COURS.sql (03/10/2026)
--
-- UNE FORMULE DE PÉRIODE ACHETÉE EN COURS D'ANNÉE.
--
-- 🔴 LE DÉFAUT : une formule « septembre à juin » se vendait au compte PLEIN
-- après son début, et même après sa fin. Achetée en février, elle coûtait le
-- prix de l'année et accordait trente-six séances pour dix-neuf semaines.
--
-- ✅ DÉCIDÉ PAR ALEX LE 03/10 : le choix à la commerçante, formule par formule,
-- avec explication dans le tableau de bord :
--   • 'prorata' (le DÉFAUT) : prix au prorata des semaines restantes ;
--   • 'fixe' : même prix quelle que soit la date d'achat.
-- Dans les deux cas, les séances sont les semaines restantes, affichées avant
-- le paiement, et la formule n'est plus en vente après la fin de la période.
-- Le calcul vit dans `lib/abonnements.js` (`offreAuJour`).
--
-- ⚠️ À LANCER AVANT DE POUSSER LE CODE, sur la base d'ESSAI puis sur la PROD.
-- La fiche publique lit cette colonne par son nom : absente, toute la lecture
-- des formules échouerait, et le bloc Abonnements disparaîtrait de la fiche
-- sans un mot. Le formulaire de la commerçante, lui, ne pourrait plus
-- enregistrer une formule.
--
-- ⚠️ AUCUNE FORMULE NE CHANGE DE PRIX : avant le début d'une période, l'offre
-- reste entière au prix plein. Seule la vente APRÈS le début change, et elle
-- était fausse.
--
-- Idempotente. Une seule transaction.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.abonnement_formules
  ADD COLUMN IF NOT EXISTS prix_en_cours text NOT NULL DEFAULT 'prorata';

ALTER TABLE public.abonnement_formules
  DROP CONSTRAINT IF EXISTS abonnement_formules_prix_en_cours_check;
ALTER TABLE public.abonnement_formules
  ADD CONSTRAINT abonnement_formules_prix_en_cours_check
  CHECK (prix_en_cours IN ('prorata', 'fixe'));

COMMENT ON COLUMN public.abonnement_formules.prix_en_cours IS
  'Prix d''une période déjà commencée : prorata des semaines restantes (défaut) ou fixe. Calcul : lib/abonnements.js, offreAuJour.';

-- La vitrine (anon) lit la colonne, la commerçante (authenticated) l'écrit.
-- La table porte déjà ces droits ; on les redit pour la colonne, sans rien
-- ouvrir de plus.
GRANT SELECT (prix_en_cours) ON public.abonnement_formules TO anon, authenticated;
GRANT INSERT (prix_en_cours), UPDATE (prix_en_cours) ON public.abonnement_formules TO authenticated;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRÔLE : une ligne par point, valeur ET attendu
-- ═══════════════════════════════════════════════════════════════════════════
SELECT 'A. la colonne prix_en_cours existe, en texte'::text AS controle,
       COALESCE((SELECT data_type FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'abonnement_formules' AND column_name = 'prix_en_cours'), 'ABSENTE')::text AS valeur,
       'text'::text AS attendu
UNION ALL
SELECT 'B. elle n est jamais vide',
       COALESCE((SELECT is_nullable FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'abonnement_formules' AND column_name = 'prix_en_cours'), 'ABSENTE')::text,
       'NO'
UNION ALL
SELECT 'C. son defaut est le prorata',
       CASE WHEN (SELECT column_default FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'abonnement_formules' AND column_name = 'prix_en_cours') LIKE '''prorata''%'
            THEN 'oui' ELSE 'NON' END,
       'oui'
UNION ALL
SELECT 'D. seules prorata et fixe sont acceptees',
       (SELECT count(*)::text FROM pg_constraint WHERE conname = 'abonnement_formules_prix_en_cours_check'),
       '1'
UNION ALL
SELECT 'E. la vitrine (anon) lit la colonne',
       has_column_privilege('anon', 'public.abonnement_formules', 'prix_en_cours', 'SELECT')::text,
       'true'
UNION ALL
SELECT 'F. la commercante (authenticated) l ecrit',
       has_column_privilege('authenticated', 'public.abonnement_formules', 'prix_en_cours', 'UPDATE')::text,
       'true'
UNION ALL
SELECT 'G. toutes les formules existantes sont au prorata',
       (SELECT count(*) FILTER (WHERE prix_en_cours = 'prorata')::text FROM public.abonnement_formules),
       (SELECT count(*)::text FROM public.abonnement_formules);
