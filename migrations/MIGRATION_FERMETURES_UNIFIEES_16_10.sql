-- ═══════════════════════════════════════════════════════════════════════════
-- UNE SEULE LISTE « FERMETURES ET HORAIRES EXCEPTIONNELS » (16/10)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ✅ ALEX, 16/10 (tableau, suite à un rendez-vous commerçant) : une seule liste
-- pour tout le commerce (commandes, livraison, boutique, rendez-vous, tables),
-- avec « Fermé du … au … » ET « Horaires adaptés du … au … » (une ou deux
-- plages). Les absences d'un membre de l'équipe et les cours annulés restent
-- dans l'agenda (`rdv_fermetures`).
--
-- CE QUE FAIT CE SQL :
--   1. `fermetures_exceptionnelles` gagne deux plages facultatives. Sans plage :
--      fermé toute la journée (le sens d'aujourd'hui). Avec plage : ouvert ce
--      jour-là SEULEMENT sur ces heures. Une plage qui finit avant de commencer
--      passe minuit (18:00 → 01:00), comme les horaires d'ouverture.
--   2. Les fermetures « tout le commerce » de l'agenda (`rdv_fermetures` sans
--      praticien ni cours, non supprimées, pas encore terminées) y sont
--      RECOPIÉES. Les lignes d'origine restent en place : le code actuel les lit
--      encore, le nouveau ne lira plus que la liste unique.
--
-- ⚠️ SANS DANGER POUR LE CODE EN LIGNE : les colonnes ajoutées sont
-- facultatives, et une fermeture recopiée ferme désormais AUSSI les commandes
-- de ce jour-là, ce qui est précisément la demande.
--
-- Lancer TOUT le fichier en un seul coller. La dernière requête rend une ligne
-- par contrôle : valeur ET attendu.

ALTER TABLE public.fermetures_exceptionnelles ADD COLUMN IF NOT EXISTS plage1_debut time;
ALTER TABLE public.fermetures_exceptionnelles ADD COLUMN IF NOT EXISTS plage1_fin time;
ALTER TABLE public.fermetures_exceptionnelles ADD COLUMN IF NOT EXISTS plage2_debut time;
ALTER TABLE public.fermetures_exceptionnelles ADD COLUMN IF NOT EXISTS plage2_fin time;

-- Une plage est entière ou absente ; la seconde n'existe pas sans la première ;
-- la fin d'une période ne précède pas son début.
ALTER TABLE public.fermetures_exceptionnelles DROP CONSTRAINT IF EXISTS fermetures_exceptionnelles_plages_coherentes;
ALTER TABLE public.fermetures_exceptionnelles ADD CONSTRAINT fermetures_exceptionnelles_plages_coherentes CHECK (
  (plage1_debut IS NULL) = (plage1_fin IS NULL)
  AND (plage2_debut IS NULL) = (plage2_fin IS NULL)
  AND (plage2_debut IS NULL OR plage1_debut IS NOT NULL)
);
ALTER TABLE public.fermetures_exceptionnelles DROP CONSTRAINT IF EXISTS fermetures_exceptionnelles_dates_ordonnees;
-- ⚠️ NOT VALID : la règle vaut pour toute ligne écrite désormais, sans faire
-- échouer ce SQL si une ancienne ligne la viole (le contrôle 9 les compte).
ALTER TABLE public.fermetures_exceptionnelles ADD CONSTRAINT fermetures_exceptionnelles_dates_ordonnees CHECK (
  date_fin >= date_debut
) NOT VALID;

-- La recopie des fermetures « tout le commerce » de l'agenda. Idempotente : une
-- ligne identique (mêmes dates, fermée toute la journée) n'est pas recopiée deux fois.
INSERT INTO public.fermetures_exceptionnelles (commercant_id, date_debut, date_fin, motif)
SELECT r.commercant_id, r.date_debut, r.date_fin, r.motif
  FROM public.rdv_fermetures r
 WHERE r.praticien_id IS NULL
   AND r.prestation_id IS NULL
   AND r.deleted_at IS NULL
   AND r.date_fin >= CURRENT_DATE
   AND NOT EXISTS (
     SELECT 1 FROM public.fermetures_exceptionnelles f
      WHERE f.commercant_id = r.commercant_id
        AND f.date_debut = r.date_debut
        AND f.date_fin = r.date_fin
        AND f.plage1_debut IS NULL
   );

