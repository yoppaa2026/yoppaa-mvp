// Banc du DÉLAI DE COMMANDE.
//
// 🔴 CE QU'IL GARDE : qu'un Yopper ne se voie jamais promettre un retrait que
// le commerçant ne peut pas tenir, et qu'un commerçant ne perde jamais une
// vente parce qu'un article lent a bloqué tout son catalogue.
//
// Les deux erreurs coûtent, et elles sont symétriques. Trop permissif, la
// tarte de 48 h part pour ce midi et le boulanger découvre une commande
// impossible. Trop strict, le sandwich hérite des 48 h de la tarte et personne
// ne commande plus rien à 11 h.
//
// ⚠️ TOUT S'EXÉCUTE. Aucune garde ne cherche un mot dans un fichier : on appelle
// la fonction avec un instant précis et on regarde ce qu'elle rend. Une garde
// qui lit du texte reste verte quand le code déménage.
//
// ⚠️ LES INSTANTS SONT BELGES, fabriqués par `brusselsInstant` — celui du
// serveur, pas une copie. Le banc ne dépend donc pas du fuseau de la machine
// qui le fait tourner.

import {
  delaiDeLaLigne, delaiDuPanier, refusDeMelange, pretA,
  premierCreneauPossible, premierJourBoutique,
  libelleDuree, mentionArticle, libelleMoment, avertissementDelai,
  DELAIS_PROPOSES, choixDeDelai, libelleChoixDelai,
  delaiDeLOffre, delaiEnJours, joursIndisponibles, refusDuJour, longueurCalendrier,
  libelleJoursVente, mentionDisponibilite, propositionPourArticle,
} from '../lib/delai-commande.js'
import { jourPlus as jourPlusBanc } from '../lib/statut-commerce.js'
import { brusselsInstant } from '../lib/timezone.js'
import { readFileSync } from 'node:fs'
import { sansProse } from './lire-code.mjs'
import { construireLignesCommande, SELECT_ARTICLES, SELECT_DEALS } from '../lib/lignes-commande.js'

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}
const egal = (nom, a, b) => verifier(nom, JSON.stringify(a) === JSON.stringify(b),
  `obtenu ${JSON.stringify(a)}, attendu ${JSON.stringify(b)}`)

// Le mardi 8 septembre 2026, à l'heure qu'on veut, chez nous.
const MARDI = '2026-09-08'
const MERCREDI = '2026-09-09'
const JEUDI = '2026-09-10'
const le = (jour, heure) => brusselsInstant(jour, heure)

// ═══════════════════════════════════════════════════════════════════════════
// 1. LE DÉLAI D'UNE LIGNE
// ═══════════════════════════════════════════════════════════════════════════
egal('un article sans délai vaut zéro', delaiDeLaLigne({ nom: 'Baguette' }), 0)
egal('une ligne absente vaut zéro', delaiDeLaLigne(null), 0)
egal('un délai nul vaut zéro', delaiDeLaLigne({ delai_minutes: null }), 0)
egal('une chaîne vide vaut zéro', delaiDeLaLigne({ delai_minutes: '' }), 0)
egal('un délai illisible vaut zéro', delaiDeLaLigne({ delai_minutes: 'demain' }), 0)
// ⚠️ UN NÉGATIF EST UNE ERREUR DE SAISIE, PAS UNE AVANCE DANS LE TEMPS. Laissé
// passer, il ferait remonter le premier retrait AVANT maintenant et rendrait
// commandable un créneau déjà commencé.
egal('🔴 un délai négatif vaut zéro', delaiDeLaLigne({ delai_minutes: -60 }), 0)
egal('90 minutes valent 90', delaiDeLaLigne({ delai_minutes: 90 }), 90)
egal('« 90 » aussi', delaiDeLaLigne({ delai_minutes: '90' }), 90)
egal('les demi-minutes s’arrondissent', delaiDeLaLigne({ delai_minutes: 90.6 }), 91)

// 🔴 L'OFFRE DE FIN DE JOURNÉE ANNULE LE DÉLAI DE SON ARTICLE, et c'est le cas
// qu'Alex a construit en avocat du diable. La tarte qui reste à 17 h est DÉJÀ
// FAITE : lui appliquer les 48 h de production rendrait l'anti-gaspi
// inutilisable exactement là où il sert.
const TARTE_INVENDUE = {
  nom: 'Tarte aux pommes', delai_minutes: 2880,
  offre: { heure_debut: '15:00:00', heure_fin: '18:00:00' },
}
egal('🔴 un invendu ne porte plus le délai de son article',
  delaiDeLaLigne(TARTE_INVENDUE), 0)
// ⚠️ ET UNE DEMI-FENÊTRE N'EST PAS UNE OFFRE. Une ligne à moitié remplie ne
// doit jamais servir de laissez-passer : elle annulerait un délai réel.
egal('🔴 une demi-fenêtre n’annule rien',
  delaiDeLaLigne({ delai_minutes: 2880, offre: { heure_debut: '15:00:00' } }), 2880)
egal('une offre sans heures non plus',
  delaiDeLaLigne({ delai_minutes: 2880, offre: {} }), 2880)

// ═══════════════════════════════════════════════════════════════════════════
// 2. LE DÉLAI DU PANIER : LE PLUS CONTRAIGNANT GAGNE, ET ON LE NOMME
// ═══════════════════════════════════════════════════════════════════════════
const BAGUETTE = { nom: 'Baguette', quantite: 2 }
const SANDWICH = { nom: 'Sandwich club', delai_minutes: 60 }
const TARTE = { nom: 'Tarte aux pommes', delai_minutes: 2880 }

egal('un panier vide ne retarde rien', delaiDuPanier([]), { minutes: 0, nom: null })
egal('un panier absent non plus', delaiDuPanier(null), { minutes: 0, nom: null })
egal('sans article lent, rien à dire', delaiDuPanier([BAGUETTE]), { minutes: 0, nom: null })
egal('🔴 le plus contraignant gagne, et il est nommé',
  delaiDuPanier([BAGUETTE, SANDWICH, TARTE]), { minutes: 2880, nom: 'Tarte aux pommes' })
// ⚠️ L'ORDRE DU PANIER NE DOIT RIEN CHANGER. Rendre le premier trouvé au lieu
// du plus grand dépendrait de l'ordre des clics du Yopper.
egal('l’ordre du panier ne change rien',
  delaiDuPanier([TARTE, SANDWICH, BAGUETTE]), { minutes: 2880, nom: 'Tarte aux pommes' })
egal('le sandwich seul impose son heure',
  delaiDuPanier([BAGUETTE, SANDWICH]), { minutes: 60, nom: 'Sandwich club' })
// La fiche garde son panier dans un OBJET indexé par clé, pas un tableau.
egal('🔴 le panier de la fiche, qui est un objet, se lit aussi',
  delaiDuPanier({ a: BAGUETTE, b: TARTE }), { minutes: 2880, nom: 'Tarte aux pommes' })
egal('🔴 un invendu ne tire pas le panier',
  delaiDuPanier([BAGUETTE, TARTE_INVENDUE]), { minutes: 0, nom: null })

