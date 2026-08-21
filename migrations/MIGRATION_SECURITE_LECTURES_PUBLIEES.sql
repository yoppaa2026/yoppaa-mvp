-- ═══════════════════════════════════════════════════════════════════════════
-- SÉCURITÉ — 21/08/2026 — LE CATALOGUE D'UN COMMERÇANT NON VALIDÉ FUITE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ À PASSER APRÈS MIGRATION_SECURITE_21_08.sql ET
--    MIGRATION_SECURITE_COLONNES_21_08.sql, et à TESTER AU NAVIGATEUR juste
--    après : c'est le chemin de réservation du client qui est en jeu.
--
-- ─── LE DÉFAUT ─────────────────────────────────────────────────────────────
--
-- Deux policies de lecture coexistent sur chaque table `rdv_*`. La stricte
-- filtre sur `statut_publication = 'publie'`, la large ne filtre rien de tel :
--
--   rdv_prestations | Prestations actives visibles publiquement
--                   | … AND EXISTS (SELECT 1 FROM commercants c WHERE … 'publie' …)
--   rdv_prestations | rdv_prestations_lecture_publique
--                   | (actif IS TRUE AND deleted_at IS NULL)
--
-- Les permissives se combinent en OU : la large gagne toujours. Résultat, le
-- catalogue complet d'un commerçant qui attend encore ta validation est lisible
-- par n'importe qui avec la clé anon : ses prestations, ses prix, ses horaires,
-- ses praticiens.
--
-- ─── ⚠️ ET POURQUOI ON NE SUPPRIME PAS SIMPLEMENT LA LARGE ─────────────────
--
-- C'est le piège, et je m'y suis laissé prendre avant que le relevé ne me
-- rattrape. Les policies « strictes » contiennent
-- `EXISTS (SELECT 1 FROM commercants c WHERE …)`, et **une sous-requête dans un
-- `USING` est évaluée AVEC LES DROITS DE L'APPELANT**. Or `commercants` n'a
-- AUCUNE policy de lecture pour `anon` : pour un visiteur anonyme, ce EXISTS
-- rend FAUX, sans erreur.
--
-- Autrement dit : les strictes sont MORTES depuis toujours, et les larges sont
-- les rustines posées le 03/08 justement parce que plus rien ne s'affichait.
-- Les retirer reproduirait la panne à l'identique, en silence.
--
-- ─── LE REMÈDE ─────────────────────────────────────────────────────────────
--
-- Une fonction `SECURITY DEFINER`, qui s'exécute avec les droits de son
-- propriétaire et voit donc `commercants` quel que soit l'appelant. Exactement
-- ce que `mes_commerces_bloques()` fait depuis le 20/08.

-- ─── 1) LA FONCTION ────────────────────────────────────────────────────────
-- STABLE : PostgreSQL peut la mettre en cache le temps d'une requête, ce qui
-- évite de la rappeler pour chaque ligne du catalogue.
CREATE OR REPLACE FUNCTION public.commerces_publies()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM commercants WHERE statut_publication = 'publie'
$$;

GRANT EXECUTE ON FUNCTION public.commerces_publies() TO anon, authenticated;


-- ─── 2) LES QUATRE TABLES DU RENDEZ-VOUS ───────────────────────────────────
-- Pour chacune : on supprime la stricte (morte) ET la large (trop ouverte), et
-- on pose UNE policy qui fait vraiment le travail.
--
-- ⚠️ UNE SEULE POLICY PAR TABLE À LA FIN, c'est le point. Deux permissives se
-- combinent en OU, donc la plus large annule toujours l'autre : c'est ce défaut
-- qu'on répare, ne le recréons pas en laissant une survivante.

-- PRESTATIONS
DROP POLICY IF EXISTS "Prestations actives visibles publiquement" ON rdv_prestations;
DROP POLICY IF EXISTS "rdv_prestations_lecture_publique"          ON rdv_prestations;
CREATE POLICY "rdv_prestations_lecture_publique" ON rdv_prestations
  FOR SELECT TO anon, authenticated
  USING (
    actif IS TRUE AND deleted_at IS NULL
    AND commercant_id IN (SELECT public.commerces_publies())
  );

-- CRÉNEAUX
DROP POLICY IF EXISTS "Creneaux visibles publiquement"   ON rdv_creneaux;
DROP POLICY IF EXISTS "rdv_creneaux_lecture_publique"    ON rdv_creneaux;
CREATE POLICY "rdv_creneaux_lecture_publique" ON rdv_creneaux
  FOR SELECT TO anon, authenticated
  USING (
    actif IS TRUE AND deleted_at IS NULL
    AND commercant_id IN (SELECT public.commerces_publies())
  );

-- PRATICIENS
DROP POLICY IF EXISTS "Praticiens visibles publiquement"  ON rdv_praticiens;
DROP POLICY IF EXISTS "rdv_praticiens_lecture_publique"   ON rdv_praticiens;
CREATE POLICY "rdv_praticiens_lecture_publique" ON rdv_praticiens
  FOR SELECT TO anon, authenticated
  USING (
    actif IS TRUE AND deleted_at IS NULL
    AND commercant_id IN (SELECT public.commerces_publies())
  );

