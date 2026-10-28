-- LA TRACE DE LA PROMO SUR CHAQUE LIGNE DE COMMANDE (28/10, lot 0 du module
-- promo, Alex au tableau).
--
-- 🔴 POURQUOI. Une ligne remisée ne gardait que son prix remisé : ni le prix
-- plein, ni la promo qui l'avait baissé (`deal_id` n'est gardé que pour les
-- offres séparées, lot, duo, invendu, parce qu'il sert à les plafonner). Le
-- coût d'une promo était invisible partout : statistiques, export, emails.
--
-- Deux colonnes, nulles quand la ligne est au prix plein :
--   • prix_plein     : le prix unitaire SANS la promo, suppléments compris ;
--   • promo_deal_id  : la promo qui a baissé le prix (remise, prix promo, ou
--                      l'offre séparée elle-même).
-- La remise d'une ligne se lit : (prix_plein - prix_unitaire) × quantite.
--
-- ⚠️ PAS DE CLÉ ÉTRANGÈRE vers `yoppaa_deals`, comme `deal_id` : une promo
-- supprimée ne doit ni bloquer sa suppression ni effacer l'histoire d'une
-- vente. Et une seconde relation vers la même table rendrait les lectures
-- jointes ambiguës (PGRST201).
--
-- ⚠️ À LANCER AVANT LE CODE (commit « trace de la promo ») : le code écrit ces
-- colonnes à chaque commande, et une colonne inconnue ferait échouer
-- l'enregistrement. Sans le code, elles restent nulles : rien ne change.
-- Ordre : TEST, puis PROD.

BEGIN;

ALTER TABLE public.commande_articles
  ADD COLUMN IF NOT EXISTS prix_plein numeric(10,2),
  ADD COLUMN IF NOT EXISTS promo_deal_id uuid;

ALTER TABLE public.commande_articles
  DROP CONSTRAINT IF EXISTS commande_articles_prix_plein_check;
ALTER TABLE public.commande_articles
  ADD CONSTRAINT commande_articles_prix_plein_check
  CHECK (prix_plein IS NULL OR prix_plein >= 0);

COMMENT ON COLUMN public.commande_articles.prix_plein IS
  'Prix unitaire sans la promo, supplements compris. NULL = vendu au prix plein.';
COMMENT ON COLUMN public.commande_articles.promo_deal_id IS
  'La promo (yoppaa_deals) qui a baisse le prix de la ligne. NULL = aucune.';

-- Les lignes se lisent colonne par colonne : le commerçant connecté lit les
-- siennes (règles de lecture), les visiteurs rien. Comme `quantite_fournisseur`.
GRANT SELECT (prix_plein, promo_deal_id) ON public.commande_articles TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ─── CONTRÔLES ──────────────────────────────────────────────────────────────
SELECT * FROM (
  SELECT 1 AS n, 'T1. colonne prix_plein' AS controle,
    coalesce((SELECT data_type FROM information_schema.columns WHERE table_schema = 'public'
              AND table_name = 'commande_articles' AND column_name = 'prix_plein'), 'ABSENTE')::text AS valeur,
    'numeric' AS attendu
  UNION ALL
  SELECT 2, 'T2. colonne promo_deal_id',
    coalesce((SELECT data_type FROM information_schema.columns WHERE table_schema = 'public'
              AND table_name = 'commande_articles' AND column_name = 'promo_deal_id'), 'ABSENTE')::text,
    'uuid'
  UNION ALL
  SELECT 3, 'T3. aucune clé étrangère sur promo_deal_id',
    (SELECT count(*)::text FROM pg_constraint c
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
      WHERE c.conrelid = 'public.commande_articles'::regclass AND c.contype = 'f' AND a.attname = 'promo_deal_id'),
    '0'
  UNION ALL
  SELECT 4, 'T4. le commerçant connecté lit les deux colonnes',
    (has_column_privilege('authenticated', 'public.commande_articles', 'prix_plein', 'SELECT')
     AND has_column_privilege('authenticated', 'public.commande_articles', 'promo_deal_id', 'SELECT'))::text,
    'true'
  UNION ALL
  SELECT 5, 'T5. les visiteurs ne lisent pas les lignes de commande',
    has_column_privilege('anon', 'public.commande_articles', 'prix_plein', 'SELECT')::text,
    'false'
  UNION ALL
  SELECT 6, 'T6. aucune ligne existante touchée',
    (SELECT count(*)::text FROM public.commande_articles WHERE prix_plein IS NOT NULL OR promo_deal_id IS NOT NULL),
    '0'
) t ORDER BY n;
