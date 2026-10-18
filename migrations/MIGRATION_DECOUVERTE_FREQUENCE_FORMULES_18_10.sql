-- ═══════════════════════════════════════════════════════════════════════════
-- DÉCOUVERTE, FRÉQUENCE DES CRÉNEAUX, FORMULES AFFICHÉES (18/10)
-- Demandes d'Emily (Centre Respire), décisions d'Alex au tableau.
-- À lancer sur TEST puis sur PROD, AVANT le code. Un seul coller : la dernière
-- requête rend une ligne par contrôle (valeur et attendu).
--
-- Rien ne change pour l'existant : toutes les nouvelles colonnes ont un défaut
-- qui garde le comportement d'aujourd'hui (pas de tarif découverte, créneaux
-- « chaque semaine », formules non affichées).
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1) LE TARIF DÉCOUVERTE, SUR LE COURS LUI-MÊME ─────────────────────────
-- Vide : pas de tarif découverte. 0 : une première séance offerte.
ALTER TABLE public.rdv_prestations
  ADD COLUMN IF NOT EXISTS prix_decouverte numeric(8,2);

ALTER TABLE public.rdv_prestations DROP CONSTRAINT IF EXISTS rdv_prestations_prix_decouverte_check;
ALTER TABLE public.rdv_prestations ADD CONSTRAINT rdv_prestations_prix_decouverte_check
  CHECK (prix_decouverte IS NULL OR prix_decouverte >= 0);

-- Le rendez-vous retient qu'il a été pris au tarif découverte (badge dans
-- l'agenda, chiffres). Le prix lui-même reste dans `prix_estime`.
ALTER TABLE public.rdv_reservations
  ADD COLUMN IF NOT EXISTS tarif_decouverte boolean NOT NULL DEFAULT false;

-- « A-t-il déjà suivi CE cours ? » Le serveur seul le demande.
-- ⚠️ JAMAIS OUVERTE À `anon` NI À `authenticated` : sinon n'importe qui
-- pourrait sonder si une adresse a déjà fréquenté un centre.
-- Reconnu par email (minuscules) OU par téléphone (les 9 derniers chiffres :
-- « +32 470… » et « 0470… » sont le même numéro).
-- Les réservations annulées ne comptent pas ; un « pas venu » compte.
CREATE OR REPLACE FUNCTION public.rdv_cours_deja_suivi(
  p_prestation_id uuid, p_email text, p_telephone text
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM rdv_reservations r
     WHERE r.prestation_id = p_prestation_id
       AND r.deleted_at IS NULL
       AND r.statut IN ('confirme', 'honore', 'no_show', 'reporte')
       AND (
         (nullif(trim(p_email), '') IS NOT NULL
           AND lower(trim(r.client_email)) = lower(trim(p_email)))
         OR (length(regexp_replace(coalesce(p_telephone, ''), '\D', '', 'g')) >= 8
           AND right(regexp_replace(coalesce(r.client_telephone, ''), '\D', '', 'g'), 9)
             = right(regexp_replace(p_telephone, '\D', '', 'g'), 9))
       )
  )
