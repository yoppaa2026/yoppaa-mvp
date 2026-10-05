-- ════════════════════════════════════════════════════════════════════════════
-- I7 + I8 (audit livraison, 05/10) : fermer une tournée, et une capacité qui
-- tient quand deux clients paient en même temps
-- ════════════════════════════════════════════════════════════════════════════
--
-- 🔴 I7. Le commerçant débordé pouvait fermer un créneau de RETRAIT pour la
-- journée (`creneaux_blocages`), pas une TOURNÉE de livraison : la colonne
-- pointe `creneaux`, les tournées vivent dans `livraison_creneaux`. On ajoute
-- `livraison_creneau_id`, et une ligne désigne exactement UN des deux.
--
-- 🔴 ET UN TROU TROUVÉ AU RELEVÉ : la policy d'écriture ne vérifiait que le
-- commerce de la ligne, jamais celui du CRÉNEAU. Un commerçant connecté
-- pouvait écrire une ligne à son nom qui pointe le créneau d'un AUTRE commerce,
-- et la route de commande, qui cherchait le blocage par créneau seul, fermait
-- alors ce créneau chez l'autre. La route filtre désormais aussi sur le
-- commerce, et la policy exige que le créneau appartienne au commerce de la
-- ligne. Le contrôle passe par une fonction SECURITY DEFINER : une sous-requête
-- évaluée avec les droits du compte connecté rendrait FAUX en silence sur une
-- fiche non publiée (reference_policy_large_qui_sauve).
--
-- 🔴 I8. La capacité d'un créneau se vérifiait en COMPTANT puis en INSÉRANT,
-- en deux appels séparés : deux clients qui paient à la même seconde lisaient
-- tous les deux « une place » et passaient tous les deux. Un déclencheur avant
-- insertion prend un verrou sur (créneau, jour), recompte, et refuse avec
-- CRENEAU_COMPLET. Le verrou tombe à la fin de la transaction de l'insertion :
-- la suivante attend, puis voit la commande précédente.
--
-- ⚠️ La règle est « la commande DÉBORDERAIT », jamais « le créneau est plein
-- après elle » : 4 commandes sur 5 acceptent la 5e. La route faisait l'erreur
-- inverse (elle refusait la 5e, et un créneau réglé sur 1 ne prenait RIEN).
--
-- ⚠️ En mode temps, le temps de la commande n'est connu qu'avant l'insertion
-- de ses lignes : la route l'écrit dans `temps_prepa_minutes`. Pour les
-- commandes plus anciennes, on recalcule depuis les lignes, exactement comme
-- `charge_creneaux_par_jour` (un article sans temps compte 1 minute).
--
-- ⚠️ À PASSER AVANT LE DÉPLOIEMENT DU CODE : la route écrit
-- `temps_prepa_minutes`, la fiche et le tableau de bord lisent
-- `livraison_creneau_id`. Sans la migration, la commande échoue entièrement.
-- D'abord TEST, puis PROD avant le « pousse ».
--
-- GRANT : aucune table créée. Deux fonctions : le déclencheur n'est appelable
-- par personne, la fonction de contrôle est exécutable par `authenticated`
-- (la policy l'appelle au nom du commerçant).
-- Date : 2026-10-05
-- ════════════════════════════════════════════════════════════════════════════

-- ─── I7 : la tournée se ferme comme un créneau ──────────────────────────────

ALTER TABLE public.creneaux_blocages
  ADD COLUMN IF NOT EXISTS livraison_creneau_id uuid
    REFERENCES public.livraison_creneaux(id) ON DELETE CASCADE;

ALTER TABLE public.creneaux_blocages
  ALTER COLUMN creneau_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.creneaux_blocages'::regclass
                    AND conname = 'creneaux_blocages_un_seul_creneau') THEN
    ALTER TABLE public.creneaux_blocages
      ADD CONSTRAINT creneaux_blocages_un_seul_creneau
      CHECK (num_nonnulls(creneau_id, livraison_creneau_id) = 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.creneaux_blocages'::regclass
                    AND conname = 'creneaux_blocages_unicite_livraison') THEN
    ALTER TABLE public.creneaux_blocages
      ADD CONSTRAINT creneaux_blocages_unicite_livraison
      UNIQUE (livraison_creneau_id, date_blocage);
  END IF;
