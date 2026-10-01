// IMPRIMER L'ÉTIQUETTE DEPUIS LE NAVIGATEUR (AirPrint sur iPhone et iPad,
// Mopria ou le service Brother sur Android, le pilote sur ordinateur).
//
// C'est la voie de SECOURS, et la première qu'on teste. La voie normale sera
// l'app de comptoir, qui imprime sans fenêtre (décision du 01/10). Ce que porte
// l'étiquette vient de `lib/etiquette-commande.js`, partagé par les deux.
//
// 🔴 TROIS RÈGLES, ET CHACUNE A SA RAISON.
//
// 1. L'IMPRESSION PART DANS LE GESTE, AVANT TOUT APPEL RÉSEAU. Safari n'ouvre la
//    fenêtre d'impression que pendant le geste de l'utilisateur. Si le code
//    attend d'abord le serveur, le geste est expiré et RIEN NE SORT, sans le
//    moindre message. D'où un module sans React : l'étiquette est posée dans la
//    page et imprimée dans la même seconde, sans attendre un rendu.
//
// 2. L'IMPRESSION NE BLOQUE JAMAIS LE CHANGEMENT DE STATUT (« en préparation »
//    depuis le 01/10). Tout est sous `try` et la fonction rend un booléen : pas
//    de papier, imprimante éteinte, Wi-Fi tombé, la commande avance quand même
//    et le client est prévenu quand même. Sinon un rouleau vide arrête le
//    comptoir.
//
// 3. LE STYLE D'IMPRESSION NE SURVIT PAS À L'IMPRESSION. Il cache tout sauf
//    l'étiquette et fixe le format de la page : laissé en place, il ferait
//    imprimer une étiquette à qui imprime ensuite une affichette dans la même
//    séance. Il est retiré à `afterprint`, avec un filet si l'événement ne
//    vient pas.
//
// ⚠️ LE RÉGLAGE EST UN CONFORT D'APPAREIL, pas une donnée du commerce : c'est
// l'appareil posé à côté de la Brother qui imprime, pas le GSM du patron en
// réunion. `localStorage`, lu et écrit sous `try`, désactivé par défaut : un
// commerçant sans imprimante ne doit jamais voir surgir une fenêtre
// d'impression.

import { FORMAT_ETIQUETTE, contenuEtiquette, etiquetteConcernee, hauteurEtiquetteMm } from './etiquette-commande'

export const CLE_ETIQUETTES_APPAREIL = 'yoppaa_etiquettes_appareil'
const ID_ZONE = 'yoppaa-etiquette'
const ID_STYLE = 'yoppaa-etiquette-style'
// Le filet, si `afterprint` ne vient jamais : assez long pour qu'une fenêtre
// d'impression restée ouverte n'en soit pas privée.
const FILET_MS = 120000

export function lireImpressionActive() {
  try { return window.localStorage.getItem(CLE_ETIQUETTES_APPAREIL) === '1' } catch { return false }
}

export function ecrireImpressionActive(actif) {
  try {
    if (actif) window.localStorage.setItem(CLE_ETIQUETTES_APPAREIL, '1')
    else window.localStorage.removeItem(CLE_ETIQUETTES_APPAREIL)
  } catch { /* confort d'appareil : la séance continue sans */ }
}

// La feuille d'impression. Tout est en millimètres et en points : chaque
// étiquette fait une page à sa taille, le reste de l'écran disparaît.
// ⚠️ PLUSIEURS SACS = PLUSIEURS PAGES D'UNE MÊME IMPRESSION, donc une seule
// fenêtre et un seul « Imprimer » : la Brother coupe entre chaque page.
export function feuilleEtiquette(format = FORMAT_ETIQUETTE, hauteurMm = format.hauteurMm) {
  const { largeurMm: l, margeMm: m } = format
  const h = hauteurMm
  return [
    `#${ID_ZONE} { display: none; }`,
    '@media print {',
    `  @page { size: ${l}mm ${h}mm; margin: 0; }`,
    '  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; height: auto !important; min-height: 0 !important; overflow: visible !important; }',
    `  body > *:not(#${ID_ZONE}) { display: none !important; }`,
    `  #${ID_ZONE} { display: block !important; color: #000; background: #fff; font-family: Arial, Helvetica, sans-serif; }`,
    `  #${ID_ZONE} .etiquette { box-sizing: border-box; width: ${l}mm; height: ${h}mm; padding: ${m}mm; overflow: hidden; break-after: page; page-break-after: always; }`,
    `  #${ID_ZONE} .etiquette:last-child { break-after: auto; page-break-after: auto; }`,
    `  #${ID_ZONE} .tete { display: flex; justify-content: space-between; align-items: baseline; gap: 2mm; }`,
    `  #${ID_ZONE} .ref { font-size: 22pt; font-weight: 900; line-height: 1.05; letter-spacing: -0.5pt; }`,
    `  #${ID_ZONE} .sac { font-size: 12pt; font-weight: 900; white-space: nowrap; }`,
    `  #${ID_ZONE} .client { font-size: 14pt; font-weight: 800; line-height: 1.15; margin-top: 1mm; }`,
    `  #${ID_ZONE} .adresse { font-size: 9.5pt; font-weight: 700; line-height: 1.2; margin-top: 0.8mm; max-height: 7mm; overflow: hidden; }`,
    `  #${ID_ZONE} .quand { font-size: 10pt; font-weight: 700; line-height: 1.2; margin-top: 1mm; }`,
    `  #${ID_ZONE} .liste { margin-top: 1.5mm; padding-top: 1mm; border-top: 0.3mm solid #000; }`,
    `  #${ID_ZONE} .article { font-size: 9pt; font-weight: 800; line-height: 1.25; }`,
    `  #${ID_ZONE} .options { font-size: 8pt; font-weight: 600; line-height: 1.2; margin-left: 3mm; }`,
    `  #${ID_ZONE} .bas { display: flex; justify-content: space-between; align-items: center; gap: 2mm; margin-top: 2mm; font-size: 10pt; font-weight: 700; }`,
    `  #${ID_ZONE} .du { background: #000; color: #fff; padding: 0.6mm 1.6mm; font-weight: 900; -webkit-print-color-adjust: exact; print-color-adjust: exact; }`,
    '}',
  ].join('\n')
}

