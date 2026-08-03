-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION DEAL STATS RPC — Fonction increment_deal_stat pour tracking B4
-- À passer dans Supabase SQL Editor.
--
-- Contexte : Bloc B4 Sprint 2 étendu, stats deals côté commerçant.
-- L'API /api/deals/track (POST { deal_id, event }) appelle cette RPC pour
-- incrementer atomiquement la bonne colonne selon l'événement :
--   • event=view       → colonne vues (ouverture modale deal)
--   • event=cta_click  → colonne cta_clics (clic CTA transactionnel)
--   • event=click      → colonne clics (clic générique, réservé futur)
--
-- SECURITY DEFINER pour que anon (Yoppers non connectés) puissent tracker
-- sans avoir besoin de policy RLS UPDATE sur yoppaa_deals. Validation de la
-- colonne en dur pour éviter toute injection SQL.
--
-- Date : 2026-07-01
-- ════════════════════════════════════════════════════════════════════════════


CREATE OR REPLACE FUNCTION public.increment_deal_stat(p_deal_id UUID, p_column TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validation stricte : seules 3 colonnes autorisees (pas d'injection possible)
  IF p_column NOT IN ('vues', 'clics', 'cta_clics') THEN
    RAISE EXCEPTION 'increment_deal_stat : colonne invalide %', p_column;
  END IF;

  EXECUTE format('UPDATE public.yoppaa_deals SET %I = COALESCE(%I, 0) + 1 WHERE id = $1', p_column, p_column)
    USING p_deal_id;
END;
$$;


-- Grants : anon (Yopper non connecte), authenticated (Yopper connecte),
-- service_role (route API server-side)
GRANT EXECUTE ON FUNCTION public.increment_deal_stat(UUID, TEXT) TO anon, authenticated, service_role;


-- ─── Vérification ────────────────────────────────────────────────────────────
SELECT proname, pg_get_function_arguments(oid) AS args, prosecdef AS security_definer
FROM pg_proc
WHERE proname = 'increment_deal_stat';

-- Test rapide (remplace UUID par un vrai deal_id de test si tu veux confirmer) :
-- SELECT increment_deal_stat('YOUR-DEAL-UUID-HERE', 'vues');
-- SELECT id, vues, clics, cta_clics FROM yoppaa_deals WHERE id = 'YOUR-DEAL-UUID-HERE';
