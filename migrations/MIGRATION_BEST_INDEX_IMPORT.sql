-- ════════════════════════════════════════════════════════════════════════════
-- BeSt : un index sur la date d'import, pour que le nettoyage tienne
-- Chantier zone, 05/10 (trouvé au premier import en PROD)
-- ════════════════════════════════════════════════════════════════════════════
--
-- 🔴 CE QUI S'EST PASSÉ. Après avoir écrit 1,6 million de maisons, le script
-- efface les lignes d'un import PRÉCÉDENT (`import_le` plus ancien). Sans
-- index sur `import_le`, la base relisait toute la table pour le savoir, et la
-- requête a dépassé le délai maximal (« statement timeout »). Rien n'était à
-- effacer (premier import), mais la prochaine mise à jour du référentiel
-- bloquerait au même endroit. Avec l'index, la recherche ne lit que les
-- lignes concernées.
--
-- Aucun objet nouveau exposé : deux index sur des tables déjà fermées aux
-- navigateurs. Idempotent. À passer sur l'ESSAI et la PROD.
-- Date : 2026-10-05
-- ════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_best_adresses_import_le ON public.best_adresses (import_le);
CREATE INDEX IF NOT EXISTS idx_best_rues_import_le     ON public.best_rues (import_le);

-- ─── Contrôle : une ligne par vérification, valeur ET attendu ───────────────
SELECT * FROM (
  SELECT 1 AS n, 'index sur la date d import' AS controle,
         (SELECT string_agg(indexname, ', ' ORDER BY indexname) FROM pg_indexes
           WHERE schemaname = 'public'
             AND indexname IN ('idx_best_adresses_import_le', 'idx_best_rues_import_le'))::text AS valeur,
         'idx_best_adresses_import_le, idx_best_rues_import_le' AS attendu
  UNION ALL SELECT 2, 'maisons rangees',
         (SELECT count(*) FROM public.best_adresses)::text, '1612254'
  UNION ALL SELECT 3, 'rues rangees',
         (SELECT count(*) FROM public.best_rues)::text, '57931'
  UNION ALL SELECT 4, 'imports differents presents (1 = rien d ancien a nettoyer)',
         ((SELECT count(DISTINCT import_le) FROM public.best_adresses)::text || ' maisons / '
           || (SELECT count(DISTINCT import_le) FROM public.best_rues)::text || ' rues'),
         '1 maisons / 1 rues'
  UNION ALL SELECT 5, 'maisons estimees par les voisins',
         (SELECT count(*) FROM public.best_adresses WHERE origine_position = 'voisins')::text, '99324'
) t ORDER BY n;
