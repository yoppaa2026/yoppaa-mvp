-- LE STOCK EN TROIS CHOIX PAR ARTICLE (30/09/2026, décision d'Alex)
--
--   illimite  préparé à la commande (pizzeria, traiteur) : aucune quantité.
--   jour      une quantité par jour, le compteur repart chaque matin
--             (boulangerie) : ce que fait l'alimentaire aujourd'hui.
--   magasin   un vrai stock (boutique) : les ventes se COMPTENT depuis
--             `stock_maj_le`, une annulation cesse d'être comptée (modèle B
--             validé par Alex). Le serveur le lira APRÈS la revue Play.
--
-- 🔴 POURQUOI UNE COLONNE ET PAS « VIDE = SANS LIMITE ». Le même chiffre 0
-- voulait dire « épuisé » pour une variante et « sans limite » pour un article,
-- et l'écran de la boutique affichait « Épuisé » sur un article que la fiche
-- vendait sans limite. Un choix se range dans une colonne qui le dit.
--
-- ⚠️ `stock_mode` EXISTAIT DÉJÀ, libre (texte, défaut 'manuel', aucune
-- contrainte, aucune fonction ni déclencheur, relevé du 30/09) : les 46
-- articles portaient 'manuel', qui ne voulait rien dire. On la réutilise.
--
-- ⚠️ CHAQUE ARTICLE REÇOIT CE QU'IL FAIT DÉJÀ, rien ne change pour personne :
--   • boutique et services (catégories detail, vitrine) : 'magasin' ;
--   • alimentaire sans quantité ET sans jour réglé : 'illimite' (le serveur
--     le traite déjà comme sans limite) ;
--   • tout le reste : 'jour'.
-- Les « 999 » restent en 'jour' (Alex : le commerçant bascule lui-même).
--
-- ⚠️ `stock_maj_le` : la date à partir de laquelle les ventes d'un stock en
-- magasin se comptent. Posée à maintenant pour les articles existants : leur
-- chiffre est déjà ce qu'il reste. Les variantes auront la leur APRÈS Play, dans
-- la même livraison qui arrêtera de les décrémenter (sinon une vente serait
-- retirée ET comptée).

UPDATE public.articles a
   SET stock_mode = CASE
         WHEN c.categorie IN ('detail', 'vitrine') THEN 'magasin'
         WHEN coalesce(a.stock_jour, 0) <= 0
              AND NOT EXISTS (SELECT 1 FROM public.article_stock_jour s
                               WHERE s.article_id = a.id AND s.actif IS NOT FALSE AND coalesce(s.stock, 0) > 0)
           THEN 'illimite'
         ELSE 'jour'
       END
  FROM public.commercants c
 WHERE c.id = a.commercant_id;

-- Un article sans commerce lisible garde le comportement d'aujourd'hui.
UPDATE public.articles
   SET stock_mode = 'jour'
 WHERE stock_mode IS NULL OR stock_mode NOT IN ('illimite', 'jour', 'magasin');

ALTER TABLE public.articles ALTER COLUMN stock_mode SET DEFAULT 'jour';
ALTER TABLE public.articles ALTER COLUMN stock_mode SET NOT NULL;
ALTER TABLE public.articles DROP CONSTRAINT IF EXISTS articles_stock_mode_check;
ALTER TABLE public.articles ADD CONSTRAINT articles_stock_mode_check
  CHECK (stock_mode IN ('illimite', 'jour', 'magasin'));

ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS stock_maj_le timestamptz NOT NULL DEFAULT now();

-- La fiche lit les articles avec la clé publique, le tableau de bord les écrit
-- sous l'identité du commerçant (la RLS borne les lignes).
GRANT SELECT (stock_mode, stock_maj_le) ON public.articles TO anon, authenticated;
GRANT INSERT (stock_mode, stock_maj_le), UPDATE (stock_mode, stock_maj_le) ON public.articles TO authenticated;

