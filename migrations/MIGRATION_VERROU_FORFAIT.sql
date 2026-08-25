-- ════════════════════════════════════════════════════════════════════════════
-- VERROU SUR LE FORFAIT — `commercants.plan` n'est plus en libre-service
--
-- 🔴 LA FAILLE
--
-- `commercants.plan` est l'entrée de canDo() : c'est cette colonne, et elle
-- seule, qui décide de ce qu'un commerçant a le droit de faire. Or la RLS
-- travaille à la LIGNE et pas à la COLONNE : la policy « Commercant modifie sa
-- fiche » l'autorise à modifier TOUTES les colonnes de SA ligne.
--
-- Le déclencheur `commercants_colonnes_reservees` (migration du 21/08) ferme
-- déjà statut, statut_publication, kyb_statut et les colonnes de facturation.
-- `plan` n'y figurait pas. Depuis la console de son navigateur, un commerçant
-- en Exister pouvait donc écrire :
--
--     supabase.from('commercants').update({ plan: 'vendre' }).eq('id', …)
--
-- et obtenir le paiement en ligne, le Click & Collect, les rendez-vous, la
-- fidélité, la comptabilité et l'IA avancée. Gratuitement, définitivement.
-- Aucun contrôle serveur ne le rattrape : ils lisent tous cette même colonne.
--
-- ⚠️ Le trou est INVISIBLE aujourd'hui, puisque la dégustation donne tout à
-- tout le monde jusqu'au 9 janvier. Le 9 janvier au matin, cette colonne
-- devient la seule chose entre le gratuit et le payant. Elle se ferme
-- maintenant, pas ce jour-là.
--
-- ─── LE CONTRÔLE EN QUATRE QUESTIONS ────────────────────────────────────────
--
--  1. QUI peut écrire cette colonne ? Le propriétaire de la ligne, via la
--     policy UPDATE. Après cette migration : personne depuis un navigateur.
--  2. QUE peut-il écrire ? N'importe laquelle des trois valeurs, et même une
--     valeur hors matrice. Après : rien, l'écriture est refusée.
--  3. D'OÙ vient la valeur légitime ? De l'INSERT du signup (le commerçant
--     CHOISIT sa formule à l'étape 1), du webhook Stripe et des relances de
--     facturation. Les deux derniers passent par la clé de service, sans JWT,
--     donc auth.uid() est NULL et le déclencheur les laisse passer.
--  4. QU'EST-CE QUI CASSE si je ferme ? Vérifié fichier par fichier :
--     aucune mise à jour de `plan` depuis le navigateur, ni au tableau de
--     bord, ni au signup. `handleUpgrade` appelle /api/stripe/billing/checkout
--     et c'est le WEBHOOK qui écrit la colonne, après paiement.
--
-- ⚠️ L'INSERT reste ouvert, et c'est voulu : c'est ainsi que le commerçant
-- choisit sa formule en s'inscrivant. Un déclencheur BEFORE UPDATE ne protège
-- PAS l'INSERT (piège consigné le 21/08), mais ici l'INSERT n'a rien à
-- protéger : la ligne n'existe pas encore, il n'y a pas de droit à voler.
-- Ce qui compte, c'est qu'on ne puisse plus CHANGER de formule sans payer.
--
-- Idempotent. Ne crée aucun objet nouveau : la fonction existe déjà et est
-- remplacée à l'identique, plus le bloc `plan`. Aucun GRANT à poser.
--
-- Date : 2026-08-25
-- ════════════════════════════════════════════════════════════════════════════


-- ─── AVANT ──────────────────────────────────────────────────────────────────
-- À lire avant de lancer : la définition actuelle doit bien contenir statut,
-- statut_publication, kyb_statut et billing_exempt, et PAS `plan`.

SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'commercants_colonnes_reservees';


-- ─── LA CORRECTION ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.commercants_colonnes_reservees()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Clé de service : pas de JWT, donc pas d'auth.uid(). Les routes API
  -- d'administration, le webhook Stripe et les relances passent par là.
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

  -- 🔴 NOUVEAU — LE FORFAIT SE PAIE, IL NE SE DÉCLARE PAS.
  -- Un changement de formule est TOUJOURS la conséquence d'un événement
  -- Stripe : souscription, résiliation, échec de paiement. Ces trois chemins
  -- écrivent en clé de service et sont sortis plus haut.
  IF NEW.plan IS DISTINCT FROM OLD.plan THEN
    RAISE EXCEPTION 'La formule se change en passant par le paiement (plan: % -> %)', OLD.plan, NEW.plan
      USING ERRCODE = '42501';
  END IF;

  -- La date d'entrée dans la formule suit la formule : la laisser libre
  -- permettrait de se fabriquer une ancienneté, donc une facturation.
  IF NEW.plan_actif_depuis IS DISTINCT FROM OLD.plan_actif_depuis THEN
    RAISE EXCEPTION 'La date d''activation de la formule est réservée à Yoppaa'
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

-- Le déclencheur est déjà posé par MIGRATION_VERROU_COMMERCANT_NON_VALIDE.
-- On le repose quand même : cette migration doit pouvoir se passer seule.
DROP TRIGGER IF EXISTS trg_commercants_colonnes_reservees ON commercants;
CREATE TRIGGER trg_commercants_colonnes_reservees
  BEFORE UPDATE ON commercants
  FOR EACH ROW
  EXECUTE FUNCTION public.commercants_colonnes_reservees();


-- ─── CONTRÔLE APRÈS ─────────────────────────────────────────────────────────
-- 1) La définition contient bien le bloc `plan`.

SELECT
  CASE WHEN pg_get_functiondef(oid) LIKE '%NEW.plan IS DISTINCT FROM OLD.plan%'
       THEN '✅ le forfait est verrouillé'
       ELSE '🔴 le verrou n''est pas en place' END AS controle
FROM pg_proc
WHERE proname = 'commercants_colonnes_reservees';

-- 2) Le déclencheur est bien attaché à la table.

SELECT tgname AS declencheur, pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
WHERE c.relname = 'commercants' AND NOT t.tgisinternal
ORDER BY 1;

-- 3) LA VRAIE PREUVE, à faire depuis le NAVIGATEUR, connecté en commerçant :
--
--      await supabase.from('commercants')
--        .update({ plan: 'vendre' })
--        .eq('id', '<mon id>')
--
--    Attendu : une erreur 42501 « La formule se change en passant par le
--    paiement ». Une réussite silencieuse voudrait dire que le déclencheur
--    n'est pas actif, et un contrôle qui ne se vérifie pas ne protège rien.


-- ─── RETOUR ARRIÈRE ─────────────────────────────────────────────────────────
-- Repasser la fonction de MIGRATION_VERROU_COMMERCANT_NON_VALIDE.sql, qui
-- contient la même définition sans les deux blocs ajoutés ici.
