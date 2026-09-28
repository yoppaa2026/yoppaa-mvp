-- LE JOURNAL DE L'ADMIN ADMET « PUBLIE » (28/09/2026)
--
-- Le contrôle B1 de MIGRATION_FICHE_A_PUBLIER.sql a rendu :
--   CHECK ((action = ANY (ARRAY['valide'::text, 'rejete'::text])))
-- La route « Publier » (/api/admin/publier) y écrit `action = 'publie'` : chaque
-- publication aurait été refusée par le journal. La fiche partait quand même en
-- ligne (le journal ne bloque pas), mais SANS TRACE, en silence.
--
-- On remplace la contrainte, quel que soit son nom actuel, par la même liste
-- augmentée de « publie ». Rien d'autre ne change : les deux valeurs d'avant
-- restent admises.
--
-- Idempotent. Une seule transaction.

BEGIN;

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.admin_validations'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%action%'
  LOOP
    EXECUTE format('ALTER TABLE public.admin_validations DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.admin_validations
  ADD CONSTRAINT admin_validations_action_check
  CHECK (action IN ('valide', 'rejete', 'publie'));

COMMIT;

-- ─── CONTRÔLE : une ligne par vérification, la valeur ET l'attendu ─────────
SELECT 'A1' AS n, 'contraintes sur action' AS controle,
       (SELECT count(*)::text FROM pg_constraint
         WHERE conrelid = 'public.admin_validations'::regclass AND contype = 'c'
           AND pg_get_constraintdef(oid) LIKE '%action%') AS valeur,
       '1' AS attendu
UNION ALL
SELECT 'A2', 'la contrainte admet valide, rejete et publie',
       (SELECT CASE WHEN pg_get_constraintdef(oid) LIKE '%''valide''%'
                     AND pg_get_constraintdef(oid) LIKE '%''rejete''%'
                     AND pg_get_constraintdef(oid) LIKE '%''publie''%' THEN 'oui' ELSE 'NON' END
          FROM pg_constraint
         WHERE conrelid = 'public.admin_validations'::regclass
           AND conname = 'admin_validations_action_check'),
       'oui'
UNION ALL
SELECT 'A3', 'definition',
       (SELECT pg_get_constraintdef(oid) FROM pg_constraint
         WHERE conrelid = 'public.admin_validations'::regclass
           AND conname = 'admin_validations_action_check'),
       'pour memoire'
ORDER BY 1;
