-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_RDV_LISTE_ATTENTE.sql
-- « Previens-moi si une place se libere. »
--
-- CONTEXTE (Alex, 06/09). Un cours complet, un agenda plein : aujourd'hui le
-- client repart et ne revient pas. Le desistement qui suit ne profite a
-- personne. On ouvre une file d'attente, et un desistement pousse une
-- notification a ceux qui attendent.
--
-- 🔴 LA REPONSE ETAIT DEJA DANS LE CODE, ET ELLE CHANGE LA TABLE. Decision
-- d'Alex du 13/08 : un cours complet reste AFFICHE, grise ; un creneau
-- individuel pris, lui, DISPARAIT toujours. Donc en solo il n'y a rien a
-- cliquer, le client ne voit que « aucun creneau libre ce jour-la ». Les deux
-- portees ne sont donc pas un raffinement, ce sont deux gestes differents :
--
--   COURS  il clique sur la seance grisee   il attend CETTE seance   P + D + H
--   SOLO   il clique sous le vide           il attend UN rendez-vous P + plage
--
-- ⚠️ UNE SEULE TABLE, DEUX PORTEES. Un desistement libere toujours
-- prestation + date + heure : on cherche les lignes `seance` qui collent
-- exactement, PLUS les lignes `fenetre` sur cette prestation dont la plage
-- contient la date. Un declencheur, un push, deux filtres. Deux tables
-- auraient double le declencheur, et le second aurait vieilli seul.
--
-- ⚠️ LE PLAFOND COMPTE CE QU'ON ATTEND : N par SEANCE en collectif, N par
-- PRESTATION en solo. Sinon cinq personnes inscrites sur le cours du lundi
-- bloqueraient le mardi, alors qu'elles n'attendent pas le mardi.
--
-- 🔴 CE QUE CETTE TABLE CONTIENT EST UNE DONNEE PERSONNELLE : qui attend quoi,
-- chez qui, et quand. Elle n'est donc lisible par PERSONNE depuis un
-- navigateur, ni par le Yopper, ni par le commercant. RLS activee, AUCUNE
-- policy, droits retires a `anon` et `authenticated`, tout passe par des
-- routes serveur. Le commercant verra un NOMBRE, jamais une identite, comme
-- pour les signaux.
--
-- ⚠️ CE QUE LE COMMERCANT VOIT (arbitrage du 06/09). Au repos, un NOMBRE.
-- Prenom et numero n'apparaissent que la ou ils servent : quand une place est
-- libre, et quand il annule lui-meme et veut prevenir. Base legale : une
-- mesure precontractuelle demandee par la personne elle-meme, pas du
-- demarchage. Donc PAS de case a cocher, qui serait un faux consentement
-- puisque le service ne marche pas sans, mais UNE PHRASE au moment du geste.
-- Et ces coordonnees ne sont pas stockees ici : elles se lisent dans
-- `clients`, elles ne sont jamais figees, elles ne survivent a rien.
--
-- ⚠️ ET LA CASCADE NE SUFFIT PAS AU DROIT A L'EFFACEMENT. La suppression de
-- compte ANONYMISE la ligne `clients`, elle ne la supprime pas (les commandes
-- la referencent) : un `ON DELETE CASCADE` ne se declencherait donc JAMAIS.
-- La route /api/yopper/supprimer-compte devra effacer `rdv_attente`
-- explicitement, avec les favoris et les avis. C'est du code, pas du SQL, et
-- c'est note ici pour que ca ne s'oublie pas.
--
-- ⚠️ CE QUI SORT DE LA FILE, ET COMMENT. Une seance passee et une fenetre
-- expiree sortent PAR LEURS DATES, lues a chaque requete : aucun cron, aucun
-- balayage, donc aucune ligne qui reste « en attente » parce qu'un cron n'a
-- pas tourne. La place obtenue passe en `servi`. La desinscription EFFACE la
-- ligne : on ne garde pas une donnee personnelle pour le plaisir d'un statut.
--
-- Idempotente, POUR DE BON depuis la correction du 06/09 : les contraintes se
-- posent HORS du `CREATE TABLE`. Ecrites dedans, elles rendaient tout deuxieme
-- passage impossible (« check constraint already exists »), alors meme que
-- l'en-tete promettait le contraire.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. LE PLAFOND, SUR LA PRESTATION ──────────────────────────────────────
-- Au meme endroit que `capacite`, et pour la meme raison (decision d'Alex du
-- 13/08) : c'est la prestation qui sait combien de monde elle peut accueillir,
-- et un cours de yoga tres demande n'a pas le meme plafond qu'une coupe.
--
-- ⚠️ ET LE DEFAUT VAUT 3, PAS 0. Un defaut a zero livrerait la fonction
-- eteinte partout, et elle n'existerait que pour les commercants qui vont
-- chercher un reglage dont ils ignorent l'existence. Trois personnes en
-- attente ne coutent rien a un commercant : il n'est pas notifie, il ne fait
-- aucun geste, il recupere un client qui serait parti. 0 desactive.
ALTER TABLE rdv_prestations
  ADD COLUMN IF NOT EXISTS attente_max int NOT NULL DEFAULT 3;

