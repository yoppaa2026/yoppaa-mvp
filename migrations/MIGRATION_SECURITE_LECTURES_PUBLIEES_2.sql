-- ═══════════════════════════════════════════════════════════════════════════
-- SÉCURITÉ — 21/08/2026 — LA FUITE DE PUBLICATION, LES TROIS DERNIÈRES TABLES
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ À PASSER APRÈS MIGRATION_SECURITE_LECTURES_PUBLIEES.sql, qui a créé la
--    fonction `commerces_publies()` dont ce fichier se sert.
--
-- Même défaut que sur les tables `rdv_*`, sur les trois qui restaient :
--
--   actualites        | Tout le monde lit les actualites     | SELECT | true
--   yoppaa_deals      | Tout le monde lit les deals          | SELECT | true
--   yoppaa_deals      | lecture publique deals               | SELECT | true
--   commercant_photos | Lecture publique photos commercants  | SELECT | true
--   commercant_photos | lecture publique photos              | SELECT | true
--
-- `USING true` ne filtre rien : les actualités, les deals et les photos d'un
-- commerçant qui attend encore sa validation sont lisibles par n'importe qui
-- avec la clé anon, celle qui est dans le bundle JavaScript.
--
-- ⚠️ JE L'AVAIS QUALIFIÉE DE « MINEURE », ET C'EST ALEX QUI M'A RELANCÉ. Elle
-- l'est en effet moins que le catalogue de prestations : ce sont des contenus
-- faits pour être vus. Mais « moins grave » n'est pas « à laisser ».
-- Voir feedback_tout_traiter_jamais_amateur.
--
-- ⚠️ COLONNES VÉRIFIÉES AVANT D'ÉCRIRE, dans le code qui interroge ces tables
-- tous les jours : les trois portent bien un `commercant_id`. Les migrations,
-- elles, ne me l'ont pas dit — plusieurs de ces tables ont été créées dans
-- l'interface Supabase, et sont donc invisibles au dépôt.


-- ─── 1) UNE SEULE FORME, POUR LES TROIS ────────────────────────────────────
--
-- ⚠️ LA CONDITION A DEUX BRANCHES, ET LA SECONDE EST CE QUI REND CE FICHIER
-- SANS DANGER POUR LE TABLEAU DE BORD.
--
--   • branche PUBLIQUE : le commerce est publié → tout le monde voit.
--   • branche PROPRIÉTAIRE : c'est mon commerce → je vois, publié ou non.
--
-- Sans la seconde, un commerçant en attente de validation ne verrait plus ses
-- propres actualités depuis son tableau de bord, et l'écran serait vide SANS
-- ERREUR. C'est précisément la panne du 03/08, et je ne la reproduis pas.
--
-- ⚠️ La sous-requête sur `commercants` est ici SANS RISQUE, contrairement à
-- celles qui ont tué les policies `rdv_*` : elle n'est évaluée que pour un
-- appelant authentifié, qui a le droit de lire SA propre ligne
-- (`commercant_select_own`). Pour `anon`, `auth.uid()` est NULL, l'ensemble est
-- vide, la branche est simplement fausse et la première décide seule.

-- ACTUALITÉS
DROP POLICY IF EXISTS "Tout le monde lit les actualites" ON actualites;
CREATE POLICY "actualites_lecture_publique" ON actualites
  FOR SELECT TO anon, authenticated
  USING (
    commercant_id IN (SELECT public.commerces_publies())
    OR commercant_id IN (SELECT id FROM commercants WHERE auth_user_id = auth.uid())
  );

-- DEALS
DROP POLICY IF EXISTS "Tout le monde lit les deals" ON yoppaa_deals;
DROP POLICY IF EXISTS "lecture publique deals"      ON yoppaa_deals;
CREATE POLICY "deals_lecture_publique" ON yoppaa_deals
  FOR SELECT TO anon, authenticated
  USING (
    commercant_id IN (SELECT public.commerces_publies())
    OR commercant_id IN (SELECT id FROM commercants WHERE auth_user_id = auth.uid())
  );

