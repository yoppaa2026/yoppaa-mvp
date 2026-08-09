-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_VUES_FICHE.sql
--
-- Le compteur de vues de fiche : combien de personnes ont ouvert ma page.
--
-- POURQUOI. C'est le premier chiffre que tout commerçant cherche, et le seul
-- qui manquait aux statistiques livrées le 09/08. Sans lui, un commerce qui
-- démarre ne voit que des zéros et conclut que Yoppaa ne sert à rien, alors
-- qu'il est peut-être déjà regardé cinquante fois par semaine.
--
-- ⚠️ UNE LIGNE PAR JOUR ET PAR COMMERCE, PAS UNE LIGNE PAR VISITE.
-- Une ligne par visite donnerait une table qui grossit sans fin et, surtout,
-- un horodatage à la seconde près de chaque consultation. Agrégé à la journée,
-- le compteur suffit pour la courbe jour par jour et ne raconte plus rien sur
-- personne.
--
-- ⚠️ AUCUNE DONNÉE PERSONNELLE. Ni IP, ni identifiant de visiteur, ni Yopper.
-- On ne stocke QUE : quel commerce, quel jour, combien. Le dédoublonnage (une
-- vue par session et par commerce) se fait côté navigateur, exactement comme
-- pour les statistiques des deals.
--
-- Le jour est en HEURE BELGE, calculé côté base : une vue à 00h30 doit tomber
-- dans la bonne journée, pas dans celle de la veille en UTC.
--
-- Idempotente : ré-exécutable sans effet de bord.
--
-- Vérifications attendues en fin de script :
--   table_creee = 1, fonction_creee = 1, rls_active = true
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.fiche_vues (
  commercant_id uuid NOT NULL REFERENCES public.commercants(id) ON DELETE CASCADE,
  jour          date NOT NULL,
  vues          integer NOT NULL DEFAULT 0,
  PRIMARY KEY (commercant_id, jour)
);

COMMENT ON TABLE public.fiche_vues IS
  'Vues de fiche agrégées par commerce et par jour (heure belge). Aucune donnée personnelle : ni IP, ni visiteur, ni horodatage fin.';

-- La lecture se fait toujours par la route de statistiques, en service_role,
-- pour une seule période : un index sur le jour évite un balayage complet dès
-- que la table aura quelques milliers de lignes.
CREATE INDEX IF NOT EXISTS idx_fiche_vues_jour
  ON public.fiche_vues (commercant_id, jour DESC);

-- ─── RLS ───────────────────────────────────────────────────────────────────
-- Personne n'écrit ni ne lit cette table directement : l'écriture passe par la
-- fonction ci-dessous (SECURITY DEFINER), la lecture par la route de
-- statistiques (service_role, qui contourne RLS). On active donc RLS SANS
-- aucune policy permissive : c'est fermé par défaut, et c'est voulu.
--
-- ⚠️ Une policy « lecture publique » ici laisserait n'importe qui compiler
-- l'audience de tous les commerces de la plateforme.
ALTER TABLE public.fiche_vues ENABLE ROW LEVEL SECURITY;

-- ─── Droits ────────────────────────────────────────────────────────────────
-- GRANT explicite (règle Yoppaa : toute migration qui crée une table pose ses
-- droits). service_role seul : anon et authenticated passent par la fonction.
GRANT SELECT, INSERT, UPDATE ON public.fiche_vues TO service_role;

-- ─── L'incrément ───────────────────────────────────────────────────────────
-- SECURITY DEFINER, comme increment_deal_stat : un Yopper non connecté doit
-- pouvoir être compté sans qu'on ouvre la table en écriture.
-- Le jour est calculé ICI, en heure belge, pour que deux visites de la même
-- soirée tombent dans la même case quelle que soit la saison.
CREATE OR REPLACE FUNCTION public.incrementer_vue_fiche(p_commercant_id uuid)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jour date := (now() AT TIME ZONE 'Europe/Brussels')::date;
BEGIN
  INSERT INTO public.fiche_vues (commercant_id, jour, vues)
  VALUES (p_commercant_id, v_jour, 1)
  ON CONFLICT (commercant_id, jour)
  DO UPDATE SET vues = public.fiche_vues.vues + 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.incrementer_vue_fiche(uuid) TO anon, authenticated, service_role;

-- ─── Vérifications ─────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'fiche_vues')        AS table_creee,
  (SELECT COUNT(*) FROM pg_proc
     WHERE proname = 'incrementer_vue_fiche')                            AS fonction_creee,
  (SELECT relrowsecurity FROM pg_class
     WHERE oid = 'public.fiche_vues'::regclass)                          AS rls_active;
