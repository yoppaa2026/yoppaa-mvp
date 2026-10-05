-- ════════════════════════════════════════════════════════════════════════════
-- Une commande ne s'écrit plus depuis un navigateur (audit livraison I2, 05/10)
-- ════════════════════════════════════════════════════════════════════════════
--
-- 🔴 CE QUI SE PASSAIT. La policy `commande_update_own_commercant` laissait le
-- commerçant connecté réécrire N'IMPORTE QUELLE colonne de ses commandes par
-- l'API REST, avec la seule clé publique : le total, les frais, le statut de
-- livraison, l'email du client, `paye_en_ligne`, l'encaissement. Le tableau de
-- bord s'en servait pour deux gestes ; depuis le commit I3 il passe par le
-- serveur, comme le Poste de l'équipe. Plus aucun code n'écrit `commandes`
-- avec une clé de navigateur (`npm run verif:livraison` le vérifie).
--
-- ✅ DEUX BARRIÈRES, l'une derrière l'autre :
--   1. la policy d'écriture du commerçant disparaît. La lecture reste
--      (`commande_select_own_commercant`), l'admin garde `Admin Yoppaa FULL`.
--   2. un déclencheur refuse toute écriture venue d'un compte connecté qui
--      n'est pas l'admin, même si une policy réapparaissait un jour par erreur
--      (c'est ainsi que les vues publiques sont devenues écrivables le 27/08).
--
-- ⚠️ SAUF LES COLONNES DE LIEN. Supprimer un bon cadeau, un rendez-vous ou une
-- récompense remet à NULL la colonne qui le désigne dans `commandes`
-- (ON DELETE SET NULL), et Postgres le fait AU NOM de celui qui supprime. Les
-- refuser bloquerait ces suppressions. Ces colonnes ne portent ni argent ni
-- identité : elles passent, tout le reste est figé.
--
-- ⚠️ MÊME RECONNAISSANCE DU SERVEUR que `abonnements_colonnes_reservees` :
-- `auth.uid()` vide = clé de service ou éditeur SQL. `anon` n'a de toute façon
-- aucune policy d'écriture sur cette table.
--
-- ⚠️ À PASSER APRÈS LE DÉPLOIEMENT DU CODE I3, jamais avant : l'ancien tableau
-- de bord écrit encore le statut depuis le navigateur, il serait refusé.
-- D'abord TEST, puis PROD après le « pousse ».
--
-- GRANT : aucune table ni vue créée. La fonction est un déclencheur, elle
-- n'est appelable par personne d'autre ; on retire quand même EXECUTE à tous.
-- Date : 2026-10-05
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS commande_update_own_commercant ON public.commandes;

CREATE OR REPLACE FUNCTION public.commandes_ecriture_serveur()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  liens text[] := ARRAY[
    'bon_cadeau_id', 'rdv_id', 'rdv_reservation_id', 'fidelite_recompense_id'
  ];
  avant jsonb;
  apres jsonb;
  col   text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF public.is_yoppaa_admin() THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP IN ('INSERT', 'DELETE') THEN
    RAISE EXCEPTION 'Une commande ne se crée ni ne se supprime depuis le navigateur'
      USING ERRCODE = '42501';
  END IF;

  avant := to_jsonb(OLD);
  apres := to_jsonb(NEW);
  FOREACH col IN ARRAY liens LOOP
    avant := avant - col;
    apres := apres - col;
  END LOOP;
  IF avant IS DISTINCT FROM apres THEN
    RAISE EXCEPTION 'Une commande ne se modifie pas depuis le navigateur'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.commandes_ecriture_serveur() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_commandes_ecriture_serveur ON public.commandes;
CREATE TRIGGER trg_commandes_ecriture_serveur
  BEFORE INSERT OR UPDATE OR DELETE ON public.commandes
  FOR EACH ROW
  EXECUTE FUNCTION public.commandes_ecriture_serveur();

-- ─── Contrôle : une ligne par vérification, valeur ET attendu ───────────────
SELECT * FROM (
  SELECT 1 AS n, 'I2 la policy d ecriture du commercant a disparu' AS controle,
         (SELECT COALESCE(string_agg(policyname || ':' || cmd || ':' || permissive, ', '), 'AUCUNE') FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'commandes' AND policyname = 'commande_update_own_commercant')::text AS valeur,
         'AUCUNE' AS attendu
  UNION ALL SELECT 2, '🔴 I2 aucune ecriture ouverte hors admin',
         (SELECT COALESCE(string_agg(policyname || ':' || cmd || ':' || permissive, ', ' ORDER BY policyname), 'AUCUNE') FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'commandes'
             AND permissive = 'PERMISSIVE' AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
             AND COALESCE(qual, '') NOT LIKE '%is_yoppaa_admin()%')::text,
         'AUCUNE'
  UNION ALL SELECT 3, 'I2 policies de commandes (nom:commande:type)',
         (SELECT string_agg(policyname || ':' || cmd || ':' || permissive, ', ' ORDER BY policyname) FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'commandes')::text,
         'Admin Yoppaa FULL:ALL:PERMISSIVE, commande_select_own_commercant:SELECT:PERMISSIVE (+ zz_commerce_ouvert:…:RESTRICTIVE si present)'
  UNION ALL SELECT 4, 'I2 declencheur actif',
         (SELECT string_agg(tgname || (CASE WHEN tgenabled = 'O' THEN ' actif' ELSE ' INACTIF' END), ', ')
            FROM pg_trigger WHERE tgrelid = 'public.commandes'::regclass AND tgname = 'trg_commandes_ecriture_serveur')::text,
         'trg_commandes_ecriture_serveur actif'
  UNION ALL SELECT 5, 'I2 declencheur avant insert, update et delete',
         (SELECT CASE WHEN (tgtype & 2) <> 0 AND (tgtype & 4) <> 0 AND (tgtype & 8) <> 0 AND (tgtype & 16) <> 0
                      THEN 'avant insert update delete' ELSE 'AUTRE' END
            FROM pg_trigger WHERE tgrelid = 'public.commandes'::regclass AND tgname = 'trg_commandes_ecriture_serveur')::text,
         'avant insert update delete'
  UNION ALL SELECT 6, 'I2 la fonction laisse passer le serveur et l admin',
         (SELECT CASE WHEN prosrc LIKE '%auth.uid() IS NULL%' AND prosrc LIKE '%is_yoppaa_admin()%' AND prosecdef
                      THEN 'oui' ELSE 'NON' END
            FROM pg_proc WHERE proname = 'commandes_ecriture_serveur')::text,
         'oui'
  UNION ALL SELECT 7, 'I2 personne n execute la fonction directement',
         (SELECT CASE WHEN has_function_privilege('authenticated', 'public.commandes_ecriture_serveur()', 'EXECUTE')
                        OR has_function_privilege('anon', 'public.commandes_ecriture_serveur()', 'EXECUTE')
                      THEN 'ouverte' ELSE 'fermee' END)::text,
         'fermee'
) t ORDER BY n;