-- ─── CONTRÔLE : une ligne par vérification, la valeur et l'attendu ─────────
SELECT n, controle, valeur, attendu FROM (
  SELECT '01' AS n, 'stock_mode : type | vide permis' AS controle,
         (SELECT data_type || ' | ' || is_nullable FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'articles' AND column_name = 'stock_mode') AS valeur,
         'text | NO' AS attendu
  UNION ALL
  SELECT '02', 'stock_mode : défaut',
         (SELECT column_default FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'articles' AND column_name = 'stock_mode'),
         '''jour''::text'
  UNION ALL
  SELECT '03', 'contrainte des trois valeurs posée',
         (SELECT count(*)::text FROM pg_constraint
           WHERE conrelid = 'public.articles'::regclass AND conname = 'articles_stock_mode_check'),
         '1'
  UNION ALL
  SELECT '04', 'articles avec une valeur hors des trois',
         (SELECT count(*)::text FROM public.articles WHERE stock_mode NOT IN ('illimite', 'jour', 'magasin')),
         '0'
  UNION ALL
  SELECT '05', 'boutiques et services qui ne sont PAS en magasin',
         (SELECT count(*)::text FROM public.articles a JOIN public.commercants c ON c.id = a.commercant_id
           WHERE c.categorie IN ('detail', 'vitrine') AND a.stock_mode <> 'magasin'),
         '0'
  UNION ALL
  SELECT '06', 'alimentaire AVEC une quantité qui n est pas en jour',
         (SELECT count(*)::text FROM public.articles a JOIN public.commercants c ON c.id = a.commercant_id
           WHERE coalesce(c.categorie, '') NOT IN ('detail', 'vitrine') AND coalesce(a.stock_jour, 0) > 0 AND a.stock_mode <> 'jour'),
         '0'
  UNION ALL
  SELECT '07', 'alimentaire SANS quantité ni jour réglé qui n est pas sans limite',
         (SELECT count(*)::text FROM public.articles a JOIN public.commercants c ON c.id = a.commercant_id
           WHERE coalesce(c.categorie, '') NOT IN ('detail', 'vitrine') AND coalesce(a.stock_jour, 0) <= 0
             AND NOT EXISTS (SELECT 1 FROM public.article_stock_jour s
                              WHERE s.article_id = a.id AND s.actif IS NOT FALSE AND coalesce(s.stock, 0) > 0)
             AND a.stock_mode <> 'illimite'),
         '0'
  UNION ALL
  SELECT '08', 'stock_maj_le : type | vide permis',
         (SELECT data_type || ' | ' || is_nullable FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'articles' AND column_name = 'stock_maj_le'),
         'timestamp with time zone | NO'
  UNION ALL
  SELECT '09', 'articles sans stock_maj_le',
         (SELECT count(*)::text FROM public.articles WHERE stock_maj_le IS NULL),
         '0'
  UNION ALL
  SELECT '10', 'la fiche (anon) lit stock_mode et stock_maj_le',
         (has_column_privilege('anon', 'public.articles', 'stock_mode', 'SELECT')
          AND has_column_privilege('anon', 'public.articles', 'stock_maj_le', 'SELECT'))::text,
         'true'
  UNION ALL
  SELECT '11', 'le commerçant (authenticated) écrit stock_mode et stock_maj_le',
         (has_column_privilege('authenticated', 'public.articles', 'stock_mode', 'UPDATE')
          AND has_column_privilege('authenticated', 'public.articles', 'stock_maj_le', 'UPDATE')
          AND has_column_privilege('authenticated', 'public.articles', 'stock_mode', 'INSERT'))::text,
         'true'
  UNION ALL
  SELECT '12', 'répartition : sans limite | par jour | en magasin',
         (SELECT count(*) FILTER (WHERE stock_mode = 'illimite')::text || ' | '
               || count(*) FILTER (WHERE stock_mode = 'jour')::text || ' | '
               || count(*) FILTER (WHERE stock_mode = 'magasin')::text FROM public.articles),
         'pour information (46 au total)'
) controles
ORDER BY n;
