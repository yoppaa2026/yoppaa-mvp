-- L'EMPREINTE BANCAIRE SUR UNE TABLE (lot 4 du module restaurant, 14/09/2026)
--
-- « Six annoncés, personne. » Le restaurateur demande la carte du client au
-- moment de la réservation, rien n'est débité s'il vient, et l'absence totale
-- se facture. Décisions d'Alex du 14/09 :
--   • empreinte par CARTE UNIQUEMENT, jamais d'acompte encaissé : un acompte
--     est un produit à déclarer, avec TVA et caisse certifiée belge. Une
--     empreinte non capturée n'est rien, et c'est ce qui met le point fiscal
--     hors du chemin critique ;
--   • le restaurateur règle LUI-MÊME le seuil et le montant, réglage de SALLE ;
--   • seul le NO-SHOW TOTAL se débite : « 6 annoncés, 4 venus » ne retient rien ;
--   • le débit est déclenché PAR LE RESTAURATEUR, et le bouton disparaît à la
--     fin du lendemain.
--
-- 🔴 CE QUE STRIPE IMPOSE, VÉRIFIÉ AVANT D'ÉCRIRE CE FICHIER. Une autorisation
-- carte en ligne EXPIRE EN 7 JOURS (Visa en transaction commerçant : 4 j 18 h).
-- Un blocage de fonds est donc IMPOSSIBLE pour une table réservée plus d'une
-- semaine à l'avance. Le chemin est un `SetupIntent` (la carte est enregistrée
-- avec l'authentification forte, qui donne le mandat), puis un `PaymentIntent`
-- hors session le jour du no-show. Conséquence de vocabulaire, non négociable :
-- RIEN N'EST BLOQUÉ SUR LE COMPTE DU CLIENT, et aucun texte ne doit l'écrire.
--
-- ⚠️ ON EST EN DIRECT CHARGES (`{ stripeAccount }`, voir
-- create-rdv-acompte/route.js:326). Le SetupIntent, le client Stripe et le
-- débit vivent donc SUR LE COMPTE DU RESTAURATEUR. Ces colonnes gardent des
-- identifiants qui n'ont de sens que là-bas.
--
-- CE QUE FAIT CETTE MIGRATION, EN UNE SEULE TRANSACTION :
--   1. `commercants` : les trois réglages. ÉTEINT PAR DÉFAUT : aucun commerce
--      ne change de comportement tant que le restaurateur n'a rien allumé.
--      ⚠️ Les deux nombres sont NOT NULL avec une valeur par défaut, et c'est
--      délibéré : `Number(null)` vaut 0 en JavaScript, et une colonne vide
--      aurait produit une empreinte de 0 € au premier oubli. Le piège du zéro,
--      huitième fois.
--   2. `rdv_reservations` : l'état de l'empreinte et ses identifiants Stripe,
--      plus `annulation_tardive`.
--      ⚠️ AUCUN NOUVEAU STATUT. Une annulation tardive reste `annule_client`
--      avec ce drapeau. Une neuvième valeur de `statut` casserait les filtres
--      de tous les écrans pour une information qui tient dans un booléen.
--   3. La vue publique expose les trois réglages : le client doit savoir AVANT
--      de réserver qu'une carte lui sera demandée et combien. C'est aussi ce
--      qu'exige l'information préalable.
--
-- ⚠️ LA VUE EST RECONDUITE SUR SA DÉFINITION VIVANTE, PAS SUR UNE LISTE FIGÉE.
-- Les migrations précédentes énuméraient les colonnes attendues et refusaient
-- si elles ne correspondaient pas (07/09). Ici la liste vivante n'a pas pu être
-- lue avant d'écrire ce fichier, et INVENTER une liste serait exactement le
-- geste qui efface une colonne en silence. La vue est donc reconstruite avec
-- SES PROPRES colonnes, les trois nouvelles ajoutées à la fin. Les garde-fous
-- changent de forme, pas de sévérité :
--   • refus si le filtre des fiches publiées a bougé ;
--   • refus si une colonne manifestement sensible s'y trouve (email, jeton,
--     secret, IBAN, mot de passe, identifiant de compte Stripe) ;
--   • la liste complète, AVANT et APRÈS, est rendue par le contrôle.
--   • ⚠️ SANS `security_invoker`, comme depuis le 27/08 : la vue reste en
--     lecture seule PAR SES DROITS, reposés ici. `CREATE OR REPLACE VIEW`
--     remplace les options par celles qu'on lui donne, même aucune : on note
--     les options vivantes et on les repose.
--
-- ⚠️ À PASSER AVANT LE DÉPLOIEMENT DU CODE : la fiche publique lit les trois
-- réglages par leur nom. Sans eux, la lecture échoue et la réservation de table
-- s'arrête. Sûre à rejouer.
--
-- ✅ PASSÉE PAR ALEX LE 14/09/2026 : 41 lignes conformes (trois réglages,
-- empreinte éteinte partout, les deux nombres NOT NULL à 6 et 20.00, les dix
-- colonnes de la réservation, `annulation_tardive` NOT NULL fausse, cinq
-- garde-fous, vue à 59 colonnes avec les trois en dernier, aucune colonne
-- perdue, filtre et options intacts, lecture seule pour `anon`), et les vingt
-- essais conformes (bornes acceptées et refusées dans les deux sens, une
-- empreinte posée sans montant, sans carte ou sans client Stripe refusée, un
-- statut inventé refusé).
--
-- ⚠️ DEUX CHOSES À RETENIR DU PASSAGE, ET AUCUNE N'EST UN DÉTAIL :
--
-- 1. 🔴 A11 N'A RIEN MESURÉ. Il devait prouver qu'aucun statut n'avait été
--    ajouté ; il a ramené la contrainte d'exclusion anti double-réservation,
--    qui contient les mots « statut » et « confirme ». Ce qu'il révèle par
--    accident vaut mieux que ce qu'il prétendait : `statut` N'A AUCUNE
--    CONTRAINTE EN BASE, les huit valeurs ne vivent que dans le code.
-- 2. HUIT COMMERCES PUBLIÉS (A20), CONTRE DOUZE LE 12/09 au même contrôle.
--    ✅ EXPLIQUÉ : « c'est moi qui ai suspendu 4 fiches » (Alex, 14/09). Ce
--    n'est donc pas une régression, et le contrôle a bien fait son travail en
--    rendant le nombre plutôt qu'un « oui ».
--
-- 🔴 ET LE TROU QUE CE PASSAGE A OUVERT : `authenticated` peut ÉCRIRE sur
-- `rdv_reservations` (A21), et le tableau de bord s'en sert vraiment
-- (app/dashboard/page.js:2036). Un commerçant pouvait donc gonfler
-- `empreinte_montant`, ou coller l'identifiant du SetupIntent d'un autre
-- client, avant de déclencher le débit. Fermé par MIGRATION_EMPREINTE_VERROU.

