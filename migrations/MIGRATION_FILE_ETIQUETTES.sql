-- ════════════════════════════════════════════════════════════════════════════
-- LA FILE DES ÉTIQUETTES ET LA STATION DU COMPTOIR (« Yoppaa Comptoir »)
-- Décisions d'Alex, 11/10 (tableau) :
--   - UNE app Android sur la tablette du kit, qui affiche le tableau de bord
--     et imprime sans fenêtre sur la Brother ;
--   - la tablette appartient au commerce PAR LA CONNEXION (le commerçant
--     connecté coche « cette tablette est l'imprimante du comptoir ») ;
--   - TOUTES les étiquettes passent PAR LA FILE, d'où qu'elles viennent
--     (tablette, téléphone de l'équipe, PC) : un seul chemin, une trace,
--     jamais deux fois la même.
-- ════════════════════════════════════════════════════════════════════════════
--
-- A. `stations_impression` : la tablette déclarée imprimante, UNE par commerce
--    (la dernière déclarée remplace la précédente). `dernier_contact` dit au
--    tableau de bord si elle est en ligne.
-- B. `etiquettes_impression` : la file. Une ligne par impression demandée
--    (démarrage de la prépa, réimpression, étiquette d'essai) ; la station la
--    PREND (en_attente → en_cours), puis rend « imprimée » ou « échec » avec
--    la raison (plus de papier, injoignable…).
--
-- ⚠️ SERVEUR SEULEMENT : RLS active SANS aucune policy, aucun droit pour anon
-- ni authenticated. Tout passe par les routes `/api/impression/*`, qui
-- vérifient l'appartenance au commerce (`gardeEquipe`). Un navigateur ne peut
-- ni lire la file d'un autre commerce, ni y écrire.
--
-- Aucune table existante n'est modifiée. Idempotent. Date : 2026-10-11
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── A. LA STATION ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stations_impression (
  commercant_id   uuid PRIMARY KEY REFERENCES public.commercants(id) ON DELETE CASCADE,
  appareil_id     text NOT NULL CHECK (length(appareil_id) BETWEEN 8 AND 64),
  nom             text NOT NULL DEFAULT 'Tablette du comptoir' CHECK (length(nom) <= 60),
  declaree_par    uuid,
  declaree_le     timestamptz NOT NULL DEFAULT now(),
  dernier_contact timestamptz
);

COMMENT ON TABLE public.stations_impression IS
  'La tablette Yoppaa Comptoir qui imprime les etiquettes du commerce (une par commerce). Serveur seulement.';

-- ─── B. LA FILE ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.etiquettes_impression (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commercant_id uuid NOT NULL REFERENCES public.commercants(id) ON DELETE CASCADE,
  commande_id   uuid REFERENCES public.commandes(id) ON DELETE CASCADE,
  origine       text NOT NULL CHECK (origine IN ('demarrage', 'reimpression', 'essai')),
  sacs          integer NOT NULL DEFAULT 1 CHECK (sacs BETWEEN 1 AND 20),
  statut        text NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'en_cours', 'imprimee', 'echec')),
  raison        text CHECK (raison IS NULL OR length(raison) <= 200),
  appareil_id   text,
  cree_le       timestamptz NOT NULL DEFAULT now(),
  pris_le       timestamptz,
  termine_le    timestamptz,
  CONSTRAINT etiquettes_impression_commande_ou_essai CHECK (origine = 'essai' OR commande_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS etiquettes_impression_file_idx
  ON public.etiquettes_impression (commercant_id, statut, cree_le);

COMMENT ON TABLE public.etiquettes_impression IS
  'La file des etiquettes a imprimer par la station du comptoir : en_attente, en_cours, imprimee, echec. Serveur seulement.';

-- ─── C. SERVEUR SEULEMENT ──────────────────────────────────────────────────
ALTER TABLE public.stations_impression ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.etiquettes_impression ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.stations_impression FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.etiquettes_impression FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stations_impression TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.etiquettes_impression TO service_role;

COMMIT;

-- ─── CONTRÔLE : une ligne par vérification, valeur ET attendu ──────────────
SELECT * FROM (
  SELECT 1 AS n, 'les deux tables existent'::text AS controle,
         (SELECT string_agg(table_name, ', ' ORDER BY table_name) FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name IN ('stations_impression', 'etiquettes_impression'))::text AS valeur,
         'etiquettes_impression, stations_impression'::text AS attendu
  UNION ALL SELECT 2, 'RLS active sur les deux',
         (SELECT string_agg(relname || ':' || relrowsecurity, ', ' ORDER BY relname) FROM pg_class
           WHERE oid IN ('public.stations_impression'::regclass, 'public.etiquettes_impression'::regclass))::text,
         'etiquettes_impression:true, stations_impression:true'
  UNION ALL SELECT 3, 'aucune policy (serveur seulement), avec leur type',
         coalesce((SELECT string_agg(tablename || '.' || policyname || ':' || permissive, ', ') FROM pg_policies
           WHERE schemaname = 'public' AND tablename IN ('stations_impression', 'etiquettes_impression')), 'aucune')::text,
         'aucune'
  UNION ALL SELECT 4, 'anon et authenticated : aucun droit',
         (has_table_privilege('anon', 'public.etiquettes_impression', 'SELECT')
          OR has_table_privilege('authenticated', 'public.etiquettes_impression', 'SELECT')
          OR has_table_privilege('authenticated', 'public.etiquettes_impression', 'INSERT')
          OR has_table_privilege('anon', 'public.stations_impression', 'SELECT')
          OR has_table_privilege('authenticated', 'public.stations_impression', 'SELECT')
          OR has_table_privilege('authenticated', 'public.stations_impression', 'UPDATE'))::text,
         'false'
  UNION ALL SELECT 5, 'service_role lit et ecrit les deux',
         (has_table_privilege('service_role', 'public.etiquettes_impression', 'SELECT')
          AND has_table_privilege('service_role', 'public.etiquettes_impression', 'UPDATE')
          AND has_table_privilege('service_role', 'public.stations_impression', 'INSERT')
          AND has_table_privilege('service_role', 'public.stations_impression', 'DELETE'))::text,
         'true'
  UNION ALL SELECT 6, 'statuts permis de la file',
         (SELECT pg_get_constraintdef(oid) FROM pg_constraint
           WHERE conrelid = 'public.etiquettes_impression'::regclass AND conname = 'etiquettes_impression_statut_check')::text,
         'CHECK ((statut = ANY (ARRAY[''en_attente''::text, ''en_cours''::text, ''imprimee''::text, ''echec''::text])))'
  UNION ALL SELECT 7, 'une etiquette sans commande n est qu un essai',
         (SELECT pg_get_constraintdef(oid) FROM pg_constraint
           WHERE conrelid = 'public.etiquettes_impression'::regclass AND conname = 'etiquettes_impression_commande_ou_essai')::text,
         'CHECK (((origine = ''essai''::text) OR (commande_id IS NOT NULL)))'
  UNION ALL SELECT 8, 'sacs bornes de 1 a 20',
         (SELECT pg_get_constraintdef(oid) FROM pg_constraint
           WHERE conrelid = 'public.etiquettes_impression'::regclass AND conname = 'etiquettes_impression_sacs_check')::text,
         'CHECK (((sacs >= 1) AND (sacs <= 20)))'
  UNION ALL SELECT 9, 'liens effaces avec le commerce et la commande (cascade)',
         (SELECT string_agg(confrelid::regclass::text || ':' || confdeltype::text, ', ' ORDER BY confrelid::regclass::text) FROM pg_constraint
           WHERE contype = 'f' AND conrelid IN ('public.stations_impression'::regclass, 'public.etiquettes_impression'::regclass))::text,
         'commandes:c, commercants:c, commercants:c'
  UNION ALL SELECT 10, 'index de la file',
         (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'etiquettes_impression_file_idx')::text,
         '1'
  UNION ALL SELECT 11, 'la file est vide au depart',
         (SELECT count(*) FROM public.etiquettes_impression)::text, '0'
) t ORDER BY n;
