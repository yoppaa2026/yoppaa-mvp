-- ═══════════════════════════════════════════════════════════════════════════
-- CRÉNEAUX — 22/08/2026 — « JE SUIS DÉBORDÉ, FERME-MOI CE CRÉNEAU »
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Demande remontée à Alex par un commerçant, et elle est juste : le comptoir
-- ne prévient pas. Un car de scouts entre à 16 h, et le créneau de 16 h 15
-- continue d'accepter des commandes Yoppaa qu'il ne pourra pas préparer.
--
-- ⚠️ CE QU'IL FAUT ABSOLUMENT NE PAS FAIRE, ET C'EST LA RÈGLE D'ALEX : les
-- commandes DÉJÀ PRISES sur ce créneau RESTENT. On ne bloque que la capacité
-- QUI RESTE. Annuler ce qui est déjà vendu serait pire que le problème.
--
-- ⚠️ ET LE BLOCAGE VAUT POUR UN JOUR PRÉCIS, JAMAIS POUR LE MODÈLE. La table
-- `creneaux` décrit une SEMAINE TYPE : une ligne « vendredi 16 h 15 » vaut pour
-- tous les vendredis. Poser un drapeau dessus fermerait ce créneau jusqu'à la
-- fin des temps, et le commerçant ne le découvrirait que le vendredi suivant,
-- en se demandant pourquoi plus personne ne commande à 16 h 15.
-- D'où une table à part, avec sa DATE.
--
-- C'est la même raison qui a fait naître `article_stock_jour` : ce qui varie au
-- jour le jour ne se range pas dans la grille hebdomadaire.


-- ─── 1) LA TABLE ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS creneaux_blocages (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commercant_id  uuid NOT NULL REFERENCES commercants(id) ON DELETE CASCADE,
  creneau_id     uuid NOT NULL REFERENCES creneaux(id) ON DELETE CASCADE,
  -- Le jour civil BELGE, écrit en clair. Jamais un instant : un créneau se
  -- bloque pour « le 22 août », pas pour « le 22 août à 00:00 UTC », qui est
  -- le 21 à 22 h chez nous. Voir reference_jour_civil_fuseau.
  date_blocage   date NOT NULL,
  motif          text,
  created_at     timestamptz NOT NULL DEFAULT now(),

  -- ⚠️ UN SEUL BLOCAGE PAR CRÉNEAU ET PAR JOUR. Sans cette contrainte, deux
  -- taps sur le bouton créeraient deux lignes, et le déblocage n'en retirerait
  -- qu'une : le créneau resterait fermé sans que rien ne l'explique.
  CONSTRAINT creneaux_blocages_unicite UNIQUE (creneau_id, date_blocage)
);

COMMENT ON TABLE creneaux_blocages IS
  'Créneaux fermés à la volée par le commerçant débordé, pour UN JOUR donné. La présence d''une ligne suffit : elle met la capacité restante à zéro sans toucher aux commandes déjà prises.';
COMMENT ON COLUMN creneaux_blocages.date_blocage IS
  'Jour civil belge (YYYY-MM-DD) auquel ce créneau est fermé. Le blocage ne vaut QUE pour ce jour : `creneaux` décrit une semaine type.';

-- La lecture se fait toujours « ce commerce, ce jour ».
CREATE INDEX IF NOT EXISTS idx_creneaux_blocages_jour
  ON creneaux_blocages (commercant_id, date_blocage);


-- ─── 2) LES DROITS ─────────────────────────────────────────────────────────
--
-- ⚠️ EXPLICITES, comme sur toute table créée ici. Sans `GRANT`, PostgREST
-- répond 401 et l'écran se vide sans dire pourquoi.
--
-- ⚠️ `anon` A BESOIN DE LIRE, et c'est le point à ne pas manquer : la fiche
-- publique doit savoir qu'un créneau est fermé pour ne pas le proposer. Elle
-- n'écrit jamais.

GRANT SELECT                         ON creneaux_blocages TO anon;
GRANT SELECT                         ON creneaux_blocages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON creneaux_blocages TO service_role;


-- ─── 3) RLS ────────────────────────────────────────────────────────────────

ALTER TABLE creneaux_blocages ENABLE ROW LEVEL SECURITY;

