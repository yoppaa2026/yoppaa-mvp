-- ═══════════════════════════════════════════════════════════════════════════
-- SÉCURITÉ — 21/08/2026 — LES COLONNES QUE LA RLS NE SAIT PAS PROTÉGER
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ LA RLS TRAVAILLE À LA LIGNE, PAS À LA COLONNE. Une policy
-- `USING (c'est bien ma ligne)` autorise à réécrire TOUTES les colonnes de
-- cette ligne. C'est le même défaut, découvert une troisième fois aujourd'hui :
--
--   • `commercants`        → corrigé le 20/08 (trg_commercants_colonnes_reservees)
--   • `avis`               → ce fichier, partie 1
--   • `rdv_reservations`   → ce fichier, partie 2
--
-- Un `WITH CHECK` ne peut rien ici : une policy ne sait pas comparer à
-- l'ancienne ligne. Seul un déclencheur voit OLD et NEW.
--
-- ⚠️ CE FICHIER NE TOUCHE PAS AUX POLICIES DE LECTURE. Voir la note en fin de
-- fichier : le `DROP` que j'allais proposer aurait éteint la réservation
-- publique.


-- ─── 1) 🔴 UN COMMERÇANT POUVAIT RÉÉCRIRE LES AVIS, PAS SEULEMENT Y RÉPONDRE ─
--
--   avis | commercant_update_own_avis_reponse | UPDATE
--        | USING (commercant_id IN (SELECT id FROM commercants WHERE auth_user_id = auth.uid()))
--        | with_check = —
--
-- Le nom de la policy dit « réponse ». Sa portée dit « toute la ligne ». Un
-- commerçant pouvait donc changer la NOTE et le COMMENTAIRE que sa cliente a
-- écrits : un 1 étoile devient un 5 étoiles, et le texte devient ce qu'il veut.
-- Personne ne s'en apercevrait, pas même l'autrice de l'avis.
--
-- ⚠️ Sur un produit dont la crédibilité repose sur des avis honnêtes, celui-là
-- ne se voit pas seulement en interne : il se voit de l'extérieur, le jour où
-- quelqu'un compare ce qu'il a écrit à ce qui est affiché.
--
-- ⚠️ VÉRIFIÉ AVANT D'ÉCRIRE : le tableau de bord n'écrit QU'UNE colonne,
-- `reponse_commercant` (`app/dashboard/ConfigDashboard.js`). Le déclencheur
-- ci-dessous gèle donc tout le reste, et ne change rien à l'usage réel.

CREATE OR REPLACE FUNCTION public.avis_colonnes_reservees()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  avant jsonb := to_jsonb(OLD);
  apres jsonb := to_jsonb(NEW);
  col   text;
BEGIN
  -- Clé de service : aucun JWT, donc aucun auth.uid(). Les routes API passent ici.
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF public.is_yoppaa_admin() THEN RETURN NEW; END IF;

  -- Le commerçant RÉPOND. Il ne corrige pas la note, il ne réécrit pas le texte.
  IF EXISTS (
    SELECT 1 FROM commercants c
     WHERE c.id = NEW.commercant_id AND c.auth_user_id = auth.uid()
  ) THEN
    FOR col IN SELECT jsonb_object_keys(avant) LOOP
      IF col <> 'reponse_commercant'
         AND (apres -> col) IS DISTINCT FROM (avant -> col) THEN
        RAISE EXCEPTION 'Un commerçant répond à un avis, il ne le réécrit pas (colonne « % »)', col
          USING ERRCODE = '42501';
      END IF;
    END LOOP;
    RETURN NEW;
  END IF;

  -- L'autrice de l'avis : elle corrige son texte et sa note dans les 24 heures,
  -- ce que la policy autorise déjà. Elle ne touche pas à la réponse du
  -- commerçant ni au rattachement de l'avis.
  FOREACH col IN ARRAY ARRAY['reponse_commercant', 'commercant_id', 'client_id', 'commande_id'] LOOP
    IF jsonb_exists(avant, col)
       AND (apres -> col) IS DISTINCT FROM (avant -> col) THEN
      RAISE EXCEPTION 'Cette colonne d''un avis ne se modifie pas depuis le navigateur (« % »)', col
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_avis_colonnes_reservees ON avis;
CREATE TRIGGER trg_avis_colonnes_reservees
  BEFORE UPDATE ON avis
  FOR EACH ROW
  EXECUTE FUNCTION public.avis_colonnes_reservees();


-- ─── 2) 🔴 UNE CLIENTE POUVAIT DÉCLARER SON RENDEZ-VOUS PAYÉ ────────────────
--
--   rdv_reservations | Client peut annuler son RDV | UPDATE TO authenticated
--        | USING (client_id IN (mes fiches client) AND statut = 'confirme')
--        | WITH CHECK (statut IN ('confirme', 'annule_client'))
--
-- Le `WITH CHECK` ne contraint QUE `statut`. Toutes les autres colonnes de sa
-- propre réservation étaient libres : se poser `acompte_paye = true`, mettre
-- `prix_estime` à zéro, remplir les colonnes d'encaissement, déplacer l'heure.
--
-- L'écran ajouté le 17/08 pour dire au commerçant s'il doit réclamer de
-- l'argent lit précisément ces colonnes, et l'export TVA belge aussi.
--
-- La migration d'origine documentait le trou elle-même : « RLS ne peut pas
-- restreindre par colonne. Pour MVP : se reposer sur l'app. » La fonction de
-- remplacement prévue pour la V2 n'a jamais été écrite.
--
-- ⚠️ ON COMPARE PAR JSON, colonne par colonne, et on saute celles qui
-- n'existent pas (`jsonb_exists`). Nommer en dur une colonne absente ferait
-- échouer TOUTES les mises à jour de rendez-vous, ce qui est bien pire que le
-- défaut qu'on corrige.