// Les lignes de l'étiquette. ⚠️ `textContent` seulement, jamais de HTML : le
// nom vient du client, et un nom n'a pas à devenir du code dans la page.
function lignesEtiquette(doc, contenu) {
  const ligne = (classe, texte, balise = 'div') => {
    const el = doc.createElement(balise)
    el.className = classe
    el.textContent = texte
    return el
  }
  const lignes = []
  if (contenu.reference || contenu.sac) {
    const tete = doc.createElement('div')
    tete.className = 'tete'
    tete.appendChild(ligne('ref', contenu.reference || '', 'span'))
    if (contenu.sac) tete.appendChild(ligne('sac', contenu.sac, 'span'))
    lignes.push(tete)
  }
  lignes.push(ligne('client', contenu.client || 'Client'))
  if (contenu.adresse) lignes.push(ligne('adresse', contenu.adresse))
  if (contenu.quand) lignes.push(ligne('quand', contenu.quand))
  // Le bon de préparation : chaque article, puis ses options.
  if (Array.isArray(contenu.lignes) && contenu.lignes.length > 0) {
    const liste = doc.createElement('div')
    liste.className = 'liste'
    for (const l of contenu.lignes) {
      liste.appendChild(ligne('article', l.article))
      if (l.options) liste.appendChild(ligne('options', l.options))
    }
    lignes.push(liste)
  }
  if (contenu.articles || contenu.paiement) {
    const bas = doc.createElement('div')
    bas.className = 'bas'
    const gauche = doc.createElement('span')
    gauche.textContent = contenu.articles || ''
    bas.appendChild(gauche)
    if (contenu.paiement) {
      const droite = doc.createElement('span')
      droite.className = contenu.aEncaisser ? 'du' : 'paye'
      droite.textContent = contenu.paiement
      bas.appendChild(droite)
    }
    lignes.push(bas)
  }
  return lignes
}

let nettoyage = null

function retirer(doc) {
  doc.getElementById(ID_STYLE)?.remove()
  doc.getElementById(ID_ZONE)?.remove()
}

/**
 * Imprime une étiquette. Rend `true` si la fenêtre d'impression a été
 * demandée, `false` sinon. Ne lève JAMAIS d'erreur.
 */
export function imprimerEtiquette(contenus) {
  try {
    // Une étiquette, ou une par sac (`etiquettesPourSacs`).
    const liste = (Array.isArray(contenus) ? contenus : [contenus]).filter(Boolean)
    if (liste.length === 0 || typeof window === 'undefined' || typeof window.print !== 'function') return false
    const doc = window.document
    // Une impression précédente dont le filet n'est pas encore passé.
    if (nettoyage) nettoyage()

    const style = doc.createElement('style')
    style.id = ID_STYLE
    style.textContent = feuilleEtiquette(FORMAT_ETIQUETTE, hauteurEtiquetteMm(liste[0]))
    doc.head.appendChild(style)
    const zone = doc.createElement('div')
    zone.id = ID_ZONE
    zone.setAttribute('aria-hidden', 'true')
    for (const contenu of liste) {
      const page = doc.createElement('div')
      page.className = 'etiquette'
      for (const el of lignesEtiquette(doc, contenu)) page.appendChild(el)
      zone.appendChild(page)
    }
    doc.body.appendChild(zone)

    let filet = null
    const fin = () => {
      window.removeEventListener('afterprint', fin)
      if (filet) clearTimeout(filet)
      retirer(doc)
      nettoyage = null
    }
    nettoyage = fin
    window.addEventListener('afterprint', fin)
    filet = setTimeout(fin, FILET_MS)

    window.print()
    return true
  } catch {
    try { if (nettoyage) nettoyage() } catch { /* rien de plus à faire */ }
    return false
  }
}

/**
 * Le geste du comptoir : si CET appareil imprime et que la commande est de
 * celles qui ont une étiquette, on l'imprime. À appeler DANS le geste, avant
 * le premier `await` (règle 1).
 */
export function imprimerSiActive(commande, { categorie = null } = {}) {
  if (!etiquetteConcernee(commande) || !lireImpressionActive()) return false
  return imprimerEtiquette(contenuEtiquette(commande, { categorie }))
}
