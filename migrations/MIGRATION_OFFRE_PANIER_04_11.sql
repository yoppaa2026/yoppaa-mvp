-- « ACHETEZ N, RECEVEZ X » : L'OFFRE DANS LA BASE (04/11, lot 3 du module promo).
--
-- Les deux cas d'Alex (28/10) :
--   • « 2 pizzas achetées, une boisson offerte » : mode 'choisi', le client
--     choisit son cadeau parmi les articles offerts ;
--   • « 3 vêtements achetés, le moins cher offert » : mode 'moins_cher'.
--
-- ✅ Décisions d'Alex (28/10 et 04/11) : l'offre se déclenche toute seule dans
-- le panier ; le cadeau est une LIGNE À 0 € (la TVA reste sur les articles
-- payés) ; un cadeau en trop est payé ; le supplément d'un cadeau est payant ;
-- le paiement est bloqué tant que le cadeau n'est pas choisi (sauf « Je n'en
-- veux pas », ou si aucun cadeau n'est disponible).
--
-- Une offre est une ligne de `yoppaa_deals` de type 'panier', avec :
--   • offre_mode          : 'choisi' | 'moins_cher'
--   • offre_seuil         : N articles achetés (1 à 50)
--   • offre_nombre        : X articles offerts par palier (1 à 20)
--   • offre_declencheurs  : ce qui compte, [{ "article_id": … } | { "categorie": … }]
--   • offre_offerts       : mode 'choisi', ce qui peut être offert (même forme)
-- Les dates, la récurrence et la plage horaire restent celles de toute promo.
--
-- ⚠️ TOUTES NULLES par défaut : aucune promo existante ne change.
-- ⚠️ À LANCER AVANT LE CODE (TEST, puis PROD) : le serveur lit ces colonnes
-- par leur nom (`SELECT_DEALS`), et une colonne inconnue ferait échouer
-- TOUTES les commandes.

BEGIN;

ALTER TABLE public.yoppaa_deals
  ADD COLUMN IF NOT EXISTS offre_mode text,
  ADD COLUMN IF NOT EXISTS offre_seuil smallint,
  ADD COLUMN IF NOT EXISTS offre_nombre smallint,
  ADD COLUMN IF NOT EXISTS offre_declencheurs jsonb,
  ADD COLUMN IF NOT EXISTS offre_offerts jsonb;

-- Une offre complète, ou rien du tout sur une autre promo.
ALTER TABLE public.yoppaa_deals DROP CONSTRAINT IF EXISTS yoppaa_deals_offre_panier_check;
ALTER TABLE public.yoppaa_deals ADD CONSTRAINT yoppaa_deals_offre_panier_check CHECK (
  (deal_type IS DISTINCT FROM 'panier'
    AND offre_mode IS NULL AND offre_seuil IS NULL AND offre_nombre IS NULL
    AND offre_declencheurs IS NULL AND offre_offerts IS NULL)
  OR (deal_type = 'panier'
    AND offre_seuil BETWEEN 1 AND 50 AND offre_nombre BETWEEN 1 AND 20
    AND jsonb_typeof(offre_declencheurs) = 'array' AND jsonb_array_length(offre_declencheurs) >= 1
    AND (
      -- « 3 achetés, le moins cher offert » : le cadeau est PARMI les N.
      (offre_mode = 'moins_cher' AND offre_nombre < offre_seuil AND offre_offerts IS NULL)
      OR (offre_mode = 'choisi' AND jsonb_typeof(offre_offerts) = 'array' AND jsonb_array_length(offre_offerts) >= 1)
    ))
);

-- ⚠️ SI LA BASE BORNE `deal_type` (contrainte créée hors du dépôt), on y
-- ajoute 'panier' EN PARTANT DE LA VERSION EN BASE. Sans contrainte, rien.
DO $$
DECLARE
  c record;
  def text;
BEGIN
  FOR c IN
    SELECT conname, pg_get_constraintdef(oid) AS d FROM pg_constraint
     WHERE conrelid = 'public.yoppaa_deals'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%deal_type%' AND pg_get_constraintdef(oid) ILIKE '%prix_fixe%'
       AND pg_get_constraintdef(oid) NOT ILIKE '%panier%'
       AND conname NOT IN ('yoppaa_deals_prestation_type_check', 'yoppaa_deals_cible_tout_type_check')
  LOOP
    def := replace(c.d, '''prix_fixe''::text', '''prix_fixe''::text, ''panier''::text');
    IF def = c.d THEN
      RAISE EXCEPTION 'contrainte % sur deal_type : forme inattendue, rien modifié (%)', c.conname, c.d;
    END IF;
    EXECUTE format('ALTER TABLE public.yoppaa_deals DROP CONSTRAINT %I', c.conname);
    EXECUTE format('ALTER TABLE public.yoppaa_deals ADD CONSTRAINT %I %s', c.conname, def);
  END LOOP;
END $$;

-- Les droits : les colonnes héritent des droits de la table (contrôle O2).
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ─── CONTRÔLES : une ligne par contrôle, valeur et attendu ─────────────────
SELECT * FROM (
  SELECT 1 AS n, 'O1. les cinq colonnes existent' AS controle,
    (SELECT count(*)::text FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'yoppaa_deals'
       AND column_name IN ('offre_mode', 'offre_seuil', 'offre_nombre', 'offre_declencheurs', 'offre_offerts')) AS valeur,
    '5' AS attendu
  UNION ALL
  -- 🔴 Si les droits étaient posés colonne par colonne, les colonnes neuves
  -- seraient invisibles en lecture, sans une seule erreur.
  SELECT 2, 'O2. anon et authenticated lisent offre_declencheurs',
    (SELECT count(DISTINCT grantee)::text FROM information_schema.column_privileges
      WHERE table_name = 'yoppaa_deals' AND column_name = 'offre_declencheurs' AND privilege_type = 'SELECT'
        AND grantee IN ('anon', 'authenticated')),
    '2'
  UNION ALL
  SELECT 3, 'O3. le commerçant écrit offre_offerts',
    (SELECT count(*)::text FROM information_schema.column_privileges
      WHERE table_name = 'yoppaa_deals' AND column_name = 'offre_offerts' AND privilege_type IN ('INSERT', 'UPDATE')
        AND grantee = 'authenticated'),
    '2'
  UNION ALL
  SELECT 4, 'O4. la contrainte de l’offre',
    (SELECT count(*)::text FROM pg_constraint WHERE conrelid = 'public.yoppaa_deals'::regclass AND conname = 'yoppaa_deals_offre_panier_check'),
    '1'
  UNION ALL
  SELECT 5, 'O5. une contrainte de deal_type sans « panier » (doit être 0)',
    (SELECT count(*)::text FROM pg_constraint WHERE conrelid = 'public.yoppaa_deals'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%deal_type%' AND pg_get_constraintdef(oid) ILIKE '%prix_fixe%'
       AND pg_get_constraintdef(oid) NOT ILIKE '%panier%'
       AND conname NOT IN ('yoppaa_deals_prestation_type_check', 'yoppaa_deals_cible_tout_type_check')),
    '0'
  UNION ALL
  SELECT 6, 'O6. aucune promo existante touchée',
    (SELECT count(*)::text FROM public.yoppaa_deals WHERE deal_type = 'panier' OR offre_mode IS NOT NULL),
    '0'
) t ORDER BY n;
