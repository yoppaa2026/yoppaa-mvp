-- ════════════════════════════════════════════════════════════════════════════
-- LA COMMANDE ENCODÉE À LA MAIN PAR LE COMMERÇANT
-- Décision d'Alex, 10/10 (tableau) : « version express », retrait et livraison,
-- créneau plein ou stock court = on PRÉVIENT puis on laisse, patron + équipe.
-- ════════════════════════════════════════════════════════════════════════════
--
-- CE QUE FAIT CETTE MIGRATION :
--   A. vérifie que les colonnes lues par la nouvelle fenêtre existent (les
--      tables d'options ont été créées à la main, hors migration) ;
--   B. `commandes.origine` : 'en_ligne' (par défaut, tout ce qui existe) ou
--      'commercant'. Sans elle, le tableau de bord sonnerait « Nouvelle
--      commande ! » pour la saisie du commerçant, et l'export ne saurait pas
--      qu'elle vient du téléphone ;
--   C. le téléphone et l'e-mail du client deviennent facultatifs (le nom seul
--      est obligatoire au téléphone) ;
--   D. le contrôle de capacité sous verrou laisse passer une commande ENCODÉE
--      PAR LE COMMERÇANT : il a été prévenu par l'écran et a confirmé
--      (« prévenir, pas interdire », décidé le 24/09). Il reste entier pour
--      toute commande en ligne.
--
-- ⚠️ SEUL LE SERVEUR ÉCRIT UNE COMMANDE (`trg_commandes_ecriture_serveur`) : un
-- navigateur ne peut donc pas se déclarer « commerçant » pour passer le verrou.
--
-- À passer sur l'ESSAI puis la PROD, AVANT le code. Idempotent. Date : 2026-10-10
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── A. LES COLONNES QUE LA FENÊTRE LIT ─────────────────────────────────────
DO $$
DECLARE
  manquantes text;
BEGIN
  SELECT string_agg(t || '.' || c, ', ') INTO manquantes
    FROM (VALUES ('article_options_groupes', 'type'), ('article_options_groupes', 'obligatoire'),
                 ('article_options_groupes', 'article_id'), ('article_options_groupes', 'nom'),
                 ('article_options_valeurs', 'prix_supplement'), ('article_options_valeurs', 'groupe_id'),
                 ('articles', 'gere_variantes'), ('articles', 'est_vitrine'),
                 ('commandes', 'client_email'), ('commandes', 'client_telephone'),
                 ('commandes', 'encaisse_mode'), ('commandes', 'encaisse_montant'), ('commandes', 'encaisse_le'),
                 ('commandes', 'temps_prepa_minutes')) AS x(t, c)
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema = 'public' AND table_name = x.t AND column_name = x.c);
  IF manquantes IS NOT NULL THEN
    RAISE EXCEPTION 'Colonnes absentes : %', manquantes;
  END IF;
END $$;

-- ─── B. L'ORIGINE D'UNE COMMANDE ────────────────────────────────────────────
ALTER TABLE public.commandes
  ADD COLUMN IF NOT EXISTS origine text NOT NULL DEFAULT 'en_ligne';

ALTER TABLE public.commandes DROP CONSTRAINT IF EXISTS commandes_origine_check;
ALTER TABLE public.commandes
  ADD CONSTRAINT commandes_origine_check CHECK (origine IN ('en_ligne', 'commercant'));

COMMENT ON COLUMN public.commandes.origine IS
  'en_ligne : passee par le client (app, site). commercant : encodee a la main par le commercant ou son equipe (telephone, comptoir).';

-- La note libre du commerçant (« sans oignons ») : créée si elle manque.
ALTER TABLE public.commandes
  ADD COLUMN IF NOT EXISTS notes_client text;

GRANT SELECT (origine, notes_client) ON public.commandes TO authenticated;

