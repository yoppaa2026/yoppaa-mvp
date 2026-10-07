// HARNAIS DE MUTATION — LE DÉLAI DE COMMANDE (04/09).
//
// 🔴 CE QU'ON MESURE : qu'un Yopper ne se voie jamais promettre un retrait que
// le commerçant ne peut pas tenir, et qu'un article lent ne bloque jamais tout
// le catalogue.
//
// Les deux erreurs coûtent, et elles sont symétriques. Trop permissif, la tarte
// de 48 h part pour ce midi et le boulanger découvre une commande impossible.
// Trop strict, le sandwich hérite des 48 h de la tarte et plus personne ne
// commande à 11 h. Aucune des deux ne lève d'erreur.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES. Le dépôt est stocké en LF, mais le
// disque peut porter du CRLF là où git n a pas encore normalisé : une ancre à
// cheval sur deux lignes ne vaut alors que sur une machine. Vérifié par
// npm run verif:ancres.
//
//   node scripts/mutations-delai-commande.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:delai'
const MODULE = 'lib/delai-commande.js'
const FICHE = 'app/commander/[slug]/page.js'
const BORD = 'app/dashboard/ConfigDashboard.js'
const LIGNES = 'lib/lignes-commande.js'
const ROUTE = 'app/api/stripe/checkout/create-commande/route.js'

