-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION : UNE ACTUALITÉ PEUT DÉSIGNER UN ARTICLE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ À PASSER DANS L'ÉDITEUR SQL SUPABASE, PUIS ME DIRE QUE C'EST FAIT.
-- Aucun repli n'est écrit dans le code : tant que la colonne n'existe pas, la
-- fonctionnalité n'existe pas, et c'est voulu.
--
-- LE MANQUE : aujourd'hui une actualité est un texte et une photo, rien de
-- plus. Le commerçant annonce « nos nouvelles pralines sont arrivées », et le
-- Yopper qui a envie d'en acheter doit REFERMER l'actualité, ouvrir le
-- catalogue et retrouver l'article à la main. C'est ce chaînon manquant qui
-- fait que le fil ressemble à Facebook sans jamais devenir transactionnel.
--
-- CE QUE ÇA AJOUTE : UNE colonne. Une actualité peut pointer un article, et
-- l'écran affichera « Voir l'article » sous le post.
--
-- ⚠️ SÉCURITÉ, LA QUESTION QUI COMPTE ICI : QUI ÉCRIT, ET QU'A-T-IL LE DROIT DE
-- DÉSIGNER ? Sans garde, un commerçant pourrait pointer l'article d'un AUTRE
-- commerçant — donc afficher son prix, sa photo, et le rendre visible même s'il
-- n'est pas publié. La clé étrangère seule ne l'empêche PAS : elle vérifie que
-- l'article existe, pas à qui il appartient. Une contrainte CHECK ne peut pas
-- faire de sous-requête, il faut donc un DÉCLENCHEUR.
--
-- ⚠️ ET IL COUVRE INSERT *ET* UPDATE. Leçon du 21/08 : un déclencheur posé sur
-- le seul UPDATE laisse passer la naissance de la ligne.

BEGIN;

-- ── 1) La colonne ─────────────────────────────────────────────────────────
-- ON DELETE SET NULL : si le commerçant supprime l'article, l'actualité reste
-- (c'est son message), elle perd juste son lien. La détruire silencieusement
-- effacerait une publication qu'il n'a pas demandé à retirer.
ALTER TABLE public.actualites
  ADD COLUMN IF NOT EXISTS article_id uuid
  REFERENCES public.articles(id) ON DELETE SET NULL;

-- Un seul index : on lit toujours dans le sens actualité → article, et la
-- suppression d'un article a besoin de retrouver les actualités qui le citent.
CREATE INDEX IF NOT EXISTS idx_actualites_article
  ON public.actualites(article_id)
  WHERE article_id IS NOT NULL;

-- ── 2) Le déclencheur : l'article doit être le SIEN ───────────────────────
CREATE OR REPLACE FUNCTION public.actualite_article_meme_commercant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proprietaire uuid;
BEGIN
  -- ⚠️ NULL N'EST NI ÉGAL NI DIFFÉRENT (leçon du 23/08, une tournée entière
  -- vidée par un .neq). Une actualité SANS article est parfaitement légitime :
  -- on sort avant toute comparaison.
  IF NEW.article_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT commercant_id INTO proprietaire
  FROM public.articles
  WHERE id = NEW.article_id;

  IF proprietaire IS NULL THEN
    RAISE EXCEPTION 'Article introuvable';
  END IF;

  IF proprietaire IS DISTINCT FROM NEW.commercant_id THEN
    RAISE EXCEPTION 'Une actualité ne peut désigner qu''un article du même commerçant';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_actualite_article_meme_commercant ON public.actualites;
CREATE TRIGGER trg_actualite_article_meme_commercant
  BEFORE INSERT OR UPDATE OF article_id, commercant_id ON public.actualites
  FOR EACH ROW
  EXECUTE FUNCTION public.actualite_article_meme_commercant();

-- ── 3) Les droits ─────────────────────────────────────────────────────────
-- La colonne hérite des droits de la table, mais on le rend EXPLICITE : le
-- jour où des droits par colonne apparaissent, un oubli ici serait muet.
-- `anon` lit (la fiche publique affiche le lien), il n'écrit pas.
GRANT SELECT (article_id) ON public.actualites TO anon, authenticated;
GRANT UPDATE (article_id) ON public.actualites TO authenticated;

REVOKE EXECUTE ON FUNCTION public.actualite_article_meme_commercant() FROM public;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRÔLE — à lancer APRÈS, et à me renvoyer tel quel
-- ═══════════════════════════════════════════════════════════════════════════

-- a) La colonne existe et accepte le vide
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'actualites' AND column_name = 'article_id';
-- attendu : article_id | uuid | YES

-- b) Le déclencheur est bien posé, sur INSERT ET UPDATE
SELECT tgname,
       CASE WHEN (tgtype & 4) > 0 THEN 'INSERT ' ELSE '' END ||
       CASE WHEN (tgtype & 16) > 0 THEN 'UPDATE' ELSE '' END AS evenements
FROM pg_trigger
WHERE tgrelid = 'public.actualites'::regclass AND NOT tgisinternal;
-- attendu : trg_actualite_article_meme_commercant | INSERT UPDATE

-- c) La clé étrangère relâche au lieu de détruire
SELECT conname, confdeltype
FROM pg_constraint
WHERE conrelid = 'public.actualites'::regclass AND contype = 'f'
  AND conname LIKE '%article%';
-- attendu : confdeltype = 'n'  (n = SET NULL)
