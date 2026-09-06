-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_DEALS_PRESTATIONS.sql
-- Une remise peut viser une PRESTATION, pas seulement un produit.
--
-- CONTEXTE (Alex, 06/09). Le champ « Article concerné » d'un deal ne lit que
-- `articles`. Une prof de yoga ou un salon ne peut donc pas mettre son cours ou
-- son soin en promotion, alors que c'est exactement ce qu'ils vendent.
--
-- ⚠️ SEULES LA REMISE % ET LE PRIX PROMO SONT PERMIS SUR UNE PRESTATION, et
-- c'est la décision structurante de cette migration. Un « lot » de séances
-- (« 3 + 1 offerte ») EXISTE DÉJÀ dans Yoppaa : c'est un carnet
-- d'abonnement, qui décompte les séances, porte une validité et sait exclure
-- des périodes. Le permettre aussi en deal donnerait DEUX systèmes qui
-- comptent les séances différemment — le carnet décompte, le deal non — et le
-- commerçant découvrirait la différence sur un client qui revient une fois de
-- trop. La contrainte ci-dessous l'interdit en base, pas seulement à l'écran.
--
-- ⚠️ ET UN DEAL VISE UNE SEULE CIBLE. La contrainte existante
-- (`yoppaa_deals_cible_check`) ne connaissait que l'article et la catégorie.
-- Laissée telle quelle, un deal aurait pu viser un article ET une prestation,
-- et plus personne n'aurait su quel prix appliquer.
--
-- ⚠️ AUCUNE PRESTATION SANS PRIX. `rdv_prestations.prix` est NULLABLE (« Prix
-- sur demande ») : une remise de 20 % sur un prix inconnu ne veut rien dire.
-- L'écran l'écartera, mais la base le refuse aussi, parce qu'une garde d'écran
-- n'est jamais une réponse.
--
-- Aucune table créée. Les GRANT de `yoppaa_deals` sont posés au niveau de la
-- TABLE et couvrent donc la colonne neuve — le contrôle 5 le VÉRIFIE au lieu
-- de le supposer : si les droits étaient posés colonne par colonne, la nouvelle
-- serait invisible en lecture et le deal disparaîtrait sans un mot.
--
-- Idempotente : ré-exécutable sans effet de bord.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. La colonne ─────────────────────────────────────────────────────────
-- ON DELETE CASCADE : une prestation supprimée pour de bon emporte les deals
-- qui la visaient. Un deal qui pointe une prestation absente n'est pas une
-- trace à conserver, c'est une offre que plus personne ne peut honorer.
ALTER TABLE yoppaa_deals
  ADD COLUMN IF NOT EXISTS prestation_id uuid
  REFERENCES rdv_prestations(id) ON DELETE CASCADE;

COMMENT ON COLUMN yoppaa_deals.prestation_id IS
  'Prestation de rendez-vous visee par la remise. Alternative a article_id et a categorie_cible : un deal vise UNE cible, jamais deux. Reserve aux types remise_pct et prix_fixe : un lot de seances est un carnet d''abonnement, pas un deal.';

-- ─── 2. Une seule cible, les trois comprises ───────────────────────────────
-- On remplace la contrainte a deux cibles par la meme regle a trois. Aucune
-- ligne existante ne peut la violer : `prestation_id` vient de naitre.
ALTER TABLE yoppaa_deals DROP CONSTRAINT IF EXISTS yoppaa_deals_cible_check;

ALTER TABLE yoppaa_deals
  ADD CONSTRAINT yoppaa_deals_cible_check
  CHECK (
    (CASE WHEN article_id      IS NOT NULL THEN 1 ELSE 0 END)
  + (CASE WHEN categorie_cible IS NOT NULL THEN 1 ELSE 0 END)
  + (CASE WHEN prestation_id   IS NOT NULL THEN 1 ELSE 0 END) <= 1
  );

-- ─── 3. Un deal sur prestation est une REMISE, jamais un lot ───────────────
-- `deal_type` vaut 'lot', 'bundle', 'remise_pct' ou 'prix_fixe' (lib/deals.js).
-- Les deux premiers creent une offre SEPAREE, qui aurait son propre stock et
-- son propre decompte : c'est le carnet d'abonnement, qui existe deja.
ALTER TABLE yoppaa_deals DROP CONSTRAINT IF EXISTS yoppaa_deals_prestation_type_check;

