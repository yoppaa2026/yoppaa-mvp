-- RELEVÉ COMPLET DE LA CONFIGURATION — STUDIO AMANDINE (18/09)
--
-- 🔴 POURQUOI CELUI-CI PLUTÔT QU'UN DE PLUS. Alex a demandé de contrôler
-- L'ENSEMBLE avant la soumission, et il a raison : j'ai corrigé deux fois de
-- suite en devinant une partie des données, et deux fois de suite ça a produit
-- un défaut ailleurs. Ce relevé sort TOUT ce dont le moteur de créneaux se
-- sert, pour que chaque combinaison prestation × praticienne × jour puisse
-- être rejouée au banc, sans supposer une seule valeur.
--
-- ⚠️ CE QUE LE MOTEUR LIT, ET DONC CE QU'IL FAUT VOIR :
--   • les praticiennes vivantes         → qui peut travailler
--   • les prestations                   → durée, capacité, mode table
--   • rdv_prestation_praticiens         → qui fait quoi
--   • rdv_creneaux                      → les plages, AVEC leur praticien_id
--   • rdv_creneau_prestations           → ce que chaque plage accepte
--   • commercants.horaires_detail       → l'ouverture réelle, qui clippe tout
--   • rdv_fermetures                    → ce qui ferme par-dessus
--
-- ⚠️ AUCUNE DONNÉE DE CLIENT. Ni réservations, ni commandes, ni comptes.
-- Les prénoms des praticiennes apparaissent : ils sont indispensables à la
-- lecture. LECTURE SEULE, rien n'est écrit.

WITH c AS (
  SELECT id, nom, horaires_detail
  FROM commercants
  WHERE nom ILIKE '%amandine%'
  LIMIT 1
)
SELECT 'A. commerce'::text AS bloc,
       COALESCE((SELECT nom || ' / ' || id::text FROM c), 'INTROUVABLE')::text AS contenu

UNION ALL
SELECT 'B. horaires d ouverture (ils clippent TOUTES les plages)'::text,
       COALESCE((SELECT horaires_detail::text FROM c), 'AUCUN')::text

UNION ALL
SELECT 'C. praticiennes vivantes'::text,
       COALESCE((SELECT string_agg(p.prenom || ' [' || p.id::text || ']', ' | ' ORDER BY p.prenom)
                 FROM rdv_praticiens p
                 WHERE p.commercant_id = (SELECT id FROM c)
                   AND p.actif IS TRUE AND p.deleted_at IS NULL), 'AUCUNE')::text

UNION ALL
-- ⚠️ UNE PRATICIENNE ÉTEINTE FAIT DISPARAÎTRE SES PLAGES, partout et en
-- silence. C'est le défaut du 07/09, et il frappe tous les choix à la fois.
SELECT 'D. praticiennes eteintes ou supprimees'::text,
       COALESCE((SELECT string_agg(p.prenom || ' (actif=' || p.actif::text
                                   || ', supprime=' || (p.deleted_at IS NOT NULL)::text || ')', ' | ' ORDER BY p.prenom)
                 FROM rdv_praticiens p
                 WHERE p.commercant_id = (SELECT id FROM c)
                   AND (p.actif IS NOT TRUE OR p.deleted_at IS NOT NULL)), 'aucune')::text

UNION ALL
-- ⚠️ `capacite > 1` FAIT UN COURS, et un cours ne vit que sur une plage qui le
-- NOMME. `par_couverts` fait une table, qui suit d'autres règles encore.
SELECT 'E. prestations actives'::text,
       COALESCE((SELECT string_agg(pr.nom || ' [' || pr.id::text || '] duree=' || COALESCE(pr.duree_minutes, 0)::text
                                   || 'min capacite=' || COALESCE(pr.capacite, 1)::text
                                   || ' table=' || COALESCE(pr.par_couverts, false)::text, E'\n   ' ORDER BY pr.ordre, pr.nom)
                 FROM rdv_prestations pr
                 WHERE pr.commercant_id = (SELECT id FROM c)
                   AND pr.actif IS TRUE AND pr.deleted_at IS NULL), 'AUCUNE')::text

UNION ALL
-- 🔴 QUI FAIT QUOI. Une prestation sans AUCUNE ligne ici est ouverte à TOUTES
-- les praticiennes ; avec UNE SEULE, l'écran auto-selectionne et n'affiche même
-- pas « sans préférence ».
SELECT 'F. qui fait quoi (rdv_prestation_praticiens)'::text,
       COALESCE((SELECT string_agg(pr.nom || ' -> ' || p.prenom, E'\n   ' ORDER BY pr.nom, p.prenom)
                 FROM rdv_prestation_praticiens j
                 JOIN rdv_prestations pr ON pr.id = j.prestation_id
                 JOIN rdv_praticiens p   ON p.id = j.praticien_id
                 WHERE pr.commercant_id = (SELECT id FROM c)), 'VIDE (toutes eligibles partout)')::text