BEGIN;

-- 0) Ce qui existait avant, pour le contrôle et pour la reconduction.
DROP TABLE IF EXISTS pg_temp.vue_avant;
CREATE TEMP TABLE vue_avant AS
SELECT c.reloptions AS options,
       (SELECT string_agg(quote_ident(column_name::text), ', ' ORDER BY ordinal_position)
          FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'commercants_public') AS colonnes,
       pg_get_viewdef(c.oid, true) AS definition
  FROM pg_class c
 WHERE c.oid = 'public.commercants_public'::regclass;

-- 1) Les trois réglages du restaurateur.
ALTER TABLE public.commercants
  ADD COLUMN IF NOT EXISTS rdv_empreinte_actif boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rdv_empreinte_seuil_couverts integer NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS rdv_empreinte_par_personne numeric(6,2) NOT NULL DEFAULT 20.00;

COMMENT ON COLUMN public.commercants.rdv_empreinte_actif IS
  'Le restaurant demande une empreinte bancaire sur les grandes tables. Eteint par defaut.';
COMMENT ON COLUMN public.commercants.rdv_empreinte_seuil_couverts IS
  'A partir de combien de personnes la carte est demandee. 6 par defaut : les grandes tables, la ou un no-show coute vraiment cher.';
COMMENT ON COLUMN public.commercants.rdv_empreinte_par_personne IS
  'Montant garanti par personne, en euros. 20 par defaut (fourchette brasserie relevee chez les concurrents : 10 a 20 par couvert). NOT NULL : une valeur vide produirait une empreinte de zero euro.';

