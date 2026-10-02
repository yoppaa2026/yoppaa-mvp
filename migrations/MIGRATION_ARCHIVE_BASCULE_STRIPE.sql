-- L'ARCHIVE DE LA BASCULE STRIPE : CE QUI EXISTAIT EN TEST (02/10/2026)
--
-- À COLLER DANS L'ÉDITEUR SQL DE LA PRODUCTION, AVANT `BASCULE_STRIPE_LIVE.sql`.
-- Ne modifie AUCUNE ligne existante : crée une table vide, rien d'autre.
--
-- 🔴 LE TROU QU'ELLE FERME (trouvé le 02/10). La procédure du 17/09 détache
-- les comptes de PAIEMENT des commerçants (Connect), pas leurs ABONNEMENTS
-- Yoppaa. Or la plateforme a toujours tourné en mode test : les 8 abonnements
-- « trialing » de la base n'existent QUE dans le monde de test. Après la
-- bascule, la base dirait encore « en essai », Stripe ne connaîtrait aucun de
-- ces abonnements, et personne ne serait facturé au 9 janvier. En silence.
-- La bascule va donc les détacher, comme les comptes Connect.
--
-- ⚠️ ON NE JETTE RIEN. Les identifiants de test partent ici avant d'être
-- effacés de `commercants`. Si la bascule devait se rejouer (clé remise en
-- test par erreur), on saurait exactement ce qui existait. Une table à part
-- plutôt que des colonnes en plus sur `commercants` : cette table est lue par
-- des vues publiques, une colonne de plus y serait une colonne de trop.
--
-- Les droits : comme `equipe_membres`, RLS ACTIVÉE et AUCUNE règle. `anon` et
-- `authenticated` n'y lisent ni n'y écrivent rien ; seul le serveur (et
-- l'éditeur SQL) y accède. Un oubli laisse donc une porte FERMÉE.
--
-- Idempotent. Une seule transaction.

BEGIN;

CREATE TABLE IF NOT EXISTS public.stripe_bascule_archive (
  id                      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- CASCADE, et c'est voulu : ces identifiants n'ont de sens que pour une fiche
  -- qui existe. En RESTRICT, supprimer une fiche de test depuis
  -- l'administration échouerait à cause de son archive.
  commercant_id           uuid NOT NULL REFERENCES public.commercants(id) ON DELETE CASCADE,
  -- Le monde d'où viennent ces identifiants (toujours « test » le 02/10).
  monde                   text NOT NULL,
  stripe_customer_id      text,
  stripe_subscription_id  text,
  subscription_status     text,
  subscription_trial_end  timestamptz,
  archive_le              timestamptz NOT NULL DEFAULT now(),
  motif                   text NOT NULL,

  CONSTRAINT stripe_bascule_archive_monde_check CHECK (monde IN ('test', 'live')),
  CONSTRAINT stripe_bascule_archive_quelque_chose
    CHECK (stripe_customer_id IS NOT NULL OR stripe_subscription_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS stripe_bascule_archive_par_commerce
  ON public.stripe_bascule_archive (commercant_id);

COMMENT ON TABLE public.stripe_bascule_archive IS
  'Identifiants Stripe (client, abonnement) detaches lors d une bascule de monde. Ecrite par le SQL de bascule, lue par personne d autre que le serveur.';

ALTER TABLE public.stripe_bascule_archive ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.stripe_bascule_archive FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stripe_bascule_archive TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.stripe_bascule_archive_id_seq TO service_role;

COMMIT;

-- ─── CONTRÔLE : une ligne par vérification, la valeur ET l'attendu ─────────
SELECT 'A1' AS n, 'table stripe_bascule_archive' AS controle,
       (to_regclass('public.stripe_bascule_archive') IS NOT NULL)::text AS valeur, 'true' AS attendu
UNION ALL
SELECT 'A2', 'lignes (vide avant la bascule)',
       (SELECT count(*) FROM public.stripe_bascule_archive)::text, '0'
UNION ALL
SELECT 'B1', 'RLS active',
       (SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.stripe_bascule_archive'::regclass), 'true'
UNION ALL
SELECT 'B2', 'regles d acces (nom et type)',
       coalesce((SELECT string_agg(policyname || ' ' || permissive, ', ')
                   FROM pg_policies WHERE schemaname = 'public' AND tablename = 'stripe_bascule_archive'), 'aucune'),
       'aucune'
UNION ALL
SELECT 'B3', 'anon et authenticated ne lisent ni n ecrivent rien',
       (has_table_privilege('anon', 'public.stripe_bascule_archive', 'SELECT')
        OR has_table_privilege('anon', 'public.stripe_bascule_archive', 'INSERT')
        OR has_table_privilege('authenticated', 'public.stripe_bascule_archive', 'SELECT')
        OR has_table_privilege('authenticated', 'public.stripe_bascule_archive', 'INSERT')
        OR has_table_privilege('authenticated', 'public.stripe_bascule_archive', 'UPDATE'))::text, 'false'
UNION ALL
SELECT 'B4', 'le serveur lit et ecrit',
       (has_table_privilege('service_role', 'public.stripe_bascule_archive', 'SELECT')
        AND has_table_privilege('service_role', 'public.stripe_bascule_archive', 'INSERT')
        AND has_sequence_privilege('service_role', 'public.stripe_bascule_archive_id_seq', 'USAGE'))::text, 'true'
UNION ALL
SELECT 'C1', 'supprimer une fiche emporte son archive (ne bloque pas l administration)',
       (SELECT confdeltype::text FROM pg_constraint
         WHERE conrelid = 'public.stripe_bascule_archive'::regclass AND contype = 'f'), 'c';