const MUTATIONS = [
  // ─── LE DÉLAI D'UNE LIGNE ───────────────────────────────────────────────
  //
  // 🔴 LE CAS QU'ALEX A CONSTRUIT EN AVOCAT DU DIABLE. La tarte qui reste à
  // 17 h est déjà faite ; lui réappliquer les 48 h de production rendrait
  // l'anti-gaspi inutilisable exactement là où il sert le plus.
  { nom: '🔴 l’invendu reprend le delai de production de son article',
    de: '  if (porteUneFenetre(ligne.offre)) return 0',
    vers: '  if (false) return 0' },

  // ⚠️ Une demi-fenêtre ne doit jamais servir de laissez-passer.
  { nom: '🔴 une demi-fenetre suffit a annuler un delai reel',
    de: '  if (porteUneFenetre(ligne.offre)) return 0',
    vers: '  if (ligne.offre) return 0' },

  { nom: '🔴 un delai NEGATIF fait remonter le retrait dans le passe',
    de: '  if (!Number.isFinite(brut) || brut <= 0) return 0',
    vers: '  if (!Number.isFinite(brut)) return 0' },

  // ─── LE PLUS CONTRAIGNANT GAGNE ─────────────────────────────────────────
  { nom: '🔴 le panier ne retient plus le delai le plus long',
    de: '    if (d > minutes) {',
    vers: '    if (d < minutes) {' },

  // ⚠️ « Cette commande demande 48 h » laisse le Yopper chercher lequel de ses
  // six articles bloque tout. Il ne cherchera pas, il partira.
  // ⚠️ ANCRE REFAITE LE 04/09 : le module lit maintenant `article_nom` en plus
  // de `nom`, parce que la ligne construite par le serveur n'a pas la même
  // forme que celle du panier. Le harnais l'a dit en « TEXTE INTROUVABLE ».
  // Septième fois qu'un point d'ancrage périme après un déplacement de code, et
  // septième fois que le harnais le rattrape au lieu de verdir en silence.
  { nom: '🔴 le coupable n’est plus nomme',
    de: '      nom = ligne?.nom || ligne?.article_nom || null',
    vers: '      nom = null' },

  // 🔴 ET LA FORME SERVEUR EN PARTICULIER. Ne lire que `nom` laisserait le
  // message du serveur dire « un article de ta commande », sans jamais nommer
  // la tarte : la ligne de commande, elle, s'appelle `article_nom`.
  { nom: '🔴 le serveur ne sait plus lire le nom de SA propre ligne',
    de: '      nom = ligne?.nom || ligne?.article_nom || null',
    vers: '      nom = ligne?.nom || null' },

  // ─── L'INVENDU NE SE REPORTE PAS ────────────────────────────────────────
  { nom: '🔴 le melange invendu + article lent n’est plus refuse',
    de: '  if (invendus.length === 0) return null',
    vers: '  if (true) return null' },

  { nom: '🔴 une fenetre DEJA FERMEE passe au paiement',
    de: '    if (reste === null) {',
    vers: '    if (false) {' },

  { nom: '🔴 un panier sans moment de retrait possible part quand meme',
    de: '    if (minutes > reste) {',
    vers: '    if (false) {' },

  // ─── QUAND LA PRÉPARATION EST FINIE ─────────────────────────────────────
  { nom: '🔴 un delai illisible fabrique une date invalide',
    de: '  return new Date(base.getTime() + (Number.isFinite(m) && m > 0 ? m : 0) * 60000)',
    vers: '  return new Date(base.getTime() + m * 60000)' },

  // ─── LE PREMIER CRÉNEAU POSSIBLE ────────────────────────────────────────
  { nom: '🔴 le delai n’ecarte plus les creneaux trop proches',
    de: '      if (debut.getTime() < pret.getTime()) continue',
    vers: '      if (false) continue' },

  // 🔴 LA CLÔTURE DU CRÉNEAU EST UNE BORNE INDÉPENDANTE, et c'est la fonction
  // du SERVEUR qui la lit. Deux calculs auraient divergé, et le Yopper se
  // serait fait refuser au paiement après avoir choisi son créneau.
  { nom: '🔴 la cloture du creneau n’est plus lue (l’ecran ment au serveur)',
    de: '      if (!creneauCommandable(cr, { dateStr: j.jour, maintenant, instantDebut }).ok) continue',
    vers: '      if (false) continue' },

  { nom: '🔴 les jours ne sont plus tries (« le premier » devient le hasard)',
    de: '    .sort((a, b) => String(a.jour).localeCompare(String(b.jour)))',
    vers: '    .filter(() => true)' },

  { nom: '🔴 les creneaux d’un jour ne sont plus tries',
    de: "      .sort((a, b) => String(a?.heure_debut || '').localeCompare(String(b?.heure_debut || '')))",
    vers: '      .filter(() => true)' },

  { nom: '🔴 le creneau plein ou ferme est propose quand meme',
    de: '      if (typeof utilisable === \'function\' && !utilisable(cr, j.jour)) continue',
    vers: '      if (false) continue' },

  // ─── LE PREMIER JOUR EN BOUTIQUE ────────────────────────────────────────
  //
  // 🔴 Une tarte prête à 19 h dans une boutique qui ferme à 18 h ne se retire
  // pas ce jour-là. Sans cette borne, l'écran promet un retrait le soir même.
  { nom: '🔴 la preparation qui finit apres la fermeture passe quand meme',
    de: '    if (limite === null || arrivee === null || arrivee <= limite) return jour',
    vers: '    return jour' },

  { nom: '🔴 un jour de fermeture n’est plus saute',
    de: '  if (ouvertLe({ horairesDetail, fermetures, dateStr: jour })) {',
    vers: '  if (true) {' },

  { nom: '🔴 la recherche du jour suivant repart du jour lui-meme',
    de: '  const lendemain = jourPlus(jour, 1)',
    vers: '  const lendemain = jourPlus(jour, 0)' },

  // ─── CE QUE L'ÉCRAN ÉCRIT ───────────────────────────────────────────────
  { nom: '🔴 une demi-heure s’ecrit « 0 h 30 »',
    de: '  if (m < 60) return `${Math.round(m)} min`',
    vers: '  if (m < 30) return `${Math.round(m)} min`' },

  // ⚠️ 48 H SE DIT « 2 JOURS ». C'est le mot du boulanger, pas celui de la base.
  { nom: '🔴 48 h ne se disent plus « 2 jours »',
    de: '  if (m % 1440 === 0) {',
    vers: '  if (false) {' },

  { nom: '🔴 le pluriel des jours disparait',
    de: '    return `${j} jour${j > 1 ? \'s\' : \'\'}`',
    vers: '    return `${j} jour`' },

  // ⚠️ « Commande 0 min à l'avance » sur chaque baguette transformerait
  // l'information en décor, et plus personne ne la verrait où elle compte.
  { nom: '🔴 la mention s’affiche meme sans delai',
    de: '  return duree ? `Commande ${duree} à l\'avance` : null',
    vers: '  return `Commande ${duree} à l\'avance`' },

  { nom: '🔴 « aujourd’hui » se met a nommer le jour de la semaine',
    de: '  if (aujourdhui && jour === aujourdhui) return h ? `à ${h}` : \'\'',
    vers: '  if (false) return h ? `à ${h}` : \'\'' },

  { nom: '🔴 « demain » disparait au profit du nom du jour',
    de: '  if (aujourdhui && jour === jourPlus(aujourdhui, 1)) return `demain${suffixe}`',
    vers: '  if (false) return `demain${suffixe}`' },

  { nom: '🔴 l’avertissement s’affiche sur une commande sans delai',
    de: '  if (!duree) return null',
    vers: '  if (false) return null' },

  { nom: '🔴 on n’avoue plus qu’aucun creneau ne convient',
    de: '  if (!moment) return `${quoi}, et aucun créneau ne le permet dans les jours proposés.`',
    vers: '  if (false) return `${quoi}, et aucun créneau ne le permet dans les jours proposés.`' },

  // ─── CE QUE LE COMMERÇANT CHOISIT ───────────────────────────────────────
  //
  // 🔴 Un article réglé à 36 h, ouvert dans le formulaire, verrait la liste
  // retomber sur le premier choix : le commerçant enregistrerait son prix et
  // perdrait son délai sans qu'aucun écran ne le lui dise.
  { nom: '🔴 un delai hors liste disparait en silence a l’ouverture du formulaire',
    de: '  if (Number.isFinite(m) && m > 0 && !liste.includes(m)) liste.push(m)',
    vers: '  if (false) liste.push(m)' },

  // 🔴 ARBITRAGE D'ALEX, 04/09 : les courtes durees sont le travail de la
  // CLOTURE DU CRENEAU, en production depuis le 09/08. Les remettre sur
  // l article recreerait deux reglages voisins dont un seul agit.
  { nom: '🔴 les courtes durees reviennent concurrencer la cloture du creneau',
    // ⚠️ Ancre reorientee le 07/10 : J+5, J+7, J+14 s ajoutent.
    de: 'export const DELAIS_PROPOSES = [0, 1440, 2880, 4320, 7200, 10080, 20160]',
    vers: 'export const DELAIS_PROPOSES = [0, 30, 60, 120, 240, 1440, 2880, 4320, 7200, 10080, 20160]' },
  { nom: '🔴 la liste depasse la borne de la base (J+30 refuse a l enregistrement)',
    de: 'export const DELAIS_PROPOSES = [0, 1440, 2880, 4320, 7200, 10080, 20160]',
    vers: 'export const DELAIS_PROPOSES = [0, 1440, 2880, 4320, 7200, 10080, 43200]' },

  { nom: '🔴 la liste des delais n’est plus triee',
    de: '  return liste.sort((a, b) => a - b)',
    vers: '  return liste' },

  { nom: '🔴 « aucun delai » s’affiche comme un delai',
    de: "  return duree ? `Commande ${duree} à l'avance` : 'Aucun délai, disponible tout de suite'",
    vers: "  return `Commande ${duree} à l'avance`" },

  { nom: '🔴 l’avertissement cesse de nommer l’article',
    de: '  const quoi = nom ? `${nom} demande ${duree} de préparation` : `Cette commande demande ${duree} de préparation`',
    vers: '  const quoi = `Cette commande demande ${duree} de préparation`' },

  // ═══════════════════════════════════════════════════════════════════════
  // LE CÂBLAGE DES ÉCRANS
  // ═══════════════════════════════════════════════════════════════════════
  //
  // ⚠️ CES GARDES-LÀ LISENT DU CODE, faute de pouvoir monter un rendu. Elles
  // valent donc EXACTEMENT ce que cette section mesure : une garde textuelle
  // que personne ne fait rougir ne prouve rien du tout. Chaque mutation est
  // écrite comme une régression plausible, pas comme un changement de texte.

  // ─── LA FICHE CLIENT ────────────────────────────────────────────────────
  // ⚠️ Ancres reorientees le 07/10 : la carte lit `mentionCarte`, panier compris.
  { nom: '🔴 la carte produit n’affiche plus la mention du delai',
    fichier: FICHE,
    de: '                  {mention}',
    vers: '                  {article.delai_minutes}' },

  // ⚠️ Rien ne se commande en vitrine : un delai y serait du decor.
  { nom: '🔴 la vitrine se met a afficher un delai de commande',
    fichier: FICHE,
    de: '              if (article.est_vitrine || modeVitrine) return null',
    vers: '              if (false) return null' },

  // 🔴 LE JOUR CHOISI, ET LE DELAI EN JOURS (Alex, 07/10).
  { nom: '🔴 la carte ne dit plus les jours ni la date limite',
    fichier: FICHE,
    de: '              const mention = mentionDispo',
    vers: '              const mention = null' },
  { nom: '🔴 le pain se met au panier un jour ou il ne se vend pas',
    fichier: FICHE,
    de: '    if (refuseParDelai(article, { article, options, variante })) return',
    vers: '' },
  { nom: '🔴 un lot a 48 h part pour aujourd hui',
    fichier: FICHE,
    de: '    if (refuseParDelai({ id: article.id, nom: deal.titre,',
    vers: '    if (false && refuseParDelai({ id: article.id, nom: deal.titre,' },
  { nom: '🔴 la fenetre de choix ne s affiche plus',
    fichier: FICHE,
    de: '        {propositionJour && (() => {',
    vers: '        {false && (() => {' },
  { nom: '🔴 accepter ne rejoue plus l ajout',
    fichier: FICHE,
    de: '    if (p.rejouer) setAjoutEnAttente(p.rejouer)',
    vers: '' },
  { nom: '🔴 les jours de vente ne sont plus lus a l ecran',
    fichier: FICHE,
    de: '    return { delaiJours: delaiEnJours(ligne), indispo: joursIndisponibles(stocksJour?.[ligne?.id]) }',
    vers: '    return { delaiJours: delaiEnJours(ligne), indispo: [] }' },
  { nom: '🔴 l expedition se met a refuser (pas de jour)',
    fichier: FICHE,
    de: '    if (estDetail) return modeBoutiqueEff === \'retrait\' ? jourRetraitBoutique : null',
    vers: '    if (estDetail) return jourRetraitBoutique' },
  { nom: '🔴 un panier qui ne va pas avec le jour passe a l etape du retrait',
    fichier: FICHE,
    de: '                      blocage={blocagePanier}',
    vers: '                      blocage={null}' },
  { nom: '🔴 le bouton grise reste cliquable',
    fichier: FICHE,
    de: '        <button onClick={() => { if (!blocage) onValider() }} disabled={!!blocage}',
    vers: '        <button onClick={onValider}' },
  { nom: '🔴 une tournee est proposee un jour ou le panier ne va pas',
    fichier: FICHE,
    de: '      return panierVaCeJour(dateStr)',
    vers: '      return true' },
  { nom: '🔴 le calendrier de la fiche ne s allonge plus',
    fichier: FICHE,
    de: '    buildJoursDispos(data.commercant, data.creneaux, data.fermetures, data.chargeCreneaux || {}, data.blocagesCreneaux || [], longueurCal)',
    vers: '    buildJoursDispos(data.commercant, data.creneaux, data.fermetures, data.chargeCreneaux || {}, data.blocagesCreneaux || [], null)' },
  { nom: '🔴 le duo ignore de nouveau son second article a l ecran',
    fichier: FICHE,
    de: '    return delaiDeLOffre(article, second)',
    vers: '    return delaiDeLOffre(article, null)' },
  { nom: '🔴 le serveur accepte une tarte a J+2 pour aujourd hui',
    fichier: 'app/api/stripe/checkout/create-commande/route.js',
    de: '          if (refus?.raison === \'delai\') {',
    vers: '          if (false) {' },
  { nom: '🔴 le serveur ignore le second article du duo',
    fichier: 'app/api/stripe/checkout/create-commande/route.js',
    de: '          l.delai_minutes = delaiDeLOffre({ delai_minutes: l.delai_minutes }, parId[String(l.deal_article2_id)])',
    vers: '          l.delai_minutes = Number(l.delai_minutes) || 0' },
  { nom: '🔴 le serveur refuse samedi lundi (horizon du commerce seul)',
    fichier: 'app/api/stripe/checkout/create-commande/route.js',
    de: '        const horizon = longueurCalendrier({',
    vers: '        const horizon = Number(commercant.horizon_commande) || 2 || longueurCalendrier({' },
  { nom: '🔴 la regle oublie les jours de vente',
    fichier: 'lib/delai-commande.js',
    de: '  if ((indispo || []).includes(jourSemaineDe(jour))) return { raison: \'jour\' }',
    vers: '' },
  { nom: '🔴 la regle compte en heures (le samedi matin refuse)',
    fichier: 'lib/delai-commande.js',
    de: '  return m >= 1440 ? Math.round(m / 1440) : 0',
    vers: '  return m >= 1440 ? Math.round(m / 1440) + 1 : 0' },
  { nom: '🔴 la fenetre ne fait plus que 7 jours (samedi suivant perdu)',
    fichier: 'lib/delai-commande.js',
    de: '    if (d > 0 || (a?.indispo || []).length > 0) n = Math.max(n, d + FENETRE_APRES_DELAI)',
    vers: '    if (d > 0 || (a?.indispo || []).length > 0) n = Math.max(n, FENETRE_APRES_DELAI)' },
  { nom: '🔴 la proposition oublie le panier (Tout retirer sans verifier)',
    fichier: 'lib/delai-commande.js',
    de: '  const commun = tries.find(j => j >= premier && va(candidat, j) && lignes.every(l => va(l, j)))',
    vers: '  const commun = tries.find(j => j >= premier && va(candidat, j))' },
  { nom: '🔴 l invendu redevient lent (delai brut)',
    fichier: 'lib/delai-commande.js',
    de: '  const m = delaiDeLaLigne(ligne)\n  return m >= 1440',
    vers: '  const m = Number(ligne?.delai_minutes) || 0\n  return m >= 1440' },
  { nom: '🔴 le duo ne prend que son premier article',
    fichier: 'lib/delai-commande.js',
    de: '    delaiDeLaLigne({ delai_minutes: article2?.delai_minutes }),',
    vers: '    0,' },

  // 🔴 L'ecran mentait au serveur : l'un lisait l'heure machine, l'autre
  // l'heure belge. Sans effet a Namur, faux des que le Yopper voyage.
  // ⚠️ Ancre reorientee le 07/10 : le filtre tient desormais en une ligne.
  { nom: '🔴 le selecteur cesse d’appliquer la cloture du creneau',
    fichier: FICHE,
    de: '    return liste.filter(cr => creneauCommandable(cr, { dateStr, instantDebut: brusselsInstant }).ok)',
    vers: '    return liste' },
  { nom: '🔴 le selecteur repasse en heure MACHINE',
    fichier: FICHE,
    de: '    return liste.filter(cr => creneauCommandable(cr, { dateStr, instantDebut: brusselsInstant }).ok)',
    vers: '    return liste.filter(cr => creneauCommandable(cr, { dateStr }).ok)' },


  { nom: '🔴 le refus de melange ne s’affiche plus',
    fichier: FICHE,
    de: '                {refusMelange && (',
    vers: '                {false && (' },

  // 🔴 Un lot « 3 tartes + 1 » partait pour le jour meme pendant que la tarte
  // a l unite demandait ses 48 h.
  { nom: '🔴 le lot reperd le delai de son article',
    fichier: FICHE,
    de: '      delai_minutes: delaiOffre,',
    vers: '      delai_minutes: 0,' },

  { nom: '🔴 la fenetre de l’offre ne voyage plus avec la ligne de panier',
    fichier: FICHE,
    de: '      offre: { heure_debut: deal.heure_debut, heure_fin: deal.heure_fin },',
    vers: '      offre: null,' },

  // ─── LE TABLEAU DE BORD ─────────────────────────────────────────────────
  { nom: '🔴 un delai hors liste disparait du formulaire commercant',
    fichier: BORD,
    de: '                {choixDeDelai(form.delai_minutes).map(m => (',
    vers: '                {choixDeDelai(0).map(m => (' },

  { nom: '🔴 le delai s’enregistre en CHAINE au lieu d’un nombre',
    fichier: BORD,
    // ⚠️ ANCRE RÉORIENTÉE LE 30/09 (l'article pas vendu en ligne n'a pas de délai).
    de: '      delai_minutes: (estVitrine || !form.vendable) ? 0 : (parseInt(form.delai_minutes, 10) || 0),',
    vers: '      delai_minutes: form.delai_minutes,' },

  { nom: '🔴 le delai enregistre n’est plus relu a l’ouverture de l’article',
    fichier: BORD,
    de: "categorie: a.categorie || '', temps_prepa: String(a.temps_prepa ?? ''), delai_minutes: a.delai_minutes ?? 0,",
    vers: "categorie: a.categorie || '', temps_prepa: String(a.temps_prepa ?? ''), delai_minutes: 0," },

  // 🔴 Il ecrivait `delta_minutes` a cinq endroits et AUCUNE ligne ne le
  // lisait : le commercant reglait un temps sans le moindre effet.
  { nom: '🔴 le reglage mort « Delai » revient dans les creneaux',
    fichier: BORD,
    de: '      max_commandes: parseInt(form.max_commandes) || 5,',
    vers: '      max_commandes: parseInt(form.max_commandes) || 5,\n      delta_minutes: 0,' },

  // ═══════════════════════════════════════════════════════════════════════
  // LE SERVEUR, C'EST-À-DIRE LA SEULE PROTECTION RÉELLE
  // ═══════════════════════════════════════════════════════════════════════
  //
  // 🔴 TOUT CE QUI PRÉCÈDE EXPLIQUE, RIEN NE DÉFEND. Un onglet ouvert depuis ce
  // matin, un panier restauré au retour de Stripe ou une requête fabriquée ne
  // passent par aucune ligne d'écran. Ces mutations-ci sont donc les seules
  // dont l'échec se paierait en argent.

  // ─── LA LIGNE DE COMMANDE ───────────────────────────────────────────────
  //
  // 🔴 Sans le délai sur la ligne, la garde du serveur lit zéro partout et
  // laisse tout passer, en silence. Aucune erreur, aucun symptôme.
  { nom: '🔴 la ligne de commande perd le delai de son article',
    fichier: LIGNES,
    de: '      delai_minutes: article.delai_minutes ?? 0,',
    vers: '      delai_minutes: 0,' },

  // 🔴 DÉPLACÉE DEPUIS mutations-anti-gaspi.mjs LE 04/09. Elle y visait
  // `lib/lignes-commande.js`, mais la garde qui la mesure vit dans CE banc-ci :
  // elle restait donc verte, faute de tourner sur le bon banc. Une mutation
  // mesurée par un banc qui ne regarde pas la règle ne mesure rien.
  { nom: '🔴 l offre qui a produit la ligne est de nouveau jetee',
    fichier: LIGNES,
    de: '      deal_id: deal ? deal.id : null,',
    vers: '      deal_id: null,' },

  { nom: '🔴 la fenetre de l’invendu n’arrive plus jusqu’a la ligne',
    fichier: LIGNES,
    de: '      offre: deal ? { heure_debut: deal.heure_debut, heure_fin: deal.heure_fin } : null,',
    vers: '      offre: null,' },

  // ⚠️ UNE COLONNE ABSENTE D UN SELECT est LE defaut le plus frequent de ce
  // projet, six fois. Elle ne leve rien : elle rend `undefined`.
  { nom: '🔴 le select des articles ne demande plus le delai',
    fichier: LIGNES,
    de: 'tva_taux, tva_taux_sur_place, delai_minutes\'',
    vers: 'tva_taux, tva_taux_sur_place\'' },

  { nom: '🔴 le select des deals ne demande plus la fenetre',
    fichier: LIGNES,
    // ⚠️ ANCRE REFAITE : `quantite` a rejoint le select le 04/09 au soir, pour
    // le plafond de l'offre. Le harnais l'a dit en « TEXTE INTROUVABLE ».
    de: 'heure_debut, heure_fin, quantite\'',
    vers: 'quantite\'' },

  // ─── LA ROUTE QUI CRÉE LA COMMANDE ──────────────────────────────────────
  // ⚠️ Remplacees le 07/10 : le serveur juge chaque ligne en JOURS.
  { nom: '🔴 le serveur ne lit plus le delai des lignes',
    fichier: ROUTE,
    de: '          const n = delaiEnJours(l)',
    vers: '          const n = 0' },

  { nom: '🔴 le melange impossible passe au paiement',
    fichier: ROUTE,
    de: '      if (refusMelange) {',
    vers: '      if (false) {' },

  { nom: '🔴 la boutique n’applique plus le delai a son jour de retrait',
    fichier: ROUTE,
    de: '      if (!estBoutique || estRetraitBoutique) {\n        const aujourdhui = jourBruxelles()',
    vers: '      if (!estBoutique) {\n        const aujourdhui = jourBruxelles()' },

  { nom: '🔴 le serveur ne lit plus les jours de vente du catalogue',
    fichier: ROUTE,
    de: '          articles: (catalogue || []).map(a => ({ delaiJours: delaiEnJours(a), indispo: offParArticle[a.id] || [], horizonJours: a.horizon_jours })),',
    vers: '          articles: (catalogue || []).map(a => ({ delaiJours: delaiEnJours(a), indispo: [], horizonJours: a.horizon_jours })),' },
  // 🔴 TEMPS 2 (07/10) : « Reservable jusqu a ».
  { nom: '🔴 le serveur ignore « Reservable jusqu a »',
    fichier: ROUTE,
    de: '          articles: (catalogue || []).map(a => ({ delaiJours: delaiEnJours(a), indispo: offParArticle[a.id] || [], horizonJours: a.horizon_jours })),',
    vers: '          articles: (catalogue || []).map(a => ({ delaiJours: delaiEnJours(a), indispo: offParArticle[a.id] || [] })),' },
  { nom: '🔴 la regle ignore « Reservable jusqu a »',
    fichier: 'lib/delai-commande.js',
    de: '    if (Number.isFinite(h) && h >= 1) n = Math.max(n, Math.floor(h) + 1)',
    vers: '' },
  { nom: '🔴 la fiche ignore « Reservable jusqu a »',
    fichier: FICHE,
    de: 'indispo: joursIndisponibles(stocks?.[a.id]), horizonJours: a.horizon_jours })),',
    vers: 'indispo: joursIndisponibles(stocks?.[a.id]) })),' },
  { nom: '🔴 le formulaire n enregistre plus « Reservable jusqu a »',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: '        ? null : (parseInt(form.horizon_jours, 10) || null),',
    vers: '        ? null : null,' },

  // ⚠️ HORIZON ET DÉLAI SONT DEUX BORNES OPPOSÉES : plafond et plancher.
  { nom: '🔴 l’horizon ne plafonne plus rien cote serveur',
    fichier: ROUTE,
    de: '        if (date_commande < aujourdhui || (dernier && date_commande > dernier)) {',
    vers: '        if (date_commande < aujourdhui) {' },

  { nom: '🔴 une date DEJA PASSEE est acceptee',
    fichier: ROUTE,
    de: '        if (date_commande < aujourdhui || (dernier && date_commande > dernier)) {',
    vers: '        if ((dernier && date_commande > dernier)) {' },

  { nom: '🔴 l’horizon n’est plus demande en base (il vaudra le defaut, en silence)',
    fichier: ROUTE,
    // ⚠️ REPOINTÉE DEUX FOIS LE 05/10 : le select s'allonge à chaque chantier
    // (`livraison_actif`, puis `latitude, longitude` pour l'étoile). L'ancre
    // vise désormais le voisinage de `horizon_commande`, plus la fin de ligne.
    de: 'boutique_delai_heures, horizon_commande, plan, essai_plan,',
    vers: 'boutique_delai_heures, plan, essai_plan,' },

  { nom: '🔴 les fermetures ne sont plus partagees entre les deux controles',
    fichier: ROUTE,
    de: '    let fermeturesCommercant = []',
    vers: '    let fermeturesCommercant = null' },
]

