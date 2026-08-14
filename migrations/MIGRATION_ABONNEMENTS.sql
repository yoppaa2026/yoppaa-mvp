-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_ABONNEMENTS.sql
--
-- L'ABONNEMENT : ON N'ACHÈTE PLUS UNE SÉANCE, ON ACHÈTE UN DROIT.
--
-- Le module des cours collectifs suppose qu'on RÉSERVE UNE SÉANCE, et qu'on la
-- paie. Une bonne partie des métiers de service ne vend pas ça du tout :
--
--   • une professeure de yoga vend une place, le même jour, toutes les
--     semaines, du 1er septembre au 3 juillet, hors congés scolaires ;
--   • un coach sportif vend un carnet de 10 séances valable six mois ;
--   • une esthéticienne vend une cure de 6 soins ;
--   • une auto-école vend un forfait de leçons.
--
-- Dans les quatre cas la séance est déjà payée quand elle est réservée, et la
-- séance à l'unité n'est plus qu'un reste, souvent plus cher, quand il y a de
-- la place. C'est ce renversement que cette migration installe.
--
-- ⚠️ LE MODÈLE, ET C'EST LA DÉCISION QUI COMMANDE TOUT LE RESTE : un contrat
-- d'un côté, DE VRAIES RÉSERVATIONS de l'autre.
--
--   abonnements  ──(génère ou décompte)──▶  rdv_reservations
--
-- Le contrat porte la formule, la période, le prix et le paiement. Les places,
-- elles, sont des lignes ordinaires de `rdv_reservations`, avec leur numéro de
-- place et leur lieu gravé. Conséquence : la jauge, l'agenda, les blocs de
-- cours et surtout L'INDEX UNIQUE ANTI DOUBLE-BOOKING fonctionnent sans qu'on
-- y touche, et la règle « les abonnées sont prioritaires » n'a pas une ligne
-- de code : les places sont réellement prises, la séance à l'unité ne peut
-- tomber que sur ce qui reste.
--
-- C'est le même principe que le numéro de place du 13/08 : on AJOUTE au
-- modèle existant, on ne le remplace pas.
--
-- ⚠️ ET IL Y A DEUX POPULATIONS, PAS UNE. C'est la précision d'Alex du 15/08,
-- et elle est structurante : une même formule, au même prix, se consomme de
-- deux façons selon la cliente.
--
--   mode 'place_fixe'  ── le commerçant inscrit une cliente qui ne touchera
--                         jamais une application. Sa place est GÉNÉRÉE pour
--                         toutes les séances d'un coup, elle n'a rien à faire.
--
--   mode 'credit'      ── la cliente réserve elle-même, séance par séance, et
--                         chaque réservation SE DÉDUIT de son solde. Rien
--                         n'est généré d'avance : ses places restent
--                         disponibles pour les autres tant qu'elle n'a pas
--                         choisi sa semaine.
--
-- Les deux produisent les mêmes lignes de `rdv_reservations` portant le même
-- `abonnement_id`. La différence n'est QUE le moment où elles sont créées, ce
-- qui est exactement ce qu'il faut pour que tout le reste du moteur continue
-- de n'y voir que des rendez-vous.
--
-- ⚠️ RIEN NE CHANGE POUR LE PARC. Aucune colonne existante n'est modifiée à
-- part l'ajout d'un lien nullable sur `rdv_reservations`. Un commerçant qui ne
-- crée aucune formule ne verra jamais la différence.
--
-- ⚠️ DEUX QUESTIONS, ET ELLES SE CROISENT. Ce que le commerçant vend (une
-- PÉRIODE ou un CARNET) est indépendant de qui réserve (LUI ou son client).
-- Les quatre combinaisons ont un métier réel derrière elles, et c'est ce qui
-- justifie de porter les deux axes plutôt que de coder le cas d'Emily :
--
--                    │ Je bloque leur place  │ Ils réservent eux-mêmes
--   ─────────────────┼───────────────────────┼─────────────────────────────
--    Une période     │ yoga, école de        │ yoga, clientes connectées
--                    │ musique, soutien      │
--    Un carnet       │ 10 séances toujours   │ coach sportif, cure de
--                    │ le mardi              │ soins, auto-école
--
-- Décisions d'Alex du 15/08 :
--   • un contrat PLUS de vraies réservations, jamais un droit récurrent
--     calculé à la volée ;
--   • DEUX MODES sur la même formule : le commerçant inscrit lui-même les
--     clientes qui ne toucheront jamais l'application, et les autres réservent
--     leurs séances qui se déduisent de leur abonnement ;
--   • DEUX FORMES en V1, la période et le carnet. L'accès illimité est écarté
--     tant qu'aucune salle de sport ne le demande, et le mode « aucune
--     réservation » avec lui : sans rendez-vous il n'y a ni agenda, ni jauge,
--     ni rappel, donc ce serait une carte de membre et non ce module ;
--   • les semaines sans cours sont COCHÉES PAR LE COMMERÇANT, il n'existe pas
--     de calendrier scolaire maintenu par Yoppaa. En contrepartie l'écran
--     affiche le nombre de séances obtenues et leurs dates avant de confirmer,
--     pour qu'une erreur de saisie se voie tout de suite.
--
-- Besoin réel documenté : Emily Woine, Respire be Yoga. Abonnement à l'année
-- (1/09 au 3/07, 36 séances) ou au semestre (1/09 au 31/01 et 1/02 au 3/07,
-- 18 séances), une séance par semaine. Deux séances par semaine, chez elle,
-- c'est un SECOND abonnement avec réduction : le plafond hebdomadaire porté
-- par la formule vaut donc 1 dans son cas, et ne la bride en rien.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1) LES FORMULES QUE LE COMMERÇANT VEND ────────────────────────────────
-- « Année », « Semestre 1 », « Carnet de 10 ». Une formule décrit un produit et
-- son prix, jamais un client.
CREATE TABLE IF NOT EXISTS abonnement_formules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commercant_id   uuid NOT NULL REFERENCES commercants(id) ON DELETE CASCADE,
  prestation_id   uuid REFERENCES rdv_prestations(id) ON DELETE SET NULL,
  libelle         text NOT NULL,

  -- ⚠️ CE QUE LE COMMERÇANT VEND, et c'est la deuxième question qui commande
  -- tout. Le besoin d'Emily n'est qu'une des formes du marché :
  --
  --   'periode' ── du 1er septembre au 3 juillet, hors semaines écartées.
  --                Les écoles de musique, la danse, les arts martiaux, le
  --                soutien scolaire : tout ce qui suit une année scolaire.
  --
  --   'carnet'  ── 10 séances valables 6 mois. Le coach sportif, la cure de
  --                soins d'une esthéticienne, le forfait d'une auto-école, les
  --                toilettages d'un salon canin. PLUS SIMPLE que la période :
  --                ni calendrier ni semaines à cocher, un nombre et une durée.
  --
  -- Les deux remplissent le MÊME compteur sur le contrat. Seule la façon de le
  -- calculer au départ change, ce qui est exactement pourquoi les deux formes
  -- tiennent dans une seule table.
  type            text NOT NULL DEFAULT 'periode',

  -- Pour une période : les bornes. NULL pour un carnet, dont la validité part
  -- du jour de l'achat.
  date_debut      date,
  date_fin        date,

  -- Pour un carnet : le nombre de séances et leur durée de vie.
  seances_carnet  int,
  validite_jours  int,
  -- Les semaines sans cours, cochées par le commerçant :
  -- [{"debut":"2026-10-27","fin":"2026-10-31","libelle":"Congé d'automne"}]
  -- ⚠️ jsonb et non une table à part : ces périodes n'existent que pour la
  -- formule qui les porte, personne d'autre ne les interroge, et les stocker
  -- avec elle évite une jointure sur chaque calcul de série.
  periodes_exclues jsonb NOT NULL DEFAULT '[]'::jsonb,
  prix            numeric(10,2) NOT NULL DEFAULT 0,
  -- ⚠️ LE PLAFOND HEBDOMADAIRE, indispensable dès qu'une cliente réserve
  -- elle-même : sans lui, elle peut brûler ses 36 séances en deux mois alors
  -- que la commerçante lui en vend une par semaine. Défaut 1, qui est la règle
  -- d'Emily. Elle vend d'ailleurs un SECOND abonnement à qui veut venir deux
  -- fois, donc ce plafond ne l'empêche de rien.
  seances_par_semaine int NOT NULL DEFAULT 1,
  actif           boolean NOT NULL DEFAULT true,
  ordre           int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

