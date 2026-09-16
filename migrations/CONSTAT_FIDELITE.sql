-- CONSTAT APRES LA REMISE A ZERO (16/09)
--
-- 🔴 POURQUOI CE FICHIER EXISTE : le script precedent utilisait
-- `CREATE TEMP TABLE`, qui NE SURVIT PAS entre deux instructions dans
-- l editeur Supabase (pooler en mode transaction). Le bloc de suppression a
-- probablement tourne, et seul le controle final a echoue : il faut donc
-- CONSTATER avant de refaire quoi que ce soit.
--
-- ⚠️ LECTURE SEULE. Aucune ecriture, aucune suppression, aucune donnee
-- personnelle en sortie : uniquement des comptes.

SELECT 'A. cartes de fidelite restantes'::text AS controle,
       (SELECT count(*)::text FROM fidelite_cartes) AS valeur,
       '0 si la remise a zero est passee'::text AS attendu
UNION ALL
SELECT 'B. recompenses restantes'::text,
       (SELECT count(*)::text FROM fidelite_recompenses),
       '0 si la remise a zero est passee'::text
UNION ALL
SELECT 'C. mouvements restants'::text,
       (SELECT count(*)::text FROM fidelite_mouvements),
       '0 si la remise a zero est passee'::text
UNION ALL
SELECT 'D. commandes encore liees a une recompense'::text,
       (SELECT count(*)::text FROM commandes WHERE fidelite_recompense_id IS NOT NULL),
       '0 : une reference qui pointe dans le vide est pire que rien'::text
UNION ALL
-- ⚠️ LE CONTROLE QUI COMPTE VRAIMENT : aucune vente ne devait etre touchee.
SELECT 'E. commandes en base (AUCUNE ne devait disparaitre)'::text,
       (SELECT count(*)::text FROM commandes),
       'le meme nombre qu avant : on efface la fidelite, jamais des ventes'::text
UNION ALL
SELECT 'F. remises de fidelite deja accordees, CONSERVEES'::text,
       (SELECT count(*)::text FROM commandes WHERE coalesce(fidelite_remise, 0) > 0),
       'inchange : ce montant a ete remise pour de vrai ce jour-la'::text
UNION ALL
SELECT 'G. commercants avec la fidelite allumee'::text,
       (SELECT count(*)::text FROM commercants WHERE fidelite_actif IS TRUE),
       'leurs reglages ne sont PAS touches, seules les cartes le sont'::text;