// ⚠️ L ÉCRITURE ET LA RESTAURATION PASSENT PAR `scripts/harnais-mutation.mjs`.
// Le remède du 04/09 y vit pour les SEIZE harnais : réessai sur verrou de
// fichier, et restauration automatique sur toutes les sorties, y compris
// celles qu'on n'a pas prévues. Recopié ici, il aurait été corrigé une fois
// sur seize le jour où il faudra le reprendre.
const ecrire = (f, contenu) => ecrireSur(f, contenu)

const lancer = () => {
  try {
    const sortie = execSync(`npm run ${BANC}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    // ⚠️ ON DISTINGUE « ROUGE » DE « PLANTÉ ». Un banc qui explose au lieu de
    // rougir n'est pas une mesure, c'est un accident.
    const plante = !/vérifications/.test(sortie)
    return { rouge: true, plante, extrait: sortie.slice(-400) }
  }
}

const depart = lancer()
if (depart.rouge) {
  console.log(`🔴 ${BANC} EST DÉJÀ ROUGE. On ne mesure rien sur un banc rouge.`)
  console.log(depart.extrait)
  process.exit(1)
}
console.log('Banc vert au départ.\n')

let attrapees = 0
const manquees = []

for (const m of MUTATIONS) {
  const f = chemin(m.fichier || MODULE)
  const original = readFileSync(f, 'utf8')
  if (!original.includes(m.de)) {
    manquees.push(`${m.nom} — TEXTE INTROUVABLE`)
    console.log(`  ? introuvable : ${m.nom}`)
    continue
  }
  if (!ecrire(f, original.replace(m.de, m.vers))) {
    // Le fichier n'a pas bougé : rien à restaurer, on passe.
    manquees.push(`${m.nom} — ÉCRITURE IMPOSSIBLE`)
    continue
  }

  // ⚠️ LA RESTAURATION VIT DANS UN `finally`. Si le banc plante, si `lancer`
  // lève, si le processus reçoit une interruption au mauvais moment, le
  // fichier revient quand même. C'est la seule façon de garantir qu'un harnais
  // ne laisse jamais de mutation derrière lui.
  let res
  try {
    res = lancer()
  } finally {
    if (!ecrire(f, original)) {
      console.log(`\n🔴 RESTAURATION IMPOSSIBLE sur ${m.fichier || MODULE}. Le dépôt est MUTÉ, corrige à la main.`)
      process.exit(2)
    }
  }

  if (readFileSync(f, 'utf8') !== original) {
    console.log(`\n🔴 RESTAURATION RATÉE sur ${m.fichier || MODULE}. On s'arrête.`)
    process.exit(2)
  }

  if (res.rouge && !res.plante) { attrapees++; console.log(`  ✓ attrapée : ${m.nom}`) }
  else if (res.plante) { manquees.push(`${m.nom} — le banc a PLANTÉ`); console.log(`  ⚠ plantage : ${m.nom}`) }
  else { manquees.push(`${m.nom} — RESTÉ VERT`); console.log(`  ✕ MANQUÉE : ${m.nom}`) }
}

console.log(`\n${attrapees}/${MUTATIONS.length} mutations attrapées.`)
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach(x => console.log('   • ' + x)) }

const finalRouge = lancer().rouge
if (finalRouge) console.log(`🔴 ${BANC} ROUGE APRÈS RESTAURATION.`)
else console.log('\nBanc vert après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
