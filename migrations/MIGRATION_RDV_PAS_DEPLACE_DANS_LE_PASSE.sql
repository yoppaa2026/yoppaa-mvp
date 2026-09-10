-- ON NE DÉPLACE PAS UN RENDEZ-VOUS DANS LE PASSÉ (Alex, 10/09/2026 tard)
-- « Y a moyen de déplacer un rendez-vous dans le passé, ça ne doit pas être
-- possible. »
--
-- Le déplacement s'écrit depuis le navigateur du commerçant (sous RLS). L'écran
-- le refuse désormais, mais une garde d'écran n'est jamais une réponse : c'est
-- la base qui tranche, à l'heure de BRUXELLES, quelle que soit la pendule de
-- l'appareil. Le quart d'heure en cours reste ouvert (à 19h05, 19h00 passe),
-- exactement comme à l'écran (`premiereMinuteOuverte`, lib/deplacement-rdv.js).
--
-- ⚠️ SEULEMENT UN DÉPLACEMENT. Rien ne change pour :
--   • la création : un rendez-vous peut se noter après coup (décision d'Alex du
--     même soir), et le webhook Stripe crée le rendez-vous APRÈS le paiement,
--     parfois quand le créneau a commencé ; le refuser perdrait un paiement ;
--   • les clôtures (honoré, absent, annulé) : elles ne touchent ni la date ni
--     l'heure, et la garde ne s'éveille que si l'une des deux change vraiment ;
--   • reporter un rendez-vous d'hier à demain : c'est la NOUVELLE heure qui
--     compte, pas l'ancienne.
--
-- Sûre à rejouer. Peut se passer avant ou après le déploiement.

-- 1) La garde.
CREATE OR REPLACE FUNCTION public.rdv_refuse_deplacement_dans_le_passe()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  maintenant timestamp := now() AT TIME ZONE 'Europe/Brussels';
  seuil timestamp := date_trunc('hour', maintenant)
    + make_interval(mins => (floor(extract(minute FROM maintenant) / 15) * 15)::int);
BEGIN
  -- Ni la date ni l'heure ne bougent : ce n'est pas un déplacement.
  IF NEW.date_rdv IS NOT DISTINCT FROM OLD.date_rdv
     AND NEW.heure_debut IS NOT DISTINCT FROM OLD.heure_debut THEN
    RETURN NEW;
  END IF;
  IF (NEW.date_rdv + NEW.heure_debut) < seuil THEN
    RAISE EXCEPTION 'RDV_DEPLACE_DANS_LE_PASSE'
      USING ERRCODE = 'P0001',
            HINT = 'On ne déplace pas un rendez-vous avant le quart d''heure en cours, heure de Bruxelles.';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS rdv_pas_deplace_dans_le_passe ON public.rdv_reservations;
CREATE TRIGGER rdv_pas_deplace_dans_le_passe
  BEFORE UPDATE OF date_rdv, heure_debut ON public.rdv_reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.rdv_refuse_deplacement_dans_le_passe();

-- Une fonction de déclencheur ne s'appelle pas directement : même usage que
-- les autres gardes du projet (MIGRATION_RDV_CRENEAU_PRESTATIONS.sql).
REVOKE EXECUTE ON FUNCTION public.rdv_refuse_deplacement_dans_le_passe() FROM public;

-- 2) L'essai, sur une table TEMPORAIRE qui porte la même garde : aucune vraie
-- réservation n'est lue ni touchée. Chaque cas écrit ce qu'il a obtenu.
DROP TABLE IF EXISTS pg_temp.essai_deplacement;
DROP TABLE IF EXISTS pg_temp.essai_deplacement_resultats;
CREATE TEMP TABLE essai_deplacement (id int PRIMARY KEY, date_rdv date NOT NULL, heure_debut time NOT NULL, statut text);
CREATE TEMP TABLE essai_deplacement_resultats (ordre int, cas text, obtenu text, attendu text);
CREATE TRIGGER essai_deplacement_garde
  BEFORE UPDATE OF date_rdv, heure_debut ON essai_deplacement
  FOR EACH ROW EXECUTE FUNCTION public.rdv_refuse_deplacement_dans_le_passe();

DO $$
DECLARE
  maintenant timestamp := now() AT TIME ZONE 'Europe/Brussels';
  seuil timestamp := date_trunc('hour', maintenant)
    + make_interval(mins => (floor(extract(minute FROM maintenant) / 15) * 15)::int);
  avant timestamp := seuil - interval '15 minutes';
