-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_NUMERO_COMMANDE.sql
--
-- La numérotation des commandes ET des rendez-vous, refaite pour qu'un doublon
-- soit IMPOSSIBLE.
--
-- ⚠️ LE DÉFAUT DE FOND N'EST PAS LE CALCUL, C'EST LA MÉTHODE.
-- L'ancien déclencheur faisait `SELECT MAX(numero_commande) + 1`. Deux commandes
-- qui arrivent dans la même seconde LISENT LE MÊME MAXIMUM et repartent avec le
-- MÊME NUMÉRO. Un samedi matin de boulangerie, ça arrive, et le commerçant a
-- deux « #7 » à servir sans savoir laquelle est laquelle. Le numéro est le seul
-- langage commun entre lui et son client : c'est le pire endroit pour un
-- à-peu-près.
--
-- La seule façon fiable est un COMPTEUR qu'on incrémente EN LE VERROUILLANT.
-- L'`UPDATE ... RETURNING` ci-dessous pose un verrou de ligne : deux commandes
-- simultanées passent forcément l'une après l'autre. Plus un INDEX UNIQUE, qui
-- rend le doublon impossible même si un jour quelqu'un écrit un numéro à la main.
--
-- ─── CE QUE LE COMMERÇANT LIT ──────────────────────────────────────────────
--
--   Click & Collect (avec créneau)  →  CC12
--   Livraison                       →  LI5
--   Expédition (colis)              →  EX3
--   Retrait en magasin              →  RE12
--   Rendez-vous                     →  RV7
--
-- Deux lettres partout : symétrique, lisible à voix haute au comptoir, et
-- impossible à confondre avec le numéro lui-même (décision Alex du 10/08).
--
-- Des compteurs SÉPARÉS par mode : le commerçant lit d'un coup d'œil « douze
-- retraits et cinq livraisons cette semaine ». `CC12` et `LI12` coexistent sans
-- être des doublons, la référence complète les distingue.
--
-- ⚠️ UN NUMÉRO N'EST JAMAIS RÉATTRIBUÉ. Une commande annulée GARDE le sien.
-- C'est un document commercial : réutiliser un numéro, c'est se retrouver avec
-- deux tickets « CC7 » différents dans la même semaine et un litige impossible
-- à trancher. Il y aura donc des trous dans la suite, et c'est normal.
--
-- ⚠️ LA SEMAINE EST STOCKÉE, pas seulement déduite. C'est elle qui porte
-- l'unicité, et qui lève la confusion d'une semaine à l'autre : `CC12` de la
-- semaine 33 et `CC12` de la semaine 34 sont deux lignes distinctes et assumées.
-- Format ISO (`IYYY-IW`) : il gère correctement le passage d'une année à l'autre,
-- là où l'année civile couperait une semaine en deux.
--
-- ⚠️ LES RENDEZ-VOUS N'ÉTAIENT PAS NUMÉROTÉS. La colonne `numero_rdv` existe
-- depuis le début et AUCUNE ligne ne l'écrivait : l'écran client va jusqu'à
-- interroger le serveur en boucle pour l'obtenir, en vain. Ils entrent dans le
-- même mécanisme, avec le préfixe RV.
--
-- ⚠️ LES ANCIENNES LIGNES NE SONT PAS RENUMÉROTÉES (décision Alex du 10/08 :
-- « c'était du test »). Elles gardent leur numéro nu, sans préfixe ni semaine.
-- Renuméroter aurait de toute façon été exclu : un client peut avoir gardé son
-- email de confirmation.
--
-- Idempotente : ré-exécutable sans effet de bord.
--
-- Vérification attendue en fin de script :
--   table_compteurs = 1, colonnes_commandes = 2, colonnes_rdv = 2,
--   index_uniques = 2, declencheurs = 2
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Les colonnes qui portent la référence ──────────────────────────────

ALTER TABLE commandes
  ADD COLUMN IF NOT EXISTS numero_semaine text,
  ADD COLUMN IF NOT EXISTS numero_prefixe text;

ALTER TABLE rdv_reservations
  ADD COLUMN IF NOT EXISTS numero_semaine text,
  ADD COLUMN IF NOT EXISTS numero_prefixe text;

COMMENT ON COLUMN commandes.numero_semaine IS
  'Semaine ISO de la numérotation (IYYY-IW). Stockée et non déduite : c''est elle qui porte l''unicité et qui distingue le CC12 de la semaine 33 de celui de la semaine 34.';
COMMENT ON COLUMN commandes.numero_prefixe IS
  'CC = Click & Collect, LI = livraison, EX = expédition, RE = retrait en magasin. Des compteurs séparés par mode, pour que le commerçant lise son activité d''un coup d''œil.';
COMMENT ON COLUMN rdv_reservations.numero_prefixe IS
  'RV pour les rendez-vous. Même mécanisme et même compteur que les commandes.';

-- ─── 2. Le compteur, une ligne par commerçant / semaine / mode ─────────────

CREATE TABLE IF NOT EXISTS compteurs_commande (
  commercant_id uuid    NOT NULL REFERENCES commercants(id) ON DELETE CASCADE,
  semaine       text    NOT NULL,
  prefixe       text    NOT NULL DEFAULT '',
  dernier       integer NOT NULL DEFAULT 0,
  PRIMARY KEY (commercant_id, semaine, prefixe)
);

COMMENT ON TABLE compteurs_commande IS
  'Dernier numéro attribué par commerçant, semaine et mode (commandes ET rendez-vous). Incrémenté sous verrou de ligne : c''est ce verrou, et lui seul, qui empêche deux enregistrements simultanés de recevoir le même numéro.';

-- GRANT explicite (règle projet). Personne n'y touche directement : seuls les
-- déclencheurs, qui s'exécutent avec les droits du propriétaire.
REVOKE ALL ON compteurs_commande FROM anon, authenticated;
GRANT ALL ON compteurs_commande TO service_role;

ALTER TABLE compteurs_commande ENABLE ROW LEVEL SECURITY;
-- Aucune policy : la table n'est lue par personne d'autre que les déclencheurs.
-- C'est volontaire, elle ne contient rien qui regarde qui que ce soit.

-- ─── 3. Le cœur : attribuer un numéro sous verrou ──────────────────────────

CREATE OR REPLACE FUNCTION public.prochain_numero(
  p_commercant_id uuid,
  p_semaine       text,
  p_prefixe       text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_numero integer;
BEGIN
  -- La ligne de compteur existe-t-elle ? On la crée si besoin, sans écraser
  -- celle d'une transaction concurrente.
  INSERT INTO compteurs_commande (commercant_id, semaine, prefixe, dernier)
  VALUES (p_commercant_id, p_semaine, p_prefixe, 0)
  ON CONFLICT (commercant_id, semaine, prefixe) DO NOTHING;

  -- ⚠️ LE CŒUR DU CORRECTIF. Cet UPDATE pose un VERROU DE LIGNE : un second
  -- enregistrement qui arrive au même instant ATTEND que celui-ci soit validé,
  -- puis lit la valeur à jour. C'est ce qui rend le doublon impossible, là où
  -- `MAX + 1` laissait les deux lire la même chose.
  UPDATE compteurs_commande
     SET dernier = dernier + 1
   WHERE commercant_id = p_commercant_id
     AND semaine = p_semaine
     AND prefixe = p_prefixe
  RETURNING dernier INTO v_numero;

  RETURN v_numero;
END;
$function$;

-- ─── 4. Le déclencheur des COMMANDES ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_commande_numero()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_semaine text;
  v_prefixe text;
BEGIN
  -- Un numéro déjà posé n'est jamais recalculé.
  IF NEW.numero_commande IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- La semaine du RETRAIT, pas celle de la prise de commande : c'est la semaine
  -- de travail du commerçant, celle qu'il a sous les yeux.
  v_semaine := to_char(COALESCE(NEW.date_commande, CURRENT_DATE), 'IYYY-IW');

  v_prefixe := CASE
    WHEN NEW.mode_retrait = 'livraison'  THEN 'LI'
    WHEN NEW.mode_retrait = 'expedition' THEN 'EX'
    -- ⚠️ Le Click & Collect se reconnaît à son CRÉNEAU : un retrait en magasin
    -- porte le MÊME `mode_retrait` mais n'a pas d'heure convenue. C'est la seule
    -- différence entre les deux, et elle est facile à manquer.
    WHEN NEW.creneau_id IS NOT NULL      THEN 'CC'
    ELSE 'RE'
  END;

  NEW.numero_commande := prochain_numero(NEW.commercant_id, v_semaine, v_prefixe);
  NEW.numero_semaine  := v_semaine;
  NEW.numero_prefixe  := v_prefixe;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_set_commande_numero ON commandes;
CREATE TRIGGER trg_set_commande_numero
  BEFORE INSERT ON commandes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_commande_numero();

-- ─── 5. Le déclencheur des RENDEZ-VOUS ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_rdv_numero()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_semaine text;
BEGIN
  IF NEW.numero_rdv IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_semaine := to_char(COALESCE(NEW.date_rdv, CURRENT_DATE), 'IYYY-IW');

  NEW.numero_rdv     := prochain_numero(NEW.commercant_id, v_semaine, 'RV');
  NEW.numero_semaine := v_semaine;
  NEW.numero_prefixe := 'RV';
  RETURN NEW;
END;
$function$;

-- ⚠️ On retire d'abord tout déclencheur de numérotation qui existerait déjà sur
-- les rendez-vous : deux déclencheurs qui numérotent la même colonne se
-- marcheraient dessus, et le second effacerait le travail du premier. Le filtre
-- vise UNIQUEMENT les fonctions dont le nom parle de numéro.
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT tg.tgname
      FROM pg_trigger tg
      JOIN pg_proc p ON p.oid = tg.tgfoid
     WHERE tg.tgrelid = 'rdv_reservations'::regclass
       AND NOT tg.tgisinternal
       AND p.proname ILIKE '%numero%'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON rdv_reservations', t.tgname);
    RAISE NOTICE 'Ancien déclencheur de numérotation retiré : %', t.tgname;
  END LOOP;
END $$;

CREATE TRIGGER trg_set_rdv_numero
  BEFORE INSERT ON rdv_reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_rdv_numero();

-- ─── 6. Le doublon rendu impossible ────────────────────────────────────────
-- La ceinture après les bretelles : même si un numéro était écrit à la main, la
-- base refuserait le doublon.
--
-- ⚠️ Les index ne couvrent QUE les lignes qui portent la nouvelle référence. Les
-- anciennes ont `numero_semaine` à NULL et ne sont pas renumérotées : sans ce
-- filtre, l'index échouerait à se créer sur des numéros qui se répètent d'une
-- semaine à l'autre dans l'ancien modèle.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_commande_numero
  ON commandes (commercant_id, numero_semaine, numero_prefixe, numero_commande)
  WHERE numero_semaine IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_rdv_numero
  ON rdv_reservations (commercant_id, numero_semaine, numero_prefixe, numero_rdv)
  WHERE numero_semaine IS NOT NULL;

-- ─── Vérification ──────────────────────────────────────────────────────────
-- Interroge l'état réel de la base, jamais une tautologie.
SELECT
  (SELECT COUNT(*) FROM information_schema.tables
    WHERE table_name = 'compteurs_commande')                          AS table_compteurs,
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'commandes'
      AND column_name IN ('numero_semaine', 'numero_prefixe'))        AS colonnes_commandes,
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'rdv_reservations'
      AND column_name IN ('numero_semaine', 'numero_prefixe'))        AS colonnes_rdv,
  (SELECT COUNT(*) FROM pg_indexes
    WHERE indexname IN ('uidx_commande_numero', 'uidx_rdv_numero'))   AS index_uniques,
  (SELECT COUNT(*) FROM pg_trigger
    WHERE tgname IN ('trg_set_commande_numero', 'trg_set_rdv_numero')) AS declencheurs;
