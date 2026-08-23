-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION : LA RÉCOMPENSE DEVIENT UN OBJET, FIGÉ ET DÉPENSABLE EN LIGNE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ À PASSER DANS L'ÉDITEUR SQL SUPABASE, PUIS ME DIRE QUE C'EST FAIT.
-- Aucun repli n'est écrit dans le code.
--
-- ⚠️ CELLE-CI PEUT PASSER AVANT LE DÉPLOIEMENT, contrairement à la précédente :
-- elle n'enlève aucun droit, elle ajoute. Le code actuel continue de tourner
-- sans la voir.
--
-- ── LES DEUX DÉFAUTS QU'ELLE FERME ────────────────────────────────────────
--
-- 1. LA RÉCOMPENSE N'EST PAS FIGÉE. Aujourd'hui `fidelite_cartes` ne porte
--    qu'un COMPTEUR (`recompenses_disponibles`), et le montant affiché est relu
--    sur la fiche du COMMERÇANT à chaque affichage. S'il passe sa récompense de
--    5 € à 3 €, ce que le client croyait avoir gagné change rétroactivement,
--    sans que personne ne le lui dise. C'est exactement le défaut de
--    `periodes_exclues` sur les abonnements.
--
-- 2. ELLE NE SE DÉPENSE QU'AU COMPTOIR. Un Yopper la gagne en commandant en
--    ligne et ne peut pas la poser sur sa commande suivante. Alex, 24/08 :
--    « ça doit couvrir le C&C, RDV, et détail ».
--
-- ── LE MODÈLE ─────────────────────────────────────────────────────────────
--
-- Une récompense devient UNE LIGNE, qui porte la valeur telle qu'elle était AU
-- MOMENT OÙ ELLE A ÉTÉ GAGNÉE, et qui sait où elle a été dépensée.
--
-- ⚠️ `recompenses_disponibles` RESTE, et c'est délibéré : une dizaine d'écrans
-- le lisent déjà. Il devient un compteur d'affichage, tenu par le MÊME chemin
-- serveur que cette table. Deux vérités qui ne peuvent diverger que si
-- quelqu'un écrit ailleurs — et depuis MIGRATION_FIDELITE_SERVEUR, plus
-- personne ne le peut.

BEGIN;

-- ── 1) La récompense, objet à part entière ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fidelite_recompenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carte_id uuid NOT NULL REFERENCES public.fidelite_cartes(id) ON DELETE CASCADE,
  -- Redondant avec la carte, mais indispensable : les policies et les
  -- vérifications de propriété interrogent le commerçant sans jointure.
  commercant_id uuid NOT NULL REFERENCES public.commercants(id) ON DELETE CASCADE,

  -- ⚠️ LA VALEUR FIGÉE. Recopiée du commerçant à l'instant du déblocage, et
  -- plus jamais relue chez lui. C'est tout l'objet de cette table.
  type text NOT NULL CHECK (type IN ('remise_montant', 'remise_pct')),
  valeur numeric(10,2) NOT NULL CHECK (valeur > 0),
  libelle text NOT NULL,

  debloquee_at timestamptz NOT NULL DEFAULT now(),

  -- ── La consommation ────────────────────────────────────────────────────
  utilisee_at timestamptz,
  utilisee_source text CHECK (utilisee_source IN ('comptoir', 'commande', 'rdv')),
  commande_id uuid REFERENCES public.commandes(id) ON DELETE SET NULL,
  rdv_id uuid REFERENCES public.rdv_reservations(id) ON DELETE SET NULL
);

-- La question posée cent fois par jour : « qu'est-ce qui reste à ce client ? »
CREATE INDEX IF NOT EXISTS idx_fid_recompenses_dispo
  ON public.fidelite_recompenses(carte_id, debloquee_at)
  WHERE utilisee_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fid_recompenses_commercant
  ON public.fidelite_recompenses(commercant_id);

-- ⚠️ UNE RÉCOMPENSE NE PEUT PAS ÊTRE DÉPENSÉE DEUX FOIS SUR LA MÊME COMMANDE.
-- La consommation se fera sous `WHERE utilisee_at IS NULL`, mais un index vaut
-- mieux qu'une intention : deux webhooks Stripe rejoués en parallèle ne
-- doivent pas pouvoir écrire la même ligne deux fois.
CREATE UNIQUE INDEX IF NOT EXISTS idx_fid_recompenses_commande
  ON public.fidelite_recompenses(commande_id)
  WHERE commande_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_fid_recompenses_rdv
  ON public.fidelite_recompenses(rdv_id)
  WHERE rdv_id IS NOT NULL;