ALTER TABLE rdv_prestations DROP CONSTRAINT IF EXISTS rdv_prestations_attente_max_check;
ALTER TABLE rdv_prestations
  ADD CONSTRAINT rdv_prestations_attente_max_check CHECK (attente_max >= 0);

COMMENT ON COLUMN rdv_prestations.attente_max IS
  'Nombre de personnes acceptees en liste d''attente. Compte PAR SEANCE pour un cours collectif (capacite > 1), PAR PRESTATION pour un rendez-vous individuel. 0 = pas de liste d''attente sur cette prestation.';

-- La colonne herite des droits de la table, on le rend EXPLICITE : si des
-- droits par colonne apparaissaient un jour, l'oubli serait MUET et le bouton
-- « previens-moi » ne s'afficherait chez personne, sans une seule erreur.
GRANT SELECT (attente_max) ON rdv_prestations TO anon, authenticated;


-- ─── 2. LA FILE ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rdv_attente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  commercant_id uuid NOT NULL REFERENCES commercants(id) ON DELETE CASCADE,
  prestation_id uuid NOT NULL REFERENCES rdv_prestations(id) ON DELETE CASCADE,

  -- ⚠️ YOPPERS CONNECTES SEULEMENT (decision d'Alex, 06/09) : il faut une
  -- identite pour tenir un rang, et un push pour joindre quelqu'un en
  -- MINUTES. Un email arriverait toujours deuxieme. `client_id` est donc
  -- obligatoire : c'est lui, et lui seul, que OneSignal sait joindre.
  --
  -- 🔴 ET RIEN D'AUTRE. Pas d'email fige, pas de prenom, pas de numero. Une
  -- reservation fige les coordonnees parce que c'est un CONTRAT dont la trace
  -- doit survivre sept ans ; une attente n'est pas un contrat, elle dure trois
  -- jours. Les coordonnees se lisent dans `clients` au moment ou on en a
  -- besoin : elles restent a jour, et le jour ou quelqu'un ferme son compte
  -- elles disparaissent pour de bon au lieu de dormir ici.
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  portee text NOT NULL,

  -- Portee `seance` : la seance exacte qu'il attend.
  date_rdv date,
  heure_debut time,

  -- Portee `fenetre` : jusqu'a quand ca l'interesse. UN SEUL geste en plus
  -- cote client (semaine / quinzaine / mois). Pas de matin-midi-soir au
  -- depart : un formulaire de plus tue le geste, et un push n'oblige a rien.
  date_debut date,
  date_fin date,

  -- `en_attente` : dans la file. `prevenu` : le push est parti, il reste dans
  -- la file (une deuxieme place peut se liberer). `servi` : il a pris la
  -- place, il sort. Pas de statut « expire » : ce serait un statut qu'AUCUN
  -- code ne poserait sans un cron, donc un statut qui mentirait.
  statut text NOT NULL DEFAULT 'en_attente',

  -- LA FENETRE DE PRIORITE, SANS UN SEUL CRON. Le premier est prevenu tout de
  -- suite ; le push du suivant est PROGRAMME (`send_after`) quinze minutes
  -- plus tard, et ANNULE si la place part avant. `push_id` est l'identifiant
  -- OneSignal du dernier push programme pour cette ligne, le seul moyen de
  -- l'annuler.
  push_id text,
  prevenu_le timestamptz,
  priorite_jusqu timestamptz,

  -- L'ORDRE D'ARRIVEE EST LE RANG. Pas de colonne `rang` : deux personnes qui
  -- se desinscrivent laisseraient des trous a renumeroter, et une
  -- renumerotation qui echoue a moitie donne deux premiers.
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 🔴 LES CONTRAINTES SONT POSEES DEHORS, ET C'EST UNE CORRECTION. Ecrites
-- DANS le `CREATE TABLE IF NOT EXISTS`, elles n'etaient jouables qu'une fois :
-- au deuxieme passage, la table existe, le CREATE est saute, et le lot
-- s'arrete sur « check constraint already exists ». Le fichier se disait
-- « re-executable sans effet de bord » et ne l'etait pas.
-- ⚠️ Une affirmation en commentaire se verifie comme du code.

-- Rattrapage d'un premier passage : la colonne `client_email` a existe une
-- heure, entre la premiere version de ce fichier et l'arbitrage RGPD du meme
-- jour. Elle ne doit plus exister, et une table qui la porterait encore
-- divergerait EN SILENCE de ce fichier. Sans effet si elle n'a jamais existe.
ALTER TABLE rdv_attente DROP COLUMN IF EXISTS client_email;

ALTER TABLE rdv_attente DROP CONSTRAINT IF EXISTS rdv_attente_portee_valeurs;
ALTER TABLE rdv_attente
  ADD CONSTRAINT rdv_attente_portee_valeurs
  CHECK (portee IN ('seance', 'fenetre'));

ALTER TABLE rdv_attente DROP CONSTRAINT IF EXISTS rdv_attente_statut_valeurs;
ALTER TABLE rdv_attente
  ADD CONSTRAINT rdv_attente_statut_valeurs
  CHECK (statut IN ('en_attente', 'prevenu', 'servi'));

-- ⚠️ LA PORTEE DECIDE DES COLONNES QUI ONT UN SENS, ET LA BASE LE TIENT.
-- Sans cette contrainte, une ligne `fenetre` sans dates serait acceptee et
-- n'attendrait rien du tout : elle ne serait jamais trouvee par le
-- declencheur, et personne ne saurait pourquoi ce client n'est pas prevenu.
ALTER TABLE rdv_attente DROP CONSTRAINT IF EXISTS rdv_attente_portee_check;
ALTER TABLE rdv_attente
  ADD CONSTRAINT rdv_attente_portee_check CHECK (
    (portee = 'seance'
      AND date_rdv IS NOT NULL AND heure_debut IS NOT NULL
      AND date_debut IS NULL AND date_fin IS NULL)
    OR
    (portee = 'fenetre'
      AND date_debut IS NOT NULL AND date_fin IS NOT NULL AND date_fin >= date_debut
      AND date_rdv IS NULL AND heure_debut IS NULL)
  );

COMMENT ON TABLE rdv_attente IS
  'Liste d''attente des rendez-vous. Deux portees : `seance` (une seance precise d''un cours collectif) et `fenetre` (un rendez-vous individuel, sur une plage de dates). Donnee personnelle : lecture reservee au serveur, le commercant ne voit que des nombres.';


-- ─── 3. LA PRESTATION APPARTIENT BIEN AU COMMERCE ──────────────────────────
-- Les deux cles etrangeres sont valides SEPAREMENT : rien n'empeche, sans
-- cette garde, d'attendre la prestation d'un commerce en la rattachant a un
-- autre. Le declencheur d'un desistement cherche sur les deux : la ligne
-- serait alors invisible, ou pire, comptee chez le voisin.
CREATE OR REPLACE FUNCTION rdv_attente_meme_commercant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  proprietaire uuid;
BEGIN
  SELECT commercant_id INTO proprietaire
  FROM public.rdv_prestations
  WHERE id = NEW.prestation_id;

  IF proprietaire IS NULL THEN
    RAISE EXCEPTION 'Prestation introuvable';
  END IF;

  IF proprietaire IS DISTINCT FROM NEW.commercant_id THEN
    RAISE EXCEPTION 'Une attente ne peut viser qu''une prestation du meme commercant';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rdv_attente_meme_commercant ON rdv_attente;
CREATE TRIGGER trg_rdv_attente_meme_commercant
  BEFORE INSERT OR UPDATE OF prestation_id, commercant_id ON rdv_attente
  FOR EACH ROW
  EXECUTE FUNCTION rdv_attente_meme_commercant();

REVOKE EXECUTE ON FUNCTION rdv_attente_meme_commercant() FROM public;

-- `updated_at` : la fonction du module rendez-vous existe deja depuis
-- MIGRATION_RDV, on la reutilise plutot que d'en ecrire une neuvieme copie.
DROP TRIGGER IF EXISTS trg_touch_rdv_attente ON rdv_attente;
CREATE TRIGGER trg_touch_rdv_attente BEFORE UPDATE ON rdv_attente
  FOR EACH ROW EXECUTE FUNCTION rdv_touch_updated_at();


-- ─── 4. ON N'ATTEND QU'UNE FOIS LA MEME CHOSE ──────────────────────────────
-- 🔴 SANS CES DEUX INDEX, UN DOUBLE CLIC DONNE DEUX RANGS A LA MEME PERSONNE,
-- et elle occupe deux des trois places de la file. C'est la base qui tranche,
-- jamais un comptage applicatif : deux requetes a la meme seconde comptent
-- toutes les deux « une seule ligne » avant d'inserer.
--
-- ⚠️ Et le plafond, lui, se compte cote serveur : depasser une file d'attente
-- de trois n'est pas une double reservation, personne ne perd d'argent, et une
-- contrainte de cardinalite en base couterait un verrou sur chaque insertion.
CREATE UNIQUE INDEX IF NOT EXISTS rdv_attente_unique_seance
  ON rdv_attente (client_id, prestation_id, date_rdv, heure_debut)
  WHERE portee = 'seance' AND statut <> 'servi';

-- Une seule fenetre par prestation : se reinscrire ALLONGE la fenetre
-- existante, ca n'en ouvre pas une deuxieme. C'est aussi ce qui fait que le
-- plafond du solo compte bien des PERSONNES, et pas des inscriptions.
CREATE UNIQUE INDEX IF NOT EXISTS rdv_attente_unique_fenetre
  ON rdv_attente (client_id, prestation_id)
  WHERE portee = 'fenetre' AND statut <> 'servi';


-- ─── 5. CE QUE LE DESISTEMENT DEMANDE ──────────────────────────────────────
-- « Qui attend cette prestation, ce jour-la, a cette heure-la ? », dans l'ordre
-- d'arrivee. Les deux filtres du declencheur, un index chacun.
CREATE INDEX IF NOT EXISTS idx_rdv_attente_seance
  ON rdv_attente (prestation_id, date_rdv, heure_debut, created_at)
  WHERE portee = 'seance' AND statut <> 'servi';

CREATE INDEX IF NOT EXISTS idx_rdv_attente_fenetre
  ON rdv_attente (prestation_id, date_debut, date_fin, created_at)
  WHERE portee = 'fenetre' AND statut <> 'servi';

-- « Qu'est-ce que j'attends ? », cote Yopper.
CREATE INDEX IF NOT EXISTS idx_rdv_attente_client
  ON rdv_attente (client_id, statut);

-- « Combien de personnes attendent chez moi ? », cote commercant.
CREATE INDEX IF NOT EXISTS idx_rdv_attente_commercant
  ON rdv_attente (commercant_id, prestation_id, statut);


-- ─── 6. LES DROITS ─────────────────────────────────────────────────────────
-- 🔴 LA REVOCATION N'EST PAS UNE PRECAUTION, C'EST LA MIGRATION. Supabase pose
-- des droits PAR DEFAUT sur toute table neuve du schema public : sans ces deux
-- lignes, n'importe quel navigateur lirait qui attend quoi et chez qui, et il
-- suffirait d'une jointure sur `clients` pour y mettre des noms. La RLS seule
-- ne suffirait pas non plus : une policy permissive ajoutee plus tard par
-- distraction ouvrirait tout. On coupe les DROITS, puis la RLS par-dessus.
ALTER TABLE rdv_attente ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON rdv_attente FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON rdv_attente TO service_role;

-- AUCUNE POLICY, ET C'EST VOLONTAIRE. Un Yopper n'est pas un utilisateur
-- Supabase Auth (le module rendez-vous entier repose sur ce constat, cf.
-- /api/rdv/mes-rdvs) : la base n'a aucun `auth.uid()` pour reconnaitre le
-- proprietaire d'une ligne. Une policy ne pourrait donc rien exprimer de vrai.
-- L'identite se prouve par le cookie signe, dans une route serveur.


-- ═══════════════════════════════════════════════════════════════════════════
-- CONTROLE — une ligne par verification, la valeur ET l'attendu, tout en text
-- ═══════════════════════════════════════════════════════════════════════════
SELECT '1. table rdv_attente'::text AS controle,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
                          WHERE table_name = 'rdv_attente') THEN 'oui' ELSE 'NON' END::text AS valeur,
       'oui'::text AS attendu
