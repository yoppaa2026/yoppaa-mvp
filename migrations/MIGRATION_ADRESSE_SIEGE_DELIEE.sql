-- ═══════════════════════════════════════════════════════════════════════════
-- L'ADRESSE DU SIÈGE CESSE D'ÊTRE UNE ADRESSE D'ACTIVITÉ
--
-- Décision d'Alex du 15/08 : « l'adresse du signup ne doit servir qu'à la
-- validation du dossier. Les adresses, fixes ou dynamiques, seront encodées
-- dans le profil. »
--
-- ⚠️ CETTE MIGRATION EST UN FILET, PAS UNE FONCTIONNALITÉ. Le code va cesser
-- de présenter le siège comme un lieu. Sans elle, tout commerçant qui n'a pas
-- rempli son profil verrait sa fiche perdre son adresse du jour au lendemain,
-- et disparaîtrait des listes par commune. On rend donc EXPLICITE ce qui était
-- implicite : ceux dont l'activité se passait à leur siège reçoivent un vrai
-- lieu permanent, avec la même adresse. Rien ne bouge à l'écran, et plus rien
-- ne dépend du siège ensuite.
--
-- ⚠️ ET ELLE NE TOUCHE QUE CEUX-LÀ. Un commerçant qui avait répondu « je
-- change d'endroit » n'a jamais utilisé son siège comme lieu : lui en fabriquer
-- un l'enverrait à une adresse qu'il a explicitement écartée.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── Le siège devient un lieu, pour ceux dont l'activité s'y passait ───────
--
-- ⚠️ AUCUNE COMMUNE ICI, ET C'EST UNE CORRECTION.
--
-- Deux versions de cette migration ont été fausses avant celle-ci, pour la même
-- raison : j'ai supposé une colonne `commercants.commune_id` parce que
-- `lib/lieux-activite.js` la lit. **Elle n'existe pas.** La base l'a refusée
-- (`42703: column c.commune_id does not exist`), et c'est elle qui avait
-- raison.
--
-- Ce que ça révèle, et qui vaut mieux que la migration : la ligne qui la lit
-- est du CODE MORT depuis toujours, et `communesDuCommercant` n'est appelée
-- par AUCUN code applicatif, seulement par le banc. Le rattachement d'un
-- commerce à une commune ne passe donc pas du tout par là : l'accueil classe
-- par DISTANCE, à partir des coordonnées des lieux, et le Good Morning Yoppers
-- lit le code postal de l'adresse.
--
-- Les coordonnées, elles, existent bien sur `commercants` et sont recopiées :
-- ce sont elles qui font que la distance affichée sur l'accueil ne bouge pas.
INSERT INTO commercant_lieux
  (commercant_id, type, libelle, adresse, latitude, longitude, principal, actif)
SELECT
  c.id,
  'permanent',
  c.nom,
  c.adresse,
  c.latitude,
  c.longitude,
  true,
  true
FROM commercants c
WHERE c.adresse IS NOT NULL
  AND btrim(c.adresse) <> ''
  -- Le défaut de la colonne est `true` : « IS NOT FALSE » retient donc aussi
  -- les commerçants qui n'ont jamais répondu à la question, ce qui est bien
  -- leur cas, leur activité se passant à leur adresse.
  AND c.siege_social_est_lieu_activite IS NOT FALSE
  -- Idempotent : relancer la migration ne crée pas de doublon, et un commerçant
  -- qui a déjà déclaré un lieu permanent n'est pas touché.
  AND NOT EXISTS (
    SELECT 1 FROM commercant_lieux l
    WHERE l.commercant_id = c.id
      AND l.type = 'permanent'
      AND l.actif IS TRUE
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRÔLE — à exécuter séparément.
--
-- Ce qu'il faut lire :
--   • `sans_aucun_lieu` ne doit contenir QUE les commerçants qui avaient
--     répondu « je change d'endroit » sans rien remplir. Centre Respire en
--     fait partie, c'est normal et c'est même ce que son bandeau d'alerte dit.
--   • `permanents_sans_coords` compte ceux dont l'adresse n'a jamais été
--     géocodée : leur distance ne s'affichera pas sur l'accueil, exactement
--     comme avant. Ce n'est pas une régression, c'est un état déjà là.
-- ═══════════════════════════════════════════════════════════════════════════

-- SELECT
--   (SELECT count(*) FROM commercants WHERE adresse IS NOT NULL AND btrim(adresse) <> '') AS avec_adresse,
--   (SELECT count(*) FROM commercant_lieux WHERE type = 'permanent' AND actif IS TRUE) AS lieux_permanents,
--   (SELECT count(*) FROM commercant_lieux
--     WHERE type = 'permanent' AND actif IS TRUE AND latitude IS NULL) AS permanents_sans_coords,
--   (SELECT count(*) FROM commercants c
--     WHERE c.adresse IS NOT NULL AND btrim(c.adresse) <> ''
--       AND NOT EXISTS (SELECT 1 FROM commercant_lieux l
--                       WHERE l.commercant_id = c.id AND l.actif IS TRUE)) AS sans_aucun_lieu;
