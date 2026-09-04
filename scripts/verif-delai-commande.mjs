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
} from '../lib/delai-commande.js'
import { brusselsInstant } from '../lib/timezone.js'

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

console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Délai de commande vert.')
