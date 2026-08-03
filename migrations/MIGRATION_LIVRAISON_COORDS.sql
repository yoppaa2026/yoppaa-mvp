-- MIGRATION_LIVRAISON_COORDS.sql   (Sprint 3 — tournée optimisée)
--
-- Coordonnées GPS de l'adresse de livraison, géocodées via Nominatim au moment
-- de la commande (server-side, lib/geocode.js). Servent la TOURNÉE OPTIMISÉE
-- (OpenRouteService Optimization) : ordre des arrêts le plus efficient + itinéraire.
--
-- Nullable : le géocodage peut échouer (adresse introuvable) sans invalider la
-- commande. La tournée optimisée ignore simplement les commandes sans coordonnées
-- (fallback : le commerçant les gère manuellement).
--
-- Idempotent.

ALTER TABLE commandes ADD COLUMN IF NOT EXISTS livraison_lat double precision;
ALTER TABLE commandes ADD COLUMN IF NOT EXISTS livraison_lng double precision;