-- LECTURE : tout le monde, y compris `anon`.
--
-- ⚠️ ON NE FILTRE PAS SUR LA PUBLICATION ICI, ET C'EST DÉLIBÉRÉ. Le contenu de
-- cette table n'est ni personnel ni commercial : « le créneau de 16 h 15 est
-- fermé le 22 août ». La refermer sur les seuls commerces publiés obligerait à
-- une sous-requête sur `commercants`, et une sous-requête évaluée avec les
-- droits d'`anon` rend FAUX en silence : le créneau bloqué redeviendrait
-- commandable pour le public, c'est-à-dire l'inverse exact du but.
-- Voir reference_policy_large_qui_sauve.
DROP POLICY IF EXISTS "blocages_lecture_publique" ON creneaux_blocages;
CREATE POLICY "blocages_lecture_publique" ON creneaux_blocages
  FOR SELECT TO anon, authenticated
  USING (true);

-- ÉCRITURE : le propriétaire du commerce, et lui seul.
--
-- ⚠️ TROIS POLICIES SÉPARÉES, PAS UN `FOR ALL`. Sur un `ALL` sans `WITH CHECK`,
-- PostgreSQL réutilise le `USING` comme contrôle d'écriture : la nuance passe
-- inaperçue tant qu'elle ne fait pas de dégât. On écrit ce qu'on veut dire.
DROP POLICY IF EXISTS "blocages_insert_proprietaire" ON creneaux_blocages;
CREATE POLICY "blocages_insert_proprietaire" ON creneaux_blocages
  FOR INSERT TO authenticated
  WITH CHECK (commercant_id IN (SELECT id FROM commercants WHERE auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "blocages_delete_proprietaire" ON creneaux_blocages;
CREATE POLICY "blocages_delete_proprietaire" ON creneaux_blocages
  FOR DELETE TO authenticated
  USING (commercant_id IN (SELECT id FROM commercants WHERE auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "blocages_update_proprietaire" ON creneaux_blocages;
CREATE POLICY "blocages_update_proprietaire" ON creneaux_blocages
  FOR UPDATE TO authenticated
  USING      (commercant_id IN (SELECT id FROM commercants WHERE auth_user_id = auth.uid()))
  WITH CHECK (commercant_id IN (SELECT id FROM commercants WHERE auth_user_id = auth.uid()));


-- ─── 4) CONTRÔLES ──────────────────────────────────────────────────────────

-- a) Attendu : la table existe, RLS ACTIVE (rowsecurity = true).
SELECT relname, relrowsecurity AS rls_active
  FROM pg_class
 WHERE relname = 'creneaux_blocages';

-- b) Attendu : QUATRE policies. Une SELECT pour {anon,authenticated}, et trois
--    d'écriture pour {authenticated} seulement.
--    ⚠️ Si une policy d'écriture mentionne `anon`, n'importe qui pourrait
--    fermer les créneaux d'un commerçant. À relire avant de continuer.
SELECT policyname, cmd, roles::text
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'creneaux_blocages'
 ORDER BY cmd, policyname;

-- c) Attendu : 0 ligne. Aucune écriture ouverte à `anon`.
SELECT policyname, cmd
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'creneaux_blocages'
   AND cmd <> 'SELECT'
   AND roles::text LIKE '%anon%';

-- d) Attendu : la contrainte d'unicité est là.
SELECT conname, contype
  FROM pg_constraint
 WHERE conrelid = 'creneaux_blocages'::regclass
   AND conname = 'creneaux_blocages_unicite';


-- ─── 5) 🔴 LE TEST, ET IL NE SE FAIT PAS EN SQL ────────────────────────────
--
-- ⚠️ L'éditeur Supabase tourne en clé de service et ignore la RLS.
--
-- 1. Tableau de bord, bande « Remplissage des créneaux » : bloquer un créneau
--    du jour. Il doit passer en « Fermé » immédiatement.
-- 2. NAVIGATION PRIVÉE, fiche du commerce : ce créneau ne doit plus être
--    proposé, et les autres doivent l'être.
-- 3. 🔴 LE TEST QUI COMPTE : bloquer un créneau qui porte DÉJÀ une commande.
--    La commande doit RESTER dans le tableau de bord. C'est la règle d'Alex :
--    on ferme ce qui reste, on n'annule pas ce qui est vendu.
-- 4. Débloquer : le créneau redevient commandable côté client.


-- ─── 6) RETOUR ARRIÈRE ─────────────────────────────────────────────────────
--
-- ⚠️ Il PERD les blocages en cours : des créneaux fermés rouvriraient d'un coup.
--
-- DROP TABLE IF EXISTS creneaux_blocages;
