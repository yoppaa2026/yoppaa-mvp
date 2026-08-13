-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_LIEUX_PLANNING.sql
--
-- LE LIEU DEVIENT LE PORTEUR DES DISPONIBILITÉS.
--
-- Jusqu'ici, les plages de réservation et les créneaux de retrait
-- appartenaient au COMMERCE en général : un mardi, une heure, une capacité,
-- sans jamais dire OÙ. Tant qu'un commerce n'a qu'une adresse, ça se tient.
-- Ça s'effondre dès qu'il bouge :
--
--   • le food truck a DEUX emplacements le même jour, celui du midi et celui
--     du soir. La table des lieux l'interdisait formellement, par un index
--     unique « un lieu par jour » ;
--   • la professeure de yoga donne cours dans deux salles. Un client qui
--     réserve recevait l'adresse du SIÈGE SOCIAL, donc, si elle a décoché la
--     case, son DOMICILE.
--
-- Ce que la migration pose, dans l'ordre :
--   1. deux lieux par jour, distingués par leur heure de début ;
--   2. le rattachement des plages de retrait C&C à un lieu, et leur ouverture
--      aux lieux occasionnels (un marché a une date, pas un jour de semaine) ;
--   3. le rattachement des plages de réservation RDV à un lieu ;
--   4. le lieu FIGÉ dans la réservation et dans la commande.
--
-- ⚠️ TOUTES LES COLONNES SONT NULLABLES, ET C'EST CE QUI PROTÈGE L'EXISTANT.
-- `lieu_id` à NULL veut dire « le lieu principal du commerce », c'est-à-dire
-- exactement ce que le paramétrage actuel signifie déjà. Aucun commerçant
-- inscrit ne voit son planning changer, et aucune ligne n'est à réécrire.
--
-- ⚠️ POURQUOI FIGER LE LIEU DANS LA RÉSERVATION plutôt que le recalculer.
-- Alex a tranché le 13/08 : un commerçant ne peut PAS déplacer un emplacement
-- qui porte des rendez-vous. Il doit d'abord les annuler, puis inviter ses
-- clients à reprendre place. Le lieu figé est ce qui rend ce verrou vérifiable,
-- et le libellé figé garantit qu'un rendez-vous passé dit toujours où il a eu
-- lieu, même si le lieu a été supprimé depuis.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1) DEUX LIEUX PAR JOUR ────────────────────────────────────────────────
-- Les deux index uniques disaient « un lieu par jour ». Ils disent désormais
-- « un lieu par jour ET par heure de début ».
--
-- ⚠️ `coalesce` est indispensable : en SQL, deux NULL ne sont pas égaux, donc
-- un index unique portant directement sur `heure_debut` laisserait passer
-- autant de lieux sans horaire qu'on veut sur la même journée. Le commerçant
-- qui ne renseigne pas ses heures retrouverait la pagaille que cet index
-- existe pour empêcher.
DROP INDEX IF EXISTS uidx_lieux_ponctuel;
DROP INDEX IF EXISTS uidx_lieux_hebdo;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_lieux_ponctuel
  ON commercant_lieux (commercant_id, date_jour, coalesce(heure_debut, '00:00'::time))
  WHERE type = 'ponctuel';

CREATE UNIQUE INDEX IF NOT EXISTS uidx_lieux_hebdo
  ON commercant_lieux (commercant_id, jour_semaine, coalesce(heure_debut, '00:00'::time))
  WHERE type = 'hebdo';


-- ─── 2) LES CRÉNEAUX DE RETRAIT C&C ────────────────────────────────────────
-- Deux manques : ils ne savent pas où, et ils ne savent pas faire une DATE.
-- Un food truck sur un marché de Noël ne pouvait donc proposer aucun retrait.
ALTER TABLE creneaux
  ADD COLUMN IF NOT EXISTS lieu_id uuid REFERENCES commercant_lieux(id) ON DELETE CASCADE;

ALTER TABLE creneaux
  ADD COLUMN IF NOT EXISTS date_jour date;

-- Un créneau occasionnel n'a pas de jour de semaine : la colonne doit pouvoir
-- rester vide. `DROP NOT NULL` ne fait rien si elle l'était déjà.
ALTER TABLE creneaux ALTER COLUMN jour_semaine DROP NOT NULL;

-- Mais il faut l'un OU l'autre, jamais rien. NOT VALID : la contrainte
-- s'applique aux écritures futures sans exiger un balayage des lignes
-- existantes, qui portent toutes un jour de semaine.
ALTER TABLE creneaux DROP CONSTRAINT IF EXISTS creneaux_jour_ou_date_check;
ALTER TABLE creneaux
  ADD CONSTRAINT creneaux_jour_ou_date_check
  CHECK (jour_semaine IS NOT NULL OR date_jour IS NOT NULL) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_creneaux_lieu
  ON creneaux (lieu_id) WHERE lieu_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_creneaux_date
  ON creneaux (commercant_id, date_jour) WHERE date_jour IS NOT NULL;


