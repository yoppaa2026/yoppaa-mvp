-- ═══════════════════════════════════════════════════════════════════════════
-- SÉCURITÉ — 21/08/2026 — TROIS TROUS RÉVÉLÉS PAR LE RELEVÉ pg_policies
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ AUCUN DES TROIS N'ÉTAIT VISIBLE DANS LE CODE. Ils n'existent qu'en base,
-- créés à la main dans le tableau de bord Supabase, donc absents de toute
-- migration : aucun banc, aucun build, aucune relecture ne pouvait les voir.
-- C'est la deuxième fois en deux jours. La leçon tient en une ligne : sur un
-- sujet d'accès, aller LIRE LA BASE, jamais relire le code.
--
-- ⚠️ CE FICHIER NE TOUCHE PAS À `rdv_reservations` en UPDATE. Ce quatrième
-- point demande un déclencheur qui traverse toutes les écritures du tableau de
-- bord, et donc un test navigateur AVANT d'être posé. Il vit dans
-- MIGRATION_SECURITE_RDV_COLONNES.sql, à passer APRÈS celui-ci.
--
-- Contrôles en partie 5, retour arrière en partie 6.


-- ─── 1) 🔴 UN COMMERÇANT POUVAIT SE VALIDER LUI-MÊME, À LA CRÉATION ─────────
--
-- Le relevé montre :
--
--   commercants | Commercant cree sa fiche | INSERT | {authenticated}
--               | with_check = (auth_user_id = auth.uid())
--
-- Le `WITH CHECK` ne contraint QUE `auth_user_id`. Toutes les autres colonnes
-- sont libres au moment de l'INSERT, `statut` compris.
--
-- ⚠️ ET LE VERROU DU 20/08 NE COUVRE PAS CE CAS : `trg_commercants_colonnes_reservees`
-- est un déclencheur BEFORE **UPDATE**. À l'insertion, il ne se déclenche
-- jamais. N'importe quel utilisateur authentifié pouvait donc créer sa fiche
-- directement en `statut = 'valide'`, `statut_publication = 'publie'` et
-- `billing_exempt = true` : validé et gratuit à vie, sans passer par Alex, en
-- une seule requête PostgREST. Tout le travail d'hier tombait par ce trou.
--
-- ⚠️ ON FORCE, ON NE REFUSE PAS. Un `RAISE EXCEPTION` casserait l'inscription
-- au moindre écart entre ce que le formulaire envoie et ce que la règle attend,
-- et l'inscription est le chemin le plus critique du produit. On réécrit donc
-- les colonnes réservées à leur valeur de départ : le formulaire ne les envoie
-- pas autrement, rien ne change pour lui, et une requête forgée atterrit
-- proprement en brouillon.

CREATE OR REPLACE FUNCTION public.commercants_creation_sure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Clé de service : aucun JWT, donc aucun auth.uid(). Les routes API passent ici.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_yoppaa_admin() THEN
    RETURN NEW;
  END IF;

  -- Toute création venue d'un navigateur démarre au point de départ, quoi
  -- qu'elle demande. Mêmes colonnes que le déclencheur d'UPDATE du 20/08.
  NEW.statut                 := 'en_cours_onboarding';
  NEW.statut_publication     := 'brouillon';
  NEW.kyb_statut             := 'non_demarre';
  NEW.billing_exempt         := false;
  NEW.subscription_status    := NULL;
  NEW.subscription_trial_end := NULL;
  NEW.stripe_subscription_id := NULL;
  NEW.stripe_customer_id     := NULL;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_commercants_creation_sure ON commercants;
CREATE TRIGGER trg_commercants_creation_sure
  BEFORE INSERT ON commercants
  FOR EACH ROW
  EXECUTE FUNCTION public.commercants_creation_sure();


