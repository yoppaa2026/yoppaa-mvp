-- MIGRATION_FERMETURE_SEANCE.sql (04/10)
--
-- QUESTION 1, DÉCISION D'ALEX DU 04/10 : « oui », fermer UNE séance.
--
-- 🔴 POURQUOI. « Annuler ce cours » désinscrit chaque personne, rembourse et
-- prévient, mais les places se ROUVRAIENT à la réservation en ligne : une
-- fermeture ne savait couvrir qu'une journée entière (ou toute la journée d'une
-- praticienne). Quelqu'un pouvait réserver le cours annulé dans la minute.
--
-- CE QUI CHANGE : deux colonnes FACULTATIVES. Vides, la fermeture reste ce
-- qu'elle était (une ou plusieurs journées). Remplies ensemble, elle ne ferme
-- QUE ce cours, à cette heure, ce jour-là : le reste de la journée reste ouvert.
--
-- ⚠️ À LANCER AVANT LE CODE QUI LES LIT : une colonne absente d'un select fait
-- échouer TOUTE la requête, et la fiche n'aurait plus aucune fermeture.
-- ⚠️ D'ABORD SUR LA BASE D'ESSAI (test.yoppaa.app), puis sur la prod avant
-- « pousse ».
--
-- Pas de GRANT ici : on ne crée aucun objet, on ajoute deux colonnes à une
-- table dont les droits sont posés au niveau de la table. Le contrôle D et E
-- vérifie que la vitrine les lit et que la commerçante les écrit.

-- ─── 1) LES DEUX COLONNES ──────────────────────────────────────────────────
ALTER TABLE public.rdv_fermetures ADD COLUMN IF NOT EXISTS heure_debut time;
ALTER TABLE public.rdv_fermetures ADD COLUMN IF NOT EXISTS prestation_id uuid
  REFERENCES public.rdv_prestations(id) ON DELETE CASCADE;

-- ─── 2) ENSEMBLE OU PAS DU TOUT, ET UN SEUL JOUR ───────────────────────────
-- Une heure sans cours, ou un cours sans heure, ne voudrait rien dire : la
-- base le refuse plutôt que de laisser l'écran deviner.
ALTER TABLE public.rdv_fermetures DROP CONSTRAINT IF EXISTS rdv_fermetures_seance_coherente;
ALTER TABLE public.rdv_fermetures ADD CONSTRAINT rdv_fermetures_seance_coherente CHECK (
  (heure_debut IS NULL AND prestation_id IS NULL)
  OR (heure_debut IS NOT NULL AND prestation_id IS NOT NULL AND date_debut = date_fin)
);

CREATE INDEX IF NOT EXISTS rdv_fermetures_prestation_idx
  ON public.rdv_fermetures (prestation_id) WHERE prestation_id IS NOT NULL;

-- ─── 3) CONTRÔLE : UNE LIGNE PAR VÉRIFICATION, VALEUR ET ATTENDU ───────────
SELECT 'A. la colonne heure_debut existe, en heure' AS controle,
       (SELECT data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'rdv_fermetures' AND column_name = 'heure_debut')::text AS valeur,
       'time without time zone' AS attendu
UNION ALL
SELECT 'B. la colonne prestation_id existe, en uuid',
       (SELECT data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'rdv_fermetures' AND column_name = 'prestation_id')::text,
       'uuid'
UNION ALL
SELECT 'C. la contrainte ensemble-ou-rien existe',
       (SELECT count(*) FROM pg_constraint WHERE conname = 'rdv_fermetures_seance_coherente')::text,
       '1'
UNION ALL
SELECT 'D. la vitrine (anon) lit les deux colonnes',
       (has_column_privilege('anon', 'public.rdv_fermetures', 'heure_debut', 'SELECT')
        AND has_column_privilege('anon', 'public.rdv_fermetures', 'prestation_id', 'SELECT'))::text,
       'true'
UNION ALL
SELECT 'E. la commercante (authenticated) les ecrit',
       (has_column_privilege('authenticated', 'public.rdv_fermetures', 'heure_debut', 'INSERT')
        AND has_column_privilege('authenticated', 'public.rdv_fermetures', 'prestation_id', 'INSERT'))::text,
       'true'
UNION ALL
SELECT 'F. les fermetures existantes restent des journees',
       (SELECT count(*) FROM public.rdv_fermetures WHERE heure_debut IS NOT NULL OR prestation_id IS NOT NULL)::text,
       '0';
