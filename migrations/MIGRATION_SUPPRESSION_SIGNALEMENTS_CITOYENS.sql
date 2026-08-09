-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_SUPPRESSION_SIGNALEMENTS_CITOYENS.sql
--
-- ⚠️ MIGRATION DESTRUCTIVE. Elle efface des données, sans retour arrière.
--
-- CE QU'ELLE SUPPRIME : la table `signalements_citoyens` et les photos du
-- bucket `signalements-photos`.
--
-- POURQUOI. Le module des services publics a été retiré du produit le 09/08 :
-- plus aucun écran ne lit ces signalements, et plus rien ne peut en créer. Or
-- la table contient l'email et le prénom du citoyen, sa position GPS au mètre
-- près, une description libre et une photo de rue, qui peut montrer des
-- visages ou des plaques. Conserver des données personnelles pour une finalité
-- qui n'existe plus va contre le principe de minimisation : ce n'est plus une
-- ressource, c'est une responsabilité.
--
-- CONTENU AU MOMENT D'ÉCRIRE : 1 ligne, 1 personne, du 10/06/2026, soit la
-- préparation de la démo Mettet. Vérifié avec Alex avant d'écrire ce script.
--
-- ⚠️ NE PAS CONFONDRE avec la table `signalements` (sans suffixe), qui est
-- ACTIVE : c'est elle qui porte les fiches commerçant signalées comme erronées
-- et qui alimente l'onglet Signaux du tableau de bord. Elle n'est pas touchée
-- ici, et elle ne doit pas l'être.
--
-- ⚠️ `services_publics` N'EST PAS SUPPRIMÉE : ce sont des données publiques
-- (nom, adresse, téléphone d'une commune), sans enjeu de vie privée, et c'est
-- une saisie qui resservirait si le module revenait un jour.
--
-- Vérification attendue en fin de script :
--   table_restante = 0, photos_restantes = 0, signalements_commercants_intacts = (ton nombre habituel)
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Les photos d'abord : une fois la table partie, plus rien ne dit à quoi
--    ces fichiers correspondaient.
DELETE FROM storage.objects WHERE bucket_id = 'signalements-photos';
DELETE FROM storage.buckets WHERE id = 'signalements-photos';

-- 2. La table elle-même.
DROP TABLE IF EXISTS public.signalements_citoyens;

-- ─── Vérification ──────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'signalements_citoyens')  AS table_restante,
  (SELECT COUNT(*) FROM storage.objects
    WHERE bucket_id = 'signalements-photos')                                 AS photos_restantes,
  (SELECT COUNT(*) FROM public.signalements)                                 AS signalements_commercants_intacts;