$$;
REVOKE ALL ON FUNCTION public.rdv_cours_deja_suivi(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rdv_cours_deja_suivi(uuid, text, text) TO service_role;

CREATE INDEX IF NOT EXISTS idx_rdv_resa_prestation_vivante
  ON public.rdv_reservations (prestation_id) WHERE deleted_at IS NULL;

-- La cliente ne retouche pas ce drapeau depuis le navigateur. On l'ajoute à
-- la liste gelée de `rdv_colonnes_reservees` EN PARTANT DE LA VERSION EN BASE
-- (pas d'une copie du dépôt, qui pourrait être en retard sur la prod).
DO $$
DECLARE
  def text;
BEGIN
  SELECT pg_get_functiondef('public.rdv_colonnes_reservees()'::regprocedure) INTO def;
  IF position('''tarif_decouverte''' IN def) = 0 THEN
    IF position('''prix_estime'', ' IN def) = 0 THEN
      RAISE EXCEPTION 'rdv_colonnes_reservees : ancre « prix_estime » introuvable, rien modifié';
    END IF;
    def := replace(def, '''prix_estime'', ', '''prix_estime'', ''tarif_decouverte'', ');
    EXECUTE def;
  END IF;
END $$;


-- ─── 2) LA FRÉQUENCE D'UN CRÉNEAU ──────────────────────────────────────────
-- Le créneau garde son jour (`jour_semaine`) ; la fréquence dit quelles
-- semaines il tombe :
--   'hebdo'          chaque semaine (défaut, comme aujourd'hui) ;
--   'deux_semaines'  une semaine sur deux, à partir de `date_depart` ;
--   'mensuel'        le 1er, 2e, 3e, 4e ou dernier (-1) jour du mois ;
--   'dates'          seulement les dates de `dates_choisies`.
ALTER TABLE public.rdv_creneaux
  ADD COLUMN IF NOT EXISTS frequence      text NOT NULL DEFAULT 'hebdo',
  ADD COLUMN IF NOT EXISTS date_depart    date,
  ADD COLUMN IF NOT EXISTS rang_mois      smallint,
  ADD COLUMN IF NOT EXISTS dates_choisies date[];

ALTER TABLE public.rdv_creneaux DROP CONSTRAINT IF EXISTS rdv_creneaux_frequence_check;
ALTER TABLE public.rdv_creneaux ADD CONSTRAINT rdv_creneaux_frequence_check
  CHECK (frequence IN ('hebdo', 'deux_semaines', 'mensuel', 'dates'));

ALTER TABLE public.rdv_creneaux DROP CONSTRAINT IF EXISTS rdv_creneaux_rang_mois_check;
ALTER TABLE public.rdv_creneaux ADD CONSTRAINT rdv_creneaux_rang_mois_check
  CHECK (rang_mois IS NULL OR rang_mois IN (1, 2, 3, 4, -1));

-- Chaque fréquence a ce qu'il lui faut, et seulement sur un créneau à jour fixe.
ALTER TABLE public.rdv_creneaux DROP CONSTRAINT IF EXISTS rdv_creneaux_frequence_complete_check;
ALTER TABLE public.rdv_creneaux ADD CONSTRAINT rdv_creneaux_frequence_complete_check
  CHECK (
    frequence = 'hebdo'
    OR (jour_semaine IS NOT NULL AND (
         (frequence = 'deux_semaines' AND date_depart IS NOT NULL)
      OR (frequence = 'mensuel' AND rang_mois IS NOT NULL)
      OR (frequence = 'dates' AND coalesce(cardinality(dates_choisies), 0) >= 1)
    ))
  );


-- ─── 3) UNE FORMULE AFFICHÉE SUR LA FICHE, À PRENDRE CHEZ LE COMMERÇANT ────
-- Quatrième choix : visible avec son prix, sans bouton d'achat.
-- « Seulement par toi » (ni en vente, ni affichée) reste invisible.
ALTER TABLE public.abonnement_formules
  ADD COLUMN IF NOT EXISTS affichee_fiche boolean NOT NULL DEFAULT false;

ALTER TABLE public.abonnement_formules DROP CONSTRAINT IF EXISTS abonnement_formules_affichee_ou_vendue_check;
ALTER TABLE public.abonnement_formules ADD CONSTRAINT abonnement_formules_affichee_ou_vendue_check
  CHECK (NOT (vente_en_ligne AND affichee_fiche));

-- La lecture publique s'élargit aux formules affichées, et à rien d'autre.
-- L'achat en ligne reste refusé par le serveur sans `vente_en_ligne`
-- (`formuleVendableEnLigne`, create-abonnement).
DROP POLICY IF EXISTS "abo_formules_lecture_publique" ON public.abonnement_formules;
CREATE POLICY "abo_formules_lecture_publique"
  ON public.abonnement_formules FOR SELECT
  TO anon, authenticated
  USING (actif IS TRUE AND deleted_at IS NULL
         AND (vente_en_ligne IS TRUE OR affichee_fiche IS TRUE));

-- GRANT : aucune table créée ; les colonnes héritent des droits existants.
-- Réaffirmé pour la vitrine (règle projet).
GRANT SELECT ON public.abonnement_formules TO anon;


-- ─── 4) CONTRÔLES : une ligne par contrôle ─────────────────────────────────
SELECT 1 AS n, 'colonne prix_decouverte' AS controle,
       (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='rdv_prestations' AND column_name='prix_decouverte')::text AS valeur, '1' AS attendu
UNION ALL SELECT 2, 'prestations avec un tarif découverte (rien ne bouge)',
       (SELECT count(*) FROM rdv_prestations WHERE prix_decouverte IS NOT NULL)::text, '0'
UNION ALL SELECT 3, 'colonne tarif_decouverte sur les rendez-vous',
       (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='rdv_reservations' AND column_name='tarif_decouverte')::text, '1'
UNION ALL SELECT 4, 'fonction rdv_cours_deja_suivi',
       (SELECT count(*) FROM pg_proc WHERE proname='rdv_cours_deja_suivi')::text, '1'
UNION ALL SELECT 5, 'anon peut l''appeler',
       has_function_privilege('anon', 'public.rdv_cours_deja_suivi(uuid,text,text)', 'EXECUTE')::text, 'false'
UNION ALL SELECT 6, 'authenticated peut l''appeler',
       has_function_privilege('authenticated', 'public.rdv_cours_deja_suivi(uuid,text,text)', 'EXECUTE')::text, 'false'
UNION ALL SELECT 7, 'service_role peut l''appeler',
       has_function_privilege('service_role', 'public.rdv_cours_deja_suivi(uuid,text,text)', 'EXECUTE')::text, 'true'
UNION ALL SELECT 8, 'tarif_decouverte gelé pour la cliente',
       (position('''tarif_decouverte''' IN pg_get_functiondef('public.rdv_colonnes_reservees()'::regprocedure)) > 0)::text, 'true'
UNION ALL SELECT 9, 'déclencheur des colonnes réservées toujours en place',
       (SELECT count(*) FROM pg_trigger WHERE tgname='trg_rdv_colonnes_reservees')::text, '1'
UNION ALL SELECT 10, 'colonnes de fréquence (4)',
       (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='rdv_creneaux' AND column_name IN ('frequence','date_depart','rang_mois','dates_choisies'))::text, '4'
UNION ALL SELECT 11, 'créneaux qui ne sont pas « chaque semaine » (rien ne bouge)',
       (SELECT count(*) FROM rdv_creneaux WHERE frequence <> 'hebdo')::text, '0'
UNION ALL SELECT 12, 'contraintes de fréquence (3)',
       (SELECT count(*) FROM pg_constraint WHERE conrelid='public.rdv_creneaux'::regclass AND conname IN ('rdv_creneaux_frequence_check','rdv_creneaux_rang_mois_check','rdv_creneaux_frequence_complete_check'))::text, '3'
UNION ALL SELECT 13, 'colonne affichee_fiche',
       (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='abonnement_formules' AND column_name='affichee_fiche')::text, '1'
UNION ALL SELECT 14, 'formules affichées (rien ne se publie seul)',
       (SELECT count(*) FROM abonnement_formules WHERE affichee_fiche)::text, '0'
UNION ALL SELECT 15, 'lecture publique des formules : nouvelle règle (type)',
       (SELECT string_agg(permissive, ',') FROM pg_policies WHERE tablename='abonnement_formules' AND policyname='abo_formules_lecture_publique' AND qual ILIKE '%affichee_fiche%'), 'PERMISSIVE'
UNION ALL SELECT 16, 'anon lit les formules',
       has_table_privilege('anon', 'public.abonnement_formules', 'SELECT')::text, 'true'
ORDER BY n;