BEGIN
  -- 1 : à venir, on le déplace. 2 : d'hier, on le reporte. 3 : d'hier, on le
  -- clôture sans le déplacer.
  INSERT INTO essai_deplacement VALUES
    (1, maintenant::date + 2, '12:00', 'confirme'),
    (2, maintenant::date - 3, '12:00', 'confirme'),
    (3, maintenant::date - 3, '12:00', 'confirme');

  BEGIN
    UPDATE essai_deplacement SET date_rdv = maintenant::date - 1 WHERE id = 1;
    INSERT INTO essai_deplacement_resultats VALUES (1, 'deplacer a hier', 'accepte', 'refuse');
  EXCEPTION WHEN others THEN
    INSERT INTO essai_deplacement_resultats VALUES (1, 'deplacer a hier',
      CASE WHEN SQLERRM = 'RDV_DEPLACE_DANS_LE_PASSE' THEN 'refuse' ELSE 'autre erreur : ' || SQLERRM END, 'refuse');
  END;

  BEGIN
    UPDATE essai_deplacement SET date_rdv = avant::date, heure_debut = avant::time WHERE id = 1;
    INSERT INTO essai_deplacement_resultats VALUES (2, 'deplacer au quart d heure precedent', 'accepte', 'refuse');
  EXCEPTION WHEN others THEN
    INSERT INTO essai_deplacement_resultats VALUES (2, 'deplacer au quart d heure precedent',
      CASE WHEN SQLERRM = 'RDV_DEPLACE_DANS_LE_PASSE' THEN 'refuse' ELSE 'autre erreur : ' || SQLERRM END, 'refuse');
  END;

  BEGIN
    UPDATE essai_deplacement SET date_rdv = seuil::date, heure_debut = seuil::time WHERE id = 1;
    INSERT INTO essai_deplacement_resultats VALUES (3, 'deplacer au quart d heure en cours', 'accepte', 'accepte');
  EXCEPTION WHEN others THEN
    INSERT INTO essai_deplacement_resultats VALUES (3, 'deplacer au quart d heure en cours', 'refuse : ' || SQLERRM, 'accepte');
  END;

  BEGIN
    UPDATE essai_deplacement SET date_rdv = maintenant::date + 5 WHERE id = 2;
    INSERT INTO essai_deplacement_resultats VALUES (4, 'reporter un rdv d hier a plus tard', 'accepte', 'accepte');
  EXCEPTION WHEN others THEN
    INSERT INTO essai_deplacement_resultats VALUES (4, 'reporter un rdv d hier a plus tard', 'refuse : ' || SQLERRM, 'accepte');
  END;

  BEGIN
    -- ⚠️ Date et heure réécrites à l'identique : la garde s'éveille (elles sont
    -- dans le SET) et doit se rendormir, rien n'ayant bougé.
    UPDATE essai_deplacement SET statut = 'honore', date_rdv = date_rdv, heure_debut = heure_debut WHERE id = 3;
    INSERT INTO essai_deplacement_resultats VALUES (5, 'cloturer un rdv passe sans le deplacer', 'accepte', 'accepte');
  EXCEPTION WHEN others THEN
    INSERT INTO essai_deplacement_resultats VALUES (5, 'cloturer un rdv passe sans le deplacer', 'refuse : ' || SQLERRM, 'accepte');
  END;
END
$$;

-- 3) Contrôle : une ligne par vérification, sa valeur et l'attendu.
SELECT '0' AS ordre, 'fonction de garde presente' AS controle,
       count(*)::text AS valeur, '1' AS attendu
  FROM pg_proc
 WHERE proname = 'rdv_refuse_deplacement_dans_le_passe'
   AND pronamespace = 'public'::regnamespace
UNION ALL
SELECT '0', 'declencheur pose et actif sur rdv_reservations',
       count(*)::text, '1'
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
 WHERE t.tgname = 'rdv_pas_deplace_dans_le_passe'
   AND c.relname = 'rdv_reservations'
   AND NOT t.tgisinternal
   AND t.tgenabled = 'O'
UNION ALL
SELECT '0', 'seuil, heure de Bruxelles',
       to_char(date_trunc('hour', now() AT TIME ZONE 'Europe/Brussels')
         + make_interval(mins => (floor(extract(minute FROM now() AT TIME ZONE 'Europe/Brussels') / 15) * 15)::int),
         'YYYY-MM-DD HH24:MI'),
       'le quart d heure en cours, a ta pendule'
UNION ALL
SELECT ordre::text, cas, obtenu, attendu FROM essai_deplacement_resultats
ORDER BY 1, 2;
