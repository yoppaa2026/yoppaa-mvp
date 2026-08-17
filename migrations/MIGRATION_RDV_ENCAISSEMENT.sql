-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_RDV_ENCAISSEMENT.sql
--
-- ⚠️ CE QUE CETTE MIGRATION RÉPARE : « HONORÉ » ET « PAYÉ » ÉTAIENT LE MÊME
-- CLIC (Alex, 17/08 : « lorsque le commerçant clique sur honoré, le RDV passe
-- en payé mais il ne clique sur rien »).
--
-- Venir n'est pas payer. La pastille annonçait pourtant « Payé 15,00 € » sur la
-- seule foi du bouton vert, sans que personne n'ait jamais dit ni SI ni COMMENT
-- l'argent était entré. Deux faits distincts confondus en un seul.
--
-- Et il manquait la moitié du journal comptable : l'export affiche aujourd'hui
-- « 1600 € en ligne, 0,00 € au comptoir » à un centre qui a encaissé treize
-- séances à 15 € au terminal et en espèces. Ces montants n'existaient nulle
-- part, donc aucune réconciliation n'était possible.
--
-- Trois colonnes, et un geste d'un tap au moment d'honorer.
--
-- ⚠️ DEUX MOYENS DE PAIEMENT, PAS TROIS. Le terminal et les espèces. Pas de
-- chèque : ça n'existe plus en Belgique (Alex, 17/08). Payconiq et Bancontact
-- au comptoir passent par le terminal ou le QR du commerçant, donc par
-- « terminal » : ce que Yoppaa enregistre, c'est ce qu'il DÉCLARE avoir
-- encaissé, jamais un paiement que Yoppaa aurait traité.
--
-- ⚠️ ET UNE TROISIÈME VALEUR, `rien`, QUI N'EST PAS UN MOYEN DE PAIEMENT mais
-- une RÉPONSE. Le client est venu et n'a pas payé : ça arrive, et il faut
-- pouvoir le dire. Sans cette valeur, « rien encaissé » et « question jamais
-- posée » se ressembleraient comme deux gouttes d'eau, tous deux à NULL, et
-- l'écran ne pourrait plus distinguer une dette d'un simple oubli de saisie.
-- Un NULL veut dire « on ne sait pas », `rien` veut dire « on sait que non ».
--
-- ⚠️ LE MONTANT EST STOCKÉ, PAS RECALCULÉ. Le prix d'une prestation peut
-- changer demain ; ce qui est entré en caisse ce jour-là, non. C'est la même
-- règle que le prix figé sur la réservation et la TVA figée sur le contrat.
--
-- Idempotente : ré-exécutable sans effet de bord. Aucune donnée n'est modifiée.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE rdv_reservations
  ADD COLUMN IF NOT EXISTS encaisse_mode    text,
  ADD COLUMN IF NOT EXISTS encaisse_montant numeric(10,2),
  ADD COLUMN IF NOT EXISTS encaisse_le      timestamptz;

-- ⚠️ LE CHECK EST INDISPENSABLE : sans lui, une faute de frappe dans le code
-- ferait entrer « especes » et « espèces » comme deux modes différents, et la
-- réconciliation du commerçant compterait sa caisse en double.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rdv_reservations_encaisse_mode_check'
  ) THEN
    ALTER TABLE rdv_reservations
      ADD CONSTRAINT rdv_reservations_encaisse_mode_check
      CHECK (encaisse_mode IS NULL OR encaisse_mode IN ('terminal', 'especes', 'rien'));
  END IF;
END $$;

COMMENT ON COLUMN rdv_reservations.encaisse_mode IS
  'Comment le commerçant DÉCLARE avoir encaissé au comptoir : terminal (Bancontact, carte, Payconiq) ou especes. NULL tant que rien n''a été encaissé sur place. Yoppaa ne traite aucun de ces paiements, il les enregistre.';
COMMENT ON COLUMN rdv_reservations.encaisse_montant IS
  'Montant réellement encaissé au comptoir, en euros. Le solde quand un acompte a été payé en ligne, le prix complet sinon. Figé au moment de l''encaissement.';
COMMENT ON COLUMN rdv_reservations.encaisse_le IS
  'Quand l''encaissement au comptoir a été déclaré. Sert au journal du jour et au rapprochement bancaire.';

-- Aucun GRANT ici : la table `rdv_reservations` existe déjà avec ses droits et
-- ses policies, et l'ajout de colonnes en hérite. La règle du GRANT explicite
-- vaut pour toute table CRÉÉE, ce qui n'est pas le cas ici.

-- ─── Vérification ──────────────────────────────────────────────────────────
-- Attendu : 3 lignes (encaisse_le, encaisse_mode, encaisse_montant).
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'rdv_reservations'
  AND column_name IN ('encaisse_mode', 'encaisse_montant', 'encaisse_le')
ORDER BY column_name;

-- Le CHECK est bien là. Attendu : 1 ligne.
SELECT conname FROM pg_constraint
WHERE conname = 'rdv_reservations_encaisse_mode_check';

-- Combien de rendez-vous honorés attendent encore leur mode d'encaissement.
-- Ils resteront tels quels : on ne devine pas comment quelqu'un a été payé.
SELECT
  count(*) FILTER (WHERE statut = 'honore')                             AS honores,
  count(*) FILTER (WHERE statut = 'honore' AND encaisse_mode IS NULL)   AS sans_mode
FROM rdv_reservations
WHERE deleted_at IS NULL;
