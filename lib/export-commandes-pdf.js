// L'EXPORT DES COMMANDES EN PDF (Alex, 11/10 : « j'aimerais que le
// téléchargement export soit en PDF »).
//
// Un A4 couché, lisible à l'impression : un bandeau par jour (nombre de
// commandes, chiffre), puis un tableau, une commande par ligne, séparées par un
// filet. Sur plusieurs jours, le total par article de la période en tête.
//
// ⚠️ DEUX TEMPS. `donneesExport` est PUR (il range, compte, formule : le banc
// l'exécute) ; `pdfCommandes` ne fait que dessiner ce qu'il reçoit, avec
// `jspdf` chargé à la demande (plusieurs centaines de ko : jamais au premier
// affichage du tableau de bord).
//
// ⚠️ LES POLICES DE BASE DU PDF NE CONNAISSENT QUE L'ALPHABET LATIN (WinAnsi) :
// un emoji ou une flèche dans un nom de client sortirait en caractères
// illisibles. `texteSur` remplace ce qui ne s'imprime pas.

import { trierParHeure, heureDeRetrait, lignesCourtes } from './vue-commandes.js'
import { LIBELLES_STATUT_COMMANDE, estCommandeAnnulee } from './statuts-commande.js'
import { referenceCommande } from './numero-commande.js'
import { etatPaiementCommande } from './rdv-paiement.js'

const jourDe = (c) => String(c?.date_commande || c?.created_at || '').slice(0, 10)
const montant = (n) => `${(Math.round((Number(n) || 0) * 100) / 100).toFixed(2).replace('.', ',')} €`
const MODES = { livraison: 'Livraison', expedition: 'Colis' }

/** « lundi 12 octobre » */
export function jourEnLettres(jour) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(jour || ''))) return String(jour || '')
  return new Date(`${jour}T12:00:00Z`).toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
}

// Les caractères que les polices de base impriment : Latin-1, plus les
// signes typographiques de WinAnsi (€, guillemets courbes, tirets, points).
const EN_PLUS = new Set(['€', '‘', '’', '“', '”', '…', '–', '—', '•', '‰', 'Œ', 'œ', 'Š', 'š', 'Ž', 'ž', 'Ÿ'])
export function texteSur(s) {
  return Array.from(String(s ?? '').normalize('NFC').replace(/→/g, '->').replace(/ | /g, ' '))
    .filter(ch => ch.charCodeAt(0) <= 0xFF || EN_PLUS.has(ch)).join('')
}

/**
 * Les commandes d'une période, rangées pour le PDF.
 * ⚠️ LES PAIEMENTS ÉCHOUÉS N'Y SONT PAS (jamais devenus des commandes) ; les
 * ANNULÉES Y RESTENT, marquées, mais ne comptent ni dans le chiffre ni dans
 * le total par article : un export qui les cache ferait mentir le nombre de
 * commandes, un total qui les compte ferait mentir l'argent.
 */
export function donneesExport(commandes = [], { debut, fin, categorie = null } = {}) {
  const liste = trierParHeure((Array.isArray(commandes) ? commandes : [])
    .filter(c => c && c.statut !== 'annulee_paiement_ko')
    .filter(c => { const j = jourDe(c); return (!debut || j >= debut) && (!fin || j <= fin) }))
  const parJour = new Map()
  const production = new Map()
  let total = 0
  for (const c of liste) {
    const annulee = estCommandeAnnulee(c)
    const j = jourDe(c)
    if (!parJour.has(j)) parJour.set(j, { jour: j, libelle: jourEnLettres(j), commandes: [], total: 0 })
    const bloc = parJour.get(j)
    bloc.commandes.push({
      heure: heureDeRetrait(c) || '',
      ref: referenceCommande(c) ? `#${referenceCommande(c)}` : '',
      client: c.client_nom || '',
      telephone: c.client_telephone || '',
      mode: MODES[c.mode_retrait] || 'Retrait',
      articles: lignesCourtes(c).map(l => l.options ? `${l.texte} (${l.options})` : l.texte),
      note: c.notes_client || '',
      total: montant(c.total),
      paiement: etatPaiementCommande(c, { categorie })?.libelle || '',
      statut: LIBELLES_STATUT_COMMANDE[c.statut] || c.statut || '',
      annulee,
    })
    if (annulee) continue
    bloc.total += Number(c.total) || 0
    total += Number(c.total) || 0
    for (const l of c.commande_articles || []) {
      const nom = l?.article_nom || l?.article?.nom || 'Article retiré du catalogue'
      production.set(nom, (production.get(nom) || 0) + (Number(l?.quantite) || 0))
    }
  }
  return {
    nombre: liste.length,
    total: montant(total),
    jours: [...parJour.values()].map(b => ({ ...b, total: montant(b.total) })),
    production: [...production.entries()].map(([nom, quantite]) => ({ nom, quantite }))
      .sort((a, b) => b.quantite - a.quantite || a.nom.localeCompare(b.nom, 'fr')),
  }
}

