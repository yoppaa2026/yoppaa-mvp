-- ════════════════════════════════════════════════════════════════════════════
-- Chez Momo (commerce de DÉMO d'Alex) : KYB marqué validé
-- Décision d'Alex, 06/10 (tableau) : « Démo : marquer son KYB validé par SQL »
-- ════════════════════════════════════════════════════════════════════════════
--
-- POURQUOI. « Valider » et « Publier » vont exiger un KYB validé (décision du
-- 06/10). Le relevé de la prod n'a trouvé qu'UN commerce ouvert et publié
-- sans KYB : Chez Momo, `non_demarre`, le commerce de test d'Alex. On le marque
-- validé ici plutôt que d'écrire une exception dans le code.
--
-- ⚠️ PAS par la route admin `/api/admin/kyb/valider` : elle crée un abonnement
-- Stripe pour un forfait payant, ce qu'on ne veut pas pour une démo.
-- `kyb_valide_par` reste vide (personne n'a vu de pièce d'identité).
--
-- Ne touche qu'à UNE ligne, et seulement si elle est encore `non_demarre`.
-- À passer sur la PROD uniquement. Date : 2026-10-06
-- ════════════════════════════════════════════════════════════════════════════

UPDATE public.commercants
   SET kyb_statut = 'valide', kyb_valide_at = now()
 WHERE nom = 'Chez Momo' AND kyb_statut = 'non_demarre';

-- ─── Contrôle : une ligne par vérification, valeur ET attendu ───────────────
SELECT * FROM (
  SELECT 1 AS n, 'Chez Momo : kyb_statut' AS controle,
         (SELECT string_agg(kyb_statut, ', ') FROM public.commercants WHERE nom = 'Chez Momo')::text AS valeur,
         'valide' AS attendu
  UNION ALL SELECT 2, 'espaces ouverts sans KYB valide (reste)',
         (SELECT count(*) FROM public.commercants
           WHERE statut IN ('valide','actif') AND coalesce(kyb_statut,'') <> 'valide')::text,
         '0'
) t ORDER BY n;