UNION ALL
SELECT '2. RLS activee'::text,
       coalesce((SELECT CASE WHEN relrowsecurity THEN 'oui' ELSE 'NON' END
                   FROM pg_class WHERE relname = 'rdv_attente'), 'TABLE ABSENTE')::text,
       'oui'::text
UNION ALL
-- 🔴 LES DEUX CONTROLES QUI COMPTENT. Une seule policy permissive, un seul
-- droit oublie a `anon`, et la liste des gens qui attendent devient publique.
SELECT '3. aucune policy sur rdv_attente'::text,
       (SELECT count(*)::text FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'rdv_attente'),
       '0'::text
UNION ALL
SELECT '4. droits de anon et authenticated'::text,
       (SELECT count(*)::text FROM information_schema.table_privileges
         WHERE table_name = 'rdv_attente' AND grantee IN ('anon', 'authenticated')),
       '0'::text
UNION ALL
SELECT '5. droits de service_role'::text,
       (SELECT count(*)::text FROM information_schema.table_privileges
         WHERE table_name = 'rdv_attente' AND grantee = 'service_role'
           AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')),
       '4'::text
UNION ALL
SELECT '6. la portee decide des colonnes'::text,
       CASE WHEN EXISTS (SELECT 1 FROM pg_constraint
                          WHERE conname = 'rdv_attente_portee_check') THEN 'oui' ELSE 'NON' END::text,
       'oui'::text
UNION ALL
SELECT '6b. valeurs de portee et de statut'::text,
       (SELECT count(*)::text FROM pg_constraint
         WHERE conname IN ('rdv_attente_portee_valeurs', 'rdv_attente_statut_valeurs')),
       '2'::text
UNION ALL
-- ⚠️ LE RATTRAPAGE. Si ce controle rend « ENCORE LA », la table porte encore la
-- colonne d'une version abandonnee, et la base ne dit plus la meme chose que
-- ce fichier.
SELECT '6c. client_email bien absente'::text,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_name = 'rdv_attente' AND column_name = 'client_email')
            THEN 'ENCORE LA' ELSE 'absente' END::text,
       'absente'::text
