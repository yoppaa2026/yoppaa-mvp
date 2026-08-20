-- ═══════════════════════════════════════════════════════════════════════════
-- LE VERROU : UN COMMERÇANT NON VALIDÉ N'ATTEINT PLUS SES DONNÉES
--
-- Demande d'Alex, 20/08 : « Je veux une vraie sécurité, pas de validation de ma
-- part, pas d'accès au DB. Si c'est un profil bidon, il a accès quel que soit
-- mon accord. Impossible de fonctionner comme ça. »
--
-- La garde d'écran posée dans `54dc6bd` arrête la personne qui ouvre son
-- navigateur, et personne d'autre : le jeton d'authentification permet
-- d'appeler Supabase directement. Cette migration pose la vraie barrière.
--
-- ⚠️ ELLE CORRIGE AUSSI DEUX FAILLES TROUVÉES EN CHEMIN, plus graves que le
-- sujet initial. Voir les parties 1 et 3.
--
-- ⚠️ RIEN N'EST RÉÉCRIT. On AJOUTE des policies `RESTRICTIVE`, qui se combinent
-- en ET avec les policies existantes. Réécrire les cinquante policies actuelles,
-- ce serait cinquante occasions de vider un écran en silence, exactement comme
-- le 03/08 avec les prestations. Le retour arrière est un simple DROP.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 0) ÉTAT DES LIEUX, À LIRE AVANT ────────────────────────────────────────
-- À garder : ces nombres sont la référence pour juger l'après.

SELECT statut, statut_publication, count(*) AS nb
FROM commercants GROUP BY statut, statut_publication ORDER BY nb DESC;

-- Les tables qui portent un commercant_id et qui vont donc être verrouillées.
SELECT c.table_name
FROM information_schema.columns c
JOIN information_schema.tables t
  ON t.table_schema = c.table_schema AND t.table_name = c.table_name
WHERE c.table_schema = 'public'
  AND c.column_name = 'commercant_id'
  AND t.table_type = 'BASE TABLE'
ORDER BY 1;

-- ⚠️ Une policy ne s'applique QUE si RLS est activée sur la table. Celles-ci
-- sont ouvertes à tous les vents, et la migration n'y changera rien.
SELECT c.relname AS table_sans_rls
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = false
ORDER BY 1;


-- ─── 1) 🔴 LA FAILLE BÉANTE ─────────────────────────────────────────────────
--
--   commercants | Gestion commercant | UPDATE | {public} | USING true
--
-- `{public}` en PostgreSQL n'est pas « les visiteurs », c'est TOUS LES RÔLES,
-- anonyme compris. Et `USING true` ne filtre aucune ligne. Aujourd'hui,
-- n'importe qui peut donc modifier la fiche de n'importe quel commerçant, et
-- notamment se poser lui-même `statut = 'valide'`.
--
-- ⚠️ TANT QUE CETTE POLICY EXISTE, TOUT LE RESTE DE CETTE MIGRATION EST INUTILE.
--
-- Vérifié avant de la retirer : aucune écriture légitime n'en dépend. Les
-- écritures du tableau de bord et du signup portent toutes sur la fiche du
-- propriétaire (couvertes par « Commercant modifie sa fiche »), l'écran admin
-- passe par « Admin Yoppaa modifie tout », et les routes API utilisent la clé
-- de service, qui ignore la RLS.

DROP POLICY IF EXISTS "Gestion commercant" ON commercants;


-- ─── 2) QUI EST BLOQUÉ ──────────────────────────────────────────────────────
-- ⚠️ FONCTION `SECURITY DEFINER`, ET SURTOUT PAS UNE SOUS-REQUÊTE DIRECTE.
-- Une sous-requête dans un USING est évaluée avec les droits de l'appelant :
-- si la table interrogée lui est fermée, elle rend zéro ligne SANS ERREUR et la
-- policy filtre tout. C'est le défaut du 03/08 (« aucune prestation
-- disponible »), et il ne se reproduira pas ici.
--
-- La fonction rend les commerces QUE JE POSSÈDE ET QUI NE SONT PAS OUVERTS.
-- Formulée en négatif à dessein : pour un client, pour un visiteur, pour un
-- commerçant validé, elle rend l'ensemble vide, donc la condition ci-dessous
-- est vraie et NE RESTREINT RIEN. Une policy RESTRICTIVE frappe tout le rôle
-- `authenticated`, clients compris : elle doit être neutre pour eux.