-- Les bornes, les mêmes que celles de l'écran.
ALTER TABLE public.commercants DROP CONSTRAINT IF EXISTS commercants_rdv_empreinte_seuil_check;
ALTER TABLE public.commercants
  ADD CONSTRAINT commercants_rdv_empreinte_seuil_check
  CHECK (rdv_empreinte_seuil_couverts BETWEEN 1 AND 200);

ALTER TABLE public.commercants DROP CONSTRAINT IF EXISTS commercants_rdv_empreinte_montant_check;
ALTER TABLE public.commercants
  ADD CONSTRAINT commercants_rdv_empreinte_montant_check
  CHECK (rdv_empreinte_par_personne > 0 AND rdv_empreinte_par_personne <= 200);

-- La colonne hérite des droits de la table ; on le rend EXPLICITE, comme pour
-- la cadence le 12/09 : le jour où des droits par colonne apparaîtraient,
-- l'oubli serait muet.
GRANT SELECT (rdv_empreinte_actif, rdv_empreinte_seuil_couverts, rdv_empreinte_par_personne)
  ON public.commercants TO anon, authenticated;
GRANT UPDATE (rdv_empreinte_actif, rdv_empreinte_seuil_couverts, rdv_empreinte_par_personne)
  ON public.commercants TO authenticated;

-- 2) L'état de l'empreinte, sur la réservation.
ALTER TABLE public.rdv_reservations
  ADD COLUMN IF NOT EXISTS empreinte_statut text,
  ADD COLUMN IF NOT EXISTS empreinte_montant numeric(8,2),
  ADD COLUMN IF NOT EXISTS empreinte_setup_intent_id text,
  ADD COLUMN IF NOT EXISTS empreinte_payment_method_id text,
  ADD COLUMN IF NOT EXISTS empreinte_customer_id text,
  ADD COLUMN IF NOT EXISTS empreinte_debit_pi_id text,
  ADD COLUMN IF NOT EXISTS empreinte_debit_montant numeric(8,2),
  ADD COLUMN IF NOT EXISTS empreinte_debit_at timestamptz,
  ADD COLUMN IF NOT EXISTS empreinte_debit_erreur text,
  ADD COLUMN IF NOT EXISTS annulation_tardive boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.rdv_reservations.empreinte_statut IS
  'NULL = table sans empreinte (petite table, reglage eteint, ou reservation prise au telephone). posee = la carte est enregistree chez Stripe. debitee = le no-show a ete facture. echouee = le debit a ete refuse par la banque. liberee = la carte a ete detachee, plus rien ne peut etre debite.';
COMMENT ON COLUMN public.rdv_reservations.empreinte_montant IS
  'Montant garanti, FIGE A LA RESERVATION comme la TVA et le lieu : couverts x montant par personne au moment ou le client a reserve. Le reglage du restaurateur peut changer ensuite, la table deja prise ne bouge pas.';
COMMENT ON COLUMN public.rdv_reservations.annulation_tardive IS
  'Le client a annule APRES le delai. Le rendez-vous reste annule_client : ce drapeau dit seulement que le creneau n a pas pu etre reproposse a temps, et que l empreinte est debitable.';