-- ─── 2) 🔴 client_preferences ÉTAIT GRANDE OUVERTE, À TOUS LES RÔLES ────────
--
-- Le relevé montre :
--
--   client_preferences | écriture préférences client | ALL    | {public} | true
--   client_preferences | lecture préférences client  | SELECT | {public} | true
--
-- ⚠️ `{public}` n'est pas « les visiteurs », c'est TOUS LES RÔLES, `anon`
-- compris. `USING true` ne filtre aucune ligne. Et sur une policy `ALL` dont
-- le `WITH CHECK` est absent, PostgreSQL réutilise le `USING` : l'écriture est
-- donc ouverte elle aussi. N'importe qui, avec la clé anon publique qui est
-- dans le bundle JavaScript, lisait, modifiait et supprimait les préférences
-- de tous les clients. C'est le défaut EXACT fermé sur `commercants` le 20/08,
-- resté ouvert sur une table à données personnelles.
--
-- La table n'a AUCUNE migration : ni CREATE TABLE, ni policy, ni GRANT. Elle a
-- été créée dans l'interface.
--
-- ⚠️ REMÈDE VÉRIFIÉ AVANT D'ÊTRE ÉCRIT : un seul endroit du code la touche,
-- `app/api/yopper/supprimer-compte/route.js`, et il tourne en CLÉ DE SERVICE,
-- laquelle ignore la RLS. Aucun écran, aucune route ne la lit sous la clé anon.
-- On peut donc fermer complètement : pas de policy = pas d'accès pour `anon` ni
-- `authenticated`, et la suppression de compte continue de fonctionner.

DROP POLICY IF EXISTS "écriture préférences client" ON client_preferences;
DROP POLICY IF EXISTS "lecture préférences client"  ON client_preferences;

ALTER TABLE client_preferences ENABLE ROW LEVEL SECURITY;

-- Ceinture et bretelles : sans droit de table, même une policy ajoutée par
-- distraction demain ne rouvrirait rien.
REVOKE ALL ON client_preferences FROM anon, authenticated;
GRANT ALL ON client_preferences TO service_role;

-- ⚠️ `zz_commerce_ouvert` (RESTRICTIVE, posée le 20/08) reste en place et ne
-- gêne rien : les restrictives ne donnent aucun droit, elles n'en retirent.


-- ─── 3) 🟠 N'IMPORTE QUI POUVAIT CRÉER UNE LIGNE clients À N'IMPORTE QUEL NOM ─
--
-- Le relevé montre DEUX policies d'insertion, toutes deux permissives, donc
-- combinées en OU :
--
--   clients | Insert client              | INSERT | {public} | with_check = true
--   clients | yopper_insert_own_clients  | INSERT | {public}
--           | with_check = ((auth_user_id = auth.uid()) OR (auth.uid() IS NULL))
--
-- La première ne contrôle rien du tout. La seconde a la même faiblesse par sa
-- branche `auth.uid() IS NULL` : pour un appelant anonyme elle est toujours
-- vraie, donc il peut poser `auth_user_id` sur l'identifiant de QUELQU'UN
-- D'AUTRE. C'est une pré-appropriation de compte : créer d'avance la ligne
-- `clients` d'une adresse email, et la personne qui s'inscrit ensuite ne peut
-- plus prendre la main sur sa propre fiche.
--
-- ✅ Bonne nouvelle du relevé, en revanche : `yopper_select_own_clients` et
-- `yopper_update_own_clients` sont correctement bornées à
-- `auth_user_id = auth.uid()`. La lecture et la modification étaient saines ;
-- mon hypothèse d'un `{public} USING true` sur l'UPDATE est démentie.
--
-- ⚠️ Vérifié avant d'écrire : les deux seules insertions du code sont
-- `app/api/yopper/client/route.js` (clé de service, hors RLS) et
-- `app/commander/auth/page.js`, qui pose `auth_user_id: data.user.id`. La
-- règle ci-dessous les laisse toutes les deux passer.

DROP POLICY IF EXISTS "Insert client"             ON clients;
DROP POLICY IF EXISTS "yopper_insert_own_clients" ON clients;

CREATE POLICY "yopper_insert_own_clients" ON clients
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    -- Une fiche invitée, qui n'appartient à personne : c'est le cas de la
    -- commande sans compte.
    auth_user_id IS NULL
    -- Ou bien sa propre fiche. Jamais celle d'un autre.
    OR auth_user_id = auth.uid()
  );