-- ─── 3) LES PLAGES DE RÉSERVATION RDV ──────────────────────────────────────
-- Elles savaient déjà faire récurrent ET occasionnel (`date_specifique`).
-- Il ne leur manquait que le lieu.
ALTER TABLE rdv_creneaux
  ADD COLUMN IF NOT EXISTS lieu_id uuid REFERENCES commercant_lieux(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_rdv_creneaux_lieu
  ON rdv_creneaux (lieu_id) WHERE lieu_id IS NOT NULL;


-- ─── 4) LE LIEU FIGÉ DANS CE QUI EST DÉJÀ PRIS ─────────────────────────────
-- ⚠️ `ON DELETE SET NULL` et non CASCADE : on ne détruit JAMAIS un historique
-- parce qu'un lieu a été retiré. Le libellé et l'adresse, eux, sont copiés en
-- texte : c'est ce qui permet à un rendez-vous d'il y a six mois de dire encore
-- où il a eu lieu, sans jointure et sans risque d'orphelin. La table des
-- réservations fige déjà les coordonnées du client selon le même principe.
ALTER TABLE rdv_reservations
  ADD COLUMN IF NOT EXISTS lieu_id uuid REFERENCES commercant_lieux(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lieu_libelle text,
  ADD COLUMN IF NOT EXISTS lieu_adresse text;

ALTER TABLE commandes
  ADD COLUMN IF NOT EXISTS lieu_id uuid REFERENCES commercant_lieux(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lieu_libelle text,
  ADD COLUMN IF NOT EXISTS lieu_adresse text;

-- Le verrou d'Alex se lit ici : « ce lieu porte-t-il encore des rendez-vous ? »
CREATE INDEX IF NOT EXISTS idx_rdv_resa_lieu
  ON rdv_reservations (lieu_id) WHERE lieu_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commandes_lieu
  ON commandes (lieu_id) WHERE lieu_id IS NOT NULL;


-- ─── 5) L'INTERRUPTEUR, ET IL EST DÉCOCHÉ PAR DÉFAUT ───────────────────────
-- ⚠️ LE SYSTÈME CLASSIQUE RESTE LA NORME. Une boulangerie, un salon de coiffure
-- ou un cabinet ne bougeront jamais : leur demander à chaque plage horaire
-- « et c'était à quel endroit ? » serait une question absurde posée à
-- l'écrasante majorité des commerçants, pour servir une minorité.
--
-- Le planning par lieu est donc une CAPACITÉ QU'ON ACTIVE, jamais un passage
-- obligé. Décochée, la case laisse l'éditeur d'horaires exactement tel qu'il
-- est aujourd'hui et `lieu_id` reste vide partout : le commerçant ne voit même
-- pas que la fonctionnalité existe. Cochée, chaque plage de retrait ou de
-- réservation se rattache à un emplacement de son planning.
--
-- ⚠️ DÉFAUT `false`, et c'est ce qui protège l'existant : aucun commerçant
-- inscrit ne voit son écran changer au réveil.
ALTER TABLE commercants
  ADD COLUMN IF NOT EXISTS planning_par_lieu boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN commercants.planning_par_lieu IS
  'Le commerçant tient des horaires DIFFÉRENTS selon l''emplacement (food truck midi/soir, cours donnés dans plusieurs salles). Décochée : système classique, les horaires valent pour le commerce entier.';


-- ─── 6) GRANT explicites (règle projet) ────────────────────────────────────
-- Aucune table n'est créée ici, mais on réaffirme les droits des tables
-- touchées : une colonne ajoutée hérite des droits de la table, et une
-- réaffirmation ne coûte rien.
GRANT SELECT ON creneaux, rdv_creneaux TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON creneaux, rdv_creneaux TO authenticated;
GRANT ALL ON creneaux, rdv_creneaux TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRÔLE — à exécuter APRÈS, dans une requête séparée.
--
-- ⚠️ Il interroge l'ÉTAT RÉEL du schéma (`information_schema`, `pg_indexes`)
-- et non une reformulation de ce que la migration prétend avoir fait : une
-- vérification dont le résultat est connu d'avance ne vérifie rien.
--
-- Résultat attendu, exactement :  2, 1, 3, 3, 2, 1
-- ═══════════════════════════════════════════════════════════════════════════
-- select
--   (select count(*) from information_schema.columns
--     where table_name = 'creneaux' and column_name in ('lieu_id','date_jour'))          as creneaux_colonnes,
--   (select count(*) from information_schema.columns
--     where table_name = 'rdv_creneaux' and column_name = 'lieu_id')                     as rdv_creneaux_lieu,
--   (select count(*) from information_schema.columns
--     where table_name = 'rdv_reservations'
--       and column_name in ('lieu_id','lieu_libelle','lieu_adresse'))                    as rdv_resa_colonnes,
--   (select count(*) from information_schema.columns
--     where table_name = 'commandes'
--       and column_name in ('lieu_id','lieu_libelle','lieu_adresse'))                    as commandes_colonnes,
--   (select count(*) from pg_indexes
--     where indexname in ('uidx_lieux_ponctuel','uidx_lieux_hebdo')
--       and indexdef like '%heure_debut%')                                               as index_deux_lieux_par_jour,
--   (select count(*) from information_schema.columns
--     where table_name = 'commercants' and column_name = 'planning_par_lieu')            as interrupteur;