UNION ALL
-- 🔴 LES PLAGES, AVEC LEUR PRATICIENNE. C'est `praticien_id` qui décide si une
-- plage dédiée réserve l'heure de sa seule praticienne ou celle de toute la
-- maison — et c'est la colonne qui manquait au select du serveur le 18/09.
SELECT 'G. plages actives'::text,
       COALESCE((SELECT string_agg(cr.jour_semaine::text || ' ' || cr.heure_debut::text || '-' || cr.heure_fin::text
                                   || ' [' || COALESCE(p.prenom, 'COMMUNE') || ']'
                                   || ' pas=' || COALESCE(cr.pas_minutes, 0)::text
                                   || COALESCE(' pause=' || cr.pause_debut::text || '-' || cr.pause_fin::text, '')
                                   || ' id=' || cr.id::text, E'\n   '
                                   ORDER BY cr.jour_semaine, cr.heure_debut, p.prenom)
                 FROM rdv_creneaux cr
                 LEFT JOIN rdv_praticiens p ON p.id = cr.praticien_id
                 WHERE cr.commercant_id = (SELECT id FROM c)
                   AND cr.actif IS TRUE AND cr.deleted_at IS NULL), 'AUCUNE')::text

UNION ALL
-- 🔴 CE QUE CHAQUE PLAGE ACCEPTE. Une plage SANS ligne ici accepte tout le
-- catalogue ordinaire, mais JAMAIS un cours. Une plage qui nomme RÉSERVE son
-- heure contre le reste.
SELECT 'H. ce que chaque plage accepte (rdv_creneau_prestations)'::text,
       COALESCE((SELECT string_agg(cr.jour_semaine::text || ' ' || cr.heure_debut::text
                                   || ' [' || COALESCE(p.prenom, 'COMMUNE') || '] -> ' || pr.nom, E'\n   '
                                   ORDER BY cr.jour_semaine, cr.heure_debut, pr.nom)
                 FROM rdv_creneau_prestations l
                 JOIN rdv_creneaux cr    ON cr.id = l.creneau_id
                 JOIN rdv_prestations pr ON pr.id = l.prestation_id
                 LEFT JOIN rdv_praticiens p ON p.id = cr.praticien_id
                 WHERE cr.commercant_id = (SELECT id FROM c)
                   AND cr.actif IS TRUE AND cr.deleted_at IS NULL), 'AUCUNE LIAISON')::text

UNION ALL
-- ⚠️ UNE PLAGE SANS AUCUNE LIAISON ACCEPTE TOUT SAUF LES COURS. Mélanger les
-- deux régimes chez un même commerce est le cas qui trompe : la grille change
-- de logique d'un jour à l'autre sans que rien ne l'explique.
SELECT 'I. plages SANS aucune liaison'::text,
       COALESCE((SELECT string_agg(cr.jour_semaine::text || ' ' || cr.heure_debut::text
                                   || ' [' || COALESCE(p.prenom, 'COMMUNE') || ']', ' | '
                                   ORDER BY cr.jour_semaine, cr.heure_debut)
                 FROM rdv_creneaux cr
                 LEFT JOIN rdv_praticiens p ON p.id = cr.praticien_id
                 WHERE cr.commercant_id = (SELECT id FROM c)
                   AND cr.actif IS TRUE AND cr.deleted_at IS NULL
                   AND NOT EXISTS (SELECT 1 FROM rdv_creneau_prestations l WHERE l.creneau_id = cr.id)),
                'aucune : toutes les plages sont restreintes')::text

UNION ALL
-- 🔴 UN COURS QU'AUCUNE PLAGE NE NOMME N'EST RÉSERVABLE NULLE PART, et la fiche
-- ne le liste même pas. S'il en sort un ici, c'est un cours invisible.
SELECT 'J. COURS sans aucune plage (invisibles sur la fiche)'::text,
       COALESCE((SELECT string_agg(pr.nom, ' | ' ORDER BY pr.nom)
                 FROM rdv_prestations pr
                 WHERE pr.commercant_id = (SELECT id FROM c)
                   AND pr.actif IS TRUE AND pr.deleted_at IS NULL
                   AND COALESCE(pr.capacite, 1) > 1
                   AND COALESCE(pr.par_couverts, false) IS FALSE
                   AND NOT EXISTS (SELECT 1 FROM rdv_creneau_prestations l WHERE l.prestation_id = pr.id)),
                'aucun, tant mieux')::text

UNION ALL
-- ⚠️ UNE FERMETURE GLOBALE BLOQUE TOUT LE MONDE, « sans préférence » compris ;
-- celle d'une praticienne ne bloque que son propre choix.
SELECT 'K. fermetures en cours ou a venir'::text,
       COALESCE((SELECT string_agg(f.date_debut::text || ' -> ' || f.date_fin::text
                                   || ' [' || COALESCE(p.prenom, 'GLOBALE') || ']', ' | ' ORDER BY f.date_debut)
                 FROM rdv_fermetures f
                 LEFT JOIN rdv_praticiens p ON p.id = f.praticien_id
                 WHERE f.commercant_id = (SELECT id FROM c)
                   AND f.date_fin >= CURRENT_DATE), 'aucune')::text

ORDER BY 1;
