-- ═══════════════════════════════════════════════════════════════════════════
-- RATTRAPAGE : LES RÉCOMPENSES ANNONCÉES MAIS INTROUVABLES (25/08/2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 🔴 LE DÉFAUT, TROUVÉ PAR ALEX AU TEST F16. La récompense de fidélité existe
-- à DEUX endroits :
--   • le COMPTEUR `fidelite_cartes.recompenses_disponibles`, incrémenté par
--     `appliquerCredit`, que la fiche du commerce lit pour annoncer au client
--     « ta récompense est débloquée » ;
--   • la LIGNE `fidelite_recompenses`, seule chose que le tunnel de paiement
--     interroge pour la proposer.
--
-- Le premier était alimenté, le second JAMAIS : aucun `insert` n'existait dans
-- le code applicatif. Les seules lignes présentes sont celles créées par le
-- rattrapage unique de MIGRATION_FIDELITE_RECOMPENSES.sql.
--
-- Le code est corrigé : les deux chemins de crédit créent désormais la ligne.
-- Mais les récompenses débloquées ENTRE la migration d'origine et ce correctif
-- n'ont toujours pas de ligne. Leurs porteurs voient une récompense annoncée
-- qu'ils ne peuvent pas dépenser en ligne. Ce fichier les répare.
--
-- ⚠️ ON NE RETIRE RIEN À PERSONNE. Le compteur fait foi : c'est ce que le
-- client a sous les yeux et ce que le commerçant lui a promis. On crée les
-- lignes manquantes pour que la base dise la même chose que l'écran.
--
-- ⚠️ LA CONFIGURATION ACTUELLE DU COMMERÇANT EST RECOPIÉE, exactement comme le
-- fait le code à chaud et comme l'a fait la migration d'origine. C'est ce que
-- l'écran du client annonce aujourd'hui : personne ne perd ni ne gagne.
--
--   À passer dans l'éditeur SQL Supabase, bloc par bloc.

-- ── 1) L'ÉTAT AVANT, à lire et à garder ───────────────────────────────────
--
-- ⚠️ EXÉCUTER CE BLOC SEUL, ET NOTER LE RÉSULTAT. Sans lui, impossible de
-- prouver après coup que le rattrapage a créé le bon nombre de lignes.
SELECT
  (SELECT COALESCE(sum(GREATEST(COALESCE(recompenses_disponibles, 0), 0)), 0)
     FROM public.fidelite_cartes)                              AS total_annonce_aux_clients,
  (SELECT count(*) FROM public.fidelite_recompenses
     WHERE utilisee_at IS NULL)                                AS lignes_reellement_disponibles,
  (SELECT count(*) FROM public.fidelite_cartes
     WHERE COALESCE(recompenses_disponibles, 0) > 0)           AS cartes_concernees;
-- L'écart entre les deux premiers nombres est le nombre exact de récompenses
-- promises et introuvables.


-- ── 2) LE RATTRAPAGE ──────────────────────────────────────────────────────
--
-- ⚠️ ON NE CRÉE QUE LE MANQUANT, carte par carte. Une carte qui annonce 2
-- récompenses et n'a qu'une ligne en reçoit UNE, pas deux : sans ce calcul par
-- différence, relancer le fichier doublerait les récompenses de tout le monde.
-- Il est donc rejouable sans effet de bord.
INSERT INTO public.fidelite_recompenses
  (carte_id, commercant_id, type, valeur, libelle, debloquee_at)
SELECT
  fc.id,
  fc.commercant_id,
  COALESCE(NULLIF(TRIM(c.fidelite_recompense_type), ''), 'remise_montant'),
  COALESCE(NULLIF(c.fidelite_recompense_valeur, 0), 5),
  COALESCE(NULLIF(TRIM(c.fidelite_recompense_libelle), ''), 'Récompense fidélité'),
  -- ⚠️ La date du dernier mouvement de la carte, pas `now()` : la règle du
  -- module est de servir la PLUS ANCIENNE récompense d'abord. Les dater
  -- toutes d'aujourd'hui enverrait les rattrapées à la fin de la file, alors
  -- que ce sont les plus vieilles.
  COALESCE(fc.updated_at, now())
FROM public.fidelite_cartes fc
JOIN public.commercants c ON c.id = fc.commercant_id
CROSS JOIN LATERAL generate_series(
  1,
  GREATEST(
    COALESCE(fc.recompenses_disponibles, 0)
    - (SELECT count(*) FROM public.fidelite_recompenses r
        WHERE r.carte_id = fc.id AND r.utilisee_at IS NULL),
    0
  )
) AS n
WHERE COALESCE(fc.recompenses_disponibles, 0) >
      (SELECT count(*) FROM public.fidelite_recompenses r
        WHERE r.carte_id = fc.id AND r.utilisee_at IS NULL);


-- ── 3) LE CONTRÔLE ────────────────────────────────────────────────────────
--
-- ⚠️ `manquantes` DOIT VALOIR 0. Toute autre valeur signifie qu'il reste des
-- clients à qui l'application promet une récompense qu'ils ne peuvent pas
-- dépenser.
SELECT
  COALESCE(sum(GREATEST(
    COALESCE(fc.recompenses_disponibles, 0)
    - (SELECT count(*) FROM public.fidelite_recompenses r
        WHERE r.carte_id = fc.id AND r.utilisee_at IS NULL),
    0
  )), 0) AS manquantes
FROM public.fidelite_cartes fc;

-- Et le sens inverse, tout aussi grave : une ligne disponible sans compteur en
-- face donnerait une récompense que la carte n'annonce plus.
-- ⚠️ `en_trop` DOIT VALOIR 0 également.
SELECT
  COALESCE(sum(GREATEST(
    (SELECT count(*) FROM public.fidelite_recompenses r
      WHERE r.carte_id = fc.id AND r.utilisee_at IS NULL)
    - COALESCE(fc.recompenses_disponibles, 0),
    0
  )), 0) AS en_trop
FROM public.fidelite_cartes fc;


-- ── 4) LA SURVEILLANCE, à rejouer après chaque session ────────────────────
--
-- Les deux nombres doivent rester égaux. S'ils divergent un jour, c'est qu'un
-- nouveau chemin de crédit a été écrit sans créer la ligne : c'est exactement
-- le défaut du 25/08, et il se reverrait ici avant que les clients ne le
-- vivent. Le banc `verif:recompense` garde le code, cette requête garde les
-- données.
SELECT
  (SELECT COALESCE(sum(GREATEST(COALESCE(recompenses_disponibles, 0), 0)), 0)
     FROM public.fidelite_cartes)      AS compteurs,
  (SELECT count(*) FROM public.fidelite_recompenses
     WHERE utilisee_at IS NULL)        AS lignes;
