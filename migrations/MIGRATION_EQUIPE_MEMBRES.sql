-- L'ÉQUIPE D'UN COMMERCE, ÉTAPE 1 : QUI EN FAIT PARTIE, ET CE QU'ELLE A FAIT (29/09/2026)
--
-- « En restauration et dans les salons, ils aimeraient un accès limité pour le
-- personnel : l'agenda, les rendez-vous, les réservations de table, pas le
-- reste. » (Alex, 29/09). Et le livreur passe par le même système, avec sa
-- seule case « Livraisons » (brief du 10/09, fusionné le 29/09).
--
-- 🔴 LE PRINCIPE, VALIDÉ PAR ALEX : UN MEMBRE DE L'ÉQUIPE NE TOUCHE JAMAIS LA
-- BASE. L'agenda et les commandes du tableau de bord écrivent directement
-- depuis le navigateur, sans limite de colonne, et leur `select('*')` ramène
-- le jeton d'annulation de chaque client (annuler « comme lui »,
-- remboursement compris). Supabase ne sait pas cacher une colonne à UNE
-- personne. Tout passe donc par des routes serveur `/api/equipe/…`, qui
-- vérifient qui appelle, pour quel commerce, avec quel droit, et si le
-- commerce est toujours en Vendre.
--
-- CE QUE FAIT CETTE MIGRATION : deux tables, et AUCUNE règle d'accès.
--   • `equipe_membres` : une personne invitée par un commerce, ses cases
--     cochées, sa date de fin éventuelle, l'état de son invitation ;
--   • `equipe_journal` : chaque geste d'un membre, et chaque changement fait
--     par le patron sur son équipe.
-- La RLS est ACTIVÉE et AUCUNE policy n'est créée : `anon` et
-- `authenticated` n'y lisent ni n'y écrivent rien. Seule la clé de service,
-- côté serveur, y accède. Un oubli laisse donc une porte FERMÉE.
--
-- ⚠️ CE QUI N'EST PAS ICI, ET C'EST VOULU :
--   • le plafond de 5 personnes : c'est une règle de forfait, elle vit dans le
--     code (seul écrivain de la table), pas recopiée ici ;
--   • le forfait Vendre : il se calcule avec l'essai (`planEffectif`), que la
--     base ne sait pas faire. Chaque route le vérifie à chaque appel.
--
-- Les cinq cases (décidées par Alex le 29/09) :
--   agenda      rendez-vous et réservations : voir, créer, déplacer, annuler,
--               marquer « venu »
--   commandes   toutes les commandes et leurs statuts
--   livraisons  seulement les commandes à livrer du jour, et la tournée
--   argent      marquer « absent », débiter une garantie, demander une
--               garantie par SMS (crédits du patron). EXIGE « agenda ».
--   comptoir    encaisser un bon cadeau, tamponner une carte de fidélité
--
-- Idempotent. Une seule transaction.

BEGIN;

CREATE TABLE IF NOT EXISTS public.equipe_membres (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commercant_id          uuid NOT NULL REFERENCES public.commercants(id) ON DELETE CASCADE,
  -- L'adresse à laquelle l'invitation a été envoyée. Le compte qui accepte
  -- doit porter CETTE adresse : un lien transféré ne fait entrer personne.
  email                  text NOT NULL,
  prenom                 text NOT NULL,
  -- Rempli à l'acceptation, jamais avant.
  auth_user_id           uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  droit_agenda           boolean NOT NULL DEFAULT false,
  droit_commandes        boolean NOT NULL DEFAULT false,
  droit_livraisons       boolean NOT NULL DEFAULT false,
  droit_argent           boolean NOT NULL DEFAULT false,
  droit_comptoir         boolean NOT NULL DEFAULT false,

  statut                 text NOT NULL DEFAULT 'invite',
  -- L'accès se coupe tout seul à cette date (le livreur d'un samedi).
  -- NULL : pas de fin prévue.
  expire_le              timestamptz,

  -- ⚠️ L'EMPREINTE DU JETON, JAMAIS LE JETON : une fuite de la base ne donne
  -- aucun lien d'invitation valable.
  invitation_jeton_hash  text,
  invitation_expire_le   timestamptz,

  invite_par             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  accepte_le             timestamptz,
  retire_le              timestamptz,

  CONSTRAINT equipe_membres_email_check
    CHECK (email = lower(btrim(email)) AND position('@' IN email) > 1 AND length(email) <= 254),
  CONSTRAINT equipe_membres_prenom_check
    CHECK (length(btrim(prenom)) BETWEEN 1 AND 60),
  CONSTRAINT equipe_membres_statut_check
    CHECK (statut IN ('invite', 'actif', 'retire')),
  -- Un membre sans aucune case n'aurait rien à faire là.
  CONSTRAINT equipe_membres_au_moins_un_droit
    CHECK (droit_agenda OR droit_commandes OR droit_livraisons OR droit_comptoir),
  -- « Argent » agit sur des rendez-vous : sans l'agenda, il n'ouvrirait rien.
  CONSTRAINT equipe_membres_argent_avec_agenda
    CHECK (NOT droit_argent OR droit_agenda),
  -- Chaque état porte ce qui le définit.
  CONSTRAINT equipe_membres_invite_a_un_jeton
    CHECK (statut <> 'invite' OR (invitation_jeton_hash IS NOT NULL AND invitation_expire_le IS NOT NULL)),
  CONSTRAINT equipe_membres_actif_a_un_compte
    CHECK (statut <> 'actif' OR (auth_user_id IS NOT NULL AND accepte_le IS NOT NULL)),
  CONSTRAINT equipe_membres_retire_date
    CHECK (statut <> 'retire' OR retire_le IS NOT NULL),
  CONSTRAINT equipe_membres_expire_apres_creation
    CHECK (expire_le IS NULL OR expire_le > created_at)
);

