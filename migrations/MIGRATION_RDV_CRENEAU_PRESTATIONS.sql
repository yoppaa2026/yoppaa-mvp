-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_RDV_CRENEAU_PRESTATIONS.sql
-- Un creneau dit enfin CE QU'IL ACCEPTE.
--
-- 🔴 D'OU CA VIENT (Alex, 07/09). Chez Centre Respire, un creneau du lundi
-- 08:00-18:00 accepte aussi bien une Seance de Reiki (capacite 1) qu'un Cours
-- de Yoga (capacite 12). Deux consequences, et la seconde est la pire :
--
--   1. LE PREMIER ARRIVE DECIDE DE LA NATURE DU CRENEAU. Quelqu'un reserve un
--      Reiki a 10h : le cours de Yoga de 10h est annule DE FAIT, pour tout le
--      monde. Un studio qui affiche un planning ne peut pas vivre avec ca.
--
--   2. LE COURS DE YOGA EST PROPOSE A TOUTES LES HEURES. 08:00 a 18:00, cinq
--      jours sur sept : cinquante cours de yoga par semaine. Un client peut en
--      ouvrir un le mardi a 13h, et il faudra l'assurer pour lui tout seul.
--
-- ⚠️ CE N'EST PAS UNE FAILLE, C'EST UN MANQUE DE MODELE. Verifie en lisant
-- `conflitReservation` : aucune double-reservation n'est possible, un Reiki
-- pris bloque bien le Yoga de la meme heure et reciproquement. Le moteur est
-- juste ; c'est la donnee qui ne sait pas dire ce qu'un creneau accepte.
--
-- ⚠️ ET UNE SEULE CASE MANQUAIT. Un creneau porte deja son jour, sa date
-- precise, son praticien, son lieu, son pas et sa pause : tout ce qu'il faut
-- pour decrire une seance de cours. Separer les cours des rendez-vous aurait
-- reconstruit un objet existant a 90 %, avec un second moteur a maintenir.
-- On remplit la case, on ne double pas le modele.
--
-- ✅ VIDE VEUT DIRE « TOUTES » (arbitrage d'Alex, 07/09), exactement comme la
-- jonction prestation-praticien qui vit ici depuis le debut. C'est ce qui fait
-- qu'AUCUN commerce existant ne change de comportement : les creneaux deja
-- crees n'ont aucune ligne ici, donc ils continuent d'accepter tout.
--
-- 🔴 LE FILTRE DEVRA ETRE POSE COTE SERVEUR AUSSI, pas seulement a l'ecran.
-- Sans ca, une requete forgee reserve un yoga le mardi a 13h. C'est du code,
-- pas du SQL, et ca se pose au meme endroit que la garde « la prestation
-- appartient-elle a ce commerce » : `creerReservationRdv`.
--
-- Idempotente : les contraintes nommees se posent HORS du CREATE TABLE, lecon
-- du 06/09 (une contrainte ecrite dedans rend tout deuxieme passage impossible).
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. LA LIAISON ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rdv_creneau_prestations (
  creneau_id    uuid NOT NULL REFERENCES rdv_creneaux(id)    ON DELETE CASCADE,
  prestation_id uuid NOT NULL REFERENCES rdv_prestations(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (creneau_id, prestation_id)
);

COMMENT ON TABLE rdv_creneau_prestations IS
  'Quelles prestations un creneau accepte. AUCUNE ligne pour un creneau = il les accepte TOUTES : c''est le defaut, et c''est ce qui protege tous les agendas existants. Meme convention que rdv_prestation_praticiens.';

-- La cle primaire couvre deja « ce creneau accepte-t-il cette prestation ». Il
-- manque le sens inverse, qui est celui de la fiche publique : « quels creneaux
-- acceptent la prestation que le client vient de choisir ».
CREATE INDEX IF NOT EXISTS idx_rdv_cp_prestation
  ON rdv_creneau_prestations (prestation_id);


-- ─── 2. LE CRENEAU ET LA PRESTATION SONT DU MEME COMMERCE ──────────────────
-- 🔴 LES DEUX CLES ETRANGERES SONT VALIDES SEPAREMENT. Sans cette garde, un
-- commercant rattache la prestation d'un CONCURRENT a son propre creneau : la
-- fiche du voisin proposerait alors des heures qu'il n'a jamais ouvertes.
CREATE OR REPLACE FUNCTION rdv_creneau_prestation_meme_commercant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  proprio_creneau uuid;
  proprio_presta  uuid;
BEGIN
  SELECT commercant_id INTO proprio_creneau FROM public.rdv_creneaux    WHERE id = NEW.creneau_id;
  SELECT commercant_id INTO proprio_presta  FROM public.rdv_prestations WHERE id = NEW.prestation_id;

  IF proprio_creneau IS NULL THEN
    RAISE EXCEPTION 'Creneau introuvable';
  END IF;
  IF proprio_presta IS NULL THEN
    RAISE EXCEPTION 'Prestation introuvable';
  END IF;
  IF proprio_creneau IS DISTINCT FROM proprio_presta THEN
    RAISE EXCEPTION 'Un creneau ne peut accepter que les prestations du meme commercant';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rdv_cp_meme_commercant ON rdv_creneau_prestations;
CREATE TRIGGER trg_rdv_cp_meme_commercant
  BEFORE INSERT OR UPDATE OF creneau_id, prestation_id ON rdv_creneau_prestations
  FOR EACH ROW
  EXECUTE FUNCTION rdv_creneau_prestation_meme_commercant();

REVOKE EXECUTE ON FUNCTION rdv_creneau_prestation_meme_commercant() FROM public;


-- ─── 3. LES DROITS ─────────────────────────────────────────────────────────
-- La fiche publique DOIT lire cette table : c'est elle qui dit quels creneaux
-- proposer une fois la prestation choisie. Aucune donnee personnelle ici, deux
-- identifiants et une date.
ALTER TABLE rdv_creneau_prestations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON rdv_creneau_prestations FROM anon, authenticated;
GRANT SELECT ON rdv_creneau_prestations TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON rdv_creneau_prestations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON rdv_creneau_prestations TO service_role;


-- ─── 4. LES POLICIES ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS rdv_cp_lecture_publique ON rdv_creneau_prestations;
CREATE POLICY rdv_cp_lecture_publique
  ON rdv_creneau_prestations FOR SELECT
  TO anon, authenticated
  USING (true);

-- 🔴 UNE POLICY D'ECRITURE QUI NE VERIFIE PAS UNE IDENTITE NE VERIFIE PERSONNE
-- (lecon du 04/09 : n'importe qui pouvait remplir l'agenda). On verifie ici que
-- le commerce du CRENEAU et celui de la PRESTATION appartiennent tous deux a
-- l'utilisateur connecte. Les deux, et pas seulement l'un : la policy ne doit
-- pas dependre du declencheur pose plus haut pour etre juste.
DROP POLICY IF EXISTS rdv_cp_commercant_gere ON rdv_creneau_prestations;
CREATE POLICY rdv_cp_commercant_gere
  ON rdv_creneau_prestations FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM rdv_creneaux k JOIN commercants c ON c.id = k.commercant_id
             WHERE k.id = rdv_creneau_prestations.creneau_id AND c.auth_user_id = auth.uid())
    AND
    EXISTS (SELECT 1 FROM rdv_prestations p JOIN commercants c ON c.id = p.commercant_id
             WHERE p.id = rdv_creneau_prestations.prestation_id AND c.auth_user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM rdv_creneaux k JOIN commercants c ON c.id = k.commercant_id
             WHERE k.id = rdv_creneau_prestations.creneau_id AND c.auth_user_id = auth.uid())
    AND
    EXISTS (SELECT 1 FROM rdv_prestations p JOIN commercants c ON c.id = p.commercant_id
             WHERE p.id = rdv_creneau_prestations.prestation_id AND c.auth_user_id = auth.uid())
  );

