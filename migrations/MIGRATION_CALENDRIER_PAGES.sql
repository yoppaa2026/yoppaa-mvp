-- MIGRATION_CALENDRIER_PAGES.sql (04/10)
--
-- QUESTION 7, ACCORD D'ALEX DU 04/10, CORRIGÉE EN L'ÉCRIVANT.
--
-- 🔴 LE DÉFAUT. Le calendrier à pastilles de la fiche lit TOUTES les
-- réservations de l'horizon par `rdv_slots_busy_range`, et Supabase n'en rend
-- que 1 000, sans erreur et sans le dire. Un restaurant à cinquante tables par
-- soir y arrive en vingt jours : au-delà, les jours complets s'affichent en
-- vert. La réservation elle-même reste juste (le serveur décide), mais la
-- pastille ment.
--
-- ⚠️ CE QUE J'AVAIS PROPOSÉ NE MARCHAIT PAS : « un compte par jour ». La
-- pastille d'un jour rejoue la grille ENTIÈRE de ce jour (cours, tables,
-- praticiens, cadence), elle a besoin de chaque réservation, pas d'un nombre.
--
-- ✅ CE QUI CHANGE : la fonction rend les mêmes colonnes, dans un ORDRE TOTAL
-- (date, heure, puis l'identifiant de la réservation, qui ne sort pas). La fiche
-- peut alors lire par pages de 1 000 sans qu'une ligne change de page entre
-- deux lectures (`lib/toutes-les-lignes.js`). L'identifiant n'est PAS ajouté
-- aux colonnes rendues : la vitrine n'a pas à connaître celui des réservations
-- des autres.
--
-- ⚠️ D'ABORD SUR LA BASE D'ESSAI, puis sur la prod avant « pousse ». Le code qui
-- lit par pages fonctionne aussi sans elle (il lit simplement dans l'ordre de
-- la base), mais sans ordre total une ligne peut être lue deux fois.
-- Sûre à rejouer : même signature, même résultat, `CREATE OR REPLACE`.

CREATE OR REPLACE FUNCTION public.rdv_slots_busy_range(p_commercant_id uuid, p_date_start date, p_date_end date)
RETURNS TABLE(
  date_rdv       date,
  heure_debut    time without time zone,
  heure_fin      time without time zone,
  praticien_id   uuid,
  prestation_id  uuid,
  place_no       int,
  couverts       int
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT r.date_rdv, r.heure_debut, r.heure_fin, r.praticien_id, r.prestation_id, r.place_no, r.couverts
  FROM rdv_reservations r
  WHERE r.commercant_id = p_commercant_id
    AND r.date_rdv BETWEEN p_date_start AND LEAST(p_date_end, p_date_start + 400)
    AND r.deleted_at IS NULL
    AND r.statut IN ('confirme', 'honore')
  ORDER BY r.date_rdv, r.heure_debut, r.id;
$function$;

GRANT EXECUTE ON FUNCTION public.rdv_slots_busy_range(uuid, date, date) TO anon, authenticated, service_role;

-- ─── CONTRÔLE : UNE LIGNE PAR VÉRIFICATION, VALEUR ET ATTENDU ───────────────
SELECT 'A. une seule version de la fonction' AS controle,
       (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'rdv_slots_busy_range')::text AS valeur,
       '1' AS attendu
UNION ALL
SELECT 'B. elle rend toujours les 7 memes colonnes',
       (SELECT pg_get_function_result(oid) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'rdv_slots_busy_range')::text,
       'TABLE(date_rdv date, heure_debut time without time zone, heure_fin time without time zone, praticien_id uuid, prestation_id uuid, place_no integer, couverts integer)'
UNION ALL
SELECT 'C. elle trie sur un ordre total (date, heure, id)',
       (position('ORDER BY r.date_rdv, r.heure_debut, r.id' IN (SELECT pg_get_functiondef(oid) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'rdv_slots_busy_range')) > 0)::text,
       'true'
UNION ALL
SELECT 'D. la vitrine (anon) peut toujours l appeler',
       has_function_privilege('anon', 'public.rdv_slots_busy_range(uuid, date, date)', 'EXECUTE')::text,
       'true'
UNION ALL
SELECT 'E. elle repond, vide, pour un commerce inconnu',
       (SELECT count(*) FROM public.rdv_slots_busy_range('00000000-0000-0000-0000-000000000000'::uuid, current_date, current_date + 30))::text,
       '0';