ALTER TABLE abonnement_formules DROP CONSTRAINT IF EXISTS abonnement_formules_type_check;
ALTER TABLE abonnement_formules
  ADD CONSTRAINT abonnement_formules_type_check CHECK (type IN ('periode', 'carnet'));

ALTER TABLE abonnement_formules DROP CONSTRAINT IF EXISTS abonnement_formules_periode_check;
ALTER TABLE abonnement_formules
  ADD CONSTRAINT abonnement_formules_periode_check
  CHECK (date_debut IS NULL OR date_fin IS NULL OR date_fin >= date_debut);

-- ⚠️ CHAQUE FORME EXIGE SES PROPRES CHAMPS, et la base est le seul endroit où
-- l'oubli ne peut pas passer. Une période sans dates ne produit aucune séance ;
-- un carnet sans nombre ni validité vend un solde vide qui n'expire jamais.
ALTER TABLE abonnement_formules DROP CONSTRAINT IF EXISTS abonnement_formules_forme_check;
ALTER TABLE abonnement_formules
  ADD CONSTRAINT abonnement_formules_forme_check CHECK (
    (type = 'periode' AND date_debut IS NOT NULL AND date_fin IS NOT NULL)
    OR
    (type = 'carnet' AND seances_carnet > 0 AND validite_jours > 0)
  );