-- Droits explicites (inchangés : le propriétaire écrit, le public lit les
-- commerces lisibles, par les policies de MIGRATION_FERMETURES_EXCEPTIONNELLES_RLS).
GRANT SELECT ON public.fermetures_exceptionnelles TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.fermetures_exceptionnelles TO authenticated;

-- ─── CONTRÔLES : une ligne par contrôle, valeur ET attendu ──────────────────
SELECT * FROM (
  SELECT 1 AS n, 'les quatre colonnes de plage existent, en time' AS controle,
    (SELECT count(*)::text FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'fermetures_exceptionnelles'
        AND column_name IN ('plage1_debut', 'plage1_fin', 'plage2_debut', 'plage2_fin')
        AND data_type = 'time without time zone') AS valeur,
    '4' AS attendu
  UNION ALL
  SELECT 2, 'les deux contraintes posées',
    (SELECT count(*)::text FROM pg_constraint
      WHERE conname IN ('fermetures_exceptionnelles_plages_coherentes', 'fermetures_exceptionnelles_dates_ordonnees')),
    '2'
  UNION ALL
  SELECT 3, 'fermetures « tout le commerce » de l''agenda, en cours ou à venir, absentes de la liste unique',
    (SELECT count(*)::text FROM public.rdv_fermetures r
      WHERE r.praticien_id IS NULL AND r.prestation_id IS NULL AND r.deleted_at IS NULL
        AND r.date_fin >= CURRENT_DATE
        AND NOT EXISTS (SELECT 1 FROM public.fermetures_exceptionnelles f
                         WHERE f.commercant_id = r.commercant_id AND f.date_debut = r.date_debut
                           AND f.date_fin = r.date_fin AND f.plage1_debut IS NULL)),
    '0'
  UNION ALL
  SELECT 4, 'lignes existantes sans plage (fermé toute la journée, comme avant)',
    (SELECT count(*)::text || ' sur ' || (SELECT count(*) FROM public.fermetures_exceptionnelles)::text
       FROM public.fermetures_exceptionnelles WHERE plage1_debut IS NULL),
    'toutes'
  UNION ALL
  SELECT 5, 'anon lit les plages (fiche publique)',
    has_column_privilege('anon', 'public.fermetures_exceptionnelles', 'plage1_debut', 'SELECT')::text,
    'true'
  UNION ALL
  SELECT 6, 'authenticated écrit les plages (tableau de bord)',
    (has_column_privilege('authenticated', 'public.fermetures_exceptionnelles', 'plage1_debut', 'INSERT')
     AND has_column_privilege('authenticated', 'public.fermetures_exceptionnelles', 'plage2_fin', 'UPDATE'))::text,
    'true'
  UNION ALL
  SELECT 7, 'policies de la liste unique toujours en place (propriétaire, public, admin), avec leur type',
    (SELECT string_agg(policyname || ' = ' || permissive, ' · ' ORDER BY policyname) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'fermetures_exceptionnelles'
        AND policyname IN ('fermetures_exceptionnelles_proprietaire', 'fermetures_exceptionnelles_lecture_publique', 'Admin Yoppaa FULL')),
    'Admin Yoppaa FULL = PERMISSIVE · fermetures_exceptionnelles_lecture_publique = PERMISSIVE · fermetures_exceptionnelles_proprietaire = PERMISSIVE'
  UNION ALL
  SELECT 8, 'pour info : fermetures recopiées depuis l''agenda (en cours ou à venir)',
    (SELECT count(*)::text FROM public.rdv_fermetures r
      WHERE r.praticien_id IS NULL AND r.prestation_id IS NULL AND r.deleted_at IS NULL
        AND r.date_fin >= CURRENT_DATE),
    'information'
  UNION ALL
  SELECT 9, 'anciennes lignes dont la fin précède le début',
    (SELECT count(*)::text FROM public.fermetures_exceptionnelles WHERE date_fin < date_debut),
    '0'
) t ORDER BY n;