-- Une adresse n'est invitée qu'une fois par commerce, tant qu'elle n'est pas
-- retirée. Un compte n'est membre actif qu'une fois par commerce.
CREATE UNIQUE INDEX IF NOT EXISTS equipe_membres_email_unique
  ON public.equipe_membres (commercant_id, email) WHERE statut <> 'retire';
CREATE UNIQUE INDEX IF NOT EXISTS equipe_membres_compte_unique
  ON public.equipe_membres (commercant_id, auth_user_id) WHERE statut = 'actif';
CREATE UNIQUE INDEX IF NOT EXISTS equipe_membres_jeton_unique
  ON public.equipe_membres (invitation_jeton_hash) WHERE invitation_jeton_hash IS NOT NULL;
-- « De quelles équipes fais-je partie ? » : la question de chaque connexion.
CREATE INDEX IF NOT EXISTS equipe_membres_par_compte
  ON public.equipe_membres (auth_user_id) WHERE statut = 'actif';

COMMENT ON TABLE public.equipe_membres IS
  'Membres de l equipe d un commerce (personnel, livreurs). Acces par les routes serveur /api/equipe uniquement : RLS active, aucune policy.';

CREATE TABLE IF NOT EXISTS public.equipe_journal (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  commercant_id  uuid NOT NULL REFERENCES public.commercants(id) ON DELETE CASCADE,
  -- Le membre qui a agi ; NULL quand c'est le patron qui agit sur son équipe.
  membre_id      uuid REFERENCES public.equipe_membres(id) ON DELETE SET NULL,
  -- Le compte qui a agi, gardé même si le membre est supprimé plus tard.
  auth_user_id   uuid,
  action         text NOT NULL,
  cible_type     text,
  cible_id       uuid,
  details        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT equipe_journal_action_check
    CHECK (action ~ '^[a-z_]{3,40}$'),
  CONSTRAINT equipe_journal_cible_check
    CHECK (cible_type IS NULL OR cible_type IN ('rdv', 'commande', 'bon', 'fidelite', 'membre'))
);

CREATE INDEX IF NOT EXISTS equipe_journal_par_commerce
  ON public.equipe_journal (commercant_id, created_at DESC);

COMMENT ON TABLE public.equipe_journal IS
  'Qui a fait quoi : chaque geste d un membre de l equipe, et chaque changement du patron sur son equipe. Ecrit par le serveur uniquement.';

-- ─── LES DROITS : FERMÉ À TOUS, OUVERT AU SERVEUR ──────────────────────────
ALTER TABLE public.equipe_membres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipe_journal ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.equipe_membres FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.equipe_journal FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipe_membres TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipe_journal TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.equipe_journal_id_seq TO service_role;

COMMIT;

-- ─── CONTRÔLE : une ligne par vérification, la valeur ET l'attendu ─────────
SELECT 'A1' AS n, 'table equipe_membres' AS controle,
       (to_regclass('public.equipe_membres') IS NOT NULL)::text AS valeur, 'true' AS attendu
UNION ALL
SELECT 'A2', 'table equipe_journal',
       (to_regclass('public.equipe_journal') IS NOT NULL)::text, 'true'
