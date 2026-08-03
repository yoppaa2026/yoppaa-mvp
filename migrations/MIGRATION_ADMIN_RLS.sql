-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION ADMIN RLS — Étend RLS pour autoriser l'admin Yoppaa à tout voir/gérer
-- À passer dans Supabase SQL Editor. Idempotent (re-run safe).
--
-- But : pour l'impersonation admin → commerçant, l'admin doit pouvoir lire et
-- modifier les données du commerçant (articles, créneaux, commandes, RDVs, etc.)
-- comme s'il était lui. Pour ça, on ajoute une policy "Admin Yoppaa voit/gère tout"
-- sur chaque table métier.
-- ════════════════════════════════════════════════════════════════════════════


-- Helper : fonction réutilisable qui retourne TRUE si le user authentifié est l'admin
CREATE OR REPLACE FUNCTION public.is_yoppaa_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.email() = 'verstappenalexandre@gmail.com';
$$;

GRANT EXECUTE ON FUNCTION public.is_yoppaa_admin() TO anon, authenticated;


-- ─── Macro : pour chaque table, on ajoute une policy "Admin Yoppaa FULL" ──────
-- Chaque policy autorise SELECT + INSERT + UPDATE + DELETE pour l'admin.

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'articles',
    'creneaux',
    'commandes',
    'commande_articles',
    'avis',
    'yoppaa_deals',
    'actualites',
    'signalements',
    'rdv_prestations',
    'rdv_praticiens',
    'rdv_creneaux',
    'rdv_reservations',
    'rdv_prestation_praticiens',
    'rdv_fidelite_progression',
    'clients',
    'favoris',
    'options_articles',
    'article_stock_jour',
    'onboarding_commercants'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Skip si la table n'existe pas (defensive)
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t AND table_schema = 'public') THEN
      RAISE NOTICE 'Table % introuvable, skip', t;
      CONTINUE;
    END IF;

    -- Drop puis recréer (idempotent)
    EXECUTE format('DROP POLICY IF EXISTS "Admin Yoppaa FULL" ON public.%I', t);
    EXECUTE format('
      CREATE POLICY "Admin Yoppaa FULL" ON public.%I
        FOR ALL TO authenticated
        USING (public.is_yoppaa_admin())
        WITH CHECK (public.is_yoppaa_admin())
    ', t);

    RAISE NOTICE '✓ Policy "Admin Yoppaa FULL" appliquée sur %', t;
  END LOOP;
END $$;


-- ─── Verif ───────────────────────────────────────────────────────────────────
SELECT tablename, count(*) AS nb_policies
FROM pg_policies
WHERE policyname = 'Admin Yoppaa FULL'
GROUP BY tablename
ORDER BY tablename;

-- Output attendu : 10-15 lignes (selon les tables qui existent dans ton schéma)
-- Si une table critique n'apparaît pas, c'est qu'elle n'existait pas — on l'ajoutera plus tard.
