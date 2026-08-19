-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_NUMERO_ABONNEMENT.sql
--
-- Un vrai numéro pour les abonnements : ABT1, ABT2, ABT3…
--
-- ⚠️ LE DÉFAUT. L'export comptable affichait `46973dd9`, un fragment
-- d'identifiant technique. Le code espérait un `numero_abonnement` qui
-- N'EXISTAIT PAS en base : personne ne s'en était aperçu parce que le repli
-- rendait quelque chose, et que ce quelque chose ressemblait à une référence.
--
-- ⚠️ ET LA SÉRIE EST CONTINUE, elle ne repart PAS à 1 chaque semaine, à la
-- différence des commandes et des rendez-vous. Décision d'Alex du 19/08, et
-- c'est la bonne : un abonnement n'est pas une transaction de la semaine, c'est
-- un CONTRAT. Il vit douze mois, on le cite des mois après sa souscription, on
-- le résilie, on y rattache des séances. Un numéro de contrat qui repart à zéro
-- toutes les semaines serait inutilisable.
--
-- ⚠️ ON RÉUTILISE LE COMPTEUR DES COMMANDES, sans en créer un second. La
-- fonction `prochain_numero(commercant, semaine, prefixe)` pose déjà le verrou
-- de ligne qui rend le doublon impossible. On lui passe la semaine `continu`,
-- une valeur sentinelle : la clé primaire du compteur reste satisfaite, et la
-- série ne se réinitialise jamais puisque cette « semaine » ne change pas.
--
-- ⚠️ JAMAIS DE `MAX + 1`. C'est le défaut que la numérotation des commandes a
-- corrigé le 10/08 : deux souscriptions simultanées lisent le même maximum et
-- repartent avec le même numéro. Seul un compteur verrouillé l'empêche.
--
-- ⚠️ UN NUMÉRO N'EST JAMAIS RÉATTRIBUÉ, même si un contrat est supprimé. Il y
-- aura donc des trous dans la suite, et c'est normal : c'est un document
-- commercial, deux contrats « ABT7 » rendraient un litige impossible à trancher.
--
-- ⚠️ LES CONTRATS EXISTANTS SONT NUMÉROTÉS, contrairement au choix fait pour
-- les commandes le 10/08. La raison est différente : une commande passée porte
-- un numéro que le client a lu dans son email, et le renuméroter créerait deux
-- vérités. Un abonnement, lui, n'a JAMAIS eu de numéro : il n'y a rien à
-- contredire, et les laisser sans référence ferait cohabiter dans le même
-- export des lignes numérotées et des fragments d'identifiant.
--
-- Idempotente : ré-exécutable sans effet de bord.
--
-- Vérification attendue en fin de script :
--   colonnes = 2, index_unique = 1, declencheur = 1, sans_numero = 0
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Les colonnes ───────────────────────────────────────────────────────

ALTER TABLE abonnements
  ADD COLUMN IF NOT EXISTS numero_abonnement integer,
  ADD COLUMN IF NOT EXISTS numero_prefixe    text;

COMMENT ON COLUMN abonnements.numero_abonnement IS
  'Numéro de contrat, série CONTINUE par commerçant : elle ne repart jamais à 1, contrairement aux commandes et aux rendez-vous. Un abonnement est un contrat qui vit des mois, pas une transaction de la semaine.';

COMMENT ON COLUMN abonnements.numero_prefixe IS
  'ABT. Deux à trois lettres, comme CC, LI, EX, RE et RV, pour qu''une référence se lise à voix haute sans ambiguïté.';

-- ─── 2. Le déclencheur ─────────────────────────────────────────────────────
--
-- Il s'appuie sur `prochain_numero`, créée par MIGRATION_NUMERO_COMMANDE.sql,
-- qui incrémente le compteur SOUS VERROU DE LIGNE.

CREATE OR REPLACE FUNCTION public.set_abonnement_numero()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Un numéro déjà posé n'est jamais recalculé.
  IF NEW.numero_abonnement IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- ⚠️ `continu` N'EST PAS UNE SEMAINE, c'est une valeur sentinelle. Elle ne
  -- change jamais, donc le compteur ne se réinitialise jamais : c'est
  -- exactement la série continue voulue, obtenue sans dupliquer le mécanisme
  -- de verrouillage qui a déjà fait ses preuves.
  NEW.numero_abonnement := prochain_numero(NEW.commercant_id, 'continu', 'ABT');
  NEW.numero_prefixe    := 'ABT';
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_abonnement_numero ON abonnements;
CREATE TRIGGER trg_abonnement_numero
  BEFORE INSERT ON abonnements
  FOR EACH ROW
  EXECUTE FUNCTION public.set_abonnement_numero();

-- ─── 3. Les contrats déjà signés ───────────────────────────────────────────
--
-- Numérotés dans leur ordre de CRÉATION, commerçant par commerçant, pour que la
-- suite raconte l'histoire réelle des souscriptions.
--
-- ⚠️ ET LE COMPTEUR EST MIS À NIVEAU DANS LA FOULÉE. Sans cela, la prochaine
-- souscription repartirait de 1 et entrerait en collision avec le premier
-- contrat rattrapé : l'index unique la refuserait, et la vente échouerait.

WITH numerotes AS (
  SELECT id,
         commercant_id,
         row_number() OVER (PARTITION BY commercant_id ORDER BY created_at, id) AS rang
    FROM abonnements
   WHERE numero_abonnement IS NULL
)
UPDATE abonnements a
   SET numero_abonnement = n.rang,
       numero_prefixe    = 'ABT'
  FROM numerotes n
 WHERE a.id = n.id;

INSERT INTO compteurs_commande (commercant_id, semaine, prefixe, dernier)
SELECT commercant_id, 'continu', 'ABT', max(numero_abonnement)
  FROM abonnements
 WHERE numero_abonnement IS NOT NULL
 GROUP BY commercant_id
ON CONFLICT (commercant_id, semaine, prefixe)
DO UPDATE SET dernier = GREATEST(compteurs_commande.dernier, EXCLUDED.dernier);

-- ─── 4. Le doublon rendu impossible ────────────────────────────────────────
--
-- Le verrou empêche la course ; l'index empêche aussi la faute humaine, par
-- exemple un numéro écrit à la main dans un script de rattrapage.

CREATE UNIQUE INDEX IF NOT EXISTS idx_abonnement_numero_unique
  ON abonnements (commercant_id, numero_prefixe, numero_abonnement)
  WHERE numero_abonnement IS NOT NULL;

COMMIT;

-- ─── CONTRÔLE ──────────────────────────────────────────────────────────────
-- ⚠️ Il interroge l'ÉTAT RÉEL de la base, jamais une requête dont le résultat
-- serait connu d'avance. Attendu : 2, 1, 1, 0.
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_name = 'abonnements'
      AND column_name IN ('numero_abonnement', 'numero_prefixe'))            AS colonnes,
  (SELECT count(*) FROM pg_indexes
    WHERE tablename = 'abonnements'
      AND indexname = 'idx_abonnement_numero_unique')                        AS index_unique,
  (SELECT count(*) FROM pg_trigger
    WHERE tgname = 'trg_abonnement_numero' AND NOT tgisinternal)             AS declencheur,
  (SELECT count(*) FROM abonnements WHERE numero_abonnement IS NULL)         AS sans_numero;
