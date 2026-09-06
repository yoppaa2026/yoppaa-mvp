-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_DEALS_REMISE_GLOBALE.sql
-- « -10 % sur tout », en une seule promotion.
--
-- CONTEXTE (Alex, 06/09). Un deal vise aujourd'hui UN article, UNE categorie ou
-- UNE prestation. Des soldes, un anniversaire, un Black Friday demandent donc
-- une promotion par categorie, et les articles SANS categorie sont oublies EN
-- SILENCE : `dealViseArticle` compare `categorie_cible` a `article.categorie`,
-- et `null` n'egale rien.
--
-- 🔴 ET « DEAL GENERAL » NE REMISE RIEN. Verifie en executant le module : il
-- rend `null`. C'est une ANNONCE sur la fiche, pas une promotion. Un commercant
-- qui le choisit en croyant remiser son magasin ne remise rien, et rien ne le
-- lui dit. On ne touche PAS a ce sens : le changer transformerait
-- retroactivement tous les deals generaux existants en remises globales, et un
-- changement de sens sur des donnees deja en base est le plus cher des
-- raccourcis. On ajoute une cible, on n'en detourne pas une.
--
-- ⚠️ DEUX PORTEES SEPAREES, DECISION D'ALEX : « tous mes produits » et « toutes
-- mes prestations ». Une seule option « tout mon commerce » ferait qu'un
-- coiffeur qui pense a ses shampoings braderait aussi ses coupes, et il le
-- decouvrirait sur sa premiere facture.
--
-- 🔴 ET SEULEMENT EN POURCENTAGE. « Tous mes produits a 5 EUR » n'est pas une
-- promotion, c'est une erreur de saisie qui brade le magasin. La contrainte
-- l'interdit en base, pas seulement a l'ecran.
--
-- ⚠️ CE QUE LA REMISE GLOBALE TOUCHE : tout ce qui a un PRIX, articles vitrine
-- et articles a variantes compris (arbitrage d'Alex, 06/09, contre ma premiere
-- proposition). Sauter une partie du catalogue en silence ferait MENTIR le
-- commercant sur sa propre fiche : le client verrait un article au prix plein
-- sous une banniere « -10 % sur tout ». Un article sans prix reste dehors, et
-- il l'est tout seul.
--
-- Aucune table creee. Les GRANT de `yoppaa_deals` sont poses au niveau de la
-- TABLE : le controle 5 le VERIFIE au lieu de le supposer.
--
-- Idempotente : re-executable sans effet de bord.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. La colonne ─────────────────────────────────────────────────────────
-- Un TEXTE et non deux booleens : « produits » et « prestations » s'excluent,
-- et deux booleens auraient permis de cocher les deux puis de se demander ce
-- que ca veut dire.
ALTER TABLE yoppaa_deals
  ADD COLUMN IF NOT EXISTS cible_tout text;

COMMENT ON COLUMN yoppaa_deals.cible_tout IS
  'Remise GLOBALE : « produits » = tout le catalogue, « prestations » = toutes les prestations de rendez-vous. Quatrieme cible possible, exclusive des trois autres. Reservee au type remise_pct : un prix fixe global braderait le magasin.';

ALTER TABLE yoppaa_deals DROP CONSTRAINT IF EXISTS yoppaa_deals_cible_tout_valeurs;

ALTER TABLE yoppaa_deals
  ADD CONSTRAINT yoppaa_deals_cible_tout_valeurs
  CHECK (cible_tout IS NULL OR cible_tout IN ('produits', 'prestations'));

-- ─── 2. Une seule cible, les QUATRE comprises ──────────────────────────────
-- Aucune ligne existante ne peut violer la nouvelle regle : `cible_tout` vient
-- de naitre et vaut NULL partout.
ALTER TABLE yoppaa_deals DROP CONSTRAINT IF EXISTS yoppaa_deals_cible_check;

ALTER TABLE yoppaa_deals
  ADD CONSTRAINT yoppaa_deals_cible_check
  CHECK (
    (CASE WHEN article_id      IS NOT NULL THEN 1 ELSE 0 END)
  + (CASE WHEN categorie_cible IS NOT NULL THEN 1 ELSE 0 END)
  + (CASE WHEN prestation_id   IS NOT NULL THEN 1 ELSE 0 END)
  + (CASE WHEN cible_tout      IS NOT NULL THEN 1 ELSE 0 END) <= 1
  );

-- ─── 3. Une remise globale est un POURCENTAGE, jamais un prix fixe ─────────
ALTER TABLE yoppaa_deals DROP CONSTRAINT IF EXISTS yoppaa_deals_cible_tout_type_check;

