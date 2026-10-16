-- ═══════════════════════════════════════════════════════════════════════════
-- LA CLÔTURE DES CRÉNEAUX EN MINUTES (16/10)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ✅ ALEX, 16/10 (tableau, suite au rendez-vous d'Aux Délices des 7 Abbayes) :
-- la clôture se règle en minutes (Aucune, 10, 15, 20, 30, 45 min, 1 h…), plus
-- « Appliquer à tous les créneaux ». Aujourd'hui `cutoff_heures` ne connaît que
-- des heures entières.
--
-- ⚠️ ON AJOUTE `cutoff_minutes`, ON NE TOUCHE PAS À `cutoff_heures`. La colonne
-- en minutes est remplie depuis les heures (rien de perdu), le code ne lira
-- plus qu'elle. `cutoff_heures` reste en place, inerte, et partira dans un
-- nettoyage plus tard.
--
-- ⚠️ À LANCER JUSTE AVANT LE CODE : entre ce SQL et la mise en ligne, un
-- réglage changé dans l'ancien écran (en heures) ne serait pas recopié.
--
-- Bornes : 0 (jusqu'au début du créneau) à 10 080 min (une semaine).
-- Lancer TOUT le fichier en un seul coller. La dernière requête rend une ligne
-- par contrôle : valeur ET attendu.

ALTER TABLE public.creneaux ADD COLUMN IF NOT EXISTS cutoff_minutes integer;
UPDATE public.creneaux
   SET cutoff_minutes = GREATEST(0, ROUND(COALESCE(cutoff_heures, 0) * 60))::integer
 WHERE cutoff_minutes IS NULL;
ALTER TABLE public.creneaux ALTER COLUMN cutoff_minutes SET DEFAULT 0;
ALTER TABLE public.creneaux ALTER COLUMN cutoff_minutes SET NOT NULL;
ALTER TABLE public.creneaux DROP CONSTRAINT IF EXISTS creneaux_cutoff_minutes_borne;
ALTER TABLE public.creneaux ADD CONSTRAINT creneaux_cutoff_minutes_borne
  CHECK (cutoff_minutes BETWEEN 0 AND 10080);

ALTER TABLE public.livraison_creneaux ADD COLUMN IF NOT EXISTS cutoff_minutes integer;
UPDATE public.livraison_creneaux
   SET cutoff_minutes = GREATEST(0, ROUND(COALESCE(cutoff_heures, 0) * 60))::integer
 WHERE cutoff_minutes IS NULL;
ALTER TABLE public.livraison_creneaux ALTER COLUMN cutoff_minutes SET DEFAULT 120;
ALTER TABLE public.livraison_creneaux ALTER COLUMN cutoff_minutes SET NOT NULL;
ALTER TABLE public.livraison_creneaux DROP CONSTRAINT IF EXISTS livraison_creneaux_cutoff_minutes_borne;
ALTER TABLE public.livraison_creneaux ADD CONSTRAINT livraison_creneaux_cutoff_minutes_borne
  CHECK (cutoff_minutes BETWEEN 0 AND 10080);

-- Droits explicites (les mêmes qu'aujourd'hui, au niveau de la table).
GRANT SELECT ON public.creneaux TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.creneaux TO authenticated;
GRANT SELECT ON public.livraison_creneaux TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.livraison_creneaux TO authenticated;

-- ─── CONTRÔLES : une ligne par contrôle, valeur ET attendu ──────────────────
SELECT * FROM (
  SELECT 1 AS n, 'creneaux.cutoff_minutes : type, défaut, obligatoire' AS controle,
    (SELECT data_type || ' / ' || coalesce(column_default, 'aucun') || ' / ' || is_nullable
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'creneaux' AND column_name = 'cutoff_minutes') AS valeur,
    'integer / 0 / NO' AS attendu
  UNION ALL
  SELECT 2, 'livraison_creneaux.cutoff_minutes : type, défaut, obligatoire',
    (SELECT data_type || ' / ' || coalesce(column_default, 'aucun') || ' / ' || is_nullable
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'livraison_creneaux' AND column_name = 'cutoff_minutes'),
    'integer / 120 / NO'
  UNION ALL
  SELECT 3, 'créneaux dont les minutes ne valent pas les heures × 60',
    (SELECT count(*)::text FROM public.creneaux
      WHERE cutoff_minutes <> GREATEST(0, ROUND(COALESCE(cutoff_heures, 0) * 60))::integer),
    '0'
  UNION ALL
  SELECT 4, 'tournées dont les minutes ne valent pas les heures × 60',
    (SELECT count(*)::text FROM public.livraison_creneaux
      WHERE cutoff_minutes <> GREATEST(0, ROUND(COALESCE(cutoff_heures, 0) * 60))::integer),
    '0'
  UNION ALL
  SELECT 5, 'les deux bornes posées',
    (SELECT count(*)::text FROM pg_constraint
      WHERE conname IN ('creneaux_cutoff_minutes_borne', 'livraison_creneaux_cutoff_minutes_borne')),
    '2'
  UNION ALL
  SELECT 6, 'anon lit creneaux.cutoff_minutes (fiche publique)',
    has_column_privilege('anon', 'public.creneaux', 'cutoff_minutes', 'SELECT')::text,
    'true'
  UNION ALL
  SELECT 7, 'anon lit livraison_creneaux.cutoff_minutes',
    has_column_privilege('anon', 'public.livraison_creneaux', 'cutoff_minutes', 'SELECT')::text,
    'true'
  UNION ALL
  SELECT 8, 'authenticated modifie creneaux.cutoff_minutes (tableau de bord)',
    has_column_privilege('authenticated', 'public.creneaux', 'cutoff_minutes', 'UPDATE')::text,
    'true'
  UNION ALL
  SELECT 9, 'authenticated modifie livraison_creneaux.cutoff_minutes',
    has_column_privilege('authenticated', 'public.livraison_creneaux', 'cutoff_minutes', 'UPDATE')::text,
    'true'
  UNION ALL
  SELECT 10, 'pour info : type de l''ancienne colonne creneaux.cutoff_heures',
    (SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'creneaux' AND column_name = 'cutoff_heures'),
    'integer ou numeric'
  UNION ALL
  SELECT 11, 'pour info : créneaux avec une clôture réglée',
    (SELECT count(*)::text || ' sur ' || (SELECT count(*) FROM public.creneaux)::text
       FROM public.creneaux WHERE cutoff_minutes > 0),
    'information'
) t ORDER BY n;
