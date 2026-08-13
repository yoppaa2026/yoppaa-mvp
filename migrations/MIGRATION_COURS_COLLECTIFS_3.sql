-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_COURS_COLLECTIFS_3.sql
--
-- L'ÉCRAN DE RÉSERVATION NE PEUT PAS COMPTER LES INSCRITS.
--
-- `rdv_slots_busy` est la fonction qui dit au client quels créneaux sont
-- occupés. Elle est SECURITY DEFINER, donc elle contourne RLS, et c'est
-- volontaire : un visiteur non connecté doit voir les disponibilités sans
-- pouvoir lire la table des réservations. Elle ne renvoie aujourd'hui que
-- trois colonnes :
--
--   heure_debut, heure_fin, praticien_id
--
-- Cela suffit pour un rendez-vous individuel, où une plage occupée ferme le
-- créneau. Cela ne suffit plus pour un cours : l'écran doit distinguer
-- « quelqu'un occupe ce moment » de « trois personnes sont déjà inscrites À CE
-- COURS », et savoir QUELLES places sont prises pour attribuer la suivante.
--
-- ⚠️ CE QU'ON N'AJOUTE PAS EST AUSSI IMPORTANT QUE CE QU'ON AJOUTE. Cette
-- fonction est appelée par des visiteurs NON CONNECTÉS. Les deux colonnes
-- ajoutées sont des identifiants techniques : aucun nom, aucun email, aucun
-- téléphone n'en sort. Le contournement de RLS reste donc aussi étroit
-- qu'avant.
--
-- ⚠️ `CREATE OR REPLACE` NE SUFFIT PAS ICI : PostgreSQL refuse de modifier le
-- type de retour d'une fonction. Il faut la supprimer puis la recréer, et donc
-- REPOSER SES DROITS derrière, sans quoi l'écran de réservation cesserait de
-- fonctionner pour tout le monde.
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.rdv_slots_busy(uuid, date);

CREATE FUNCTION public.rdv_slots_busy(p_commercant_id uuid, p_date date)
RETURNS TABLE(
  heure_debut    time without time zone,
  heure_fin      time without time zone,
  praticien_id   uuid,
  prestation_id  uuid,
  place_no       int
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT heure_debut, heure_fin, praticien_id, prestation_id, place_no
  FROM rdv_reservations
  WHERE commercant_id = p_commercant_id
    AND date_rdv = p_date
    AND deleted_at IS NULL
    AND statut IN ('confirme', 'honore');
$function$;

-- ⚠️ LES DROITS SE PERDENT AU DROP. Sans ces GRANT, la fonction existe mais
-- personne ne peut l'appeler, et l'écran de réservation affiche « aucun
-- créneau » à tout le monde, y compris chez les coiffeurs.
GRANT EXECUTE ON FUNCTION public.rdv_slots_busy(uuid, date) TO anon, authenticated, service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRÔLE — à exécuter APRÈS, dans une requête séparée.
-- Résultat attendu, exactement :  1, 2
-- ═══════════════════════════════════════════════════════════════════════════
-- select
--   (select count(*) from pg_proc p
--      where p.proname = 'rdv_slots_busy'
--        and pg_get_functiondef(p.oid) like '%place_no%')                as fonction_elargie,
--   (select count(*) from information_schema.routine_privileges
--      where routine_name = 'rdv_slots_busy'
--        and grantee in ('anon', 'authenticated')
--        and privilege_type = 'EXECUTE')                                 as droits_reposes;
