-- ═══════════════════════════════════════════════════════════════════════════
-- TOUTES LES COMMUNES SONT OUVERTES
--
-- Décision d'Alex, 16/08 :
--   « Il faut ouvrir toutes les communes, trop de complexité avec ce système.
--     Qui veut venir, vient et on avance. Il ne peut pas y avoir de frein à
--     l'enregistrement d'un commerçant ou d'un Yopper. »
--
-- ⚠️ CE N'EST PAS UN CONFORT, C'EST UN BLOCAGE VÉCU. Alex a passé une commande,
-- s'est connecté par lien magique pour la retrouver, et une fenêtre non
-- fermable lui a annoncé que sa commune n'était pas ouverte. Son seul bouton
-- renvoyait à la landing. Il était enfermé HORS DE SA PROPRE COMMANDE.
--
-- ⚠️ ET LE CORRECTIF DANS LE CODE NE SUFFIT PAS. La modale filtrait sur
-- `active`, mais la RLS de `communes` masque de toute façon les communes non
-- actives à la clé anonyme : retirer le filtre côté écran ne change RIEN tant
-- que cette mise à jour n'est pas passée. C'est elle qui débloque, le code ne
-- fait que cesser de filtrer une deuxième fois.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1) Combien sont fermées aujourd'hui ───────────────────────────────────
-- À lire AVANT, pour savoir ce que la mise à jour va toucher.
SELECT
  count(*) FILTER (WHERE active)       AS deja_ouvertes,
  count(*) FILTER (WHERE NOT active)   AS a_ouvrir,
  count(*)                             AS total
FROM communes;


-- ─── 2) On ouvre tout ──────────────────────────────────────────────────────
-- ⚠️ `WHERE NOT active` plutôt qu'une mise à jour aveugle : on ne réécrit que
-- ce qui change, et le nombre de lignes touchées confirme le compte lu
-- au-dessus. Une mise à jour qui prétend avoir modifié 581 lignes alors qu'une
-- seule était fermée n'apprend rien.
UPDATE communes
SET active = true
WHERE NOT active;


-- ─── 3) Contrôle ───────────────────────────────────────────────────────────
-- Attendu : fermees = 0, et ouvertes = total.
SELECT
  count(*) FILTER (WHERE NOT active) AS fermees,
  count(*) FILTER (WHERE active)     AS ouvertes,
  count(*)                           AS total
FROM communes;


-- ─── 4) ⚠️ CE QUE CETTE MIGRATION EMPORTE AVEC ELLE ────────────────────────
--
-- `active` ne servait pas qu'à autoriser : il alimente aussi l'ANIMATION.
-- Après cette mise à jour :
--
--   • /classement affichera « Disponible » pour TOUTES les communes, et la
--     jauge de mobilisation sera pleine partout. La page perd sa fonction de
--     conversion (« aide ta commune à ouvrir »).
--   • Le cron Good Morning Yoppers boucle sur les communes actives : il les
--     parcourra toutes. Sans contenu publié, il n'envoie rien, donc c'est sans
--     danger, mais le travail à vide grandit avec le nombre de communes.
--   • La landing (teasing et reveal) lit `active` pour ses compteurs.
--
-- ⚠️ AUCUN de ces points n'est un frein à l'inscription : ce sont des écrans
-- de communication. Ils se retraiteront avec un AUTRE critère si Alex veut
-- garder une jauge, par exemple « au moins un commerçant publié », qui décrit
-- ce qu'un visiteur trouvera vraiment sur place.
--
-- Aucun GRANT ici : cette migration ne crée aucun objet, elle met à jour des
-- lignes existantes.