-- PHOTOS DU COMMERCE
DROP POLICY IF EXISTS "Lecture publique photos commercants" ON commercant_photos;
DROP POLICY IF EXISTS "lecture publique photos"             ON commercant_photos;
CREATE POLICY "photos_lecture_publique" ON commercant_photos
  FOR SELECT TO anon, authenticated
  USING (
    commercant_id IN (SELECT public.commerces_publies())
    OR commercant_id IN (SELECT id FROM commercants WHERE auth_user_id = auth.uid())
  );


-- ─── 2) CONTRÔLES ──────────────────────────────────────────────────────────

-- a) Attendu : 3 lignes, UNE par table, et chaque `using_clause` mentionne
--    `commerces_publies`.
--    ⚠️ S'il en apparaît une quatrième en `USING true`, la nouvelle policy est
--    annulée par elle : les permissives se combinent en OU.
SELECT tablename, policyname, roles::text, qual AS using_clause
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('actualites', 'yoppaa_deals', 'commercant_photos')
   AND cmd = 'SELECT'
 ORDER BY tablename, policyname;

-- b) Attendu : 0 ligne. Plus aucune lecture publique sans filtre sur ces trois.
SELECT tablename, policyname
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('actualites', 'yoppaa_deals', 'commercant_photos')
   AND cmd = 'SELECT'
   AND coalesce(qual, 'true') = 'true';


-- ─── 3) 🔴 LE TEST, ET IL NE SE FAIT PAS EN SQL ────────────────────────────
--
-- ⚠️ L'éditeur Supabase tourne en clé de service et ignore la RLS.
--
-- 1. NAVIGATION PRIVÉE, fiche d'un commerce de démonstration publié :
--    ses photos, ses actualités et ses deals doivent s'afficher.
-- 2. CONNECTÉ SUR TON TABLEAU DE BORD, onglets Actus et Bonnes affaires :
--    tes contenus doivent être là, y compris sur un commerce non publié.
--
-- Le second point est celui qui compte : c'est la branche propriétaire.
-- Si elle manque, l'écran est vide sans message.


-- ─── 4) RETOUR ARRIÈRE ─────────────────────────────────────────────────────
--
-- DROP POLICY IF EXISTS "actualites_lecture_publique" ON actualites;
-- CREATE POLICY "Tout le monde lit les actualites" ON actualites
--   FOR SELECT TO anon, authenticated USING (true);
--
-- DROP POLICY IF EXISTS "deals_lecture_publique" ON yoppaa_deals;
-- CREATE POLICY "Tout le monde lit les deals" ON yoppaa_deals
--   FOR SELECT TO anon, authenticated USING (true);
-- CREATE POLICY "lecture publique deals" ON yoppaa_deals
--   FOR SELECT TO public USING (true);
--
-- DROP POLICY IF EXISTS "photos_lecture_publique" ON commercant_photos;
-- CREATE POLICY "Lecture publique photos commercants" ON commercant_photos
--   FOR SELECT TO anon, authenticated USING (true);
-- CREATE POLICY "lecture publique photos" ON commercant_photos
--   FOR SELECT TO public USING (true);


-- ─── 5) CE QUI RESTE, ET C'EST DIT ─────────────────────────────────────────
--
-- Le CATALOGUE d'articles se lit lui aussi sans filtre de publication :
-- `articles`, `article_photos`, `article_variantes`, `article_stock_jour`,
-- `article_options_groupes`, `article_options_valeurs`, plus `creneaux`,
-- `commercant_lieux` et `fermetures_exceptionnelles`.
--
-- ⚠️ CE N'EST PAS UN OUBLI, C'EST UN ARBITRAGE DE RISQUE. Ces tables sont sur
-- le chemin de COMMANDE, le plus fréquenté de l'application, et trois d'entre
-- elles n'ont pas de `commercant_id` direct (elles pendent d'un article). Une
-- migration qui toucherait neuf tables d'un coup ne se diagnostiquerait plus
-- quand un écran se vide.
--
-- Elles se traitent en dernier, ensemble, avec un test de commande complet
-- derrière. Inscrit dans la todo, pas dissous dans la conversation.