CREATE OR REPLACE FUNCTION public.mes_commerces_bloques()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM commercants
  WHERE auth_user_id = auth.uid()
    AND coalesce(statut, '') NOT IN ('valide', 'actif')
$$;

-- ⚠️ « valide » ET « actif ». `valide` est ce qu'écrit /api/admin/valider, mais
-- un compte en production porte `actif`, valeur posée à la main qui n'apparaît
-- nulle part dans le code. N'autoriser que `valide` le mettrait dehors.
-- Le relevé de la base a été lu avant d'écrire cette liste, jamais deviné.

GRANT EXECUTE ON FUNCTION public.mes_commerces_bloques() TO authenticated, anon;


-- ─── 3) 🔴 EMPÊCHER L'AUTO-VALIDATION ───────────────────────────────────────
--
-- Second trou, du même ordre : « Commercant modifie sa fiche » autorise le
-- propriétaire à modifier TOUTES LES COLONNES de sa ligne. La RLS travaille à
-- la LIGNE, pas à la colonne. Un commerçant pourrait donc se poser lui-même
-- `statut = 'valide'` et ouvrir sa propre porte.
--
-- Un déclencheur est la seule réponse propre. Il laisse passer :
--   • la clé de service (auth.uid() est NULL, aucun JWT) ;
--   • l'administrateur Yoppaa ;
--   • les transitions que le formulaire d'inscription fait légitimement,
--     c'est-à-dire soumettre son dossier et effacer un motif de rejet.

CREATE OR REPLACE FUNCTION public.commercants_colonnes_reservees()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Clé de service : pas de JWT, donc pas d'auth.uid(). Les routes API
  -- d'administration passent par là.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_yoppaa_admin() THEN
    RETURN NEW;
  END IF;

  -- `statut` n'appartient qu'à Yoppaa. Aucune exception.
  IF NEW.statut IS DISTINCT FROM OLD.statut THEN
    RAISE EXCEPTION 'Le statut du compte est décidé par Yoppaa (statut: % -> %)', OLD.statut, NEW.statut
      USING ERRCODE = '42501';
  END IF;

  -- `statut_publication` : le commerçant a le droit de SOUMETTRE son dossier
  -- (brouillon -> en_attente, ou re-soumission), jamais de le publier.
  IF NEW.statut_publication IS DISTINCT FROM OLD.statut_publication
     AND NEW.statut_publication <> 'en_attente' THEN
    RAISE EXCEPTION 'La publication de la fiche est décidée par Yoppaa (statut_publication: % -> %)', OLD.statut_publication, NEW.statut_publication
      USING ERRCODE = '42501';
  END IF;

  -- `kyb_statut` : il peut se remettre en attente d'examen, jamais se valider.
  IF NEW.kyb_statut IS DISTINCT FROM OLD.kyb_statut
     AND NEW.kyb_statut <> 'en_attente' THEN
    RAISE EXCEPTION 'La conformité est décidée par Yoppaa (kyb_statut: % -> %)', OLD.kyb_statut, NEW.kyb_statut
      USING ERRCODE = '42501';
  END IF;

  -- L'argent ne se décide pas non plus depuis le navigateur.
  IF NEW.billing_exempt IS DISTINCT FROM OLD.billing_exempt
     OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
     OR NEW.subscription_trial_end IS DISTINCT FROM OLD.subscription_trial_end
     OR NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id
     OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id THEN
    RAISE EXCEPTION 'Les colonnes de facturation sont réservées à Yoppaa'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_commercants_colonnes_reservees ON commercants;
CREATE TRIGGER trg_commercants_colonnes_reservees
  BEFORE UPDATE ON commercants
  FOR EACH ROW
  EXECUTE FUNCTION public.commercants_colonnes_reservees();


-- ─── 4) LE VERROU SUR LES DONNÉES ───────────────────────────────────────────
-- Une policy RESTRICTIVE par table portant un commercant_id. Elles s'ajoutent
-- aux policies existantes sans en modifier aucune.
--
-- ⚠️ SIX TABLES RESTENT OUVERTES, et ce n'est pas un oubli : ce sont celles que
-- le formulaire d'inscription écrit. Les verrouiller rendrait toute inscription
-- impossible, c'est-à-dire empêcherait précisément le travail qu'on demande au
-- commerçant de faire AVANT d'être validé.
--
-- ⚠️ `commercant_id IS NULL OR …` : en SQL, `NULL NOT IN (…)` vaut NULL, donc
-- faux, donc la ligne serait refusée. Une ligne orpheline n'a pas à être prise
-- pour une ligne interdite.

