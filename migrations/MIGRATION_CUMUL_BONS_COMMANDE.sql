-- ═══════════════════════════════════════════════════════════════════════════
-- CUMULER PLUSIEURS BONS SUR UNE MÊME COMMANDE  (demande d'Alex, 01/09)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 🔴 CE QUI SE PASSE AUJOURD'HUI : une commande de 180 € face à trois bons de
-- 50, 75 et 20 € n'en accepte QU'UN. Et l'écran ne se contente pas de refuser
-- le cumul, il FAIT DISPARAÎTRE les deux autres : on peut en conclure qu'ils
-- sont perdus.
--
-- 🔴 POURQUOI ÇA NE POUVAIT PAS SE RÉGLER À L'ÉCRAN. `commandes.bon_cadeau_id`
-- est AU SINGULIER. Cumuler côté navigateur sans que la commande sache quels
-- bons ont servi ferait qu'une annulation n'en recréditerait QU'UN : les autres
-- seraient débités et jamais rendus. C'est exactement le défaut du 29/08,
-- « bon jamais recrédité », et on ne le refait pas.
--
-- ✅ LES PRIMITIVES EXISTENT DÉJÀ ET SONT IDEMPOTENTES : `debiterBon` et
-- `recrediterBon` travaillent bon par bon (`lib/bons-cadeaux-server.js`). Il ne
-- manquait que la LISTE de ce qui a servi.
--
-- ⚠️ UNE SEULE SOURCE DE VÉRITÉ POUR L'ARGENT. `bons_utilises` fait foi pour le
-- débit et le recrédit. `bon_cadeau_montant` reste le TOTAL, pour toutes les
-- lectures qui existent déjà (export comptable, emails, tableau de bord), et
-- `bon_cadeau_id` garde le PREMIER bon pour ne rien casser. Deux sources de
-- vérité est le défaut le plus fréquent de ce projet : celle-ci est nommée, et
-- un banc vérifiera qu'aucun chemin d'argent ne lit `bon_cadeau_id`.
--
-- ⚠️ ET ON REMPLIT LES LIGNES EXISTANTES. Sans ce rattrapage, les anciennes
-- commandes n'auraient pas de liste et se comporteraient autrement que les
-- nouvelles : deux formes, donc deux comportements, donc un défaut qui attend.

ALTER TABLE public.commandes
  ADD COLUMN IF NOT EXISTS bons_utilises jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.rdv_reservations
  ADD COLUMN IF NOT EXISTS bons_utilises jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.commandes.bons_utilises IS
  'Liste [{ id, montant }] des bons réellement débités. FAIT FOI pour le débit et le recrédit ; bon_cadeau_montant en est le total.';
COMMENT ON COLUMN public.rdv_reservations.bons_utilises IS
  'Liste [{ id, montant }] des bons réellement débités. FAIT FOI pour le débit et le recrédit ; bon_cadeau_montant en est le total.';

-- ─── RATTRAPAGE : une seule forme, y compris pour le passé ───────────────────
--
-- ⚠️ IDEMPOTENT : on ne touche que les lignes dont la liste est encore vide et
-- qui portent bien un bon. Rejouer la migration ne double rien.
UPDATE public.commandes
   SET bons_utilises = jsonb_build_array(
         jsonb_build_object('id', bon_cadeau_id, 'montant', bon_cadeau_montant))
 WHERE bon_cadeau_id IS NOT NULL
   AND COALESCE(bon_cadeau_montant, 0) > 0
   AND bons_utilises = '[]'::jsonb;

UPDATE public.rdv_reservations
   SET bons_utilises = jsonb_build_array(
         jsonb_build_object('id', bon_cadeau_id, 'montant', bon_cadeau_montant))
 WHERE bon_cadeau_id IS NOT NULL
   AND COALESCE(bon_cadeau_montant, 0) > 0
   AND bons_utilises = '[]'::jsonb;

-- ⚠️ AUCUN GRANT ICI, ET C'EST VOULU : cette migration ne crée aucun objet
-- grantable. Une colonne hérite des droits de sa table, et `commandes` comme
-- `rdv_reservations` n'ont plus aucun droit `anon` depuis le ménage de ce
-- matin, hormis l'INSERT public de la réservation.

-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRÔLE : une ligne par vérification, la valeur ET l'attendu, tout en text
-- ═══════════════════════════════════════════════════════════════════════════

SELECT 'colonne bons_utilises sur commandes'::text AS controle,
       COALESCE((SELECT data_type FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'commandes'
                   AND column_name = 'bons_utilises'), 'ABSENTE')::text AS valeur,
       'jsonb'::text AS attendu

UNION ALL
SELECT 'colonne bons_utilises sur rdv_reservations',
       COALESCE((SELECT data_type FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'rdv_reservations'
                   AND column_name = 'bons_utilises'), 'ABSENTE')::text,
       'jsonb'::text

UNION ALL
-- 🔴 LE CONTRÔLE QUI COMPTE : plus AUCUNE ligne ne porte un bon sans figurer
-- dans la nouvelle liste. Sinon une annulation ne rendrait rien sur celle-là.
SELECT 'commandes avec un bon MAIS sans liste',
       (SELECT count(*) FROM public.commandes
        WHERE bon_cadeau_id IS NOT NULL AND COALESCE(bon_cadeau_montant, 0) > 0
          AND bons_utilises = '[]'::jsonb)::text,
       '0'::text

UNION ALL
SELECT 'rendez-vous avec un bon MAIS sans liste',
       (SELECT count(*) FROM public.rdv_reservations
        WHERE bon_cadeau_id IS NOT NULL AND COALESCE(bon_cadeau_montant, 0) > 0
          AND bons_utilises = '[]'::jsonb)::text,
       '0'::text

UNION ALL
-- ⚠️ ET LA SOMME DOIT TOMBER JUSTE, sinon le total et le détail se
-- contrediraient dès la première annulation.
SELECT 'commandes ou la somme de la liste ne fait pas le total',
       (SELECT count(*) FROM public.commandes c
        WHERE c.bons_utilises <> '[]'::jsonb
          AND ROUND((SELECT COALESCE(sum((e->>'montant')::numeric), 0)
                     FROM jsonb_array_elements(c.bons_utilises) e), 2)
              <> ROUND(COALESCE(c.bon_cadeau_montant, 0), 2))::text,
       '0'::text

UNION ALL
SELECT 'rendez-vous ou la somme de la liste ne fait pas le total',
       (SELECT count(*) FROM public.rdv_reservations r
        WHERE r.bons_utilises <> '[]'::jsonb
          AND ROUND((SELECT COALESCE(sum((e->>'montant')::numeric), 0)
                     FROM jsonb_array_elements(r.bons_utilises) e), 2)
              <> ROUND(COALESCE(r.bon_cadeau_montant, 0), 2))::text,
       '0'::text

UNION ALL
SELECT 'commandes rattrapees (pour information)',
       (SELECT count(*) FROM public.commandes WHERE bons_utilises <> '[]'::jsonb)::text,
       '(pour information)'::text

UNION ALL
SELECT 'rendez-vous rattrapes (pour information)',
       (SELECT count(*) FROM public.rdv_reservations WHERE bons_utilises <> '[]'::jsonb)::text,
       '(pour information)'::text

ORDER BY 1;
