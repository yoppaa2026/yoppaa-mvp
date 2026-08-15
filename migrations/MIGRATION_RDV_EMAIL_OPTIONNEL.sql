-- ═══════════════════════════════════════════════════════════════════════════
-- L'EMAIL D'UN RENDEZ-VOUS DEVIENT VRAIMENT FACULTATIF
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ LA CONTRADICTION RELEVÉE PAR ALEX LE 15/08. La modale de création manuelle
-- annonce « email optionnel », et la base refuse la ligne : `client_email` est
-- en NOT NULL depuis MIGRATION_RDV.sql. Le commerçant lit « optionnel », laisse
-- le champ vide, et reçoit une erreur qu'il ne peut pas comprendre.
--
-- POURQUOI FACULTATIF, ET PAS OBLIGATOIRE. Une professeure de yoga qui inscrit
-- douze élèves au téléphone n'a pas leur email, et le lui imposer produirait ce
-- qu'imposent toujours les champs obligatoires inutiles : des adresses
-- inventées. La saisie manuelle sert précisément aux clients qui ne sont PAS
-- sur Yoppaa.
--
-- CE QU'ON PERD, ET C'EST ASSUMÉ : sans email, pas de confirmation, pas de
-- rappel de la veille, pas de fichier calendrier, et le rendez-vous n'apparaît
-- pas dans l'application du client. Il vit dans l'agenda du commerçant, ce qui
-- est exactement ce qu'il y met.
--
-- ⚠️ AUCUN CODE À MODIFIER EN FACE, ET C'EST VÉRIFIÉ. Les huit routes qui
-- notifient testent déjà `if (!client_email)` avant d'écrire à quiconque :
-- rdv-annule, rdv-honore, rdv-no-show, le rappel de 9h, les rappels de
-- commande, l'expédition, la livraison et le push de statut. Un rendez-vous
-- sans email les traverse sans rien déclencher, ce qui est le comportement
-- voulu.
--
-- Le paiement en ligne, lui, continue d'exiger un email : il vient de Stripe,
-- qui n'accepte pas de paiement sans adresse. Rien à faire pour ça.

ALTER TABLE public.rdv_reservations
  ALTER COLUMN client_email DROP NOT NULL;


-- ─── CONTRÔLE ──────────────────────────────────────────────────────────────
-- Interroge l'ÉTAT RÉEL de la base, jamais une requête dont le résultat est
-- connu d'avance. Attendu : facultatif = true, et le compte des rendez-vous
-- sans email, qui doit valoir 0 juste après la migration.
SELECT
  (SELECT is_nullable = 'YES'
     FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'rdv_reservations'
      AND column_name = 'client_email') AS facultatif,
  (SELECT count(*) FROM public.rdv_reservations WHERE client_email IS NULL) AS sans_email;
