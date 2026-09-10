-- UNE TABLE N'A PAS DE PRIX (décision d'Alex, 10/09/2026)
-- « La seule qu'on va faire payer, c'est un montant forfaitaire par personne
-- à partir d'un certain nombre de personnes. »
--
-- ⚠️ À PASSER APRÈS LE DÉPLOIEMENT du code qui cesse d'écrire ces champs :
-- avant, l'ancien formulaire enverrait encore un prix et la base le refuserait.
-- Sûre à rejouer.
--
-- ✅ PASSÉE PAR ALEX LE 10/09/2026 AU SOIR, pendant le déploiement de
-- `9c29f70` : « tables qui gardent un prix ou un acompte » 0 (attendu 0),
-- « contrainte posée » 1 (attendu 1).

-- 1) Les tables déjà réglées perdent leur prix, leur acompte et leur TVA.
UPDATE public.rdv_prestations
   SET prix = NULL, acompte_pourcent = 0, tva_taux = NULL
 WHERE par_couverts IS TRUE
   AND (prix IS NOT NULL OR COALESCE(acompte_pourcent, 0) <> 0 OR tva_taux IS NOT NULL);

-- 2) La base refuse désormais un prix ou un acompte sur une table.
ALTER TABLE public.rdv_prestations DROP CONSTRAINT IF EXISTS rdv_prestations_table_sans_prix;
ALTER TABLE public.rdv_prestations
  ADD CONSTRAINT rdv_prestations_table_sans_prix
  CHECK (par_couverts IS NOT TRUE OR (prix IS NULL AND COALESCE(acompte_pourcent, 0) = 0));

-- Contrôle : une ligne par vérification, sa valeur et l'attendu.
SELECT 'tables qui gardent un prix ou un acompte' AS controle,
       count(*)::text AS valeur, '0' AS attendu
  FROM public.rdv_prestations
 WHERE par_couverts IS TRUE
   AND (prix IS NOT NULL OR COALESCE(acompte_pourcent, 0) <> 0)
UNION ALL
SELECT 'contrainte posée', count(*)::text, '1'
  FROM pg_constraint
 WHERE conname = 'rdv_prestations_table_sans_prix';