-- ─── C. TÉLÉPHONE ET E-MAIL FACULTATIFS ────────────────────────────────────
ALTER TABLE public.commandes ALTER COLUMN client_email DROP NOT NULL;
ALTER TABLE public.commandes ALTER COLUMN client_telephone DROP NOT NULL;

-- ─── D. LE CONTRÔLE DE CAPACITÉ SOUS VERROU ────────────────────────────────
-- Texte repris de MIGRATION_I7_I8_TOURNEE_FERMEE_CAPACITE.sql (vérifié égal au
-- texte en base le 10/10), avec UNE ligne ajoutée : l'exemption du commerçant.
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

  -- 🔴 10/10 : LA COMMANDE ENCODÉE PAR LE COMMERÇANT PASSE. Il a été prévenu
  -- (« ce créneau est plein ») et a confirmé d'un second geste. Elle COMPTE
  -- ensuite pour toutes les commandes suivantes, comme n'importe laquelle.
  IF NEW.origine = 'commercant' THEN
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

  IF v_mode = 'temps' THEN
    IF COALESCE(v_temps, 0) <= 0 THEN RETURN NEW; END IF;
  ELSE
    IF COALESCE(v_max, 0) <= 0 THEN RETURN NEW; END IF;
  END IF;

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

COMMIT;

-- ─── CONTRÔLE : une ligne par vérification, valeur ET attendu ──────────────
SELECT * FROM (
  SELECT 1 AS n, 'colonne origine (type:nullable:defaut)'::text AS controle,
         (SELECT data_type || ':' || is_nullable || ':' || coalesce(column_default, '-') FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'commandes' AND column_name = 'origine')::text AS valeur,
         'text:NO:''en_ligne''::text'::text AS attendu
  UNION ALL SELECT 2, 'contrainte origine',
         (SELECT pg_get_constraintdef(oid) FROM pg_constraint
           WHERE conrelid = 'public.commandes'::regclass AND conname = 'commandes_origine_check')::text,
         'CHECK ((origine = ANY (ARRAY[''en_ligne''::text, ''commercant''::text])))'
  UNION ALL SELECT 3, 'commandes existantes toutes en ligne',
         (SELECT count(*) FROM public.commandes WHERE origine <> 'en_ligne')::text, '0'
  UNION ALL SELECT 4, 'authenticated lit origine et notes_client',
         (has_column_privilege('authenticated', 'public.commandes', 'origine', 'SELECT')
          AND has_column_privilege('authenticated', 'public.commandes', 'notes_client', 'SELECT'))::text, 'true'
  UNION ALL SELECT 5, 'telephone et e-mail facultatifs',
         (SELECT string_agg(column_name || ':' || is_nullable, ', ' ORDER BY column_name) FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'commandes' AND column_name IN ('client_email', 'client_telephone'))::text,
         'client_email:YES, client_telephone:YES'
  UNION ALL SELECT 6, 'le verrou exempte le commercant',
         (SELECT CASE WHEN pg_get_functiondef(p.oid) LIKE '%IF NEW.origine = ''commercant'' THEN%' THEN 'oui' ELSE 'NON' END
            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'commandes_capacite_creneau')::text, 'oui'
  UNION ALL SELECT 7, 'le verrou garde sa regle pour le reste',
         (SELECT CASE WHEN pg_get_functiondef(p.oid) LIKE '%IF v_nb + 1 > v_max THEN%'
                       AND pg_get_functiondef(p.oid) LIKE '%pg_advisory_xact_lock%' THEN 'oui' ELSE 'NON' END
            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'commandes_capacite_creneau')::text, 'oui'
  UNION ALL SELECT 8, 'declencheur de capacite present et actif',
         (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.commandes'::regclass
             AND tgname = 'trg_commandes_capacite_creneau' AND tgenabled = 'O')::text, '1'
  UNION ALL SELECT 9, 'fonction fermee a authenticated',
         has_function_privilege('authenticated', 'public.commandes_capacite_creneau()', 'EXECUTE')::text, 'false'
) t ORDER BY n;