UNION ALL
SELECT 'A3', 'equipe_membres : nombre de colonnes',
       (SELECT count(*)::text FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'equipe_membres'), '19'
UNION ALL
SELECT 'B1', 'RLS active sur equipe_membres',
       (SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.equipe_membres'::regclass), 'true'
UNION ALL
SELECT 'B2', 'RLS active sur equipe_journal',
       (SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.equipe_journal'::regclass), 'true'
UNION ALL
SELECT 'B3', 'policies sur les deux tables (nom et type)',
       coalesce((SELECT string_agg(tablename || '.' || policyname || ' ' || permissive, ', ')
                   FROM pg_policies
                  WHERE schemaname = 'public' AND tablename IN ('equipe_membres', 'equipe_journal')), 'aucune'),
       'aucune'
UNION ALL
SELECT 'B4', 'anon ne lit ni n ecrit rien',
       (has_table_privilege('anon', 'public.equipe_membres', 'SELECT')
        OR has_table_privilege('anon', 'public.equipe_membres', 'INSERT')
        OR has_table_privilege('anon', 'public.equipe_journal', 'SELECT')
        OR has_table_privilege('anon', 'public.equipe_journal', 'INSERT'))::text, 'false'
UNION ALL
SELECT 'B5', 'authenticated ne lit ni n ecrit rien',
       (has_table_privilege('authenticated', 'public.equipe_membres', 'SELECT')
        OR has_table_privilege('authenticated', 'public.equipe_membres', 'INSERT')
        OR has_table_privilege('authenticated', 'public.equipe_membres', 'UPDATE')
        OR has_table_privilege('authenticated', 'public.equipe_journal', 'SELECT')
        OR has_table_privilege('authenticated', 'public.equipe_journal', 'INSERT'))::text, 'false'
UNION ALL
SELECT 'B6', 'le serveur lit et ecrit les deux tables',
       (has_table_privilege('service_role', 'public.equipe_membres', 'SELECT')
        AND has_table_privilege('service_role', 'public.equipe_membres', 'INSERT')
        AND has_table_privilege('service_role', 'public.equipe_membres', 'UPDATE')
        AND has_table_privilege('service_role', 'public.equipe_journal', 'INSERT')
        AND has_sequence_privilege('service_role', 'public.equipe_journal_id_seq', 'USAGE'))::text, 'true'
UNION ALL
SELECT 'C1', 'contraintes de equipe_membres',
       (SELECT count(*)::text FROM pg_constraint
         WHERE conrelid = 'public.equipe_membres'::regclass AND contype = 'c'
           AND conname IN ('equipe_membres_email_check', 'equipe_membres_prenom_check',
                           'equipe_membres_statut_check', 'equipe_membres_au_moins_un_droit',
                           'equipe_membres_argent_avec_agenda', 'equipe_membres_invite_a_un_jeton',
                           'equipe_membres_actif_a_un_compte', 'equipe_membres_retire_date',
                           'equipe_membres_expire_apres_creation')), '9'
UNION ALL
SELECT 'C2', 'argent exige agenda',
       coalesce((SELECT pg_get_constraintdef(oid) FROM pg_constraint
                  WHERE conrelid = 'public.equipe_membres'::regclass
                    AND conname = 'equipe_membres_argent_avec_agenda'), 'ABSENTE'),
       'CHECK (((NOT droit_argent) OR droit_agenda))'
UNION ALL
SELECT 'C3', 'index uniques (email, compte, jeton)',
       (SELECT count(*)::text FROM pg_indexes
         WHERE schemaname = 'public' AND tablename = 'equipe_membres'
           AND indexname IN ('equipe_membres_email_unique', 'equipe_membres_compte_unique', 'equipe_membres_jeton_unique')), '3'
UNION ALL
SELECT 'C4', 'contraintes de equipe_journal (action, cible)',
       (SELECT count(*)::text FROM pg_constraint
         WHERE conrelid = 'public.equipe_journal'::regclass AND contype = 'c'
           AND conname IN ('equipe_journal_action_check', 'equipe_journal_cible_check')), '2'
UNION ALL
SELECT 'C5', 'un commerce supprime emporte son equipe et son journal',
       (SELECT string_agg(confdeltype::text, '' ORDER BY conrelid::regclass::text) FROM pg_constraint
         WHERE contype = 'f' AND confrelid = 'public.commercants'::regclass
           AND conrelid IN ('public.equipe_membres'::regclass, 'public.equipe_journal'::regclass)),
       'cc'
ORDER BY 1;