-- FERMETURES
-- ⚠️ PAS DE FILTRE `actif` ICI : une fermeture est une ABSENCE de créneau. La
-- masquer ne protège rien et ferait proposer un rendez-vous un jour de congé.
DROP POLICY IF EXISTS "Lecture publique fermetures actives" ON rdv_fermetures;
DROP POLICY IF EXISTS "rdv_fermetures_lecture_publique"     ON rdv_fermetures;
CREATE POLICY "rdv_fermetures_lecture_publique" ON rdv_fermetures
  FOR SELECT TO anon, authenticated
  USING (
    deleted_at IS NULL
    AND commercant_id IN (SELECT public.commerces_publies())
  );

-- LA TABLE DE JONCTION prestation ↔ praticien.
-- ⚠️ Elle n'a PAS de `commercant_id` : elle se raccroche à la prestation. Sa
-- policy stricte interroge `rdv_prestations`, une table que `anon` PEUT lire :
-- la sous-requête fonctionne donc, contrairement à celles sur `commercants`.
-- On garde ce mécanisme et on supprime seulement la large.
DROP POLICY IF EXISTS "rdv_prestation_praticiens_lecture_publique" ON rdv_prestation_praticiens;


-- ─── 3) CONTRÔLES ──────────────────────────────────────────────────────────

-- a) Attendu : 5 lignes, UNE SEULE par table, et chaque `using_clause` doit
--    mentionner `commerces_publies` (sauf la jonction, qui passe par la
--    prestation).
SELECT tablename, policyname, roles::text, qual AS using_clause
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('rdv_prestations', 'rdv_creneaux', 'rdv_praticiens',
                     'rdv_fermetures', 'rdv_prestation_praticiens')
   AND cmd = 'SELECT'
 ORDER BY tablename, policyname;

-- b) Attendu : 1 ligne, `commerces_publies`, avec search_path_pose à true.
SELECT p.proname,
       EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%') AS search_path_pose
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'commerces_publies';


-- ─── 4) 🔴 LE TEST QUI COMPTE, ET IL NE SE FAIT PAS EN SQL ─────────────────
--
-- ⚠️ Un `SELECT` lancé depuis l'éditeur Supabase tourne en CLÉ DE SERVICE et
-- ignore la RLS : il ne prouve RIEN sur ce que voit un visiteur.
--
-- Dans un navigateur, en NAVIGATION PRIVÉE (donc sans session) :
--   1. ouvrir la fiche d'un commerce de démonstration en catégorie Service ;
--   2. ses prestations, ses praticiens et ses créneaux doivent s'afficher ;
--   3. réserver un rendez-vous jusqu'au bout.
--
-- ⚠️ SI L'ÉCRAN EST VIDE SANS MESSAGE D'ERREUR, c'est la panne du 03/08 qui
-- recommence : la policy filtre tout. Retour arrière immédiat, partie 5.


-- ─── 5) RETOUR ARRIÈRE ─────────────────────────────────────────────────────
-- Remet exactement l'état d'avant, y compris les policies larges qui faisaient
-- marcher l'affichage.
--
-- DROP POLICY IF EXISTS "rdv_prestations_lecture_publique" ON rdv_prestations;
-- CREATE POLICY "rdv_prestations_lecture_publique" ON rdv_prestations
--   FOR SELECT TO anon, authenticated USING (actif IS TRUE AND deleted_at IS NULL);
--
-- DROP POLICY IF EXISTS "rdv_creneaux_lecture_publique" ON rdv_creneaux;
-- CREATE POLICY "rdv_creneaux_lecture_publique" ON rdv_creneaux
--   FOR SELECT TO anon, authenticated USING (true);
--
-- DROP POLICY IF EXISTS "rdv_praticiens_lecture_publique" ON rdv_praticiens;
-- CREATE POLICY "rdv_praticiens_lecture_publique" ON rdv_praticiens
--   FOR SELECT TO anon, authenticated USING (actif IS TRUE AND deleted_at IS NULL);
--
-- DROP POLICY IF EXISTS "rdv_fermetures_lecture_publique" ON rdv_fermetures;
-- CREATE POLICY "rdv_fermetures_lecture_publique" ON rdv_fermetures
--   FOR SELECT TO anon, authenticated USING (true);
--
-- CREATE POLICY "rdv_prestation_praticiens_lecture_publique" ON rdv_prestation_praticiens
--   FOR SELECT TO anon, authenticated USING (true);


-- ─── 6) CE QUI RESTE OUVERT, ET CE N'EST PAS UN OUBLI ──────────────────────
--
-- `actualites`, `yoppaa_deals`, `commercant_photos`, `article_options_groupes`
-- et `article_options_valeurs` se lisent aussi sans filtre de publication. Même
-- fuite, moindre enjeu : ce sont des contenus qu'un commerçant publie pour être
-- vus, pas son agenda ni ses tarifs de prestations.
--
-- ⚠️ Ils se traitent de la même façon, avec la MÊME fonction, et seulement une
-- fois que ce fichier-ci aura été éprouvé au navigateur. Une migration qui
-- touche six tables d'un coup ne se diagnostique plus quand un écran se vide.