-- ─── 4) 🔴 UNE RÉSERVATION POUVAIT SE DÉCLARER PAYÉE, SANS COMPTE ───────────
--
-- Deux policies d'INSERT coexistent sur `rdv_reservations`, toutes deux
-- permissives :
--
--   "Reservation insert public"            (MIGRATION_RDV.sql)
--     WITH CHECK (deleted_at IS NULL)
--   "rdv_reservations_insertion_publique"  (MIGRATION_RLS_RDV_PUBLIC.sql, 03/08)
--     WITH CHECK (acompte_paye IS NOT TRUE AND acompte_paye_en_ligne IS NOT TRUE
--                 AND stripe_payment_intent_id IS NULL AND stripe_refund_id IS NULL
--                 AND statut = 'confirme')
--
-- ⚠️ LES `WITH CHECK` PERMISSIFS SE COMBINENT EN **OU**. Il suffit donc
-- d'omettre `deleted_at` pour satisfaire l'ancienne, et la stricte n'est jamais
-- évaluée. La garde écrite le 03/08 précisément pour empêcher qu'on se déclare
-- soi-même « acompte payé » n'a jamais rien gardé : elle est morte le jour de
-- sa naissance, parce que la policy qu'elle devait remplacer n'a pas été
-- supprimée.
--
-- Conséquence concrète : avec la seule clé anon, sans compte, on insère un
-- rendez-vous marqué acompte réglé, prix à zéro et TVA à zéro. L'agenda du
-- commerçant le montre comme encaissé, et l'export comptable belge porte une
-- ligne fabriquée.
--
-- ⚠️ VÉRIFIÉ AVANT D'ÉCRIRE, LES DEUX CHEMINS LÉGITIMES PASSENT LA POLICY
-- STRICTE : la réservation publique (`app/commander/rdv/[slug]/page.js`) pose
-- `acompte_paye: false` et `statut: 'confirme'` ; la saisie manuelle du
-- commerçant (`app/dashboard/ModalNouveauRdv.js`) pose les mêmes deux valeurs.
-- Les réservations réellement payées sont créées par le webhook Stripe, en clé
-- de service, hors RLS.

DROP POLICY IF EXISTS "Reservation insert public" ON rdv_reservations;


-- ─── 5) CONTRÔLES ──────────────────────────────────────────────────────────
-- À lancer APRÈS. Chaque requête dit ce qu'on doit lire.

-- a) Attendu : 1 ligne, trg_commercants_creation_sure.
SELECT tgname FROM pg_trigger
 WHERE tgrelid = 'public.commercants'::regclass
   AND tgname = 'trg_commercants_creation_sure';

-- b) Attendu : 0 ligne. Plus aucune policy ouverte à tous les rôles sur les
--    trois tables, et plus aucune écriture anonyme non bornée.
SELECT tablename, policyname, cmd, roles::text, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('client_preferences', 'clients', 'rdv_reservations')
   AND 'public' = ANY (roles)
   AND coalesce(qual, 'true') = 'true'
   AND cmd <> 'SELECT';

-- c) Attendu : 0 ligne. `anon` et `authenticated` n'ont plus rien sur
--    client_preferences.
SELECT grantee, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public' AND table_name = 'client_preferences'
   AND grantee IN ('anon', 'authenticated');

-- d) Attendu : 1 SEULE policy INSERT sur rdv_reservations, et son with_check
--    doit mentionner acompte_paye.
SELECT policyname, with_check
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'rdv_reservations' AND cmd = 'INSERT';

-- e) LE PLUS UTILE DES CINQ : toutes les tables sans RLS. Une table absente des
--    migrations est invisible à toute relecture de code. Attendu : 0 ligne.
SELECT c.relname
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = false
 ORDER BY 1;


-- ─── 6) RETOUR ARRIÈRE ─────────────────────────────────────────────────────
-- Si quelque chose casse, décommenter et exécuter. Chaque partie est
-- indépendante des autres.
--
-- DROP TRIGGER IF EXISTS trg_commercants_creation_sure ON commercants;
-- DROP FUNCTION IF EXISTS public.commercants_creation_sure();
--
-- GRANT ALL ON client_preferences TO anon, authenticated;
-- CREATE POLICY "lecture préférences client" ON client_preferences FOR SELECT TO public USING (true);
-- CREATE POLICY "écriture préférences client" ON client_preferences FOR ALL TO public USING (true);
--
-- DROP POLICY IF EXISTS "yopper_insert_own_clients" ON clients;
-- CREATE POLICY "yopper_insert_own_clients" ON clients FOR INSERT TO public
--   WITH CHECK ((auth_user_id = auth.uid()) OR (auth.uid() IS NULL));
-- CREATE POLICY "Insert client" ON clients FOR INSERT TO public WITH CHECK (true);
--
-- CREATE POLICY "Reservation insert public" ON rdv_reservations
--   FOR INSERT TO anon, authenticated WITH CHECK (deleted_at IS NULL);