ALTER TABLE abonnement_formules DROP CONSTRAINT IF EXISTS abonnement_formules_prix_check;
ALTER TABLE abonnement_formules
  ADD CONSTRAINT abonnement_formules_prix_check CHECK (prix >= 0);

CREATE INDEX IF NOT EXISTS idx_abo_formules_commercant
  ON abonnement_formules(commercant_id) WHERE deleted_at IS NULL;

COMMENT ON TABLE abonnement_formules IS
  'Les formules d''abonnement vendues par un commerçant. Deux formes : periode (des dates, hors semaines écartées) ou carnet (un nombre de séances et une durée de validité). Une formule ne décrit jamais un client.';
COMMENT ON COLUMN abonnement_formules.type IS
  'periode : une saison, comme une année scolaire. carnet : un nombre de séances valables tant de jours à partir de l''achat. Les deux remplissent le même compteur sur le contrat.';
COMMENT ON COLUMN abonnement_formules.periodes_exclues IS
  'Semaines sans cours, cochées par le commerçant : [{debut, fin, libelle}]. Yoppaa ne maintient aucun calendrier scolaire ; l''écran affiche le nombre de séances obtenues pour qu''une erreur de saisie se voie.';


-- ─── 2) LE CONTRAT D'UNE CLIENTE ───────────────────────────────────────────
-- ⚠️ AUCUN COMPTE N'EST REQUIS. Les clientes visées ne liront jamais un email,
-- c'est la commerçante qui inscrit tout le monde. Mêmes colonnes libres que la
-- création manuelle d'un rendez-vous, qui fonctionne déjà comme ça.
--
-- ⚠️ ET LES CONDITIONS SONT FIGÉES À LA SOUSCRIPTION : période, prix et lieu
-- sont RECOPIÉS depuis la formule. Modifier la formule l'an prochain ne doit
-- pas réécrire l'histoire des contrats déjà signés, exactement comme le prix
-- et la TVA d'un rendez-vous.
CREATE TABLE IF NOT EXISTS abonnements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commercant_id   uuid NOT NULL REFERENCES commercants(id) ON DELETE CASCADE,
  formule_id      uuid REFERENCES abonnement_formules(id) ON DELETE SET NULL,
  prestation_id   uuid REFERENCES rdv_prestations(id) ON DELETE SET NULL,

  client_prenom     text NOT NULL,
  client_nom        text,
  client_telephone  text,
  client_email      text,

  -- ⚠️ LA COLONNE QUI SÉPARE LES DEUX POPULATIONS.
  --   'place_fixe' : la commerçante inscrit, la série est générée d'avance ;
  --   'credit'     : la cliente réserve elle-même et son solde diminue.
  -- Défaut 'place_fixe' parce que c'est le cas qui n'exige rien de la cliente,
  -- donc celui qu'on ne veut jamais obtenir par accident dans l'autre sens.
  mode            text NOT NULL DEFAULT 'place_fixe',

  -- Le créneau hebdomadaire retenu. `jour_semaine` s'écrit en toutes lettres
  -- et en minuscules ('lundi'), comme dans commercant_lieux : une seule
  -- convention dans tout le projet.
  -- ⚠️ NULLABLES, et c'est le mode qui décide : une cliente en 'credit' n'a
  -- pas de jour attitré, c'est tout l'intérêt pour elle.
  jour_semaine    text,
  heure_debut     time,

  -- La forme vendue, recopiée de la formule. Elle ne sert plus à calculer quoi
  -- que ce soit, le compteur est déjà rempli : elle sert à DIRE au commerçant
  -- et à la cliente ce qu'ils ont entre les mains.
  type            text NOT NULL DEFAULT 'periode',

  -- Conditions figées à la souscription.
  -- ⚠️ DEUX FENÊTRES, UNE SEULE PAIRE DE COLONNES. Pour une période ce sont
  -- ses bornes ; pour un carnet, le jour de l'achat et ce jour plus la durée
  -- de validité. Tout ce qui lit un abonnement pose donc la même question,
  -- « est-ce encore valable aujourd'hui », sans savoir ce qui a été vendu.
  date_debut      date NOT NULL,
  date_fin        date NOT NULL,
  prix            numeric(10,2) NOT NULL DEFAULT 0,

  -- ⚠️ LE NOMBRE DE SÉANCES, FIGÉ LUI AUSSI. Il se calcule à la souscription
  -- en comptant les semaines de la période moins celles que la commerçante a
  -- écartées. Le recalculer plus tard depuis la formule réécrirait le contrat
  -- au moindre congé ajouté en cours d'année, et une cliente perdrait des
  -- séances déjà payées.
  seances_total   int NOT NULL DEFAULT 0,
  -- Plafond hebdomadaire, recopié de la formule et figé comme le reste.
  seances_par_semaine int NOT NULL DEFAULT 1,

  -- Le lieu, gravé comme sur une réservation.
  lieu_id         uuid,
  lieu_libelle    text,
  lieu_adresse    text,

  place_no        int NOT NULL DEFAULT 1,

  paye            boolean NOT NULL DEFAULT false,
  paye_le         timestamptz,
  mode_paiement   text,

  statut          text NOT NULL DEFAULT 'actif',
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

