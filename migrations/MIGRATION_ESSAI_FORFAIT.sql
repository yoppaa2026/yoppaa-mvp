-- ════════════════════════════════════════════════════════════════════════════
-- L'ESSAI D'UN FORFAIT SUPÉRIEUR — proposé, jamais imposé
--
-- ⚠️ DÉCISION D'ALEX, 25/08 : « un commerçant qui choisit Exister doit avoir
-- les fonctions EXISTER, et un message qui dit qu'il peut tout tester grâce à
-- la période d'essai jusqu'au 9/01. Sinon on ne respecte pas le choix du
-- commerçant et il se sent pressé par Yoppaa. On lui dit et il choisit s'il
-- veut plus ou pas. »
--
-- D'où UNE colonne, et une seule : le forfait que le commerçant a demandé à
-- essayer. Tant qu'elle est NULLE, il a exactement ce qu'il a choisi.
--
-- ─── POURQUOI UN FORFAIT ET PAS UNE LISTE DE FONCTIONS ──────────────────────
-- Le commerçant ne raisonne pas en fonctions, il raisonne en formules : c'est
-- ce que la landing lui vend et ce que la facture lui présentera. « J'essaie
-- Vendre » se comprend sans explication ; « j'essaie bons_cadeaux et
-- export_comptable » demanderait un mode d'emploi.
--
-- ─── SÉCURITÉ : POURQUOI CETTE COLONNE N'EST PAS VERROUILLÉE ────────────────
-- LE CONTRÔLE EN QUATRE QUESTIONS :
--   1. QUI peut l'écrire ? Le commerçant, sur sa propre ligne.
--   2. QUE peut-il écrire ? Un des deux forfaits payants, le CHECK s'en charge.
--   3. QU'OBTIENT-IL en l'écrivant ? Exactement ce que le bouton de son
--      tableau de bord lui donne : l'essai auquel il a droit.
--   4. ET APRÈS LA PÉRIODE ? Rien. `planEnEssai()` exige que
--      `degustationEnCours(created_at)` soit vraie : passé le 9 janvier, cette
--      colonne ne débloque plus rien, même remplie à la main.
-- La borne n'est pas cette colonne, c'est la DATE D'INSCRIPTION, qui elle
-- n'est pas modifiable. Rien à verrouiller ici.
--
-- ⚠️ À NE PAS CONFONDRE avec `commercants.plan`, qui décide de ce qui est
-- FACTURÉ et se verrouille, lui, dans MIGRATION_VERROU_FORFAIT.sql.
--
-- Idempotent. À passer dans le SQL Editor de Supabase.
-- Date : 2026-08-25
-- ════════════════════════════════════════════════════════════════════════════

-- ─── LA COLONNE ─────────────────────────────────────────────────────────────
ALTER TABLE commercants
  ADD COLUMN IF NOT EXISTS essai_plan text,
  ADD COLUMN IF NOT EXISTS essai_demande_le timestamptz;

COMMENT ON COLUMN commercants.essai_plan IS
  'Forfait supérieur que le commerçant a DEMANDÉ à essayer jusqu''à la fin de sa période d''essai. NULL = il garde exactement le forfait qu''il a choisi. N''a plus aucun effet passé finEssai(created_at).';
COMMENT ON COLUMN commercants.essai_demande_le IS
  'Quand il a demandé l''essai. Sert aux relances avant la fin de période.';

-- ⚠️ `exister` n'est pas une valeur acceptable : essayer le forfait gratuit
-- n'a pas de sens, et l'autoriser laisserait écrire un essai qui RÉTROGRADE.
-- Le code s'en protège déjà (rangPlan), la base n'a pas à en dépendre.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'commercants_essai_plan_check'
  ) THEN
    ALTER TABLE commercants
      ADD CONSTRAINT commercants_essai_plan_check
      CHECK (essai_plan IS NULL OR essai_plan IN ('communiquer', 'vendre'));
  END IF;
END $$;

-- Aucun GRANT à poser : la table est déjà accessible, on ajoute des colonnes
-- à un objet existant. Les policies de `commercants` s'appliquent telles
-- quelles, y compris le verrou RESTRICTIVE zz_commerce_ouvert.


-- ─── CONTRÔLE ───────────────────────────────────────────────────────────────
-- 1) Les colonnes existent et le CHECK est en place.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'commercants' AND column_name IN ('essai_plan', 'essai_demande_le')
ORDER BY column_name;

SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'commercants_essai_plan_check';

-- 2) Personne n'est en essai au sortir de la migration : c'est le point de
--    départ attendu, l'essai se DEMANDE.
SELECT count(*) FILTER (WHERE essai_plan IS NOT NULL) AS deja_en_essai,
       count(*)                                        AS total
FROM commercants;

-- 3) Le refus d'une valeur hors liste, à vérifier à la main :
--      UPDATE commercants SET essai_plan = 'premium' WHERE id = '<un id>';
--    Attendu : violation de la contrainte commercants_essai_plan_check.


-- ─── RETOUR ARRIÈRE ─────────────────────────────────────────────────────────
-- ALTER TABLE commercants DROP CONSTRAINT IF EXISTS commercants_essai_plan_check;
-- ALTER TABLE commercants DROP COLUMN IF EXISTS essai_plan;
-- ALTER TABLE commercants DROP COLUMN IF EXISTS essai_demande_le;
