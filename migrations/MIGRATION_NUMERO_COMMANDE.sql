-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_NUMERO_COMMANDE.sql
--
-- La numérotation des commandes, refaite pour qu'un doublon soit IMPOSSIBLE.
--
-- ⚠️ LE DÉFAUT DE FOND N'EST PAS LE CALCUL, C'EST LA MÉTHODE.
-- L'ancien déclencheur faisait `SELECT MAX(numero_commande) + 1`. Deux commandes
-- qui arrivent dans la même seconde LISENT LE MÊME MAXIMUM et repartent avec le
-- MÊME NUMÉRO. Un samedi matin de boulangerie, ça arrive, et le commerçant a
-- deux « #7 » à servir sans savoir laquelle est laquelle. Le numéro est le seul
-- langage commun entre lui et son client : c'est le pire endroit pour un à-peu-près.
--
-- La seule façon fiable est un COMPTEUR qu'on incrémente EN LE VERROUILLANT.
-- L'`UPDATE ... RETURNING` ci-dessous pose un verrou de ligne : deux commandes
-- simultanées passent forcément l'une après l'autre. Plus un INDEX UNIQUE, qui
-- rend le doublon impossible même si un jour quelqu'un écrit un numéro à la main.
--
-- ─── CE QUI CHANGE POUR LE COMMERÇANT ──────────────────────────────────────
--
--   Click & Collect (avec créneau)  →  C12
--   Livraison                       →  L5
--   Expédition (colis)              →  E3
--   Retrait en magasin              →  12   (pas de préfixe, décision Alex)
--
-- Des compteurs SÉPARÉS par mode : le commerçant lit d'un coup d'œil « douze
-- retraits et cinq livraisons cette semaine ». `C12` et `L12` coexistent sans
-- être des doublons, la référence complète les distingue.
--
-- ⚠️ UN NUMÉRO N'EST JAMAIS RÉATTRIBUÉ. Une commande annulée GARDE le sien.
-- C'est un document commercial : réutiliser un numéro, c'est se retrouver avec
-- deux tickets « C7 » différents dans la même semaine et un litige impossible à
-- trancher. Il y aura donc des trous dans la suite, et c'est normal.
--
-- ⚠️ LA SEMAINE EST STOCKÉE, pas seulement déduite. C'est elle qui porte
-- l'unicité, et qui lève la confusion d'une semaine à l'autre : `C12` de la
-- semaine 33 et `C12` de la semaine 34 sont deux lignes distinctes et assumées.
-- Format ISO (`IYYY-IW`) : il gère correctement le passage d'une année à l'autre,
-- là où l'année civile couperait une semaine en deux.
--
-- ⚠️ LES ANCIENNES COMMANDES NE SONT PAS RENUMÉROTÉES (décision Alex du 10/08 :
-- « c'était du test »). Elles gardent leur numéro nu, sans préfixe ni semaine.
-- Renuméroter aurait de toute façon été exclu : un client peut avoir gardé son
-- email de confirmation.
--
-- Idempotente : ré-exécutable sans effet de bord.
--
-- Vérification attendue en fin de script :
--   table_compteurs = 1, colonnes = 2, index_unique = 1, declencheur = 1
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Les deux colonnes qui portent la référence ─────────────────────────

ALTER TABLE commandes
  ADD COLUMN IF NOT EXISTS numero_semaine text,
  ADD COLUMN IF NOT EXISTS numero_prefixe text;

COMMENT ON COLUMN commandes.numero_semaine IS
  'Semaine ISO de la numérotation (IYYY-IW). Stockée et non déduite : c''est elle qui porte l''unicité et qui distingue le C12 de la semaine 33 de celui de la semaine 34.';
COMMENT ON COLUMN commandes.numero_prefixe IS
  'C = Click & Collect, L = livraison, E = expédition, vide = retrait en magasin. Des compteurs séparés par mode, pour que le commerçant lise son activité d''un coup d''œil.';

-- ─── 2. Le compteur, une ligne par commerçant / semaine / mode ─────────────

CREATE TABLE IF NOT EXISTS compteurs_commande (
  commercant_id uuid    NOT NULL REFERENCES commercants(id) ON DELETE CASCADE,
  semaine       text    NOT NULL,
  prefixe       text    NOT NULL DEFAULT '',
  dernier       integer NOT NULL DEFAULT 0,
  PRIMARY KEY (commercant_id, semaine, prefixe)
);

COMMENT ON TABLE compteurs_commande IS
  'Dernier numéro attribué par commerçant, semaine et mode. Incrémenté sous verrou de ligne : c''est ce verrou, et lui seul, qui empêche deux commandes simultanées de recevoir le même numéro.';

-- GRANT explicite (règle projet). Personne n'y touche directement : seul le
-- déclencheur, qui s'exécute avec les droits du propriétaire (SECURITY DEFINER).
REVOKE ALL ON compteurs_commande FROM anon, authenticated;
GRANT ALL ON compteurs_commande TO service_role;

ALTER TABLE compteurs_commande ENABLE ROW LEVEL SECURITY;
-- Aucune policy : la table n'est lue par personne d'autre que le déclencheur.
-- C'est volontaire, elle ne contient rien qui regarde qui que ce soit.

-- ─── 3. Le déclencheur ─────────────────────────────────────────────────────

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
  -- Un numéro déjà posé n'est jamais recalculé : ni au réenregistrement, ni si
  -- un jour on reprend une commande à la main.
  IF NEW.numero_commande IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- La semaine du RETRAIT, pas celle de la prise de commande : c'est la semaine
  -- de travail du commerçant, celle qu'il a sous les yeux.
  v_semaine := to_char(COALESCE(NEW.date_commande, CURRENT_DATE), 'IYYY-IW');

  v_prefixe := CASE
    WHEN NEW.mode_retrait = 'livraison'  THEN 'L'
    WHEN NEW.mode_retrait = 'expedition' THEN 'E'
    -- Le Click & Collect se reconnaît à son CRÉNEAU : un retrait en magasin
    -- porte le même `mode_retrait` mais n'a pas d'heure convenue.
    WHEN NEW.creneau_id IS NOT NULL      THEN 'C'
    ELSE ''
  END;

  -- La ligne de compteur existe-t-elle ? On la crée si besoin, sans écraser
  -- celle d'une transaction concurrente.
  INSERT INTO compteurs_commande (commercant_id, semaine, prefixe, dernier)
  VALUES (NEW.commercant_id, v_semaine, v_prefixe, 0)
  ON CONFLICT (commercant_id, semaine, prefixe) DO NOTHING;

  -- ⚠️ LE CŒUR DU CORRECTIF. Cet UPDATE pose un VERROU DE LIGNE : une seconde
  -- commande qui arrive au même instant ATTEND que celle-ci soit validée, puis
  -- lit la valeur à jour. C'est ce qui rend le doublon impossible, là où
  -- `MAX + 1` laissait les deux lire la même chose.
  UPDATE compteurs_commande
     SET dernier = dernier + 1
   WHERE commercant_id = NEW.commercant_id
     AND semaine = v_semaine
     AND prefixe = v_prefixe
  RETURNING dernier INTO NEW.numero_commande;

  NEW.numero_semaine := v_semaine;
  NEW.numero_prefixe := v_prefixe;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_set_commande_numero ON commandes;
CREATE TRIGGER trg_set_commande_numero
  BEFORE INSERT ON commandes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_commande_numero();

-- ─── 4. Le doublon rendu impossible ────────────────────────────────────────
-- La ceinture après les bretelles : même si un numéro était écrit à la main, la
-- base refuserait le doublon.
--
-- ⚠️ L'index ne couvre QUE les lignes qui portent la nouvelle référence. Les
-- anciennes commandes ont `numero_semaine` à NULL et ne sont pas renumérotées :
-- sans ce filtre, l'index échouerait à se créer sur des numéros qui se répètent
-- d'une semaine à l'autre dans l'ancien modèle.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_commande_numero
  ON commandes (commercant_id, numero_semaine, numero_prefixe, numero_commande)
  WHERE numero_semaine IS NOT NULL;

-- ─── Vérification ──────────────────────────────────────────────────────────
-- Interroge l'état réel de la base, jamais une tautologie.
SELECT
  (SELECT COUNT(*) FROM information_schema.tables
    WHERE table_name = 'compteurs_commande')                         AS table_compteurs,
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'commandes'
      AND column_name IN ('numero_semaine', 'numero_prefixe'))       AS colonnes,
  (SELECT COUNT(*) FROM pg_indexes
    WHERE tablename = 'commandes' AND indexname = 'uidx_commande_numero') AS index_unique,
  (SELECT COUNT(*) FROM pg_trigger
    WHERE tgrelid = 'commandes'::regclass
      AND tgname = 'trg_set_commande_numero')                        AS declencheur;