// ─── LE DESSIN ──────────────────────────────────────────────────────────────
// A4 couché, en millimètres. Les colonnes font 273 mm (297 − 2 × 12).
const MARGE = 12
const COLONNES = [
  { cle: 'heure', titre: 'Heure', l: 15 },
  { cle: 'ref', titre: 'N°', l: 18 },
  { cle: 'client', titre: 'Client', l: 44 },
  { cle: 'telephone', titre: 'Téléphone', l: 28 },
  { cle: 'articles', titre: 'Articles', l: 96 },
  { cle: 'total', titre: 'Total', l: 20, droite: true },
  { cle: 'paiement', titre: 'Paiement', l: 27 },
  { cle: 'statut', titre: 'Statut', l: 25 },
]
const VIOLET = [107, 53, 196]
const ENCRE = [26, 8, 64]
const GRIS = [91, 97, 112]
const FILET = [228, 220, 242]

/**
 * Le PDF, en Blob. `periode` = { debut, fin }.
 */
export async function pdfCommandes(donnees, { commerceNom = '', periode } = {}) {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const L = 297, H = 210, BAS = H - 14
  let y = MARGE
  const t = (s) => texteSur(s)

  // En-tête du document
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16); pdf.setTextColor(...ENCRE)
  pdf.text(t(`Commandes · ${commerceNom || 'Yoppaa'}`), MARGE, y + 5)
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(...GRIS)
  const quand = periode?.debut === periode?.fin
    ? jourEnLettres(periode?.debut)
    : `du ${jourEnLettres(periode?.debut)} au ${jourEnLettres(periode?.fin)}`
  pdf.text(t(`${quand} · ${donnees.nombre} commande${donnees.nombre > 1 ? 's' : ''} · ${donnees.total} (hors annulées)`), MARGE, y + 11)
  y += 17

  // Le total par article de la période, en encadré (plusieurs jours seulement).
  if (periode?.debut !== periode?.fin && donnees.production.length > 0) {
    const parColonne = Math.ceil(donnees.production.length / 4)
    const hauteur = 9 + parColonne * 5
    pdf.setDrawColor(...FILET); pdf.setFillColor(251, 250, 255)
    pdf.roundedRect(MARGE, y, L - 2 * MARGE, hauteur, 2, 2, 'FD')
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(...VIOLET)
    pdf.text(t('Total par article sur la période'), MARGE + 4, y + 6)
    pdf.setFont('helvetica', 'normal'); pdf.setTextColor(...ENCRE)
    donnees.production.forEach((a, i) => {
      const col = Math.floor(i / parColonne), lig = i % parColonne
      pdf.text(t(`${a.quantite} × ${a.nom}`), MARGE + 4 + col * 68, y + 11 + lig * 5)
    })
    y += hauteur + 6
  }

  const enteteTableau = () => {
    pdf.setFillColor(243, 240, 250); pdf.rect(MARGE, y, L - 2 * MARGE, 7, 'F')
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5); pdf.setTextColor(...GRIS)
    let x = MARGE
    for (const c of COLONNES) {
      pdf.text(t(c.titre), c.droite ? x + c.l - 2 : x + 2, y + 4.8, c.droite ? { align: 'right' } : undefined)
      x += c.l
    }
    y += 7
  }
  const nouvellePage = () => { pdf.addPage(); y = MARGE }

  // Le bandeau du jour. 🔴 (Alex, 11/10) RÉPÉTÉ, avec « (suite) », quand un
  // jour continue sur la page suivante : la page 2 commençait par un tableau
  // sans dire de quel jour il s'agissait.
  const bandeau = (jour, suite) => {
    pdf.setFillColor(...VIOLET); pdf.roundedRect(MARGE, y, L - 2 * MARGE, 8, 1.5, 1.5, 'F')
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.setTextColor(255, 255, 255)
    const lib = jour.libelle.charAt(0).toUpperCase() + jour.libelle.slice(1)
    pdf.text(t(suite ? `${lib} (suite)` : `${lib} · ${jour.commandes.length} commande${jour.commandes.length > 1 ? 's' : ''}`), MARGE + 3, y + 5.5)
    if (!suite) pdf.text(t(jour.total), L - MARGE - 3, y + 5.5, { align: 'right' })
    y += 10
    enteteTableau()
  }
  const largeur = (cle) => COLONNES.find(c => c.cle === cle).l - 4

  for (const jour of donnees.jours) {
    if (y + 24 > BAS) nouvellePage()
    bandeau(jour, false)

    jour.commandes.forEach((r, i) => {
      pdf.setFontSize(9.5)
      const lignesArticles = r.articles.flatMap(a => pdf.splitTextToSize(t(a), largeur('articles')))
      const lignesNote = r.note ? pdf.splitTextToSize(t(`« ${r.note} »`), largeur('articles')) : []
      const lignesClient = pdf.splitTextToSize(t(r.client), largeur('client'))
      // 🔴 (Alex, 11/10) LE STATUT ET LE PAIEMENT PASSENT À LA LIGNE au lieu
      // d'être coupés (« Annulée par le » sans « commerçant »).
      const lignesStatut = pdf.splitTextToSize(t(r.mode !== 'Retrait' ? `${r.statut} · ${r.mode}` : r.statut), largeur('statut') + 2)
      const lignesPaiement = pdf.splitTextToSize(t(r.paiement), largeur('paiement') + 2)
      const n = Math.max(1, lignesArticles.length + lignesNote.length, lignesClient.length, lignesStatut.length, lignesPaiement.length)
      const hauteur = 3 + n * 4.4
      if (y + hauteur > BAS) { nouvellePage(); bandeau(jour, true) }
      if (i % 2 === 1) { pdf.setFillColor(251, 250, 255); pdf.rect(MARGE, y, L - 2 * MARGE, hauteur, 'F') }
      let x = MARGE
      for (const c of COLONNES) {
        pdf.setFont('helvetica', c.cle === 'heure' || c.cle === 'ref' || c.cle === 'total' ? 'bold' : 'normal')
        pdf.setTextColor(...(r.annulee ? GRIS : ENCRE))
        if (c.cle === 'articles') {
          pdf.text(lignesArticles, x + 2, y + 4.4)
          if (lignesNote.length) {
            pdf.setFont('helvetica', 'italic'); pdf.setTextColor(...VIOLET)
            pdf.text(lignesNote, x + 2, y + 4.4 + lignesArticles.length * 4.4)
          }
        } else if (c.cle === 'client') {
          pdf.text(lignesClient, x + 2, y + 4.4)
        } else if (c.cle === 'statut') {
          pdf.text(lignesStatut, x + 2, y + 4.4)
        } else if (c.cle === 'paiement') {
          pdf.text(lignesPaiement, x + 2, y + 4.4)
        } else {
          pdf.text(pdf.splitTextToSize(t(r[c.cle]), c.l - 3)[0] || '', c.droite ? x + c.l - 2 : x + 2, y + 4.4, c.droite ? { align: 'right' } : undefined)
        }
        x += c.l
      }
      y += hauteur
      // Le filet qui sépare chaque commande.
      pdf.setDrawColor(...FILET); pdf.setLineWidth(0.25); pdf.line(MARGE, y, L - MARGE, y)
    })
    y += 6
  }

  // Le pied de chaque page
  const pages = pdf.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p)
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(...GRIS)
    pdf.text(t(`Yoppaa · ${commerceNom || ''}`), MARGE, H - 7)
    pdf.text(`${p} / ${pages}`, L - MARGE, H - 7, { align: 'right' })
  }
  return pdf.output('blob')
}