-- Les seuls états qui existent. Un état inventé par une écriture forgée
-- laisserait un écran indécis devant une réservation qu'il ne sait pas nommer.
ALTER TABLE public.rdv_reservations DROP CONSTRAINT IF EXISTS rdv_empreinte_statut_check;
ALTER TABLE public.rdv_reservations
  ADD CONSTRAINT rdv_empreinte_statut_check
  CHECK (empreinte_statut IS NULL
         OR empreinte_statut IN ('posee', 'debitee', 'echouee', 'liberee'));

-- ⚠️ UN MONTANT GARANTI EST STRICTEMENT POSITIF. Zéro voudrait dire « garantie
-- prise » et « rien à débiter » en même temps, et c'est le genre de valeur qui
-- traverse tous les contrôles sans jamais déclencher personne.
ALTER TABLE public.rdv_reservations DROP CONSTRAINT IF EXISTS rdv_empreinte_montant_check;
ALTER TABLE public.rdv_reservations
  ADD CONSTRAINT rdv_empreinte_montant_check
  CHECK (empreinte_montant IS NULL OR empreinte_montant > 0);

-- ⚠️ UNE EMPREINTE POSÉE A FORCÉMENT UN MONTANT ET UNE CARTE. Sans cette
-- règle, une réservation pouvait se dire garantie sans que rien ne le soit, et
-- le restaurateur l'aurait appris le soir du no-show.
ALTER TABLE public.rdv_reservations DROP CONSTRAINT IF EXISTS rdv_empreinte_complete_check;
ALTER TABLE public.rdv_reservations
  ADD CONSTRAINT rdv_empreinte_complete_check
  CHECK (empreinte_statut IS NULL
         OR empreinte_statut = 'liberee'
         OR (empreinte_montant IS NOT NULL
             AND empreinte_payment_method_id IS NOT NULL
             AND empreinte_customer_id IS NOT NULL));

GRANT SELECT (empreinte_statut, empreinte_montant, empreinte_debit_montant,
              empreinte_debit_at, empreinte_debit_erreur, annulation_tardive)
  ON public.rdv_reservations TO authenticated;

-- 3) La vue publique, reconduite sur SA PROPRE définition.
DO $$
DECLARE
  cols     text;
  filtre   text;
  sensible text;
BEGIN
  SELECT colonnes INTO cols FROM pg_temp.vue_avant LIMIT 1;
  IF cols IS NULL THEN
    RAISE EXCEPTION 'VUE_ABSENTE : commercants_public est introuvable, rien n a ete change.';
  END IF;

  filtre := regexp_replace(lower(coalesce(substring(pg_get_viewdef('public.commercants_public'::regclass, true) from 'WHERE(.*)$'), '')),
                           '[[:space:]();]|commercants\.|::text', '', 'g');
  IF filtre IS DISTINCT FROM 'statut_publication=''publie''' THEN
    RAISE EXCEPTION 'VUE_DERIVEE : le filtre des fiches publiees a change, rien n a ete change. Filtre vivant : %', filtre;
  END IF;

  -- Une colonne manifestement personnelle ou secrète dans une vue lue par
  -- `anon` n'est pas quelque chose qu'on reconduit sans le savoir.
  SELECT string_agg(column_name::text, ', ') INTO sensible
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'commercants_public'
     AND (column_name ILIKE '%email%' OR column_name ILIKE '%password%'
          OR column_name ILIKE '%mot_de_passe%' OR column_name ILIKE '%secret%'
          OR column_name ILIKE '%token%' OR column_name ILIKE '%iban%'
          OR column_name = 'stripe_account_id');
  IF sensible IS NOT NULL THEN
    RAISE EXCEPTION 'VUE_SENSIBLE : commercants_public expose %, rien n a ete change. A traiter avant de la reconduire.', sensible;
  END IF;

  -- Rejouée, la vue porte déjà les trois : on ne les ajoute pas deux fois.
  cols := (SELECT string_agg(quote_ident(column_name::text), ', ' ORDER BY ordinal_position)
             FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'commercants_public'
              AND column_name NOT IN ('rdv_empreinte_actif', 'rdv_empreinte_seuil_couverts', 'rdv_empreinte_par_personne'));

  -- ⚠️ Les nouvelles À LA FIN : `CREATE OR REPLACE VIEW` n'autorise que ça.
  EXECUTE format(
    'CREATE OR REPLACE VIEW public.commercants_public AS SELECT %s, rdv_empreinte_actif, rdv_empreinte_seuil_couverts, rdv_empreinte_par_personne FROM commercants WHERE statut_publication = ''publie''::text',
    cols);
