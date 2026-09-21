-- ═══════════════════════════════════════════════════════════════════════════
-- LES DEUX CONTRAINTES QUI REFUSAIENT LE SIGNALEMENT D'UN AVIS (20/09)
--
-- 🔴 CE QUI S'EST PASSÉ. La colonne `avis_id` a été ajoutée, le code écrit, les
-- bancs verts, 16 mutations attrapées... et l'envoi rendait 500 en production.
-- Deux contraintes posées bien avant interdisaient l'insertion :
--
--   signalement_source_check : exactement UNE cible parmi DEUX
--       (commercant_id XOR service_id). Un signalement d'avis a les deux à
--       NULL, donc il était refusé.
--
--   signalements_type_check : le motif devait appartenir aux HUIT motifs de
--       fiche. Des six motifs de contenu, seul « autre » serait passé.
--
-- ⚠️ ET LA MIGRATION PRÉCÉDENTE DISAIT LE CONTRAIRE. Elle annonçait « aucune
-- contrainte CHECK n'est posée sur exactement une cible », parce que je me
-- demandais s'il fallait en AJOUTER une. Je n'ai pas regardé s'il en EXISTAIT
-- déjà. Le contrôle listait les policies, les droits, l'index, la clé
-- étrangère, et pas les contraintes de la table qu'il modifiait.
--
-- ⚠️ UN BANC QUI LIT DU JAVASCRIPT NE VOIT PAS UNE CONTRAINTE SQL. C'est la
-- famille de défauts que seul un essai en vrai attrape, et c'est Alex qui l'a
-- attrapé, sur une capture, à la veille de filmer pour Apple.
--
-- ⚠️ LES DEUX NOUVELLES CONTRAINTES SONT PLUS PERMISSIVES que les anciennes :
-- aucune ligne existante ne peut les violer, donc la pose ne peut pas échouer
-- sur les données. Le contrôle compte quand même ce qui est en base.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. LA CIBLE : exactement UNE parmi TROIS, désormais.
--
-- ⚠️ ÉCRIT EN COMPTANT, PAS EN ÉNUMÉRANT LES COMBINAISONS. La forme d'origine
-- énumérait les deux cas à la main ; à trois cibles il en faudrait six, et à
-- quatre, douze. Compter les colonnes non nulles dit la même règle et survit à
-- la prochaine cible.
ALTER TABLE public.signalements DROP CONSTRAINT IF EXISTS signalement_source_check;
ALTER TABLE public.signalements
  ADD CONSTRAINT signalement_source_check CHECK (
    (commercant_id IS NOT NULL)::int
  + (service_id    IS NOT NULL)::int
  + (avis_id       IS NOT NULL)::int
  = 1
  );

-- 2. LE MOTIF : les huit motifs de fiche, plus les six motifs de contenu.
--
-- ⚠️ LES DEUX FAMILLES COHABITENT DANS UNE SEULE COLONNE, et la contrainte ne
-- vérifie PAS qu'un motif de contenu vise bien un avis. Ce croisement-là vit
-- dans la route (`motifAvisConnu`), qui refuse un motif inconnu sur un avis :
-- le redire ici obligerait à maintenir la même règle à deux endroits, et c'est
-- le défaut que ce dépôt a déjà payé plusieurs fois.
--
-- ⚠️ « autre » APPARTIENT AUX DEUX FAMILLES, et une seule fois dans la liste.
ALTER TABLE public.signalements DROP CONSTRAINT IF EXISTS signalements_type_check;
ALTER TABLE public.signalements
  ADD CONSTRAINT signalements_type_check CHECK (
    type = ANY (ARRAY[
      -- les huit motifs d'une FICHE (commerce ou service public)
      'ferme'::text, 'horaires'::text, 'adresse'::text, 'telephone'::text,
      'articles'::text, 'site_web'::text, 'doublon'::text,
      -- les cinq motifs d'un CONTENU, plus « autre » commun aux deux
      'haineux'::text, 'faux'::text, 'personnel'::text, 'illegal'::text,
      'hors_sujet'::text, 'autre'::text
    ])
  );

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRÔLE — une ligne par vérification, la valeur ET l'attendu, tout en text.
-- ═══════════════════════════════════════════════════════════════════════════
SELECT 'D01 la cible accepte un avis seul'::text AS controle,
       (SELECT CASE WHEN pg_get_constraintdef(oid) LIKE '%avis_id IS NOT NULL%'
                    THEN 'oui' ELSE 'NON' END
        FROM pg_constraint
        WHERE conname = 'signalement_source_check'
          AND conrelid = 'public.signalements'::regclass)::text AS valeur,
       'oui'::text AS attendu
UNION ALL
SELECT 'D02 et toujours UNE SEULE cible à la fois'::text,
       (SELECT CASE WHEN pg_get_constraintdef(oid) LIKE '%= 1)%'
                    THEN 'oui' ELSE 'NON' END
        FROM pg_constraint
        WHERE conname = 'signalement_source_check'
          AND conrelid = 'public.signalements'::regclass)::text,
       'oui'::text
UNION ALL
SELECT ('D03 motif « ' || m ||' » accepté')::text,
       (SELECT CASE WHEN pg_get_constraintdef(oid) LIKE '%''' || m || '''%'
                    THEN 'oui' ELSE 'NON' END
        FROM pg_constraint
        WHERE conname = 'signalements_type_check'
          AND conrelid = 'public.signalements'::regclass)::text,
       'oui'::text
FROM unnest(ARRAY['haineux','faux','personnel','illegal','hors_sujet','autre']) AS m
UNION ALL
SELECT ('D04 motif de fiche « ' || m || ' » toujours accepté')::text,
       (SELECT CASE WHEN pg_get_constraintdef(oid) LIKE '%''' || m || '''%'
                    THEN 'oui' ELSE 'NON' END
        FROM pg_constraint
        WHERE conname = 'signalements_type_check'
          AND conrelid = 'public.signalements'::regclass)::text,
       'oui'::text
FROM unnest(ARRAY['ferme','horaires','adresse','telephone','articles','site_web','doublon']) AS m
UNION ALL
SELECT 'D05 signalements en base, aucun perdu'::text,
       (SELECT count(*)::text FROM public.signalements),
       '1 ou plus'::text
UNION ALL
SELECT 'D06 signalements visant un avis'::text,
       (SELECT count(*)::text FROM public.signalements WHERE avis_id IS NOT NULL),
       '0 avant le premier essai'::text
ORDER BY 1;