-- ⚠️ ET LE VERROU DES COMMERCES NON VALIDES, `AS RESTRICTIVE`. Sans ces deux
-- mots la policy serait PERMISSIVE, donc elle OUVRIRAIT au lieu de fermer :
-- elle s'ajouterait a celle du dessus au lieu de la restreindre. Toutes les
-- tables du module rendez-vous la portent, celle-ci ne fait pas exception.
DROP POLICY IF EXISTS zz_commerce_ouvert ON rdv_creneau_prestations;
CREATE POLICY zz_commerce_ouvert ON rdv_creneau_prestations
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT EXISTS (SELECT 1 FROM rdv_creneaux k
                      WHERE k.id = rdv_creneau_prestations.creneau_id
                        AND k.commercant_id IN (SELECT public.mes_commerces_bloques())))
  WITH CHECK (NOT EXISTS (SELECT 1 FROM rdv_creneaux k
                      WHERE k.id = rdv_creneau_prestations.creneau_id
                        AND k.commercant_id IN (SELECT public.mes_commerces_bloques())));


-- ⚠️ ET L'ADMINISTRATION, QUI SERAIT SORTIE DU MODULE SANS CA. Toutes les
-- tables du rendez-vous portent « Admin Yoppaa FULL » (MIGRATION_ADMIN_RLS,
-- une boucle sur une LISTE EN DUR). Une table neuve n'y entre pas toute seule :
-- sans cette policy, le support serait aveugle sur cette liaison precisement le
-- jour ou un commercant appellerait parce que son agenda ne propose plus rien.
DROP POLICY IF EXISTS "Admin Yoppaa FULL" ON rdv_creneau_prestations;
CREATE POLICY "Admin Yoppaa FULL" ON rdv_creneau_prestations
  FOR ALL TO authenticated
  USING (public.is_yoppaa_admin())
  WITH CHECK (public.is_yoppaa_admin());


