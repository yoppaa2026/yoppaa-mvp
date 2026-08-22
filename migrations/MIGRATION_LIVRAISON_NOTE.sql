-- ═══════════════════════════════════════════════════════════════════════════
-- LIVRAISON — 22/08/2026 — LA NOTE DU YOPPER SOUS SON ADRESSE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Demande d'Alex, 22/08 : « laisser un champ note pour le Yopper en dessous de
-- son adresse au cas où il veut donner des infos complémentaires importantes
-- par rapport à l'adresse reconnue par le système. Le commerçant doit voir
-- facilement cette note car elle est importante. »
--
-- ⚠️ POURQUOI CE CHAMP DEVIENT NÉCESSAIRE MAINTENANT, ET PAS AVANT. L'adresse
-- de livraison va être SÉLECTIONNÉE dans une liste de suggestions au lieu
-- d'être tapée librement, pour qu'elle rapporte enfin ses coordonnées. Une
-- adresse normalisée par un moteur de géocodage perd tout ce que le Yopper
-- ajoutait de sa main : « sonner chez le voisin », « portail bleu au fond de
-- l'allée », « bâtiment B, 3e étage ». Sans un endroit pour ça, la
-- normalisation ferait perdre au commerçant une information qu'il avait avant.
--
-- ⚠️ CE N'EST PAS LE COMPLÉMENT D'ADRESSE. Le complément (« Boîte 3 ») fait
-- partie de l'adresse et voyage avec elle. La note est un MESSAGE au livreur.
-- Les mélanger, c'est ce qui polluait la chaîne envoyée au géocodeur et
-- l'empêchait de trouver quoi que ce soit.
--
-- ⚠️ AUCUN `GRANT` N'EST NÉCESSAIRE ICI, et c'est dit pour qu'on ne le cherche
-- pas : les droits PostgreSQL portent sur la TABLE, pas sur la colonne. Ajouter
-- une colonne à `commandes` la rend lisible et écrivable par ceux qui ont déjà
-- le droit sur la table. La RLS de `commandes`, elle, ne change pas non plus.


-- ─── 1) LA COLONNE ─────────────────────────────────────────────────────────

ALTER TABLE commandes
  ADD COLUMN IF NOT EXISTS note_livraison text;

COMMENT ON COLUMN commandes.note_livraison IS
  'Message libre du Yopper au livreur, saisi sous son adresse au moment de la commande. Complète l''adresse normalisée sans en faire partie : consignes d''accès, étage, digicode, où sonner. Affiché en évidence sur la carte de livraison du commerçant.';


-- ─── 2) CONTRÔLE ───────────────────────────────────────────────────────────
--
-- ⚠️ IL INTERROGE L'ÉTAT RÉEL DE LA BASE, pas une requête dont le résultat est
-- connu d'avance. Attendu : UNE ligne, `note_livraison`, type `text`, nullable.
-- Les deux colonnes de coordonnées sont listées avec elle pour vérifier au
-- passage qu'elles sont bien là : elles existent depuis
-- MIGRATION_LIVRAISON_COORDS, et c'est ce qui évite une migration inutile.

SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'commandes'
   AND column_name IN ('note_livraison', 'livraison_lat', 'livraison_lng')
 ORDER BY column_name;

-- Attendu :
--   livraison_lat   | double precision | YES
--   livraison_lng   | double precision | YES
--   note_livraison  | text             | YES


-- ─── 3) 🔴 LE TEST, ET IL NE SE FAIT PAS EN SQL ────────────────────────────
--
-- ⚠️ Un `SELECT` dans l'éditeur Supabase tourne en clé de service et ne prouve
-- rien sur ce que voit un client. Le test qui compte :
--
-- 1. Passer une commande en LIVRAISON, choisir l'adresse dans les suggestions,
--    écrire une note (« portail bleu, sonner deux fois »).
-- 2. Tableau de bord, onglet Livraison : la note doit sauter aux yeux sur la
--    carte, et l'adresse porter sa pastille « localisée ».
-- 3. « Calculer la tournée » : elle doit s'ordonner, plus de message
--    « Aucune adresse géolocalisée dans cette tournée ».
-- 4. Recommencer SANS choisir de suggestion, en tapant l'adresse à la main :
--    la commande doit passer QUAND MÊME, et la carte annoncer que cette
--    adresse n'est pas localisée. Une vente ne se refuse pas pour ça.


-- ─── 4) RETOUR ARRIÈRE ─────────────────────────────────────────────────────
--
-- ⚠️ Il PERD les notes déjà saisies : ce n'est pas un retour neutre.
--
-- ALTER TABLE commandes DROP COLUMN IF EXISTS note_livraison;