-- ⚠️ LES TROIS SEULES VALEURS DE `statut`. Elles sont définies ICI et nulle
-- part ailleurs : tout code qui en invente une quatrième sera refusé par la
-- base, et le banc compare le module à cette contrainte dans les deux sens.
ALTER TABLE abonnements DROP CONSTRAINT IF EXISTS abonnements_statut_check;
ALTER TABLE abonnements
  ADD CONSTRAINT abonnements_statut_check
  CHECK (statut IN ('actif', 'resilie', 'termine'));

ALTER TABLE abonnements DROP CONSTRAINT IF EXISTS abonnements_type_check;
ALTER TABLE abonnements
  ADD CONSTRAINT abonnements_type_check CHECK (type IN ('periode', 'carnet'));

ALTER TABLE abonnements DROP CONSTRAINT IF EXISTS abonnements_mode_check;
ALTER TABLE abonnements
  ADD CONSTRAINT abonnements_mode_check CHECK (mode IN ('place_fixe', 'credit'));

ALTER TABLE abonnements DROP CONSTRAINT IF EXISTS abonnements_jour_check;
ALTER TABLE abonnements
  ADD CONSTRAINT abonnements_jour_check
  CHECK (jour_semaine IS NULL
         OR jour_semaine IN ('lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'));

