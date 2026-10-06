-- ════════════════════════════════════════════════════════════════════════════
-- Équipe : « Argent » n'impose plus « Agenda »
-- Décision d'Alex, 06/10 (tableau) : « Argent sans Agenda »
-- ════════════════════════════════════════════════════════════════════════════
--
-- POURQUOI. La case « Argent » n'agissait que sur des rendez-vous ; depuis le
-- 06/10 elle ouvre aussi « Annulée par le commerce » sur une COMMANDE (avec
-- remboursement). Un commerce alimentaire sans rendez-vous devait donc cocher
-- « Agenda » pour rien. La règle devient : « Argent » demande « Agenda » OU
-- « Commandes » (seules ces deux cases montrent ce sur quoi « Argent » agit).
--
-- Même nom de contrainte (les contrôles d'origine comptent les noms). La règle
-- côté écran et serveur : `refusDroits` (lib/equipe.js).
--
-- Idempotent. À passer sur l'ESSAI puis la PROD. Aucun membre existant n'est
-- refusé : la nouvelle règle est plus large que l'ancienne.
-- Date : 2026-10-06
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.equipe_membres DROP CONSTRAINT IF EXISTS equipe_membres_argent_avec_agenda;
ALTER TABLE public.equipe_membres ADD CONSTRAINT equipe_membres_argent_avec_agenda
  CHECK (NOT droit_argent OR droit_agenda OR droit_commandes);

-- ─── Contrôle : une ligne par vérification, valeur ET attendu ───────────────
SELECT * FROM (
  SELECT 1 AS n, 'argent exige agenda OU commandes' AS controle,
         (SELECT pg_get_constraintdef(oid) FROM pg_constraint
           WHERE conrelid = 'public.equipe_membres'::regclass
             AND conname = 'equipe_membres_argent_avec_agenda')::text AS valeur,
         'CHECK (((NOT droit_argent) OR droit_agenda OR droit_commandes))' AS attendu
  UNION ALL SELECT 2, 'membres qui violeraient la regle (aucun possible)',
         (SELECT count(*) FROM public.equipe_membres
           WHERE droit_argent AND NOT droit_agenda AND NOT droit_commandes)::text,
         '0'
) t ORDER BY n;