END $$;

COMMENT ON COLUMN public.creneaux_blocages.livraison_creneau_id IS
  'Tournée de livraison fermée ce jour-là. Une ligne désigne soit un créneau de retrait (creneau_id), soit une tournée, jamais les deux.';

CREATE OR REPLACE FUNCTION public.blocage_creneau_du_commerce(
  p_commercant uuid, p_creneau uuid, p_livraison uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (p_creneau IS NULL OR EXISTS (
            SELECT 1 FROM public.creneaux c
             WHERE c.id = p_creneau AND c.commercant_id = p_commercant))
     AND (p_livraison IS NULL OR EXISTS (
            SELECT 1 FROM public.livraison_creneaux l
             WHERE l.id = p_livraison AND l.commercant_id = p_commercant));
$$;

REVOKE ALL ON FUNCTION public.blocage_creneau_du_commerce(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.blocage_creneau_du_commerce(uuid, uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "blocages_insert_proprietaire" ON public.creneaux_blocages;
CREATE POLICY "blocages_insert_proprietaire" ON public.creneaux_blocages
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    commercant_id IN (SELECT id FROM public.commercants WHERE auth_user_id = auth.uid())
    AND public.blocage_creneau_du_commerce(commercant_id, creneau_id, livraison_creneau_id)
  );

DROP POLICY IF EXISTS "blocages_update_proprietaire" ON public.creneaux_blocages;
CREATE POLICY "blocages_update_proprietaire" ON public.creneaux_blocages
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING      (commercant_id IN (SELECT id FROM public.commercants WHERE auth_user_id = auth.uid()))
  WITH CHECK (
    commercant_id IN (SELECT id FROM public.commercants WHERE auth_user_id = auth.uid())
    AND public.blocage_creneau_du_commerce(commercant_id, creneau_id, livraison_creneau_id)
  );

-- ─── I8 : la capacité vérifiée sous verrou ──────────────────────────────────

ALTER TABLE public.commandes
  ADD COLUMN IF NOT EXISTS temps_prepa_minutes numeric;

COMMENT ON COLUMN public.commandes.temps_prepa_minutes IS
  'Temps de préparation de la commande (minutes), figé à la création par le serveur. Lu par le contrôle de capacité en mode temps.';

CREATE OR REPLACE FUNCTION public.commandes_capacite_creneau()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creneau  uuid;
  v_mode     text;
  v_mode_def text;
  v_max      numeric;
  v_temps    numeric;
  v_nb       bigint;
  v_cumul    numeric;
BEGIN
  IF NEW.statut NOT IN ('paiement_en_attente', 'en_attente', 'en_preparation', 'pret') THEN
    RETURN NEW;
  END IF;

  IF NEW.creneau_livraison_id IS NOT NULL THEN
    v_creneau := NEW.creneau_livraison_id;
    SELECT mode_capacite, max_commandes, capacite_temps INTO v_mode, v_max, v_temps
      FROM public.livraison_creneaux WHERE id = v_creneau;
  ELSIF NEW.creneau_id IS NOT NULL THEN
    v_creneau := NEW.creneau_id;
    SELECT mode_capacite, max_commandes, capacite_temps INTO v_mode, v_max, v_temps
      FROM public.creneaux WHERE id = v_creneau;
  ELSE
    RETURN NEW;
  END IF;

  SELECT mode_capacite INTO v_mode_def FROM public.commercants WHERE id = NEW.commercant_id;
  v_mode := COALESCE(NULLIF(v_mode, ''), v_mode_def);

  -- Aucune capacité réglée : rien à vérifier (même règle que `capaciteFixee`).
  IF v_mode = 'temps' THEN
    IF COALESCE(v_temps, 0) <= 0 THEN RETURN NEW; END IF;
  ELSE
    IF COALESCE(v_max, 0) <= 0 THEN RETURN NEW; END IF;
  END IF;

  -- Un verrou par (créneau, jour). ⚠️ La fonction est VOLATILE : chaque
  -- requête ci-dessous prend une image NEUVE de la base, donc voit la commande
  -- de celui qui tenait le verrou juste avant.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('capacite:' || v_creneau::text || ':' || NEW.date_commande::date::text, 0));

  IF v_mode = 'temps' THEN
    SELECT COALESCE(SUM(COALESCE(c.temps_prepa_minutes,
             (SELECT SUM(ca.quantite * COALESCE(a.temps_prepa, 1))
                FROM public.commande_articles ca
                LEFT JOIN public.articles a ON a.id = ca.article_id
               WHERE ca.commande_id = c.id), 0)), 0)
      INTO v_cumul
      FROM public.commandes c
     WHERE c.commercant_id = NEW.commercant_id
       AND (CASE WHEN NEW.creneau_livraison_id IS NOT NULL
                 THEN c.creneau_livraison_id = v_creneau
                 ELSE c.creneau_id = v_creneau END)
       AND c.date_commande::date = NEW.date_commande::date
       AND c.statut IN ('paiement_en_attente', 'en_attente', 'en_preparation', 'pret');
    IF v_cumul + COALESCE(NEW.temps_prepa_minutes, 1) > v_temps THEN
      RAISE EXCEPTION 'CRENEAU_COMPLET' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    SELECT count(*) INTO v_nb
      FROM public.commandes c
     WHERE c.commercant_id = NEW.commercant_id
       AND (CASE WHEN NEW.creneau_livraison_id IS NOT NULL
                 THEN c.creneau_livraison_id = v_creneau
                 ELSE c.creneau_id = v_creneau END)
       AND c.date_commande::date = NEW.date_commande::date
       AND c.statut IN ('paiement_en_attente', 'en_attente', 'en_preparation', 'pret');
    IF v_nb + 1 > v_max THEN
      RAISE EXCEPTION 'CRENEAU_COMPLET' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.commandes_capacite_creneau() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_commandes_capacite_creneau ON public.commandes;
CREATE TRIGGER trg_commandes_capacite_creneau
  BEFORE INSERT ON public.commandes
  FOR EACH ROW
  EXECUTE FUNCTION public.commandes_capacite_creneau();

-- ─── Contrôle : une ligne par vérification, valeur ET attendu ───────────────
SELECT * FROM (
  SELECT 1 AS n, 'I7 colonne livraison_creneau_id' AS controle,
         (SELECT data_type FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'creneaux_blocages'
             AND column_name = 'livraison_creneau_id')::text AS valeur,
         'uuid' AS attendu
  UNION ALL SELECT 2, 'I7 creneau_id accepte le vide',
         (SELECT is_nullable FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'creneaux_blocages'
             AND column_name = 'creneau_id')::text,
         'YES'
  UNION ALL SELECT 3, 'I7 contraintes un seul creneau + unicite tournee',
         (SELECT string_agg(conname, ', ' ORDER BY conname) FROM pg_constraint
           WHERE conrelid = 'public.creneaux_blocages'::regclass
             AND conname IN ('creneaux_blocages_un_seul_creneau', 'creneaux_blocages_unicite_livraison'))::text,
         'creneaux_blocages_un_seul_creneau, creneaux_blocages_unicite_livraison'
  UNION ALL SELECT 4, 'I7 policies d ecriture (nom:commande:type:controle du creneau)',
         (SELECT string_agg(policyname || ':' || cmd || ':' || permissive || ':'
                  || CASE WHEN COALESCE(with_check, '') LIKE '%blocage_creneau_du_commerce%' THEN 'oui' ELSE 'NON' END,
                  ', ' ORDER BY policyname)
            FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'creneaux_blocages'
             AND policyname IN ('blocages_insert_proprietaire', 'blocages_update_proprietaire'))::text,
         'blocages_insert_proprietaire:INSERT:PERMISSIVE:oui, blocages_update_proprietaire:UPDATE:PERMISSIVE:oui'
  UNION ALL SELECT 5, '🔴 I7 aucune ecriture ouverte a anon',
         (SELECT count(*) FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'creneaux_blocages'
             AND permissive = 'PERMISSIVE' AND cmd <> 'SELECT'
             AND roles::text LIKE '%anon%')::text,
         '0'
  UNION ALL SELECT 6, '🔴 I7 blocages existants qui pointent le creneau d un AUTRE commerce',
         (SELECT count(*) FROM public.creneaux_blocages b
           WHERE NOT public.blocage_creneau_du_commerce(b.commercant_id, b.creneau_id, b.livraison_creneau_id))::text,
         '0'
  UNION ALL SELECT 7, 'I7 fonction de controle : anon n execute pas, authenticated oui',
         (CASE WHEN has_function_privilege('anon', 'public.blocage_creneau_du_commerce(uuid, uuid, uuid)', 'EXECUTE') THEN 'anon OUVERT'
               WHEN has_function_privilege('authenticated', 'public.blocage_creneau_du_commerce(uuid, uuid, uuid)', 'EXECUTE') THEN 'ok'
               ELSE 'authenticated FERME' END)::text,
         'ok'
  UNION ALL SELECT 8, 'I8 colonne temps_prepa_minutes',
         (SELECT data_type FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'commandes'
             AND column_name = 'temps_prepa_minutes')::text,
         'numeric'
  UNION ALL SELECT 9, 'I8 declencheur actif, avant insertion',
         (SELECT string_agg(tgname || (CASE WHEN tgenabled = 'O' THEN ' actif' ELSE ' INACTIF' END)
                  || (CASE WHEN (tgtype & 2) <> 0 AND (tgtype & 4) <> 0 AND (tgtype & 16) = 0 THEN ' avant insert' ELSE ' AUTRE' END), ', ')
            FROM pg_trigger WHERE tgrelid = 'public.commandes'::regclass AND tgname = 'trg_commandes_capacite_creneau')::text,
         'trg_commandes_capacite_creneau actif avant insert'
  UNION ALL SELECT 10, 'I8 la fonction verrouille et refuse',
         (SELECT CASE WHEN prosrc LIKE '%pg_advisory_xact_lock%' AND prosrc LIKE '%CRENEAU_COMPLET%' AND prosecdef
                      THEN 'oui' ELSE 'NON' END
            FROM pg_proc WHERE proname = 'commandes_capacite_creneau')::text,
         'oui'
  UNION ALL SELECT 11, 'I8 personne n execute le declencheur directement',
         (CASE WHEN has_function_privilege('authenticated', 'public.commandes_capacite_creneau()', 'EXECUTE')
                 OR has_function_privilege('anon', 'public.commandes_capacite_creneau()', 'EXECUTE')
               THEN 'ouverte' ELSE 'fermee' END)::text,
         'fermee'
  UNION ALL SELECT 12, 'I2 toujours en place (pour information)',
         (SELECT string_agg(tgname || (CASE WHEN tgenabled = 'O' THEN ' actif' ELSE ' INACTIF' END), ', ')
            FROM pg_trigger WHERE tgrelid = 'public.commandes'::regclass AND tgname = 'trg_commandes_ecriture_serveur')::text,
         'trg_commandes_ecriture_serveur actif'
  UNION ALL SELECT 13, 'type de date_commande (pour information)',
         (SELECT data_type FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'commandes' AND column_name = 'date_commande')::text,
         'date ou timestamp'
) t ORDER BY n;