-- ═══════════════════════════════════════════════════════════════════════════
-- CONTROLE — une ligne par verification, la valeur ET l'attendu, tout en text
-- ═══════════════════════════════════════════════════════════════════════════
SELECT '1. table rdv_creneau_prestations'::text AS controle,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
                          WHERE table_name = 'rdv_creneau_prestations') THEN 'oui' ELSE 'NON' END::text AS valeur,
       'oui'::text AS attendu
UNION ALL
SELECT '2. RLS activee'::text,
       coalesce((SELECT CASE WHEN relrowsecurity THEN 'oui' ELSE 'NON' END
                   FROM pg_class WHERE relname = 'rdv_creneau_prestations'), 'TABLE ABSENTE')::text,
       'oui'::text
UNION ALL
SELECT '3. la fiche publique peut lire'::text,
       (SELECT count(DISTINCT grantee)::text FROM information_schema.table_privileges
         WHERE table_name = 'rdv_creneau_prestations' AND privilege_type = 'SELECT'
           AND grantee IN ('anon', 'authenticated')),
       '2'::text
UNION ALL
-- 🔴 LE CONTROLE QUI COMPTE. `anon` doit LIRE et rien d'autre : un droit
-- d'ecriture ici laisserait n'importe qui decider des heures d'un salon.
SELECT '4. anon ne peut RIEN ecrire'::text,
       (SELECT count(*)::text FROM information_schema.table_privileges
         WHERE table_name = 'rdv_creneau_prestations' AND grantee = 'anon'
           AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')),
       '0'::text
UNION ALL
SELECT '5. la policy d ecriture verifie une IDENTITE'::text,
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                          WHERE tablename = 'rdv_creneau_prestations'
                            AND policyname = 'rdv_cp_commercant_gere'
                            AND qual LIKE '%auth.uid()%'
                            AND with_check LIKE '%auth.uid()%') THEN 'oui' ELSE 'NON' END::text,
       'oui'::text
UNION ALL
-- ⚠️ ET ELLE VERIFIE LES DEUX BOUTS, pas seulement le creneau.
SELECT '6. elle verifie le creneau ET la prestation'::text,
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                          WHERE tablename = 'rdv_creneau_prestations'
                            AND policyname = 'rdv_cp_commercant_gere'
                            AND with_check LIKE '%rdv_creneaux%'
                            AND with_check LIKE '%rdv_prestations%') THEN 'oui' ELSE 'NON' END::text,
       'oui'::text
UNION ALL
-- 🔴 `permissive` = « PERMISSIVE » sur un verrou voudrait dire qu il OUVRE.
SELECT '7. le verrou des commerces bloques est RESTRICTIVE'::text,
       coalesce((SELECT permissive FROM pg_policies
                  WHERE tablename = 'rdv_creneau_prestations'
                    AND policyname = 'zz_commerce_ouvert'), 'POLICY ABSENTE')::text,
       'RESTRICTIVE'::text
UNION ALL
SELECT '8. garde du meme commercant'::text,
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                          WHERE tgname = 'trg_rdv_cp_meme_commercant') THEN 'oui' ELSE 'NON' END::text,
       'oui'::text
UNION ALL
SELECT '9. les deux liens s effacent avec leur parent'::text,
       (SELECT count(*)::text FROM pg_constraint
         WHERE conrelid = 'rdv_creneau_prestations'::regclass
           AND contype = 'f' AND confdeltype = 'c'),
       '2'::text
UNION ALL
SELECT '9b. l administration voit la table'::text,
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                          WHERE tablename = 'rdv_creneau_prestations'
                            AND policyname = 'Admin Yoppaa FULL') THEN 'oui' ELSE 'NON' END::text,
       'oui'::text
UNION ALL
SELECT '10. index du sens fiche publique'::text,
       CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
                          WHERE tablename = 'rdv_creneau_prestations'
                            AND indexname = 'idx_rdv_cp_prestation') THEN 'oui' ELSE 'NON' END::text,
       'oui'::text
UNION ALL
-- ⚠️ ZERO, ET C'EST LA GARANTIE DE NON-REGRESSION : aucune liaison n'existe,
-- donc TOUS les creneaux du parc acceptent encore toutes les prestations.
SELECT '11. liaisons existantes'::text,
       (SELECT count(*)::text FROM rdv_creneau_prestations),
       '0'::text
UNION ALL
-- Ce que le commercant aura a regler, pour mesurer le travail qui l'attend.
SELECT '12. creneaux actifs du parc (tous « toutes prestations »)'::text,
       (SELECT count(*)::text FROM rdv_creneaux WHERE actif = true AND deleted_at IS NULL),
       'informatif'::text
UNION ALL
SELECT '13. cours collectifs actifs (capacite > 1)'::text,
       (SELECT count(*)::text FROM rdv_prestations
         WHERE actif = true AND deleted_at IS NULL AND capacite > 1),
       'informatif'::text;