UNION ALL
SELECT '7. garde du meme commercant'::text,
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                          WHERE tgname = 'trg_rdv_attente_meme_commercant') THEN 'oui' ELSE 'NON' END::text,
       'oui'::text
UNION ALL
SELECT '8. trigger updated_at'::text,
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                          WHERE tgname = 'trg_touch_rdv_attente') THEN 'oui' ELSE 'NON' END::text,
       'oui'::text
UNION ALL
SELECT '9. index d unicite (seance + fenetre)'::text,
       (SELECT count(*)::text FROM pg_indexes
         WHERE tablename = 'rdv_attente'
           AND indexname IN ('rdv_attente_unique_seance', 'rdv_attente_unique_fenetre')),
       '2'::text
UNION ALL
SELECT '10. index du declencheur (seance + fenetre)'::text,
       (SELECT count(*)::text FROM pg_indexes
         WHERE tablename = 'rdv_attente'
           AND indexname IN ('idx_rdv_attente_seance', 'idx_rdv_attente_fenetre')),
       '2'::text
UNION ALL
SELECT '11. plafond par defaut sur la prestation'::text,
       coalesce((SELECT column_default FROM information_schema.columns
                  WHERE table_name = 'rdv_prestations' AND column_name = 'attente_max'), 'COLONNE ABSENTE')::text,
       '3'::text
UNION ALL
-- ⚠️ LE PIEGE DE LA COLONNE INVISIBLE, SEPTIEME FOIS. La fiche publique lit
-- les prestations depuis le navigateur : si `attente_max` n'etait pas lisible
-- par `anon`, le bouton « previens-moi » ne s'afficherait NULLE PART, et
-- aucune erreur ne le dirait.
SELECT '12. anon et authenticated lisent attente_max'::text,
       (SELECT count(DISTINCT grantee)::text
          FROM information_schema.column_privileges
         WHERE table_name = 'rdv_prestations' AND column_name = 'attente_max'
           AND privilege_type = 'SELECT'
           AND grantee IN ('anon', 'authenticated')),
       '2'::text
UNION ALL
-- Combien de prestations accepteront quelqu'un en attente des demain.
SELECT '13. prestations actives avec une file ouverte'::text,
       (SELECT count(*)::text FROM rdv_prestations
         WHERE actif = true AND deleted_at IS NULL AND attente_max > 0),
       'toutes les prestations actives'::text;