CREATE OR REPLACE FUNCTION public.rdv_colonnes_reservees()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  avant  jsonb := to_jsonb(OLD);
  apres  jsonb := to_jsonb(NEW);
  col    text;
  gelees text[];
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF public.is_yoppaa_admin() THEN RETURN NEW; END IF;

  IF EXISTS (
    SELECT 1 FROM commercants c
     WHERE c.id = NEW.commercant_id AND c.auth_user_id = auth.uid()
  ) THEN
    -- LE COMMERÇANT fait son métier : il honore, il annule, il encaisse au
    -- comptoir, il déplace un rendez-vous. Mais un paiement en ligne est écrit
    -- par Stripe, et par lui seul.
    gelees := ARRAY[
      'acompte_paye_en_ligne', 'stripe_payment_intent_id', 'stripe_refund_id',
      'commercant_id', 'client_id'
    ];
  ELSE
    -- LA CLIENTE annule. Elle ne facture pas, elle ne s'auto-déplace pas.
    gelees := ARRAY[
      'prix_estime', 'acompte_paye', 'acompte_paye_en_ligne', 'acompte_montant',
      'stripe_payment_intent_id', 'stripe_refund_id', 'tva_taux',
      'encaisse_mode', 'encaisse_montant', 'encaisse_le',
      'date_rdv', 'heure_debut', 'heure_fin',
      'commercant_id', 'client_id', 'prestation_id', 'abonnement_id'
    ];
  END IF;

  FOREACH col IN ARRAY gelees LOOP
    IF jsonb_exists(avant, col)
       AND (apres -> col) IS DISTINCT FROM (avant -> col) THEN
      RAISE EXCEPTION 'Cette colonne d''un rendez-vous ne se modifie pas depuis le navigateur (« % »)', col
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_rdv_colonnes_reservees ON rdv_reservations;
CREATE TRIGGER trg_rdv_colonnes_reservees
  BEFORE UPDATE ON rdv_reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.rdv_colonnes_reservees();


-- ─── 3) CONTRÔLES ──────────────────────────────────────────────────────────

-- a) Attendu : 2 lignes, trg_avis_colonnes_reservees et trg_rdv_colonnes_reservees.
SELECT c.relname AS "table", t.tgname AS declencheur
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
 WHERE t.tgname IN ('trg_avis_colonnes_reservees', 'trg_rdv_colonnes_reservees')
 ORDER BY 1;

-- b) Attendu : 3 lignes. Les trois tables de la même famille sont désormais
--    protégées à la colonne, et c'est la liste à relire le jour où une
--    quatrième table reçoit une policy « USING (c'est ma ligne) ».
SELECT c.relname AS "table", t.tgname AS declencheur
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
 WHERE t.tgname LIKE '%colonnes_reservees'
 ORDER BY 1;


-- ─── 4) ⚠️ CE QUE JE N'AI PAS MIS ICI, ET POURQUOI ─────────────────────────
--
-- J'ai failli ajouter sept `DROP POLICY` pour supprimer des policies de lecture
-- trop larges qui neutralisent des policies plus strictes (le OU des
-- permissives), sur `rdv_prestations`, `rdv_creneaux`, `rdv_fermetures`,
-- `rdv_prestation_praticiens`, `commercant_photos`, `yoppaa_deals` et
-- `article_options_*`. La fuite est réelle : le catalogue d'un commerçant pas
-- encore validé est lisible publiquement.
--
-- ⚠️ MAIS CE `DROP` AURAIT ÉTEINT LA RÉSERVATION PUBLIQUE, et le relevé le
-- prouve. Les policies « strictes » contiennent
-- `EXISTS (SELECT 1 FROM commercants c WHERE …)`, et une sous-requête dans un
-- `USING` est évaluée AVEC LES DROITS DE L'APPELANT. Or `commercants` n'a
-- AUCUNE policy de lecture pour `anon` : pour un visiteur anonyme, ce EXISTS
-- rend faux, sans erreur. Les policies larges ne sont pas un oubli, ce sont
-- les rustines posées le 03/08 justement parce que les strictes rendaient zéro
-- ligne. Les retirer reproduirait la panne à l'identique.
--
-- Le vrai remède est une fonction `SECURITY DEFINER` qui liste les commerces
-- publiés, comme `mes_commerces_bloques()` le fait depuis le 20/08 :
--
--   CREATE FUNCTION public.commerces_publies() RETURNS SETOF uuid
--     LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
--     AS $$ SELECT id FROM commercants WHERE statut_publication = 'publie' $$;
--
-- puis réécrire chaque policy large avec
-- `commercant_id IN (SELECT public.commerces_publies())`, et supprimer les
-- strictes devenues inutiles.
--
-- ⚠️ Cela touche le chemin de réservation du client, donc ça se teste dans un
-- NAVIGATEUR avant d'être posé, pas après. C'est le sujet d'une troisième
-- migration, pas un ajout de fin de fichier.


-- ─── 5) RETOUR ARRIÈRE ─────────────────────────────────────────────────────
--
-- DROP TRIGGER IF EXISTS trg_avis_colonnes_reservees ON avis;
-- DROP FUNCTION IF EXISTS public.avis_colonnes_reservees();
-- DROP TRIGGER IF EXISTS trg_rdv_colonnes_reservees ON rdv_reservations;
-- DROP FUNCTION IF EXISTS public.rdv_colonnes_reservees();