DO $$
DECLARE
  t record;
  ouvertes text[] := ARRAY[
    'commercants',            -- sa propre fiche, qu'il remplit
    'onboarding_commercants', -- l'avancement de son inscription
    'commercant_photos',      -- ses photos
    'kyb_documents',          -- ses pièces d'identité
    'logos',                  -- son logo
    'success_packs'           -- son éventuelle commande de matériel
  ];
BEGIN
  FOR t IN
    SELECT c.table_name AS nom
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'commercant_id'
      AND tb.table_type = 'BASE TABLE'
      AND NOT (c.table_name = ANY(ouvertes))
    ORDER BY 1
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS zz_commerce_ouvert ON public.%I', t.nom);
    EXECUTE format(
      'CREATE POLICY zz_commerce_ouvert ON public.%I'
      ' AS RESTRICTIVE FOR ALL TO authenticated'
      ' USING (commercant_id IS NULL OR commercant_id NOT IN (SELECT public.mes_commerces_bloques()))'
      ' WITH CHECK (commercant_id IS NULL OR commercant_id NOT IN (SELECT public.mes_commerces_bloques()))',
      t.nom);
    RAISE NOTICE 'verrou posé sur %', t.nom;
  END LOOP;
END $$;


-- ─── 4 bis) LES TABLES FILLES ───────────────────────────────────────────────
-- Elles ne portent pas de commercant_id : elles remontent à leur parent. La
-- boucle ci-dessus ne pouvait pas les deviner, on les nomme.
--
-- ⚠️ Sans elles, quelqu'un connaissant l'identifiant d'une ligne parente
-- pourrait encore lire ses enfants. Les identifiants sont des UUID, donc
-- indevinables, mais « difficile » n'est pas « impossible ».

-- Les lignes d'une commande, par la commande.
DROP POLICY IF EXISTS zz_commerce_ouvert ON public.commande_articles;
CREATE POLICY zz_commerce_ouvert ON public.commande_articles
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT EXISTS (SELECT 1 FROM commandes c
                     WHERE c.id = commande_articles.commande_id
                       AND c.commercant_id IN (SELECT public.mes_commerces_bloques())))
  WITH CHECK (NOT EXISTS (SELECT 1 FROM commandes c
                     WHERE c.id = commande_articles.commande_id
                       AND c.commercant_id IN (SELECT public.mes_commerces_bloques())));

-- Photos, versions et options, par l'article.
DO $$
DECLARE nom text;
BEGIN
  FOREACH nom IN ARRAY ARRAY['article_photos', 'article_variantes', 'article_options_groupes'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS zz_commerce_ouvert ON public.%I', nom);
    EXECUTE format(
      'CREATE POLICY zz_commerce_ouvert ON public.%I'
      ' AS RESTRICTIVE FOR ALL TO authenticated'
      ' USING (NOT EXISTS (SELECT 1 FROM articles a WHERE a.id = %I.article_id'
      '   AND a.commercant_id IN (SELECT public.mes_commerces_bloques())))'
      ' WITH CHECK (NOT EXISTS (SELECT 1 FROM articles a WHERE a.id = %I.article_id'
      '   AND a.commercant_id IN (SELECT public.mes_commerces_bloques())))',
      nom, nom, nom);
  END LOOP;
END $$;

-- Les valeurs d'options, par le groupe puis l'article.
DROP POLICY IF EXISTS zz_commerce_ouvert ON public.article_options_valeurs;
CREATE POLICY zz_commerce_ouvert ON public.article_options_valeurs
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT EXISTS (SELECT 1 FROM article_options_groupes g
                     JOIN articles a ON a.id = g.article_id
                     WHERE g.id = article_options_valeurs.groupe_id
                       AND a.commercant_id IN (SELECT public.mes_commerces_bloques())))
  WITH CHECK (NOT EXISTS (SELECT 1 FROM article_options_groupes g
                     JOIN articles a ON a.id = g.article_id
                     WHERE g.id = article_options_valeurs.groupe_id
                       AND a.commercant_id IN (SELECT public.mes_commerces_bloques())));

-- Les mouvements de fidélité, par la carte.
DROP POLICY IF EXISTS zz_commerce_ouvert ON public.fidelite_mouvements;
CREATE POLICY zz_commerce_ouvert ON public.fidelite_mouvements
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT EXISTS (SELECT 1 FROM fidelite_cartes fc
                     WHERE fc.id = fidelite_mouvements.carte_id
                       AND fc.commercant_id IN (SELECT public.mes_commerces_bloques())))
  WITH CHECK (NOT EXISTS (SELECT 1 FROM fidelite_cartes fc
                     WHERE fc.id = fidelite_mouvements.carte_id
                       AND fc.commercant_id IN (SELECT public.mes_commerces_bloques())));