END
$$;

DO $$
DECLARE
  opts text[];
BEGIN
  SELECT options INTO opts FROM pg_temp.vue_avant LIMIT 1;
  IF opts IS NOT NULL AND array_length(opts, 1) > 0 THEN
    EXECUTE format('ALTER VIEW public.commercants_public SET (%s)', array_to_string(opts, ', '));
  END IF;
END
$$;

-- ⚠️ UNE VUE NAÎT MODIFIABLE, et sans `security_invoker` l'écriture contourne la
-- RLS (la faille du 27/08). Lecture seule, par les droits.
REVOKE INSERT, UPDATE, DELETE ON public.commercants_public FROM anon, authenticated;
GRANT SELECT ON public.commercants_public TO anon, authenticated;

COMMIT;

-- 4) Les essais, sur des tables TEMPORAIRES qui portent les garde-fous VIVANTS,
-- recopiés depuis la base : aucun vrai commerce, aucune vraie réservation n'est
-- lue ni touchée.
DROP TABLE IF EXISTS pg_temp.essai_reglage;
DROP TABLE IF EXISTS pg_temp.essai_resa;
DROP TABLE IF EXISTS pg_temp.essai_resultats;
CREATE TEMP TABLE essai_reglage (rdv_empreinte_seuil_couverts integer, rdv_empreinte_par_personne numeric(6,2));
CREATE TEMP TABLE essai_resa (empreinte_statut text, empreinte_montant numeric(8,2),
                              empreinte_payment_method_id text, empreinte_customer_id text);
CREATE TEMP TABLE essai_resultats (ordre int, cas text, obtenu text, attendu text);

DO $$
DECLARE
  g text;
BEGIN
  FOR g IN SELECT pg_get_constraintdef(oid) FROM pg_constraint
            WHERE conrelid = 'public.commercants'::regclass
              AND conname IN ('commercants_rdv_empreinte_seuil_check', 'commercants_rdv_empreinte_montant_check')
  LOOP
    EXECUTE 'ALTER TABLE pg_temp.essai_reglage ADD CONSTRAINT c' || md5(g) || ' ' || g;
  END LOOP;
  FOR g IN SELECT pg_get_constraintdef(oid) FROM pg_constraint
            WHERE conrelid = 'public.rdv_reservations'::regclass
              AND conname IN ('rdv_empreinte_statut_check', 'rdv_empreinte_montant_check', 'rdv_empreinte_complete_check')
  LOOP
    EXECUTE 'ALTER TABLE pg_temp.essai_resa ADD CONSTRAINT c' || md5(g) || ' ' || g;
  END LOOP;
