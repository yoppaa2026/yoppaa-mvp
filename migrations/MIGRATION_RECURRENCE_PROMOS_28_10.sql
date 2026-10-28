-- LA RÉCURRENCE DES PROMOS ET LEUR PLAGE HORAIRE (28/10, lot 2 du module promo).
--
-- Idée d'Alex (21/10) : « 1+1 chaque mercredi, telle promo le premier samedi
-- du mois… pour automatiser légèrement la comm des commerçants ». La promo se
-- crée UNE fois et revient toute seule entre `date_debut` et `date_fin` (fin
-- facultative pour une promo récurrente).
--
-- Colonnes (toutes NULLES par défaut : une promo existante ne change pas) :
--   • recurrence         : 'hebdo' | 'mensuel' | 'intervalle' (NULL = dates seules)
--   • jours_semaine      : hebdo, 0 = dimanche … 6 = samedi
--   • rang_mois          : mensuel, 1 à 4 ou -1 (le dernier)
--   • jour_semaine_mois  : mensuel, 0 … 6
--   • intervalle_jours   : tous les N jours depuis date_debut (1 à 365)
--   • plage_debut, plage_fin : la plage horaire, jugée à l'heure du RETRAIT ou
--     du RENDEZ-VOUS. Le formulaire écrivait jusqu'ici ces heures DANS
--     date_debut / date_fin, et elles n'étaient JAMAIS appliquées (un deal
--     « 11 h à 14 h » valait toute la journée).
--
-- ⚠️ PAS `heure_debut` / `heure_fin` : leur présence FAIT l'invendu du soir.
--
-- ⚠️ À LANCER AVANT LE CODE (commit « lot 2 ») : le code lit ces colonnes dans
-- des requêtes à colonnes nommées, et une colonne inconnue fait échouer la
-- requête. Ordre : TEST, puis PROD.

BEGIN;

ALTER TABLE public.yoppaa_deals
  ADD COLUMN IF NOT EXISTS recurrence text,
  ADD COLUMN IF NOT EXISTS jours_semaine smallint[],
  ADD COLUMN IF NOT EXISTS rang_mois smallint,
  ADD COLUMN IF NOT EXISTS jour_semaine_mois smallint,
  ADD COLUMN IF NOT EXISTS intervalle_jours integer,
  ADD COLUMN IF NOT EXISTS plage_debut time,
  ADD COLUMN IF NOT EXISTS plage_fin time;

ALTER TABLE public.yoppaa_deals DROP CONSTRAINT IF EXISTS yoppaa_deals_recurrence_check;
ALTER TABLE public.yoppaa_deals ADD CONSTRAINT yoppaa_deals_recurrence_check CHECK (
  recurrence IS NULL
  OR (recurrence = 'hebdo' AND cardinality(jours_semaine) > 0
      AND jours_semaine <@ ARRAY[0,1,2,3,4,5,6]::smallint[])
  OR (recurrence = 'mensuel' AND rang_mois IN (1, 2, 3, 4, -1) AND jour_semaine_mois BETWEEN 0 AND 6)
  OR (recurrence = 'intervalle' AND intervalle_jours BETWEEN 1 AND 365)
);
-- Une promo récurrente peut n'avoir PAS de fin (« chaque mercredi », jusqu'à ce
-- que le commerçant l'éteigne). Sans effet si la colonne l'accepte déjà.
ALTER TABLE public.yoppaa_deals ALTER COLUMN date_fin DROP NOT NULL;
-- Une promo récurrente a un début.
ALTER TABLE public.yoppaa_deals DROP CONSTRAINT IF EXISTS yoppaa_deals_recurrence_debut_check;
ALTER TABLE public.yoppaa_deals ADD CONSTRAINT yoppaa_deals_recurrence_debut_check CHECK (
  recurrence IS NULL OR date_debut IS NOT NULL
);
-- La plage : les deux heures ou aucune, et la fin après le début.
ALTER TABLE public.yoppaa_deals DROP CONSTRAINT IF EXISTS yoppaa_deals_plage_check;
ALTER TABLE public.yoppaa_deals ADD CONSTRAINT yoppaa_deals_plage_check CHECK (
  (plage_debut IS NULL AND plage_fin IS NULL)
  OR (plage_debut IS NOT NULL AND plage_fin IS NOT NULL AND plage_debut < plage_fin)
);

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ─── CONTRÔLES ──────────────────────────────────────────────────────────────
SELECT * FROM (
  SELECT 1 AS n, 'C1. les sept colonnes existent' AS controle,
    (SELECT count(*)::text FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'yoppaa_deals'
       AND column_name IN ('recurrence', 'jours_semaine', 'rang_mois', 'jour_semaine_mois', 'intervalle_jours', 'plage_debut', 'plage_fin')) AS valeur,
    '7' AS attendu
  UNION ALL
  -- 🔴 LE CONTRÔLE QUI COMPTE (même raison que MIGRATION_DEALS_PRESTATIONS) :
  -- si les droits étaient posés colonne par colonne, les colonnes neuves
  -- seraient invisibles en lecture, sans une seule erreur.
  SELECT 2, 'C2. anon et authenticated lisent recurrence',
    (SELECT count(DISTINCT grantee)::text FROM information_schema.column_privileges
      WHERE table_name = 'yoppaa_deals' AND column_name = 'recurrence' AND privilege_type = 'SELECT'
        AND grantee IN ('anon', 'authenticated')),
    '2'
  UNION ALL
  SELECT 3, 'C3. et plage_debut',
    (SELECT count(DISTINCT grantee)::text FROM information_schema.column_privileges
      WHERE table_name = 'yoppaa_deals' AND column_name = 'plage_debut' AND privilege_type = 'SELECT'
        AND grantee IN ('anon', 'authenticated')),
    '2'
  UNION ALL
  SELECT 4, 'C4. les trois contraintes',
    (SELECT count(*)::text FROM pg_constraint WHERE conrelid = 'public.yoppaa_deals'::regclass
       AND conname IN ('yoppaa_deals_recurrence_check', 'yoppaa_deals_recurrence_debut_check', 'yoppaa_deals_plage_check')),
    '3'
  UNION ALL
  SELECT 5, 'C5. aucune promo existante touchée',
    (SELECT count(*)::text FROM public.yoppaa_deals WHERE recurrence IS NOT NULL OR plage_debut IS NOT NULL),
    '0'
) t ORDER BY n;