-- ⚠️ LA GARDE QUI TIENT LES DEUX MODES DROITS, et la base est le seul endroit
-- où elle ne peut pas être oubliée.
--   Une place fixe SANS jour ni heure ne génère rien : le contrat serait payé
--   et la cliente n'aurait aucune place.
--   Un crédit SANS email ne peut jamais être retrouvé au moment où la cliente
--   réserve, puisque c'est l'email normalisé qui relie une réservation à son
--   Yopper dans tout le projet.
ALTER TABLE abonnements DROP CONSTRAINT IF EXISTS abonnements_mode_coherent_check;
ALTER TABLE abonnements
  ADD CONSTRAINT abonnements_mode_coherent_check CHECK (
    (mode = 'place_fixe' AND jour_semaine IS NOT NULL AND heure_debut IS NOT NULL)
    OR
    (mode = 'credit' AND client_email IS NOT NULL)
  );

ALTER TABLE abonnements DROP CONSTRAINT IF EXISTS abonnements_seances_check;
ALTER TABLE abonnements
  ADD CONSTRAINT abonnements_seances_check
  CHECK (seances_total >= 0 AND seances_par_semaine > 0);

ALTER TABLE abonnements DROP CONSTRAINT IF EXISTS abonnements_place_check;
ALTER TABLE abonnements
  ADD CONSTRAINT abonnements_place_check CHECK (place_no > 0);

ALTER TABLE abonnements DROP CONSTRAINT IF EXISTS abonnements_periode_check;
ALTER TABLE abonnements
  ADD CONSTRAINT abonnements_periode_check CHECK (date_fin >= date_debut);

ALTER TABLE abonnements DROP CONSTRAINT IF EXISTS abonnements_mode_paiement_check;
ALTER TABLE abonnements
  ADD CONSTRAINT abonnements_mode_paiement_check
  CHECK (mode_paiement IS NULL OR mode_paiement IN ('sur_place', 'virement', 'en_ligne'));

CREATE INDEX IF NOT EXISTS idx_abonnements_commercant
  ON abonnements(commercant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_abonnements_formule
  ON abonnements(formule_id) WHERE deleted_at IS NULL;

-- ⚠️ L'INDEX QUI SERT AU DÉCOMPTE. Quand une cliente réserve en ligne, il faut
-- retrouver son abonnement en une requête : même commerçant, même email.
-- Il porte sur `lower(client_email)` parce qu'un email non normalisé a DÉJÀ
-- fait disparaître des commandes sur ce projet. L'application enregistre en
-- minuscules, l'index le suppose, et la recherche doit faire pareil.
CREATE INDEX IF NOT EXISTS idx_abonnements_email
  ON abonnements(commercant_id, lower(client_email))
  WHERE deleted_at IS NULL AND client_email IS NOT NULL;

COMMENT ON TABLE abonnements IS
  'Le contrat d''une cliente sur une période. En mode place_fixe il GÉNÈRE ses séances d''avance ; en mode credit les séances s''y rattachent au fur et à mesure que la cliente réserve. Aucun compte Yopper n''est requis en place_fixe.';
COMMENT ON COLUMN abonnements.mode IS
  'place_fixe : la commerçante inscrit, la série des séances est générée d''avance et la cliente n''a rien à faire. credit : la cliente réserve elle-même et chaque séance se déduit de son solde.';
COMMENT ON COLUMN abonnements.seances_total IS
  'Nombre de séances accordées, FIGÉ à la souscription. En place_fixe c''est le nombre de lignes générées ; en credit c''est le solde de départ.';
COMMENT ON COLUMN abonnements.jour_semaine IS
  'Jour en toutes lettres et en minuscules, même convention que commercant_lieux.jour_semaine. NULL en mode credit : la cliente choisit sa semaine.';
COMMENT ON COLUMN abonnements.client_email IS
  'Email NORMALISÉ en minuscules. C''est la clé qui relie une réservation en ligne à son abonnement, comme partout ailleurs dans le projet.';


-- ─── 3) LE LIEN ENTRE LE CONTRAT ET SES PLACES ─────────────────────────────
-- ⚠️ NULLABLE ET SANS DÉFAUT : toutes les réservations existantes restent
-- exactement ce qu'elles sont, des séances à l'unité.
--
-- ⚠️ ON DELETE SET NULL, jamais CASCADE : supprimer un contrat ne doit pas
-- faire disparaître des séances de l'agenda sans que personne ne le voie. La
-- place devient une réservation ordinaire, et la commerçante décide.
ALTER TABLE rdv_reservations
  ADD COLUMN IF NOT EXISTS abonnement_id uuid REFERENCES abonnements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rdv_abonnement
  ON rdv_reservations(abonnement_id) WHERE abonnement_id IS NOT NULL;