END
$$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      (1,  'seuil 6 et 20 euros (les valeurs proposees)',  6::int,   20.00::numeric, 'accepte'),
      (2,  'seuil 1 et 1 euro (les bornes basses)',        1,        1.00,           'accepte'),
      (3,  'seuil 200 et 200 euros (les bornes hautes)',   200,      200.00,         'accepte'),
      (4,  'un seuil de zero personne',                    0,        20.00,          'refuse'),
      (5,  'un seuil negatif',                             -2,       20.00,          'refuse'),
      (6,  'un seuil de 201 personnes',                    201,      20.00,          'refuse'),
      (7,  'un montant de zero euro',                      6,        0.00,           'refuse'),
      (8,  'un montant negatif',                           6,        -5.00,          'refuse'),
      (9,  'un montant de 201 euros',                      6,        201.00,         'refuse')
    ) AS t(ordre, cas, seuil, montant, attendu)
  LOOP
    BEGIN
      INSERT INTO essai_reglage VALUES (r.seuil, r.montant);
      INSERT INTO essai_resultats VALUES (r.ordre, r.cas, 'accepte', r.attendu);
    EXCEPTION WHEN check_violation THEN
      INSERT INTO essai_resultats VALUES (r.ordre, r.cas, 'refuse', r.attendu);
    WHEN others THEN
      INSERT INTO essai_resultats VALUES (r.ordre, r.cas, 'autre erreur : ' || SQLERRM, r.attendu);
    END;
  END LOOP;

  FOR r IN
    SELECT * FROM (VALUES
      (20, 'pas d empreinte du tout (petite table)',          NULL::text, NULL::numeric, NULL::text, NULL::text, 'accepte'),
      (21, 'une empreinte posee, complete',                   'posee',    120.00,        'pm_x',     'cus_x',    'accepte'),
      (22, 'une empreinte liberee, sans carte',               'liberee',  NULL,          NULL,       NULL,       'accepte'),
      (23, 'posee SANS montant',                              'posee',    NULL,          'pm_x',     'cus_x',    'refuse'),
      (24, 'posee SANS carte',                                'posee',    120.00,        NULL,       'cus_x',    'refuse'),
      (25, 'posee SANS client Stripe',                        'posee',    120.00,        'pm_x',     NULL,       'refuse'),
      (26, 'un montant garanti de zero euro',                 'posee',    0.00,          'pm_x',     'cus_x',    'refuse'),
      (27, 'un montant garanti negatif',                      'posee',    -10.00,        'pm_x',     'cus_x',    'refuse'),
      (28, 'un statut invente (en_attente)',                  'en_attente', 120.00,      'pm_x',     'cus_x',    'refuse'),
      (29, 'un debit enregistre, complet',                    'debitee',  120.00,        'pm_x',     'cus_x',    'accepte'),
      (30, 'un debit refuse par la banque',                   'echouee',  120.00,        'pm_x',     'cus_x',    'accepte')
    ) AS t(ordre, cas, statut, montant, pm, cus, attendu)
  LOOP
    BEGIN
      INSERT INTO essai_resa VALUES (r.statut, r.montant, r.pm, r.cus);
      INSERT INTO essai_resultats VALUES (r.ordre, r.cas, 'accepte', r.attendu);
    EXCEPTION WHEN check_violation THEN
      INSERT INTO essai_resultats VALUES (r.ordre, r.cas, 'refuse', r.attendu);
    WHEN others THEN
      INSERT INTO essai_resultats VALUES (r.ordre, r.cas, 'autre erreur : ' || SQLERRM, r.attendu);
    END;
  END LOOP;
END
$$;

-- 5) Contrôle : une ligne par vérification, sa valeur et l'attendu.
SELECT 'A01' AS ordre, 'commercants : les trois reglages' AS controle,
       (SELECT count(*)::text FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'commercants'
           AND column_name IN ('rdv_empreinte_actif', 'rdv_empreinte_seuil_couverts', 'rdv_empreinte_par_personne')) AS valeur,
       '3' AS attendu
UNION ALL
SELECT 'A02', 'l empreinte est ETEINTE par defaut',
       COALESCE((SELECT column_default::text FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'commercants'
                    AND column_name = 'rdv_empreinte_actif'), 'aucun'),
       'false'
UNION ALL
SELECT 'A03', 'aucun commerce n a allume l empreinte (au premier passage)',
       (SELECT count(*)::text FROM public.commercants WHERE rdv_empreinte_actif),
       '0'
