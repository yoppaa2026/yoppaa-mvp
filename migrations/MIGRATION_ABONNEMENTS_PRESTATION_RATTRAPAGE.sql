-- ═══════════════════════════════════════════════════════════════════════════
-- LES CONTRATS VENDUS EN LIGNE QUI NE SAVENT PAS QUEL COURS ILS COUVRENT
--
-- `contratDepuisFormule` n'écrivait pas `prestation_id`, alors que l'inscription
-- à la main le posait depuis le premier jour : deux chemins vers la même table,
-- un seul renseignait la colonne. Corrigé dans le code le 16/08 au soir
-- (commit `59869b8`), mais les contrats déjà vendus gardent leur colonne vide.
--
-- ⚠️ ILS FONCTIONNENT QUAND MÊME. Le code retombe sur la prestation de leur
-- formule, côté route comme côté écran. Cette migration ne répare pas une
-- panne, elle enlève un repli : une donnée qui se déduit à chaque lecture finit
-- par se déduire différemment quelque part.
--
-- ⚠️ ET ELLE A UNE LIMITE, QU'IL FAUT CONNAÎTRE. Si le commerçant a rattaché sa
-- formule à un AUTRE cours depuis la vente, on grave le cours d'aujourd'hui et
-- non celui qui a été acheté. Il n'y a pas de meilleure source : le contrat est
-- vide, la formule est la seule information qui reste. C'est exactement le
-- choix que le code fait déjà à chaque lecture, rendu explicite et figé.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1) Ce qu'on va toucher ────────────────────────────────────────────────
-- À lire AVANT. `sans_cours_ni_formule` doit rester à 0 : un contrat sans
-- prestation ET sans formule serait irrécupérable, et il faudrait le traiter
-- à la main.
SELECT
  count(*) FILTER (WHERE a.prestation_id IS NULL AND f.prestation_id IS NOT NULL) AS a_rattraper,
  count(*) FILTER (WHERE a.prestation_id IS NULL AND f.prestation_id IS NULL)     AS sans_cours_ni_formule,
  count(*) FILTER (WHERE a.prestation_id IS NOT NULL)                             AS deja_complets,
  count(*)                                                                        AS total
FROM abonnements a
LEFT JOIN abonnement_formules f ON f.id = a.formule_id
WHERE a.deleted_at IS NULL;


-- ─── 2) Le rattrapage ──────────────────────────────────────────────────────
-- ⚠️ `a.prestation_id IS NULL` : on ne réécrit JAMAIS un contrat qui porte déjà
-- son cours. Le sien a été figé à la signature et fait foi, même si la formule
-- a changé depuis.
UPDATE abonnements a
SET prestation_id = f.prestation_id
FROM abonnement_formules f
WHERE a.formule_id = f.id
  AND a.prestation_id IS NULL
  AND f.prestation_id IS NOT NULL
  AND a.deleted_at IS NULL;


-- ─── 3) Contrôle ───────────────────────────────────────────────────────────
-- Attendu : a_rattraper = 0, et deja_complets augmenté d'autant.
SELECT
  count(*) FILTER (WHERE a.prestation_id IS NULL AND f.prestation_id IS NOT NULL) AS a_rattraper,
  count(*) FILTER (WHERE a.prestation_id IS NULL)                                 AS encore_vides,
  count(*) FILTER (WHERE a.prestation_id IS NOT NULL)                             AS deja_complets,
  count(*)                                                                        AS total
FROM abonnements a
LEFT JOIN abonnement_formules f ON f.id = a.formule_id
WHERE a.deleted_at IS NULL;


-- ⚠️ AUCUN GRANT : cette migration ne crée aucun objet, elle met à jour des
-- lignes existantes.
--
-- ⚠️ ET LE REPLI RESTE DANS LE CODE. Il ne sert plus pour les contrats
-- d'aujourd'hui, mais il protège ceux dont la formule serait supprimée demain,
-- et il ne coûte rien. On retire une dépendance, on ne retire pas une ceinture.