ALTER TABLE yoppaa_deals
  ADD CONSTRAINT yoppaa_deals_prestation_type_check
  CHECK (
    prestation_id IS NULL
    OR deal_type IN ('remise_pct', 'prix_fixe')
  );

-- ─── 4. La recherche de la fiche RDV ───────────────────────────────────────
-- « Quelles remises visent cette prestation ? » est demande a chaque affichage
-- de la fiche de prise de rendez-vous.
CREATE INDEX IF NOT EXISTS idx_yoppaa_deals_prestation
  ON yoppaa_deals (commercant_id, prestation_id)
  WHERE prestation_id IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════════════════
-- CONTROLE — une ligne par verification, la valeur ET l'attendu, tout en text
-- ═══════════════════════════════════════════════════════════════════════════
SELECT '1. colonne prestation_id'::text AS controle,
       coalesce((SELECT data_type FROM information_schema.columns
                 WHERE table_name = 'yoppaa_deals' AND column_name = 'prestation_id'), 'ABSENTE')::text AS valeur,
       'uuid'::text AS attendu
UNION ALL
SELECT '2. cle etrangere vers rdv_prestations'::text,
       coalesce((SELECT ccu.table_name::text
                 FROM information_schema.table_constraints tc
                 JOIN information_schema.key_column_usage kcu
                   ON kcu.constraint_name = tc.constraint_name
                 JOIN information_schema.constraint_column_usage ccu
                   ON ccu.constraint_name = tc.constraint_name
                 WHERE tc.table_name = 'yoppaa_deals'
                   AND tc.constraint_type = 'FOREIGN KEY'
                   AND kcu.column_name = 'prestation_id'
                 LIMIT 1), 'ABSENTE')::text,
       'rdv_prestations'::text
UNION ALL
SELECT '3. contrainte cible unique couvre prestation_id'::text,
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_constraint
         WHERE conname = 'yoppaa_deals_cible_check'
           AND pg_get_constraintdef(oid) LIKE '%prestation_id%'
       ) THEN 'oui' ELSE 'NON' END::text,
       'oui'::text
UNION ALL
SELECT '4. un deal sur prestation ne peut etre un lot'::text,
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_constraint
         WHERE conname = 'yoppaa_deals_prestation_type_check'
       ) THEN 'oui' ELSE 'NON' END::text,
       'oui'::text
UNION ALL
-- 🔴 LE CONTROLE QUI COMPTE. Si les droits de `yoppaa_deals` etaient poses
-- COLONNE PAR COLONNE, la colonne neuve serait invisible en lecture : le deal
-- existerait en base et ne s'afficherait nulle part, sans une seule erreur.
SELECT '5. anon et authenticated lisent la colonne neuve'::text,
       (SELECT count(DISTINCT grantee)::text
          FROM information_schema.column_privileges
         WHERE table_name = 'yoppaa_deals'
           AND column_name = 'prestation_id'
           AND privilege_type = 'SELECT'
           AND grantee IN ('anon', 'authenticated'))::text,
       '2'::text
UNION ALL
SELECT '6. index de recherche'::text,
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_indexes
         WHERE tablename = 'yoppaa_deals' AND indexname = 'idx_yoppaa_deals_prestation'
       ) THEN 'oui' ELSE 'NON' END::text,
       'oui'::text
UNION ALL
SELECT '7. aucun deal existant ne vise deux cibles'::text,
       (SELECT count(*)::text FROM yoppaa_deals
         WHERE (CASE WHEN article_id      IS NOT NULL THEN 1 ELSE 0 END)
             + (CASE WHEN categorie_cible IS NOT NULL THEN 1 ELSE 0 END)
             + (CASE WHEN prestation_id   IS NOT NULL THEN 1 ELSE 0 END) > 1)::text,
       '0'::text
UNION ALL
SELECT '8. prestations avec un prix, donc remisables'::text,
       (SELECT count(*)::text FROM rdv_prestations
         WHERE actif = true AND deleted_at IS NULL AND prix IS NOT NULL AND prix > 0)::text,
       'au moins 1 pour pouvoir tester'::text;