UNION ALL
SELECT 'A04', 'les deux nombres sont NOT NULL (le piege du zero)',
       (SELECT count(*)::text FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'commercants'
           AND column_name IN ('rdv_empreinte_seuil_couverts', 'rdv_empreinte_par_personne')
           AND is_nullable = 'NO'),
       '2'
UNION ALL
SELECT 'A05', 'valeurs proposees : seuil et montant',
       (SELECT COALESCE(string_agg(column_name || '=' || regexp_replace(column_default, '::[a-z ]+', '', 'g'),
                                   ' ' ORDER BY column_name), 'aucune')
          FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'commercants'
           AND column_name IN ('rdv_empreinte_seuil_couverts', 'rdv_empreinte_par_personne')),
       'rdv_empreinte_par_personne=20.00 rdv_empreinte_seuil_couverts=6'
UNION ALL
SELECT 'A06', 'garde-fous des bornes poses',
       (SELECT count(*)::text FROM pg_constraint
         WHERE conrelid = 'public.commercants'::regclass
           AND conname IN ('commercants_rdv_empreinte_seuil_check', 'commercants_rdv_empreinte_montant_check')),
       '2'
UNION ALL
SELECT 'A07', 'anon et authenticated lisent les trois reglages',
       (SELECT count(*)::text FROM information_schema.column_privileges
         WHERE table_schema = 'public' AND table_name = 'commercants'
           AND column_name IN ('rdv_empreinte_actif', 'rdv_empreinte_seuil_couverts', 'rdv_empreinte_par_personne')
           AND privilege_type = 'SELECT' AND grantee IN ('anon', 'authenticated')),
       '6'
UNION ALL
SELECT 'A08', 'le restaurateur peut les regler',
       (SELECT count(*)::text FROM information_schema.column_privileges
         WHERE table_schema = 'public' AND table_name = 'commercants'
           AND column_name IN ('rdv_empreinte_actif', 'rdv_empreinte_seuil_couverts', 'rdv_empreinte_par_personne')
           AND privilege_type = 'UPDATE' AND grantee = 'authenticated'),
       '3'
UNION ALL
SELECT 'A09', 'rdv_reservations : les dix colonnes',
       (SELECT count(*)::text FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'rdv_reservations'
           AND (column_name LIKE 'empreinte%' OR column_name = 'annulation_tardive')),
       '10'
UNION ALL
SELECT 'A10', 'annulation_tardive : NOT NULL, faux par defaut',
       COALESCE((SELECT is_nullable || ' / ' || COALESCE(column_default, 'aucun')
                   FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'rdv_reservations'
                    AND column_name = 'annulation_tardive'), 'ABSENTE'),
       'NO / false'
UNION ALL
SELECT 'A11', 'AUCUN nouveau statut de rendez-vous',
       COALESCE((SELECT pg_get_constraintdef(oid) FROM pg_constraint
                  WHERE conrelid = 'public.rdv_reservations'::regclass
                    AND pg_get_constraintdef(oid) ILIKE '%statut%'
                    AND pg_get_constraintdef(oid) ILIKE '%confirme%' LIMIT 1),
                'aucune contrainte de statut en base'),
       'la liste d avant, sans annule_tardif'
UNION ALL
SELECT 'A12', 'garde-fous de l empreinte poses',
       (SELECT count(*)::text FROM pg_constraint
         WHERE conrelid = 'public.rdv_reservations'::regclass
           AND conname IN ('rdv_empreinte_statut_check', 'rdv_empreinte_montant_check', 'rdv_empreinte_complete_check')),
       '3'
UNION ALL
SELECT 'A13', 'aucune reservation n a d empreinte (au premier passage)',
       (SELECT count(*)::text FROM public.rdv_reservations WHERE empreinte_statut IS NOT NULL),
       '0'