-- ── 2) Ce que la commande et le RDV en gardent ────────────────────────────
--
-- Mêmes noms que le bon cadeau (`bon_cadeau_code` / `bon_cadeau_montant`) :
-- la comptabilité lit déjà ce couple, elle lira celui-ci de la même façon.
ALTER TABLE public.commandes
  ADD COLUMN IF NOT EXISTS fidelite_recompense_id uuid
    REFERENCES public.fidelite_recompenses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fidelite_remise numeric(10,2);

ALTER TABLE public.rdv_reservations
  ADD COLUMN IF NOT EXISTS fidelite_recompense_id uuid
    REFERENCES public.fidelite_recompenses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fidelite_remise numeric(10,2);

-- ── 3) Les récompenses DÉJÀ gagnées ───────────────────────────────────────
--
-- ⚠️ SANS CE BLOC, TOUS LES CLIENTS QUI ONT UNE RÉCOMPENSE EN ATTENTE LA
-- PERDRAIENT à la seconde où le code lirait la nouvelle table. On recopie la
-- configuration ACTUELLE du commerçant : c'est exactement ce que leur écran
-- leur annonce aujourd'hui, donc personne ne perd ni ne gagne quoi que ce soit.
INSERT INTO public.fidelite_recompenses (carte_id, commercant_id, type, valeur, libelle, debloquee_at)
SELECT
  fc.id,
  fc.commercant_id,
  COALESCE(NULLIF(c.fidelite_recompense_type, ''), 'remise_montant'),
  COALESCE(NULLIF(c.fidelite_recompense_valeur, 0), 5),
  COALESCE(NULLIF(TRIM(c.fidelite_recompense_libelle), ''), 'Récompense fidélité'),
  COALESCE(fc.updated_at, now())
FROM public.fidelite_cartes fc
JOIN public.commercants c ON c.id = fc.commercant_id
CROSS JOIN LATERAL generate_series(1, GREATEST(COALESCE(fc.recompenses_disponibles, 0), 0)) AS n
WHERE COALESCE(fc.recompenses_disponibles, 0) > 0
  -- Idempotent : si la migration est relancée, on ne double pas les lignes.
  AND NOT EXISTS (
    SELECT 1 FROM public.fidelite_recompenses r
    WHERE r.carte_id = fc.id AND r.utilisee_at IS NULL
  );

-- ── 4) Les droits ─────────────────────────────────────────────────────────
--
-- ⚠️ MÊME RÈGLE QUE LE 24/08 : le navigateur LIT, il n'écrit pas. Toute
-- écriture passe par le serveur, qui seul peut garantir la valeur.
ALTER TABLE public.fidelite_recompenses ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.fidelite_recompenses TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.fidelite_recompenses FROM authenticated, anon;

-- Le commerçant voit les récompenses de SES cartes, et rien d'autre.
DROP POLICY IF EXISTS fid_recompenses_own ON public.fidelite_recompenses;
CREATE POLICY fid_recompenses_own ON public.fidelite_recompenses
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.commercants c
    WHERE c.id = fidelite_recompenses.commercant_id AND c.auth_user_id = auth.uid()
  ));

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRÔLE — à lancer APRÈS, et à me renvoyer tel quel
-- ═══════════════════════════════════════════════════════════════════════════

-- a) La table et ses colonnes
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'fidelite_recompenses'
ORDER BY ordinal_position;

-- b) 🔴 LE CONTRÔLE QUI COMPTE : chaque récompense en attente a bien sa ligne.
--    Les deux comptes doivent être ÉGAUX.
SELECT
  (SELECT COALESCE(SUM(recompenses_disponibles), 0) FROM public.fidelite_cartes) AS compteur_cartes,
  (SELECT count(*) FROM public.fidelite_recompenses WHERE utilisee_at IS NULL) AS lignes_creees;

-- c) Le navigateur ne peut que lire
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'fidelite_recompenses'
  AND grantee IN ('anon', 'authenticated')
ORDER BY grantee, privilege_type;
-- attendu : authenticated | SELECT, et RIEN pour anon

-- d) Les colonnes posées sur la commande et le RDV
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name IN ('fidelite_recompense_id', 'fidelite_remise')
ORDER BY table_name, column_name;
-- attendu : 4 lignes (commandes ×2, rdv_reservations ×2)