-- Les mouvements de bons cadeaux, par le bon.
DROP POLICY IF EXISTS zz_commerce_ouvert ON public.bons_cadeaux_mouvements;
CREATE POLICY zz_commerce_ouvert ON public.bons_cadeaux_mouvements
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT EXISTS (SELECT 1 FROM bons_cadeaux b
                     WHERE b.id = bons_cadeaux_mouvements.bon_id
                       AND b.commercant_id IN (SELECT public.mes_commerces_bloques())))
  WITH CHECK (NOT EXISTS (SELECT 1 FROM bons_cadeaux b
                     WHERE b.id = bons_cadeaux_mouvements.bon_id
                       AND b.commercant_id IN (SELECT public.mes_commerces_bloques())));

-- La jonction prestations / praticiens, par la prestation.
DROP POLICY IF EXISTS zz_commerce_ouvert ON public.rdv_prestation_praticiens;
CREATE POLICY zz_commerce_ouvert ON public.rdv_prestation_praticiens
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT EXISTS (SELECT 1 FROM rdv_prestations p
                     WHERE p.id = rdv_prestation_praticiens.prestation_id
                       AND p.commercant_id IN (SELECT public.mes_commerces_bloques())))
  WITH CHECK (NOT EXISTS (SELECT 1 FROM rdv_prestations p
                     WHERE p.id = rdv_prestation_praticiens.prestation_id
                       AND p.commercant_id IN (SELECT public.mes_commerces_bloques())));


-- ─── 5) CONTRÔLES ───────────────────────────────────────────────────────────

-- a) La faille est bien fermée. Attendu : 0 ligne.
SELECT policyname, cmd, roles::text, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'commercants' AND policyname = 'Gestion commercant';

-- b) Les verrous sont posés. Attendu : une quarantaine de lignes, toutes
--    marquées permissive = false.
SELECT tablename, policyname, permissive
FROM pg_policies
WHERE schemaname = 'public' AND policyname = 'zz_commerce_ouvert'
ORDER BY tablename;

-- c) ⚠️ AUCUNE des six tables de l'inscription ne doit y figurer.
--    Attendu : 0 ligne. Si l'une apparaît, plus personne ne peut s'inscrire.
SELECT tablename
FROM pg_policies
WHERE schemaname = 'public' AND policyname = 'zz_commerce_ouvert'
  AND tablename IN ('commercants','onboarding_commercants','commercant_photos',
                    'kyb_documents','logos','success_packs');

-- d) Le déclencheur est en place. Attendu : 1 ligne.
SELECT tgname FROM pg_trigger
WHERE tgrelid = 'public.commercants'::regclass AND NOT tgisinternal
  AND tgname = 'trg_commercants_colonnes_reservees';

-- e) ⚠️ LE CONTRÔLE QUI COMPTE VRAIMENT, et il ne se fait pas en SQL.
--    Se connecter avec un VRAI compte non validé, depuis le navigateur, et
--    vérifier qu'aucune donnée ne remonte. Puis avec un compte validé, et
--    vérifier que TOUT remonte comme avant. Un SELECT lancé ici tourne en
--    `service_role` et ignore la RLS : il ne prouve rien.


-- ─── 6) RETOUR ARRIÈRE ──────────────────────────────────────────────────────
-- À garder sous la main. Si un écran se vide sans raison, on défait d'abord,
-- on comprend ensuite.
--
-- DO $$ DECLARE t record; BEGIN
--   FOR t IN SELECT tablename FROM pg_policies
--            WHERE schemaname='public' AND policyname='zz_commerce_ouvert' LOOP
--     EXECUTE format('DROP POLICY IF EXISTS zz_commerce_ouvert ON public.%I', t.tablename);
--   END LOOP;
-- END $$;
-- DROP TRIGGER IF EXISTS trg_commercants_colonnes_reservees ON commercants;
-- DROP FUNCTION IF EXISTS public.commercants_colonnes_reservees();
-- DROP FUNCTION IF EXISTS public.mes_commerces_bloques();
--
-- ⚠️ NE PAS recréer « Gestion commercant » : c'était une faille, pas une
-- fonctionnalité.