UNION ALL
SELECT 'A14', 'vue : les trois reglages y sont, en dernier',
       (SELECT COALESCE(string_agg(column_name::text, ',' ORDER BY ordinal_position), 'ABSENTS')
          FROM (SELECT column_name, ordinal_position FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'commercants_public'
                 ORDER BY ordinal_position DESC LIMIT 3) d),
       'rdv_empreinte_actif,rdv_empreinte_seuil_couverts,rdv_empreinte_par_personne'
UNION ALL
SELECT 'A15', 'vue : nombre de colonnes',
       (SELECT count(*)::text FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'commercants_public'),
       'trois de plus qu avant (voir Z1)'
UNION ALL
SELECT 'A16', 'vue : aucune colonne d avant n a disparu',
       (SELECT CASE WHEN count(*) = 0 THEN 'aucune perdue'
                    ELSE 'PERDUES : ' || string_agg(c, ', ') END
          FROM (SELECT trim(both '"' from trim(c)) AS c
                  FROM pg_temp.vue_avant, unnest(string_to_array(colonnes, ',')) AS c) av
         WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
                            WHERE table_schema = 'public' AND table_name = 'commercants_public'
                              AND column_name = av.c)),
       'aucune perdue'
UNION ALL
SELECT 'A17', 'vue : ne montre que les fiches publiees',
       CASE WHEN pg_get_viewdef('public.commercants_public'::regclass, true) LIKE '%statut_publication = ''publie''%'
            THEN 'oui' ELSE 'NON' END,
       'oui'
UNION ALL
SELECT 'A18', 'vue : options inchangees',
       (SELECT CASE WHEN c.reloptions IS NOT DISTINCT FROM (SELECT options FROM pg_temp.vue_avant LIMIT 1)
                    THEN 'oui (' || COALESCE(array_to_string(c.reloptions, ','), 'aucune') || ')'
                    ELSE 'NON : avant ' || COALESCE((SELECT array_to_string(options, ',') FROM pg_temp.vue_avant LIMIT 1), 'aucune')
                         || ', apres ' || COALESCE(array_to_string(c.reloptions, ','), 'aucune') END
          FROM pg_class c WHERE c.oid = 'public.commercants_public'::regclass),
       'oui (aucune)'
UNION ALL
SELECT 'A19', 'vue : ce que anon peut y faire',
       (SELECT COALESCE(string_agg(DISTINCT privilege_type::text, '+' ORDER BY privilege_type::text), 'RIEN')
          FROM information_schema.role_table_grants
         WHERE table_schema = 'public' AND table_name = 'commercants_public' AND grantee = 'anon'),
       'SELECT'
UNION ALL
SELECT 'A20', 'vue : les commerces publies restent visibles',
       (SELECT count(*)::text FROM public.commercants_public),
       'le nombre habituel, jamais 0'
UNION ALL
SELECT 'A21', 'QUI peut ECRIRE les identifiants Stripe de l empreinte',
       (SELECT COALESCE(string_agg(DISTINCT grantee::text, '+' ORDER BY grantee::text), 'personne')
          FROM information_schema.role_table_grants
         WHERE table_schema = 'public' AND table_name = 'rdv_reservations'
           AND privilege_type = 'UPDATE' AND grantee IN ('anon', 'authenticated')),
       'a lire : le serveur decide, la base n est pas l autorite (voir note)'
UNION ALL
SELECT 'Z1', 'AVANT : colonnes de la vue', colonnes, 'pour memoire' FROM pg_temp.vue_avant
UNION ALL
SELECT 'Z2', 'APRES : colonnes de la vue',
       (SELECT string_agg(column_name::text, ',' ORDER BY ordinal_position)
          FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'commercants_public'),
       'pour memoire'
UNION ALL
SELECT 'B' || lpad(ordre::text, 3, '0'), 'essai : ' || cas, obtenu, attendu FROM essai_resultats
ORDER BY 1, 2;