COMMENT ON COLUMN rdv_reservations.abonnement_id IS
  'Le contrat qui a généré cette séance, ou NULL pour une séance à l''unité. C''est lui qui permet de déplacer ou de résilier toute la série d''un coup.';


-- ─── 4) RLS ────────────────────────────────────────────────────────────────
-- ⚠️ AUCUN ACCÈS ANONYME sur ces deux tables. `abonnements` porte des noms et
-- des téléphones ; `abonnement_formules` n'est utile qu'au commerçant tant que
-- la souscription en ligne n'existe pas. Le jour où elle existera, on ouvrira
-- la lecture des formules EXPLICITEMENT, jamais par un USING (true) posé « au
-- cas où » : c'est ce qui avait fuité lors de l'audit du 03/08.
ALTER TABLE abonnement_formules ENABLE ROW LEVEL SECURITY;
ALTER TABLE abonnements         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS abo_formules_own ON abonnement_formules;
CREATE POLICY abo_formules_own ON abonnement_formules
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM commercants c
            WHERE c.id = abonnement_formules.commercant_id AND c.auth_user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM commercants c
            WHERE c.id = abonnement_formules.commercant_id AND c.auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS abonnements_own ON abonnements;
CREATE POLICY abonnements_own ON abonnements
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM commercants c
            WHERE c.id = abonnements.commercant_id AND c.auth_user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM commercants c
            WHERE c.id = abonnements.commercant_id AND c.auth_user_id = auth.uid())
  );


-- ─── 5) GRANT explicites (règle projet) ────────────────────────────────────
-- Sans eux, RLS n'est jamais atteint : PostgREST refuse avant.
GRANT SELECT, INSERT, UPDATE, DELETE ON abonnement_formules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON abonnements         TO authenticated;
GRANT ALL ON abonnement_formules TO service_role;
GRANT ALL ON abonnements         TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRÔLE — à exécuter APRÈS, dans une requête séparée.
--
-- ⚠️ Il interroge l'ÉTAT RÉEL du schéma, jamais une reformulation de ce que la
-- migration prétend avoir fait.
--
-- Résultat attendu, exactement :  1, 1, 1, 2, 2, 6, 1
-- ═══════════════════════════════════════════════════════════════════════════
-- select
--   (select count(*) from information_schema.tables
--     where table_name = 'abonnement_formules')                                  as table_formules,
--   (select count(*) from information_schema.tables
--     where table_name = 'abonnements')                                          as table_abonnements,
--   (select count(*) from information_schema.columns
--     where table_name = 'rdv_reservations' and column_name = 'abonnement_id')   as colonne_lien,
--   (select count(*) from pg_class
--     where relname in ('abonnements','abonnement_formules') and relrowsecurity) as rls_active,
--   (select count(*) from pg_policies
--     where tablename in ('abonnements','abonnement_formules'))                  as policies,
--   (select count(*) from pg_constraint
--     where conname in ('abonnements_statut_check','abonnements_mode_check',
--                       'abonnements_type_check','abonnements_mode_coherent_check',
--                       'abonnements_mode_paiement_check',
--                       'abonnement_formules_forme_check'))                      as gardes_valeurs,
--   (select count(*) from pg_indexes
--     where indexname = 'idx_abonnements_email')                                 as index_decompte;
