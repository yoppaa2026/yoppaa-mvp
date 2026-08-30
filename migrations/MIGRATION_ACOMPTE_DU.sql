-- MIGRATION_ACOMPTE_DU.sql — 30/08/2026 au soir
--
-- 🔴 SUR UN NO-SHOW, LE COMMERÇANT GARDE LE BON CADEAU EN ENTIER.
--
-- Décision d'Alex du 30/08 : « la garantie ne porte que sur l'acompte, le reste
-- doit être restitué. » Un client qui pose 40 € de bon sur une prestation à
-- 60 € avec 50 % d'acompte perd aujourd'hui les 40 € s'il ne vient pas, alors
-- que la garantie du commerçant ne valait que 25 €. Quinze euros de trop.
--
-- ⚠️ ET CE QUI MANQUE POUR CALCULER, C'EST L'ACOMPTE *DÛ*. La base ne stocke
-- que ce qui a été ENCAISSÉ (`acompte_montant`), c'est-à-dire déjà net du bon :
-- depuis la règle du 30/08 au soir, le bon se retranche de l'acompte dû euro
-- pour euro, et l'encaissé peut donc valoir zéro. Impossible alors de savoir
-- quelle part du bon tenait lieu de garantie.
--
-- ⚠️ ET ON NE LE RECALCULE PAS PLUS TARD. Il faudrait relire
-- `rdv_prestations.acompte_pourcent`, qui appartient au commerçant et qu'il
-- peut changer n'importe quand. Un rendez-vous déjà pris ne doit pas bouger
-- parce qu'un réglage a bougé : c'est exactement la raison pour laquelle la TVA
-- et le lieu sont figés à la réservation depuis le 12/08.
--
-- ⚠️ AUCUNE DONNÉE EXISTANTE N'EST TOUCHÉE, et rien n'est rempli
-- rétroactivement. `NULL` veut dire « on ne sait pas ce qui était dû », et ce
-- n'est PAS zéro : le code le lit comme tel et ne garde alors que l'argent
-- réellement encaissé, le bon revenant en entier. Le repli penche du côté du
-- client, jamais du côté qui prend.
--
-- ⚠️ PAS DE `GRANT` ICI, ET C'EST VÉRIFIÉ, PAS SUPPOSÉ : PostgreSQL n'attache
-- de privilèges à une colonne que si quelqu'un en a posé un explicitement. Les
-- droits de `rdv_reservations` sont au niveau de la TABLE, donc ils couvrent
-- d'office toute colonne ajoutée. Le contrôle 4 ci-dessous le prouve au lieu de
-- le promettre.

BEGIN;

-- L'acompte tel qu'il était DÛ au moment de la réservation, avant que le bon
-- cadeau ne s'en déduise. C'est la garantie du commerçant, et elle ne bouge
-- plus.
ALTER TABLE rdv_reservations
  ADD COLUMN IF NOT EXISTS acompte_du numeric(8,2);

COMMENT ON COLUMN rdv_reservations.acompte_du IS
  'Acompte DÛ à la réservation, avant déduction du bon cadeau. Figé comme la TVA et le lieu : le pourcentage de la prestation peut changer, ce rendez-vous non. Sert à borner ce que le commerçant garde sur un no-show. NULL = inconnu (rendez-vous antérieur au 30/08/2026), et ce n''est pas zéro.';

COMMIT;


-- ─────────────────────────────────────────────────────────────────────────
-- CONTRÔLE — une ligne par vérification, la valeur ET l'attendu, tout en text
-- ─────────────────────────────────────────────────────────────────────────
SELECT '1 · la colonne existe' AS controle,
       coalesce((SELECT data_type FROM information_schema.columns
                 WHERE table_name='rdv_reservations' AND column_name='acompte_du'), 'ABSENTE')::text AS valeur,
       'numeric'::text AS attendu
UNION ALL
SELECT '2 · elle accepte NULL (inconnu n''est pas zéro)',
       coalesce((SELECT is_nullable FROM information_schema.columns
                 WHERE table_name='rdv_reservations' AND column_name='acompte_du'), 'ABSENTE')::text,
       'YES'::text
UNION ALL
SELECT '3 · aucune valeur par défaut, donc aucun zéro inventé',
       coalesce((SELECT column_default FROM information_schema.columns
                 WHERE table_name='rdv_reservations' AND column_name='acompte_du'), 'aucune')::text,
       'aucune'::text
UNION ALL
-- 🔴 CE CONTRÔLE ATTENDAIT « 0 » ET A RENDU « 14 », ET C'EST MOI QUI AVAIS
-- TORT. `information_schema.column_privileges` ne liste pas les privilèges
-- POSÉS sur une colonne : il liste les privilèges qui s'y APPLIQUENT, ceux de
-- la table compris. Quatorze lignes, c'est donc la normale.
--
-- ⚠️ J'AVAIS ÉCRIT UN ATTENDU QUE JE N'AVAIS PAS VÉRIFIÉ, dans une requête dont
-- le rôle est justement de ne rien supposer. Un attendu inventé transforme un
-- contrôle en générateur de fausses alertes.
--
-- La bonne question n'est pas « combien », c'est « autant qu'ailleurs » : on
-- compare avec une colonne voisine de la même table.
SELECT '4 · droits identiques à une colonne voisine',
       ((SELECT count(*) FROM information_schema.column_privileges
         WHERE table_name='rdv_reservations' AND column_name='acompte_du')::text
        || ' vs ' ||
        (SELECT count(*) FROM information_schema.column_privileges
         WHERE table_name='rdv_reservations' AND column_name='acompte_montant')::text)::text,
       'les deux nombres égaux'::text
UNION ALL
SELECT '5 · les droits de la table couvrent authenticated',
       (SELECT string_agg(DISTINCT privilege_type, ',' ORDER BY privilege_type)
        FROM information_schema.role_table_grants
        WHERE table_name='rdv_reservations' AND grantee='authenticated')::text,
       'au moins SELECT, INSERT, UPDATE'::text
UNION ALL
SELECT '6 · rendez-vous existants laissés inconnus',
       (SELECT count(*) FROM rdv_reservations WHERE acompte_du IS NOT NULL)::text,
       '0 juste après la migration'::text
ORDER BY 1;