// ═══════════════════════════════════════════════════════════════════════════
// 2 BIS. LE DÉLAI EN JOURS DE CALENDRIER, ET LE JOUR CHOISI (Alex, 07/10)
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 LES CAS D'ALEX, EXÉCUTÉS. Le pain longue fermentation se vend samedi et
// dimanche, à J+2 : commandé jeudi pour samedi, vendredi pour dimanche, et
// dès lundi pour samedi. Semaine du lundi 12 au dimanche 18 octobre 2026.
{
  const LUN = '2026-10-12', MAR = '2026-10-13', JEU = '2026-10-15', VEN = '2026-10-16'
  const SAM = '2026-10-17', DIM = '2026-10-18', DIM_AVANT = '2026-10-11', SAM_SUIVANT = '2026-10-24'
  const SEMAINE = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi']
  const PLF = { delaiJours: 2, indispo: SEMAINE }

  // LE DÉLAI EN JOURS
  egal('2 jours = J+2', delaiEnJours({ delai_minutes: 2880 }), 2)
  egal('1 jour = J+1', delaiEnJours({ delai_minutes: 1440 }), 1)
  egal('🔴 moins d’un jour vaut zéro (les heures sont à la clôture du créneau)', delaiEnJours({ delai_minutes: 60 }), 0)
  egal('36 h hors liste s’arrondit à 2 jours', delaiEnJours({ delai_minutes: 2160 }), 2)
  egal('🔴 l’invendu n’a pas de délai', delaiEnJours(TARTE_INVENDUE), 0)
  egal('rien ne vaut zéro', delaiEnJours(null), 0)
  egal('les jours de vente se lisent sur les réglages du jour',
    joursIndisponibles({ lundi: { actif: false }, samedi: { actif: true }, mardi: { stock: 4 } }), ['lundi'])

  // LE JOUR CHOISI
  verifier('🔴 lundi pour samedi : le pain passe (J+5)', refusDuJour({ ...PLF, jour: SAM, aujourdhui: LUN }) === null)
  verifier('🔴 jeudi pour samedi : J+2 exact, à n’importe quelle heure', refusDuJour({ ...PLF, jour: SAM, aujourdhui: JEU }) === null)
  egal('🔴 vendredi pour samedi : trop tard, le plus tôt est dimanche',
    refusDuJour({ ...PLF, jour: SAM, aujourdhui: VEN }), { raison: 'delai', plancher: DIM })
  verifier('🔴 vendredi pour dimanche : ça passe', refusDuJour({ ...PLF, jour: DIM, aujourdhui: VEN }) === null)
  verifier('🔴 samedi pour le samedi suivant : ça passe', refusDuJour({ ...PLF, jour: SAM_SUIVANT, aujourdhui: SAM }) === null)
  egal('🔴 pas en semaine', refusDuJour({ ...PLF, jour: VEN, aujourdhui: LUN }), { raison: 'jour' })
  // ⚠️ ALEX : LES FERMETURES NE PROLONGENT PAS LE J+n. Fermé le lundi, la
  // tarte commandée dimanche se retire mardi.
  verifier('🔴 les fermetures ne prolongent pas le délai (dimanche → mardi à J+2)',
    refusDuJour({ delaiJours: 2, jour: MAR, aujourdhui: DIM_AVANT }) === null)
  verifier('un article sans règle passe tous les jours', refusDuJour({ jour: LUN, aujourdhui: LUN }) === null)

  // LE CALENDRIER S'ALLONGE AVEC LE CATALOGUE
  egal('sans article particulier, l’horizon du commerce', longueurCalendrier({ horizon: 2, articles: [{ delaiJours: 0, indispo: [] }] }), 2)
  egal('🔴 un pain à J+2 ouvre une semaine APRÈS son délai (9 jours)', longueurCalendrier({ horizon: 2, articles: [PLF] }), 9)
  egal('un article du seul dimanche ouvre 7 jours', longueurCalendrier({ horizon: 2, articles: [{ delaiJours: 0, indispo: ['lundi'] }] }), 7)
  egal('un horizon plus long reste', longueurCalendrier({ horizon: 10, articles: [PLF] }), 10)
  egal('un horizon illisible vaut 2', longueurCalendrier({ horizon: null }), 2)
  // 🔴 « 7 JOURS » NE SUFFISAIT PAS : le samedi, le samedi suivant est J+7.
  // Quel que soit le jour où l'on commande, un samedi doit être proposé.
  {
    const n = longueurCalendrier({ horizon: 2, articles: [PLF] })
    const manques = []
    for (let i = 0; i < 7; i++) {
      const auj = jourPlusBanc(LUN, i)
      const jours = Array.from({ length: n }, (_, k) => jourPlusBanc(auj, k))
      if (!jours.some(j => refusDuJour({ ...PLF, jour: j, aujourdhui: auj }) === null && new Date(`${j}T12:00:00Z`).getUTCDay() === 6)) manques.push(auj)
    }
    egal('🔴 chaque jour de la semaine, un samedi reste commandable', manques, [])
  }

  // CE QUE LA CARTE DIT
  egal('les jours de vente du week-end', libelleJoursVente(SEMAINE), 'Samedi et dimanche')
  egal('tous les jours : rien à dire', libelleJoursVente([]), null)
  egal('une suite de jours', libelleJoursVente(['lundi', 'dimanche']), 'Du mardi au samedi')
  egal('un seul jour', libelleJoursVente(['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'dimanche']), 'Le samedi')
  egal('des jours épars', libelleJoursVente(['mardi', 'jeudi', 'samedi', 'dimanche']), 'Lundi, mercredi et vendredi')
  egal('🔴 la carte du pain dit la date limite, comme au comptoir', mentionDisponibilite(PLF),
    'Samedi et dimanche seulement · commande au plus tard jeudi pour samedi, vendredi pour dimanche')
  egal('un délai seul dit la durée', mentionDisponibilite({ delaiJours: 2 }), 'Commande 2 jours à l\'avance')
  egal('des jours seuls', mentionDisponibilite({ indispo: SEMAINE }), 'Samedi et dimanche seulement')
  egal('ni délai ni jours : la carte reste nue', mentionDisponibilite({}), null)
  egal('🔴 une semaine de délai ne dit pas « samedi pour samedi »',
    mentionDisponibilite({ delaiJours: 7, indispo: SEMAINE }), 'Samedi et dimanche seulement · commande 7 jours à l\'avance')
  egal('J+1 le samedi : la veille', mentionDisponibilite({ delaiJours: 1, indispo: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'dimanche'] }),
    'Le samedi seulement · commande au plus tard vendredi pour samedi')

  // CE QUE L'AJOUT PROPOSE (Alex : « je dois pouvoir dire, je suis d'accord
  // de les prendre en même temps que le reste »)
  const regle = l => ({ delaiJours: l.d || 0, indispo: l.off || [] })
  const CAL = Array.from({ length: 9 }, (_, k) => jourPlusBanc(LUN, k))
  const PAIN = { nom: 'Pain longue fermentation', d: 2, off: SEMAINE }
  const CROISSANT = { nom: 'Croissant' }
  const PAIN_SEMAINE = { nom: 'Pain de semaine', off: ['samedi', 'dimanche'] }
  const propose = (candidat, panier, jourChoisi) => propositionPourArticle({ candidat, panier, jourChoisi, aujourdhui: LUN, jours: CAL, regle })
  egal('le pain un samedi choisi : il va', propose(PAIN, [], SAM), { type: 'ok' })
  egal('🔴 panier vide, lundi : on propose samedi', propose(PAIN, [], LUN), { type: 'vide', jour: SAM })
  egal('🔴 croissants du jour au panier : « Tout retirer samedi »', propose(PAIN, [CROISSANT], LUN), { type: 'tout', jour: SAM })
  egal('🔴 un pain de semaine au panier : on nomme ce qui bloque',
    propose(PAIN, [PAIN_SEMAINE], LUN), { type: 'incompatible', jour: SAM, nom: 'Pain de semaine' })
  egal('le panier ne suit que le dimanche : on propose dimanche',
    propose(PAIN, [{ nom: 'Brioche du dimanche', off: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'] }], LUN), { type: 'tout', jour: DIM })
  egal('un article vendu nulle part dans le calendrier', propose({ nom: 'X', off: [...SEMAINE, 'samedi', 'dimanche'] }, [], LUN), { type: 'aucun' })
  // 🔴 L'ORDRE DES CLICS NE CHANGE RIEN (cas 4 et 6 du tableau) : samedi
  // choisi, le croissant va, qu'il y ait du pain au panier ou non.
  egal('🔴 croissants seuls pour samedi, commandés lundi : ils vont', propose(CROISSANT, [], SAM), { type: 'ok' })
  egal('🔴 et avec le pain au panier : pareil', propose(CROISSANT, [PAIN], SAM), { type: 'ok' })
  egal('🔴 la baguette part avec la tarte samedi : plus de refus « deux délais »',
    propose({ nom: 'Baguette' }, [{ nom: 'Tarte', d: 2 }], SAM), { type: 'ok' })

  // LE DUO
  egal('🔴 un duo prend le plus long de ses deux articles',
    delaiDeLOffre({ delai_minutes: 0 }, { delai_minutes: 2880 }), 2880)
  egal('un lot n’a qu’un article', delaiDeLOffre({ delai_minutes: 1440 }), 1440)
  egal('rien d’illisible ne crée un délai', delaiDeLOffre(null, { delai_minutes: 'x' }), 0)
}


// ═══════════════════════════════════════════════════════════════════════════
// 3. L'INVENDU NE SE REPORTE PAS
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 ON REFUSE AVANT LE PAIEMENT. Laisser passer donne un commerçant avec une
// commande impossible et un Yopper débité, pour une règle qu'on connaissait
// d'avance.
verifier('sans invendu, aucun refus',
  refusDeMelange([BAGUETTE, TARTE], { maintenant: le(MARDI, '16:00') }) === null)
verifier('un invendu seul passe',
  refusDeMelange([TARTE_INVENDUE], { maintenant: le(MARDI, '16:00') }) === null)
verifier('un invendu avec une baguette passe',
  refusDeMelange([TARTE_INVENDUE, BAGUETTE], { maintenant: le(MARDI, '16:00') }) === null)
// À 16 h, la fenêtre ferme à 18 h : il reste deux heures, le sandwich en
// demande une. Ça tient.
verifier('un invendu avec un sandwich d’une heure, à 16 h, passe',
  refusDeMelange([TARTE_INVENDUE, SANDWICH], { maintenant: le(MARDI, '16:00') }) === null)

// 🔴 À 17 h 30, il ne reste que trente minutes : le sandwich ne sera pas prêt.
{
  const refus = refusDeMelange([TARTE_INVENDUE, SANDWICH], { maintenant: le(MARDI, '17:30') })
  verifier('🔴 à 17 h 30, le sandwich ne rentre plus dans la fenêtre', refus !== null, String(refus))
  // ⚠️ LE MESSAGE NOMME LES DEUX ARTICLES. « Panier incompatible » laisse le
  // Yopper deviner quoi retirer ; il ne devinera pas, il fermera l'onglet.
  verifier('et il nomme l’invendu', /Tarte aux pommes/.test(refus || ''), String(refus))
  verifier('🔴 et il nomme l’article qui retarde', /Sandwich club/.test(refus || ''), String(refus))
  verifier('et il dit jusqu’à quand l’invendu se retire', /18 h/.test(refus || ''), String(refus))
}
// 🔴 La tarte de 48 h avec un invendu : impossible dès la première seconde.
{
  const refus = refusDeMelange([TARTE_INVENDUE, TARTE], { maintenant: le(MARDI, '15:01') })
  verifier('🔴 48 h et un invendu ne partent jamais ensemble', refus !== null, String(refus))
  verifier('le message dit la durée', /2 jours/.test(refus || ''), String(refus))
}
// ⚠️ LE PANIER EST RESTAURÉ AU RETOUR DE STRIPE ET DEPUIS LE CACHE. Un invendu
// ajouté à 17 h 50 peut revenir à l'écran à 18 h 10, quand plus rien ne le vend.
{
  const refus = refusDeMelange([TARTE_INVENDUE], { maintenant: le(MARDI, '18:10') })
  verifier('🔴 un invendu dont la fenêtre a fermé est refusé', refus !== null, String(refus))
  verifier('et le message dit le geste qui répare', /[Rr]etire/.test(refus || ''), String(refus))
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. QUAND LA PRÉPARATION EST FINIE
// ═══════════════════════════════════════════════════════════════════════════
egal('sans délai, c’est maintenant',
  pretA(0, le(MARDI, '10:00')).getTime(), le(MARDI, '10:00').getTime())
egal('90 minutes plus tard',
  pretA(90, le(MARDI, '10:00')).getTime(), le(MARDI, '11:30').getTime())
egal('🔴 48 h plus tard, c’est jeudi',
  pretA(2880, le(MARDI, '10:00')).getTime(), le(JEUDI, '10:00').getTime())
verifier('une date invalide ne rend pas maintenant', pretA(60, new Date('n’importe quoi')) === null)
egal('un délai illisible ne décale rien',
  pretA('demain', le(MARDI, '10:00')).getTime(), le(MARDI, '10:00').getTime())

// ═══════════════════════════════════════════════════════════════════════════
// 5. LE PREMIER CRÉNEAU POSSIBLE, CÔTÉ ALIMENTAIRE
// ═══════════════════════════════════════════════════════════════════════════
{
  const cr = (id, debut, fin, extra = {}) => ({
    id, heure_debut: debut, heure_fin: fin, jour_semaine: null, ...extra,
  })
  const JOURS = [
    { jour: MARDI, creneaux: [cr('m11', '11:00', '11:30'), cr('m17', '17:00', '17:30')] },
    { jour: MERCREDI, creneaux: [cr('me9', '09:00', '09:30')] },
  ]
  const appel = (minutes, heure, opts = {}) => premierCreneauPossible({
    minutes, maintenant: le(MARDI, heure), jours: JOURS, instantDebut: brusselsInstant, ...opts,
  })

  egal('sans délai, le prochain créneau du jour', appel(0, '10:00')?.creneau.id, 'm11')
  egal('à 12 h, le créneau de 11 h est passé', appel(0, '12:00')?.creneau.id, 'm17')
  egal('🔴 trois heures de délai à 10 h sautent le créneau de 11 h',
    appel(180, '10:00')?.creneau.id, 'm17')
  egal('et le jour rendu est bien le mardi', appel(180, '10:00')?.jour, MARDI)
  // ⚠️ DIX HEURES DE DÉLAI PASSENT AU LENDEMAIN. C'est le cas qui rend la
  // fonction utile : sans elle, l'écran proposerait le créneau de 17 h.
  egal('🔴 dix heures de délai passent au mercredi', appel(600, '10:00')?.creneau.id, 'me9')
  egal('et le jour suit', appel(600, '10:00')?.jour, MERCREDI)
  verifier('au-delà des jours proposés, on ne promet rien', appel(4320, '10:00') === null)

  // 🔴 LA CLÔTURE DU CRÉNEAU EST UNE BORNE INDÉPENDANTE DU DÉLAI, et c'est
  // `creneauCommandable` — la fonction du serveur — qui la lit. Deux calculs
  // auraient divergé, et le client se serait fait refuser au paiement.
  {
    const avecCloture = [
      { jour: MARDI, creneaux: [cr('tot', '11:00', '11:30', { cutoff_heures: 3 }), cr('tard', '17:00', '17:30')] },
    ]
    const r = premierCreneauPossible({
      minutes: 0, maintenant: le(MARDI, '10:00'), jours: avecCloture, instantDebut: brusselsInstant,
    })
    egal('🔴 un créneau dont la clôture est passée est sauté', r?.creneau.id, 'tard')
  }
  // La même grille une heure plus tôt : la clôture n'est pas encore passée.
  {
    const avecCloture = [
      { jour: MARDI, creneaux: [cr('tot', '11:00', '11:30', { cutoff_heures: 3 })] },
    ]
    const r = premierCreneauPossible({
      minutes: 0, maintenant: le(MARDI, '07:30'), jours: avecCloture, instantDebut: brusselsInstant,
    })
    egal('avant la clôture, le créneau reste possible', r?.creneau.id, 'tot')
  }

  // ⚠️ « LE PREMIER » N'A DE SENS QUE SUR UNE LISTE ORDONNÉE. Faire confiance à
  // l'ordre reçu ferait annoncer le mercredi quand le mardi convient.
  {
    const desordre = [
      { jour: MERCREDI, creneaux: [cr('me9', '09:00', '09:30')] },
      { jour: MARDI, creneaux: [cr('m17', '17:00', '17:30'), cr('m11', '11:00', '11:30')] },
    ]
    const r = premierCreneauPossible({
      minutes: 0, maintenant: le(MARDI, '10:00'), jours: desordre, instantDebut: brusselsInstant,
    })
    egal('🔴 les jours reçus dans le désordre sont triés', r?.jour, MARDI)
    egal('🔴 et les créneaux aussi', r?.creneau.id, 'm11')
  }

  // ⚠️ LE CRÉNEAU PLEIN OU FERMÉ EST ÉCARTÉ PAR L'APPELANT, qui est le seul à
  // connaître la charge du jour. Sans ce filtre, on annoncerait un créneau
  // barré à l'écran.
  egal('🔴 le filtre de l’appelant écarte le créneau plein',
    appel(0, '10:00', { utilisable: (c) => c.id !== 'm11' })?.creneau.id, 'm17')

  // ⚠️ UN CRÉNEAU DU MARDI NE VAUT PAS POUR UN MERCREDI. `creneauCommandable`
  // porte déjà cette règle ; on vérifie qu'elle traverse bien.
  {
    const mauvaisJour = [{ jour: MERCREDI, creneaux: [cr('x', '11:00', '11:30', { jour_semaine: 'mardi' })] }]
    const r = premierCreneauPossible({
      minutes: 0, maintenant: le(MARDI, '10:00'), jours: mauvaisJour, instantDebut: brusselsInstant,
    })
    verifier('🔴 un créneau du mardi ne sert pas un mercredi', r === null, JSON.stringify(r))
  }

  verifier('sans fabricant d’instant, on ne devine pas',
    premierCreneauPossible({ minutes: 0, maintenant: le(MARDI, '10:00'), jours: JOURS }) === null)
  verifier('sans jour proposé, rien', appel(0, '10:00', { jours: [] }) === null)
  verifier('un jour mal formé est ignoré',
    premierCreneauPossible({ minutes: 0, maintenant: le(MARDI, '10:00'), jours: [{ jour: 'mardi', creneaux: [cr('x', '11:00', '11:30')] }], instantDebut: brusselsInstant }) === null)
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. LE PREMIER JOUR, CÔTÉ BOUTIQUE
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ DEUX CALCULS, PAS UN. Une boutique de détail n'a AUCUN créneau : passer
// par `premierCreneauPossible` aurait rendu `null` chez elle, et la mention
// aurait disparu de tout le commerce de détail.
{
  // ⚠️ LE FORMAT EST CELUI DE `horaires_detail` : { debut, fin }. Deux
  // écritures cohabitent en base, `creneauxDuJour` les lit toutes les deux.
  const journee = { ouvert: true, debut: '09:00', fin: '18:00' }
  const TOUS_LES_JOURS = {
    lundi: journee, mardi: journee, mercredi: journee, jeudi: journee,
    vendredi: journee, samedi: journee, dimanche: { ouvert: false },
  }
  const appel = (minutes, heure, opts = {}) => premierJourBoutique({
    minutes, maintenant: le(MARDI, heure), horairesDetail: TOUS_LES_JOURS, fermetures: [], ...opts,
  })

  egal('sans délai, c’est aujourd’hui', appel(0, '10:00'), MARDI)
  egal('deux heures de délai tiennent encore dans la journée', appel(120, '10:00'), MARDI)
  // 🔴 LE JOUR OÙ TOMBE LA PRÉPARATION PEUT ÊTRE TROP TARD. Une tarte prête à
  // 19 h dans une boutique qui ferme à 18 h ne se retire pas ce jour-là.
  egal('🔴 une préparation finie après la fermeture passe au lendemain',
    appel(600, '10:00'), MERCREDI)
  egal('à 17 h 30, une heure de préparation déborde aussi', appel(60, '17:30'), MERCREDI)
  egal('🔴 48 h de délai donnent le jeudi', appel(2880, '10:00'), JEUDI)
  // ⚠️ LA MARGE DE PRÉPARATION DE LA BOUTIQUE S'AJOUTE. Deux heures avant la
  // fermeture, la limite passe à 16 h.
  egal('la marge de la boutique avance la limite',
    appel(0, '17:00', { delaiHeures: 2 }), MERCREDI)

  // Le dimanche est fermé : une préparation qui finit samedi soir saute au lundi.
  egal('🔴 un jour fermé est sauté',
    premierJourBoutique({
      minutes: 60, maintenant: le('2026-09-12', '17:30'),
      horairesDetail: TOUS_LES_JOURS, fermetures: [],
    }), '2026-09-14')

  // ⚠️ UNE FERMETURE EXCEPTIONNELLE COMPTE AUTANT QU'UN JOUR DE REPOS.
  egal('🔴 une fermeture exceptionnelle est sautée',
    appel(600, '10:00', { fermetures: [{ date_debut: MERCREDI, date_fin: MERCREDI }] }), JEUDI)

  // ⚠️ ON NE BLOQUE PAS UN COMMERÇANT QUI N'A PAS FINI SA FICHE, et cette
  // politique vient de `estOuvertCeJour` : fermer par défaut ferait perdre de
  // l'argent à quelqu'un qui n'a rien demandé. Une limite inconnue laisse
  // passer le jour même, exactement comme `joursRetraitBoutique`.
  egal('🔴 sans horaires, on ne bloque pas la vente',
    premierJourBoutique({ minutes: 0, maintenant: le(MARDI, '10:00') }), MARDI)
  egal('et un délai qui déborde la journée passe quand même au lendemain',
    premierJourBoutique({ minutes: 2880, maintenant: le(MARDI, '10:00') }), JEUDI)

  // Rien d'ouvert dans l'horizon : on ne promet pas une date.
  const FERME = { lundi: { ouvert: false }, mardi: { ouvert: false }, mercredi: { ouvert: false },
    jeudi: { ouvert: false }, vendredi: { ouvert: false }, samedi: { ouvert: false }, dimanche: { ouvert: false } }
  verifier('un commerce fermé partout ne rend aucune date',
    premierJourBoutique({ minutes: 0, maintenant: le(MARDI, '10:00'), horairesDetail: FERME, fermetures: [] }) === null)
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. CE QUE L'ÉCRAN ÉCRIT
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ UNE DURÉE NE PÉRIME JAMAIS, UNE HEURE SI. La carte produit porte la durée,
// le sélecteur de créneau porte le moment. Un onglet ouvert depuis ce matin
// affiche encore « Commande 1 h à l'avance » sans mentir.
verifier('sans délai, rien à écrire', libelleDuree(0) === null)
verifier('un négatif non plus', libelleDuree(-30) === null)
verifier('un illisible non plus', libelleDuree('demain') === null)
egal('30 minutes', libelleDuree(30), '30 min')
egal('59 minutes restent en minutes', libelleDuree(59), '59 min')
egal('une heure pile', libelleDuree(60), '1 h')
egal('une heure et demie', libelleDuree(90), '1 h 30')
egal('deux heures', libelleDuree(120), '2 h')
// ⚠️ 48 H SE DIT « 2 JOURS ». C'est le mot du boulanger, pas celui de la base.
egal('🔴 un jour pile se dit en jours', libelleDuree(1440), '1 jour')
egal('🔴 48 h se disent « 2 jours »', libelleDuree(2880), '2 jours')
egal('72 h aussi', libelleDuree(4320), '3 jours')
egal('25 h ne sont pas un jour rond', libelleDuree(1500), '25 h')

// ⚠️ LE COMMERÇANT NE SAISIT PAS DES MINUTES. Il pense « 48 h ». Un champ
// libre autoriserait 20 000 minutes, et l'article deviendrait commandable par
// personne, en silence : les deux calculs n'explorent que quatorze jours.
egal('la liste part de « aucun délai »', DELAIS_PROPOSES[0], 0)
verifier('elle reste dans les bornes de la base',
  DELAIS_PROPOSES.every(m => m >= 0 && m <= 20160), JSON.stringify(DELAIS_PROPOSES))
verifier('elle est triée', DELAIS_PROPOSES.every((m, i) => i === 0 || m > DELAIS_PROPOSES[i - 1]))
// 🔴 QUATRE CHOIX, ET PAS UN DE PLUS (Alex, 04/09). Les courtes durees sont le
// travail de la CLOTURE DU CRENEAU, qui vaut pour tout le catalogue et qui est
// en production depuis le 09/08. Les mettre aussi sur l article fabriquerait
// deux reglages voisins dont un seul agit : exactement le defaut retire le
// matin meme avec le champ « Delai » des creneaux.
egal('🔴 la liste tient en quatre choix', DELAIS_PROPOSES.length, 4)
egal('et ils se comptent en JOURS, jamais en heures',
  DELAIS_PROPOSES, [0, 1440, 2880, 4320])
verifier('🔴 aucune duree courte ne concurrence la cloture du creneau',
  !DELAIS_PROPOSES.some(m => m > 0 && m < 1440), JSON.stringify(DELAIS_PROPOSES))
verifier('elle couvre la tarte et les 72 h',
  [1440, 2880, 4320].every(m => DELAIS_PROPOSES.includes(m)))
// 🔴 UNE VALEUR HORS LISTE NE DOIT JAMAIS DISPARAÎTRE EN SILENCE. Le commerçant
// enregistrerait son prix et perdrait son délai sans qu'aucun écran ne le dise.
egal('🔴 un délai hors liste est ajouté, à sa place',
  choixDeDelai(2160), [0, 1440, 2160, 2880, 4320])
egal('une valeur déjà dans la liste ne se duplique pas',
  choixDeDelai(1440), DELAIS_PROPOSES)
egal('une valeur absente ne change rien', choixDeDelai(null), DELAIS_PROPOSES)
egal('zéro non plus', choixDeDelai(0), DELAIS_PROPOSES)
egal('le choix « aucun » se dit en clair',
  libelleChoixDelai(0), 'Aucun délai, disponible tout de suite')
egal('et les autres disent le geste',
  libelleChoixDelai(2880), 'Commande 2 jours à l\'avance')

verifier('sans délai, aucune mention sur la carte', mentionArticle(0) === null)
egal('la mention dit le geste', mentionArticle(60), 'Commande 1 h à l\'avance')
egal('et pour 48 h aussi', mentionArticle(2880), 'Commande 2 jours à l\'avance')

egal('aujourd’hui, l’heure suffit',
  libelleMoment({ jour: MARDI, heure: '11:00', aujourdhui: MARDI }), 'à 11 h')
egal('demain se dit « demain »',
  libelleMoment({ jour: MERCREDI, heure: '09:00', aujourdhui: MARDI }), 'demain à 9 h')
egal('🔴 au-delà, on nomme le jour',
  libelleMoment({ jour: JEUDI, heure: '10:30', aujourdhui: MARDI }), 'jeudi à 10 h 30')
egal('sans repère de jour, l’heure seule',
  libelleMoment({ heure: '10:00' }), 'à 10 h')
egal('sans rien, rien', libelleMoment({}), '')

verifier('sans délai, aucun avertissement', avertissementDelai({ minutes: 0 }) === null)
{
  const texte = avertissementDelai({ minutes: 2880, nom: 'Tarte aux pommes', moment: 'jeudi à 10 h' })
  verifier('🔴 l’avertissement nomme l’article', /Tarte aux pommes/.test(texte), texte)
  verifier('🔴 il dit la durée', /2 jours/.test(texte), texte)
  verifier('🔴 et il dit quand on peut venir', /jeudi à 10 h/.test(texte), texte)
}
{
  // ⚠️ ON ANNONCE L'ÉTAT, PAS NOTRE GESTE. Le Yopper se moque de savoir qu'on a
  // masqué des créneaux ; il veut savoir s'il peut venir.
  const texte = avertissementDelai({ minutes: 2880, nom: 'Tarte aux pommes', moment: null })
  verifier('quand aucun créneau ne convient, on le dit', /aucun créneau/.test(texte), texte)
  verifier('et on nomme quand même l’article', /Tarte aux pommes/.test(texte), texte)
}
egal('sans nom d’article, la phrase tient debout',
  avertissementDelai({ minutes: 60, moment: 'à 11 h' }),
  'Cette commande demande 1 h de préparation. Premier retrait possible à 11 h.')

// ⚠️ PAS DE TIRET CADRATIN EN FRANÇAIS, et pas d'injonction non plus : ces
// phrases s'affichent tous les jours, et une urgence permanente ne se lit plus.
{
  const textes = [
    mentionArticle(60), mentionArticle(2880),
    avertissementDelai({ minutes: 60, nom: 'X', moment: 'à 11 h' }),
    avertissementDelai({ minutes: 60, nom: 'X', moment: null }),
    refusDeMelange([TARTE_INVENDUE, SANDWICH], { maintenant: le(MARDI, '17:30') }),
    refusDeMelange([TARTE_INVENDUE], { maintenant: le(MARDI, '18:10') }),
  ].filter(Boolean).join(' ')
  verifier('🔴 aucun tiret cadratin', !textes.includes('—'), textes)
  verifier('aucun point d’exclamation', !textes.includes('!'), textes)
  for (const mot of ['dépêche', 'vite', 'urgent', 'erreur', 'invalide']) {
    verifier(`aucun mot de reproche : « ${mot} »`, !textes.toLowerCase().includes(mot), textes)
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// 8. LE CÂBLAGE DES ÉCRANS
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ CES GARDES-LÀ LISENT DU CODE, ET C'EST UN PIS-ALLER ASSUMÉ. Un module se
// mesure en l'exécutant ; une liaison JSX, non, sans monter un rendu complet.
// Elles sont donc TOUTES mesurées par le harnais de mutation : une garde qui
// lit du texte et que personne ne fait rougir ne prouve rien.
//
// ⚠️ ET ON DÉPOUILLE LA PROSE AVANT DE CHERCHER. Le commentaire qui explique
// pourquoi `delta_minutes` a été retiré contient forcément `delta_minutes`.
// Six fois en trois jours une garde a verdi sur mes propres explications.
{
  const FICHE = sansProse(readFileSync(new URL('../app/commander/[slug]/page.js', import.meta.url), 'utf8'))
  const BORD = sansProse(readFileSync(new URL('../app/dashboard/ConfigDashboard.js', import.meta.url), 'utf8'))

  // 🔴 LA MENTION SUR LA CARTE : les jours de vente et la date limite
  // (07/10), calculées par la fiche et passées à la carte.
  verifier('🔴 la carte affiche la mention des jours et de la date limite',
    /mentionDispo=\{mentionDisponibilite\(regleArticle\(a\)\)\}/.test(FICHE) && /const mention = mentionDispo/.test(FICHE) && /\{mention\}/.test(FICHE))
  // ⚠️ RIEN EN VITRINE : rien ne s'y commande, donc rien n'y attend.
  verifier('et pas en vitrine',
    /if \(article\.est_vitrine \|\| modeVitrine\) return null\s*const mention = mentionDispo/.test(FICHE))
  verifier('🔴 les deux listes d’articles passent la mention ET l’état du jour',
    (FICHE.match(/mentionDispo=\{mentionDisponibilite\(regleArticle\(a\)\)\} etatJour=\{etatJourArticle\(a\)\}/g) || []).length === 2)

  // 🔴 LE JOUR CHOISI EST L'ACCORD DU CLIENT (Alex, 07/10).
  verifier('🔴 l’ajout d’un article passe par le jour choisi, avant la variante',
    /function ajouterAuPanier\(article, options = null, variante = null\) \{\s*if \(refuseParDelai\(article, \{ article, options, variante \}\)\) return\s*if \(variante\)/.test(FICHE))
  verifier('🔴 l’ajout d’un lot ou d’un duo aussi, avec l’article pour ses jours de vente',
    /const delaiOffre = delaiDuDeal\(deal, article\)\s*if \(refuseParDelai\(\{ id: article\.id, nom: deal\.titre, delai_minutes: delaiOffre,/.test(FICHE))
  verifier('la proposition se calcule sur le panier, le jour choisi et le calendrier',
    /const p = propositionPourArticle\(\{\s*candidat: ligne, panier, jourChoisi: jour, aujourdhui: aujourdhuiISO\(\),\s*jours: joursDuCalendrier\(\), regle: regleArticle,/.test(FICHE)
    && /if \(p\.type === 'ok'\) return false\s*setPropositionJour/.test(FICHE))
  verifier('🔴 en expédition (pas de jour), rien n’est refusé',
    /const jour = jourDuPanier\(\)\s*if \(!jour\) return false/.test(FICHE)
    && /if \(estDetail\) return modeBoutiqueEff === 'retrait' \? jourRetraitBoutique : null/.test(FICHE))
  verifier('🔴 les jours de vente se lisent sur les réglages du jour de l’article',
    /indispo: joursIndisponibles\(stocksJour\?\.\[ligne\?\.id\]\)/.test(FICHE))
  verifier('🔴 accepter change le jour, puis rejoue l’ajout au rendu suivant',
    /passerAuJour\(p\.jour\)\s*if \(p\.rejouer\) setAjoutEnAttente\(p\.rejouer\)/.test(FICHE)
    && /if \(a\.deal\) ajouterDealAuPanier\(a\.deal, a\.article\)\s*else ajouterAuPanier\(a\.article, a\.options \|\| null, a\.variante \|\| null\)/.test(FICHE))
  verifier('la fenêtre s’affiche, avec ses deux choix',
    /\{propositionJour && \(\(\) => \{/.test(FICHE) && /<button onClick=\{accepterProposition\}/.test(FICHE))
  verifier('🔴 un panier qui ne va pas avec le jour grise « Continuer »',
    /blocage=\{blocagePanier\}/.test(FICHE) && /disabled=\{!!blocage\}/.test(FICHE) && /onClick=\{\(\) => \{ if \(!blocage\) onValider\(\) \}\}/.test(FICHE))
  verifier('et ramène au panier s’il arrive à l’étape du retrait',
    /if \(etape === 3 && blocagePanier\) allerEtape\(2\)/.test(FICHE))
  verifier('🔴 les tournées ne sont proposées que si tout le panier va ce jour-là',
    /if \(!creneauCommandable\(slot, \{ dateStr, instantDebut: brusselsInstant \}\)\.ok\) return false\s*return panierVaCeJour\(dateStr\)/.test(FICHE))

  // 🔴 LE CALENDRIER S'ALLONGE AVEC LE CATALOGUE, lu sur TOUT le catalogue.
  verifier('🔴 le calendrier de retrait et de livraison prend la longueur du catalogue',
    /const longueurCal = longueurDuCatalogue\(data\.commercant, data\.articles, data\.stocksJour\)/.test(FICHE)
    && /data\.blocagesCreneaux \|\| \[\], longueurCal\)/.test(FICHE) && /data\.blocagesLivraison \|\| \[\], longueurCal\)/.test(FICHE))
  verifier('et la boutique aussi', /horizon: Math\.max\(7, longueurDuCatalogue\(commercant, articles, stocksJour\)\)/.test(FICHE))
  verifier('🔴 la longueur passe vraiment dans le calendrier',
    /const horizon = Number\.isFinite\(Number\(longueur\)\) && Number\(longueur\) >= 1/.test(FICHE))

  // 🔴 L'HEURE BELGE DES DEUX CÔTÉS. Cet écran fabriquait son instant dans le
  // fuseau de la MACHINE : il aurait montré des créneaux que le serveur refuse.
  verifier('🔴 le sélecteur de créneau lit l’heure belge, comme le serveur',
    /creneauCommandable\(cr, \{ dateStr, instantDebut: brusselsInstant \}\)/.test(FICHE))
  verifier('🔴 et plus aucun instant fabriqué à la main dans le sélecteur',
    !/x\.setHours\(hh, mm \|\| 0, 0, 0\)/.test(FICHE))
  // ⚠️ RETIRÉES LE 07/10 : « le délai du panier filtre les créneaux » et
  // « l'avertissement nomme le coupable ». Le délai se compte en JOURS et le
  // jour est choisi avant le panier : aucune heure n'est plus à filtrer, et
  // l'article qui ne va pas est nommé à l'ajout et au panier (gardes au-dessus).

  verifier('🔴 le refus de mélange s’affiche',
    /\{refusMelange &&/.test(FICHE))

  // 🔴 LE LOT PERDAIT LE DÉLAI DE SON ARTICLE. `ajouterDealAuPanier` construit
  // sa ligne à la main : un lot « 3 tartes + 1 » partait pour le jour même.
  // ⚠️ RÉORIENTÉE LE 07/10 : la ligne prend `delaiDuDeal`, qui ajoute le
  // second article d'un duo (il était ignoré).
  verifier('🔴 la ligne d’un lot recopie le délai de son article (et du second d’un duo)',
    /delai_minutes: delaiOffre,/.test(FICHE)
    && /deal\?\.deal_type === 'bundle' && deal\.article2_id[\s\S]{0,120}return delaiDeLOffre\(article, second\)/.test(FICHE))
  // ⚠️ VISÉE SUR LA LIGNE DU PANIER (07/10) : l'appel du refus porte la même
  // fenêtre, et la garde y trouvait son texte pendant que la ligne la perdait.
  verifier('🔴 et la fenêtre de l’offre voyage avec elle',
    /delai_minutes: delaiOffre,\s*offre: \{ heure_debut: deal\.heure_debut, heure_fin: deal\.heure_fin \},/.test(FICHE))

  // 🔴 LE COMMERÇANT PEUT RÉGLER LE DÉLAI, ET IL EST ENREGISTRÉ.
  verifier('🔴 le formulaire article propose le délai',
    /choixDeDelai\(form\.delai_minutes\)/.test(BORD))
  // ⚠️ RÉORIENTÉE LE 30/09 : un article montré sans être vendu en ligne
  // (« en vitrine », tous métiers) n'a pas de délai non plus.
  verifier('🔴 et il l’enregistre en nombre',
    /delai_minutes: \(estVitrine \|\| !form\.vendable\) \? 0 : \(parseInt\(form\.delai_minutes, 10\) \|\| 0\)/.test(BORD))
  verifier('🔴 la valeur enregistrée est relue à l’ouverture',
    /delai_minutes: a\.delai_minutes \?\? 0/.test(BORD))

  // 🔴 LE RÉGLAGE MORT A DISPARU. `delta_minutes` était écrit à cinq endroits
  // et lu NULLE PART : le commerçant réglait un temps sans le moindre effet, à
  // côté d'un champ voisin qui, lui, fonctionnait.
  verifier('🔴 le champ « Délai » mort des créneaux a disparu du tableau de bord',
    !/delta_minutes/.test(BORD), 'delta_minutes est encore ecrit')
  verifier('et de la fiche client aussi', !/delta_minutes/.test(FICHE))
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. CE QUE LE SERVEUR CONSTRUIT VRAIMENT
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 C'EST LA SEULE PROTECTION RÉELLE. Tout ce que la fiche affiche explique,
// rien ne défend : un onglet ouvert depuis ce matin, un panier restauré au
// retour de Stripe ou une requête fabriquée ne passent par aucune de ses
// lignes. Le refus appartient à `create-commande`, et il s'appuie sur les
// lignes que `construireLignesCommande` a résolues EN BASE.
//
// ⚠️ ET CELLE-CI S'EXÉCUTE. On appelle la fonction avec un panier et un
// catalogue, et on regarde ce qu'elle rend. C'est ce qui distingue une garde
// d'un commentaire.
{
  const COMMERCE = { id: 'c1', tva_taux_defaut: 6, categorie: 'alimentaire' }
  const CATALOGUE = [
    { id: 'a1', nom: 'Baguette', prix: 1.2, actif: true, commercant_id: 'c1', temps_prepa: 1, delai_minutes: null },
    { id: 'a2', nom: 'Tarte aux pommes', prix: 18, actif: true, commercant_id: 'c1', temps_prepa: 5, delai_minutes: 2880 },
  ]
  const construire = (panier, dealsData = []) => construireLignesCommande({
    panier, articlesData: CATALOGUE, optionsValeurs: [], variantesData: [],
    dealsData, commercant: COMMERCE, regime: 'emporter', dateCommande: MARDI,
  })

  const simple = construire([{ id: 'a1', quantite: 2 }, { id: 'a2', quantite: 1 }])
  verifier('le panier serveur se construit', simple.ok === true, JSON.stringify(simple).slice(0, 200))
  // 🔴 LE DÉLAI VOYAGE JUSQU'À LA LIGNE DE COMMANDE. Sans lui, la garde du
  // serveur lirait zéro partout et laisserait tout passer, en silence.
  egal('🔴 la ligne de commande porte le délai de son article',
    simple.lignes.map(l => l.delai_minutes), [0, 2880])
  // 🔴 ET LE MODULE SAIT LIRE CETTE FORME-LÀ. La ligne serveur nomme son
  // article `article_nom`, le panier de la fiche le nomme `nom`.
  egal('🔴 le délai du panier serveur nomme l’article coupable',
    delaiDuPanier(simple.lignes), { minutes: 2880, nom: 'Tarte aux pommes' })

  // 🔴 LE LOT NE PERD PAS SON DÉLAI CÔTÉ SERVEUR, et c'est structurel : un lot
  // et une unité passent par le MÊME article résolu en base. C'est exactement
  // le défaut que la fiche avait, et que le serveur ne pouvait pas avoir.
  const LOT = {
    id: 'd1', titre: 'Lot 3 tartes + 1', prix_deal: 54, actif: true, commercant_id: 'c1',
    deal_type: 'lot', unites_par_deal: 4, article_id: 'a2', date_deal: MARDI,
  }
  const avecLot = construire([{ id: 'a2', quantite: 1, deal_id: 'd1' }], [LOT])
  verifier('le lot se construit', avecLot.ok === true, JSON.stringify(avecLot).slice(0, 200))
  egal('🔴 la ligne du lot garde les 48 h de sa tarte',
    avecLot.lignes.map(l => l.delai_minutes), [2880])
  egal('et un lot ordinaire n’est pas un invendu',
    avecLot.lignes.map(l => l.offre?.heure_fin ?? null), [null])
  // 🔴 L'OFFRE QUI A PRODUIT LA LIGNE, ET ELLE ÉTAIT JETÉE. Sans elle, rien ne
  // peut compter ce qui a été vendu sur une offre, donc rien ne peut la
  // plafonner : trois assiettes publiées, quinze proposées à moitié prix.
  egal('🔴 la ligne retient l’offre qui l’a produite',
    avecLot.lignes.map(l => l.deal_id), ['d1'])
  egal('et une ligne sans offre ne s’en invente pas',
    simple.lignes.map(l => l.deal_id), [null, null])

  // 🔴 L'INVENDU PORTE SA FENÊTRE JUSQU'AU SERVEUR, et elle annule le délai.
  const INVENDU = {
    id: 'd2', titre: 'Tarte aux pommes', prix_deal: 8, actif: true, commercant_id: 'c1',
    deal_type: 'lot', unites_par_deal: 1, article_id: 'a2', date_deal: MARDI,
    heure_debut: '15:00:00', heure_fin: '18:00:00',
  }
  const avecInvendu = construire([{ id: 'a2', quantite: 1, deal_id: 'd2' }], [INVENDU])
  verifier('l’invendu se construit', avecInvendu.ok === true, JSON.stringify(avecInvendu).slice(0, 200))
  egal('🔴 la fenêtre de l’offre arrive jusqu’à la ligne de commande',
    avecInvendu.lignes.map(l => l.offre?.heure_fin ?? null), ['18:00:00'])
  egal('🔴 et le serveur en conclut qu’il n’y a plus de délai',
    delaiDuPanier(avecInvendu.lignes), { minutes: 0, nom: null })

  // 🔴 LE MÉLANGE IMPOSSIBLE EST VU SUR LES LIGNES SERVEUR, pas sur le panier
  // du navigateur. À 17 h 30 il ne reste que trente minutes de fenêtre, et la
  // tarte à l'unité en demande 48.
  const melange = construire(
    [{ id: 'a2', quantite: 1, deal_id: 'd2' }, { id: 'a2', quantite: 1 }], [INVENDU])
  const refusServeur = refusDeMelange(melange.lignes, { maintenant: le(MARDI, '17:30') })
  verifier('🔴 le serveur refuse le mélange invendu + article lent',
    refusServeur !== null, String(refusServeur))
  verifier('et son message nomme l’article', /Tarte aux pommes/.test(refusServeur || ''), String(refusServeur))

  // 🔴 LE JOUR, VU SUR LES LIGNES SERVEUR (07/10) : la tarte construite en
  // base porte ses 2 jours, et la règle du serveur la refuse pour aujourd'hui,
  // l'accepte pour le surlendemain. La baguette va tous les jours.
  {
    const parNom = Object.fromEntries(simple.lignes.map(l => [l.article_nom, l]))
    egal('🔴 la ligne serveur de la tarte se lit en jours', delaiEnJours(parNom['Tarte aux pommes']), 2)
    egal('🔴 refusée pour aujourd’hui, avec son premier jour',
      refusDuJour({ delaiJours: delaiEnJours(parNom['Tarte aux pommes']), jour: MARDI, aujourdhui: MARDI }), { raison: 'delai', plancher: JEUDI })
    verifier('acceptée pour jeudi (J+2)',
      refusDuJour({ delaiJours: delaiEnJours(parNom['Tarte aux pommes']), jour: JEUDI, aujourdhui: MARDI }) === null)
    verifier('🔴 la baguette part avec elle jeudi', refusDuJour({ delaiJours: delaiEnJours(parNom.Baguette), jour: JEUDI, aujourdhui: MARDI }) === null)
  }

  // ⚠️ LES COLONNES DOIVENT ÊTRE DEMANDÉES, sans quoi tout ce qui précède lit
  // `undefined` et conclut « aucun délai ». Une colonne absente d'un select est
  // LE défaut le plus fréquent de ce projet, six fois.
  verifier('🔴 le select des articles demande le délai',
    /\bdelai_minutes\b/.test(SELECT_ARTICLES), SELECT_ARTICLES)
  verifier('🔴 le select des deals demande la fenêtre',
    /\bheure_debut\b/.test(SELECT_DEALS) && /\bheure_fin\b/.test(SELECT_DEALS), SELECT_DEALS)
}

// ═══════════════════════════════════════════════════════════════════════════
// 10. LE SERVEUR REFUSE VRAIMENT
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ CES GARDES-LÀ LISENT LA ROUTE, faute de pouvoir la faire tourner sans
// Stripe ni base. Elles sont toutes mesurées par le harnais de mutation.
{
  const ROUTE = sansProse(readFileSync(new URL('../app/api/stripe/checkout/create-commande/route.js', import.meta.url), 'utf8'))

  verifier('🔴 elle refuse le mélange avec l’invendu avant le paiement',
    /refusDeMelange\(lignes\)/.test(ROUTE) && /refusMelange\)/.test(ROUTE))
  // 🔴 07/10 : LE DÉLAI EN JOURS, LIGNE PAR LIGNE, au jour choisi.
  verifier('🔴 elle juge chaque ligne en jours de calendrier au jour de la commande',
    /for \(const l of lignes\) \{\s*const n = delaiEnJours\(l\)\s*const refus = refusDuJour\(\{ delaiJours: n, jour: date_commande, aujourdhui \}\)\s*if \(refus\?\.raison === 'delai'\) \{/.test(ROUTE))
  verifier('🔴 partout sauf l’expédition (pas de jour de retrait)',
    /if \(!estBoutique \|\| estRetraitBoutique\) \{\s*const aujourdhui = jourBruxelles\(\)\s*for \(const l of lignes\)/.test(ROUTE))
  verifier('et le refus nomme l’article et son premier jour',
    /se commande \$\{n\} jour\$\{n > 1 \? 's' : ''\} à l'avance : le plus tôt, c'est \$\{libelleMoment\(\{ jour: refus\.plancher, aujourdhui \}\)\}/.test(ROUTE))
  verifier('🔴 plus de refus « deux délais » ni de compte en minutes',
    !/refusDelaisMelanges|debutCreneau\.getTime\(\) < pret\.getTime\(\)|premierJourBoutique\(/.test(ROUTE))
  verifier('🔴 elle lit le délai du second article d’un duo, sur CE commerce',
    /\.from\('articles'\)\.select\('id, delai_minutes'\)\s*\.in\('id', seconds\)\.eq\('commercant_id', commercant\.id\)/.test(ROUTE)
    && /l\.delai_minutes = delaiDeLOffre\(\{ delai_minutes: l\.delai_minutes \}, parId\[String\(l\.deal_article2_id\)\]\)/.test(ROUTE))
  verifier('🔴 et une lecture en échec refuse au lieu de vendre pour aujourd’hui',
    /if \(errArts2\) \{\s*return NextResponse\.json/.test(ROUTE))
  // ⚠️ L'ORDRE COMPTE : le duo doit être corrigé AVANT la règle qui le lit.
  verifier('et le duo est corrigé avant que le délai soit jugé',
    ROUTE.indexOf('l.delai_minutes = delaiDeLOffre(') > 0
    && ROUTE.indexOf('l.delai_minutes = delaiDeLOffre(') < ROUTE.indexOf('const n = delaiEnJours(l)'))
  // 🔴 L'HORIZON S'ALLONGE AVEC LE CATALOGUE, lu en entier (pas le panier).
  verifier('🔴 l’horizon se calcule sur TOUT le catalogue actif, avec ses jours de vente',
    /supabase\.from\('articles'\)\.select\('id, delai_minutes'\)\.eq\('commercant_id', commercant\.id\)\.eq\('actif', true\)/.test(ROUTE)
    && /supabase\.from\('article_stock_jour'\)\.select\('article_id, jour_semaine'\)\.eq\('commercant_id', commercant\.id\)\.eq\('actif', false\)/.test(ROUTE)
    && /const horizon = longueurCalendrier\(\{\s*horizon: commercant\.horizon_commande,/.test(ROUTE))
  // 🔴 ET LES JOURS DE VENTE Y ENTRENT : sans eux, un pain du seul samedi sans
  // délai n'allongerait rien, et samedi serait refusé le lundi.
  verifier('🔴 les jours de vente de chaque article entrent dans le calcul',
    /for \(const o of joursOff \|\| \[\]\) \(offParArticle\[o\.article_id\] \|\|= \[\]\)\.push\(o\.jour_semaine\)/.test(ROUTE)
    && /articles: \(catalogue \|\| \[\]\)\.map\(a => \(\{ delaiJours: delaiEnJours\(a\), indispo: offParArticle\[a\.id\] \|\| \[\] \}\)\)/.test(ROUTE))
  verifier('🔴 et une lecture du catalogue en échec refuse',
    /if \(errCat \|\| errOff\) \{\s*return NextResponse\.json/.test(ROUTE))

  // ⚠️ L'HORIZON EST UN PLAFOND, le délai un PLANCHER. Les deux manquaient.
  verifier('🔴 elle applique l’horizon du commerçant',
    /commercant\.horizon_commande/.test(ROUTE) && /date_commande > dernier/.test(ROUTE))
  verifier('et elle refuse aussi une date déjà passée',
    /date_commande < aujourdhui/.test(ROUTE))
  verifier('🔴 l’horizon est demandé en base',
    /horizon_commande, plan/.test(ROUTE), 'absent du select commercant')
  // ⚠️ UN SEUL RELEVÉ DES FERMETURES, LU DEUX FOIS. Deux relevés auraient
  // interrogé la base pour la même réponse, sans garantie du même instant.
  verifier('les fermetures sont relevées une fois et partagées',
    /let fermeturesCommercant = \[\]/.test(ROUTE))
}

console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Délai de commande vert.')