ALTER TABLE yoppaa_deals
  ADD CONSTRAINT yoppaa_deals_cible_tout_type_check
  CHECK (
    cible_tout IS NULL
    OR deal_type = 'remise_pct'
  );

-- ─── 4. La recherche des fiches ────────────────────────────────────────────
-- « Ce commercant a-t-il une remise globale aujourd'hui ? » est demande a
-- chaque affichage de sa fiche et de son catalogue.
CREATE INDEX IF NOT EXISTS idx_yoppaa_deals_cible_tout
  ON yoppaa_deals (commercant_id, cible_tout)
  WHERE cible_tout IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════════════════
-- CONTROLE — une ligne par verification, la valeur ET l'attendu, tout en text
-- ═══════════════════════════════════════════════════════════════════════════
SELECT '1. colonne cible_tout'::text AS controle,
       coalesce((SELECT data_type FROM information_schema.columns
                 WHERE table_name = 'yoppaa_deals' AND column_name = 'cible_tout'), 'ABSENTE')::text AS valeur,
       'text'::text AS attendu
UNION ALL
SELECT '2. seules deux valeurs acceptees'::text,
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_constraint
         WHERE conname = 'yoppaa_deals_cible_tout_valeurs'
           AND pg_get_constraintdef(oid) LIKE '%produits%'
           AND pg_get_constraintdef(oid) LIKE '%prestations%'
       ) THEN 'oui' ELSE 'NON' END::text,
       'oui'::text
UNION ALL
SELECT '3. contrainte cible unique couvre les 4'::text,
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_constraint
         WHERE conname = 'yoppaa_deals_cible_check'
           AND pg_get_constraintdef(oid) LIKE '%cible_tout%'
           AND pg_get_constraintdef(oid) LIKE '%prestation_id%'
           AND pg_get_constraintdef(oid) LIKE '%categorie_cible%'
           AND pg_get_constraintdef(oid) LIKE '%article_id%'
       ) THEN 'oui' ELSE 'NON' END::text,
       'oui'::text
UNION ALL
SELECT '4. une remise globale est un pourcentage'::text,
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_constraint
         WHERE conname = 'yoppaa_deals_cible_tout_type_check'
       ) THEN 'oui' ELSE 'NON' END::text,
       'oui'::text
UNION ALL
-- 🔴 LE CONTROLE QUI COMPTE. Si les droits etaient poses COLONNE PAR COLONNE,
-- la colonne neuve serait invisible en lecture : la remise existerait en base
-- et ne s'appliquerait nulle part, sans une seule erreur.
SELECT '5. anon et authenticated lisent la colonne neuve'::text,
       (SELECT count(DISTINCT grantee)::text
          FROM information_schema.column_privileges
         WHERE table_name = 'yoppaa_deals'
           AND column_name = 'cible_tout'
           AND privilege_type = 'SELECT'
           AND grantee IN ('anon', 'authenticated'))::text,
       '2'::text
UNION ALL
SELECT '6. index de recherche'::text,
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_indexes
         WHERE tablename = 'yoppaa_deals' AND indexname = 'idx_yoppaa_deals_cible_tout'
       ) THEN 'oui' ELSE 'NON' END::text,
       'oui'::text
UNION ALL
SELECT '7. aucun deal existant ne vise deux cibles'::text,
       (SELECT count(*)::text FROM yoppaa_deals
         WHERE (CASE WHEN article_id      IS NOT NULL THEN 1 ELSE 0 END)
             + (CASE WHEN categorie_cible IS NOT NULL THEN 1 ELSE 0 END)
             + (CASE WHEN prestation_id   IS NOT NULL THEN 1 ELSE 0 END)
             + (CASE WHEN cible_tout      IS NOT NULL THEN 1 ELSE 0 END) > 1)::text,
       '0'::text
UNION ALL
-- ⚠️ CE QUE LA MIGRATION NE CORRIGE PAS, ET QU'IL FAUT VOIR. Ces deals-la
-- portent une remise et ne visent RIEN : ils ne remisent rien aujourd'hui, et
-- ils continueront de ne rien remiser. Ce sont des annonces, volontaires ou
-- non, et c'est l'ecran qui devra proposer de les rattacher.
SELECT '8. remises actives sans aucune cible (annonces)'::text,
       (SELECT count(*)::text FROM yoppaa_deals
         WHERE actif = true
           AND deal_type IN ('remise_pct', 'prix_fixe')
           AND article_id IS NULL AND categorie_cible IS NULL
           AND prestation_id IS NULL AND cible_tout IS NULL)::text,
       'a regarder : elles ne remisent rien'::text;
