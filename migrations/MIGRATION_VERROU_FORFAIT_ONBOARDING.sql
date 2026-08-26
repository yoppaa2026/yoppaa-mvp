-- ════════════════════════════════════════════════════════════════════════════
-- CORRECTIF DU VERROU SUR LE FORFAIT — l'inscription doit pouvoir se terminer
--
-- 🔴 CE QUE MIGRATION_VERROU_FORFAIT.sql A CASSÉ, LE MÊME JOUR.
--
-- Le verrou refuse toute modification de `plan` depuis un navigateur. Or
-- `app/signup/page.js` en fait une, et c'est le chemin NORMAL de l'inscription :
--
--     mettreAJourPlan() → update({ categorie, plan, plan_actif_depuis })
--
-- Elle s'exécute quand un commerçant DÉJÀ CONNECTÉ valide son étape 1, ce qui
-- est le cas de tout le monde au retour de la confirmation d'email. Depuis le
-- verrou, cette écriture est refusée : le commerçant ne peut plus terminer son
-- inscription.
--
-- ⚠️ ET LE CODE N'EN SAVAIT RIEN. L'appel n'a jamais lu son erreur : l'écran
-- passait à l'étape suivante avec, en mémoire, une formule jamais enregistrée.
-- Une divergence silencieuse entre ce que le commerçant voit et ce que la base
-- contient. C'est corrigé côté code en même temps que cette migration.
--
-- ⚠️ POURQUOI LA VÉRIFICATION D'HIER N'A RIEN VU : elle cherchait `plan:` dans
-- le signup, et cette ligne écrit `plan,` en propriété abrégée. Chercher une
-- FORME au lieu d'une RÈGLE, encore.
--
-- ─── LA RÈGLE, CORRIGÉE ─────────────────────────────────────────────────────
--
-- **Le forfait se CHOISIT librement tant que le compte n'est pas ouvert, et se
-- PAIE ensuite.** C'est déjà vrai à l'INSERT, où le commerçant choisit sa
-- formule à l'étape 1 : le refuser à l'UPDATE deux écrans plus loin n'avait
-- aucun sens, ça interdisait seulement de changer d'avis.
--
-- ─── LE CONTRÔLE EN QUATRE QUESTIONS ────────────────────────────────────────
--  1. QUI peut écrire ? Le propriétaire, et seulement pendant son inscription.
--  2. QUE peut-il écrire ? Sa formule, avant toute validation par Yoppaa.
--  3. QU'OBTIENT-IL de plus ? RIEN. Il la choisit déjà librement à l'INSERT.
--     On ne rouvre aucun droit, on cesse d'interdire un changement d'avis.
--  4. ET S'IL RESTE EXPRÈS EN ONBOARDING ? Il n'en tire rien : sa fiche n'est
--     pas publiée, et les 43 policies RESTRICTIVE `zz_commerce_ouvert` lui
--     interdisent d'écrire la moindre donnée exploitable tant qu'il n'est pas
--     validé. Le forfait ne lui sert donc à rien avant l'ouverture du compte.
--
-- ⚠️ La condition porte sur `OLD.statut` et reprend EXACTEMENT le vocabulaire
-- de `mes_commerces_bloques()` : « valide » ET « actif ». Un compte de
-- production porte `actif`, valeur posée à la main qui n'apparaît nulle part
-- dans le code. N'en retenir qu'une laisserait la moitié des comptes ouverts.
--
-- Idempotent. Ne crée aucun objet : la fonction est remplacée.
-- Date : 2026-08-26
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.commercants_colonnes_reservees()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  compte_ouvert boolean := coalesce(OLD.statut, '') IN ('valide', 'actif');
BEGIN
  -- Clé de service : pas de JWT, donc pas d'auth.uid(). Le webhook Stripe, les
  -- relances de facturation et les routes d'administration passent par là.
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

  -- 🔴 LE FORFAIT SE PAIE, IL NE SE DÉCLARE PAS — UNE FOIS LE COMPTE OUVERT.
  -- Avant, il se choisit : c'est l'étape 1 de l'inscription, et l'intéressé
  -- doit pouvoir changer d'avis jusqu'à la validation.
  IF compte_ouvert AND NEW.plan IS DISTINCT FROM OLD.plan THEN
    RAISE EXCEPTION 'La formule se change en passant par le paiement (plan: % -> %)', OLD.plan, NEW.plan
      USING ERRCODE = '42501';
  END IF;

  -- La date d'entrée dans la formule suit la formule, et se ferme avec elle :
  -- la laisser libre sur un compte ouvert permettrait de se fabriquer une
  -- ancienneté, donc une facturation.
  IF compte_ouvert AND NEW.plan_actif_depuis IS DISTINCT FROM OLD.plan_actif_depuis THEN
    RAISE EXCEPTION 'La date d''activation de la formule est réservée à Yoppaa'
      USING ERRCODE = '42501';
  END IF;

  -- L'argent ne se décide pas depuis le navigateur, à aucun moment.
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


-- ─── CONTRÔLE 1 : la définition porte bien la condition ─────────────────────
SELECT
  CASE WHEN pg_get_functiondef(oid) LIKE '%compte_ouvert AND NEW.plan IS DISTINCT FROM OLD.plan%'
       THEN '✅ le forfait est verrouillé APRÈS ouverture du compte'
       ELSE '🔴 le correctif n''est pas en place' END AS controle
FROM pg_proc
WHERE proname = 'commercants_colonnes_reservees';


-- ─── CONTRÔLE 2 : quels comptes sont désormais protégés ─────────────────────
-- Attendu : les comptes ouverts sont verrouillés, ceux en cours d'inscription
-- ne le sont pas encore. Un compte au statut inattendu apparaîtra ici.
SELECT
  coalesce(statut, '∅ NULL') AS statut,
  CASE WHEN coalesce(statut, '') IN ('valide', 'actif')
       THEN 'forfait VERROUILLÉ' ELSE 'forfait encore modifiable' END AS effet,
  count(*) AS combien
FROM commercants
GROUP BY 1, 2
ORDER BY 1;


-- ─── CONTRÔLE 3 : LA PREUVE, ET ELLE NE SE LIT PAS EN BASE ──────────────────
-- Depuis la console du navigateur, connecté en commerçant sur un compte OUVERT
-- (statut 'valide' ou 'actif'), la tentative doit toujours rendre 403 / 42501.
-- Le bloc complet est dans la conversation du 26/08 : il lui faut la vraie clé
-- anon en `apikey`, le jeton de session en `Authorization`, et un `fetch` sur
-- /rest/v1/ — `supabase` est un module, il n'existe pas dans la console.
--
-- ⚠️ ET LA SECONDE PREUVE, CELLE QUI A MOTIVÉ CE CORRECTIF : une inscription
-- complète en navigation privée doit aller jusqu'au bout.


-- ─── RETOUR ARRIÈRE ─────────────────────────────────────────────────────────
-- Repasser MIGRATION_VERROU_FORFAIT.sql, qui verrouille le forfait à TOUS les
-- stades. ⚠️ L'inscription redeviendra alors impossible à terminer.
