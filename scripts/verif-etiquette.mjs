// BANC : L'ÉTIQUETTE DE COMMANDE (01/10).
//
// Alex : « quand le commerçant clique sur commande prête, l'étiquette sort.
// Simple, basic et suffisant », puis « ça doit être stable et fiable, outil de
// travail des commerçants ».
//
// Ce banc EXÉCUTE :
//   1. ce que porte l'étiquette (`lib/etiquette-commande.js`) ;
//   2. l'impression elle-même (`lib/impression-etiquette.js`), sur un faux
//      navigateur : ce qui est posé dans la page, ce qui en est retiré, ce qui
//      se passe quand l'imprimante ou le stockage lâchent ;
// puis il VISE les deux endroits du geste (tableau de bord et Poste), parce
// que la règle qui compte le plus, « avant le premier await », ne s'exécute
// pas hors d'un vrai Safari.
//
//   npm run verif:etiquette

import { readFileSync } from 'node:fs'
import { sansProse } from './lire-code.mjs'
import {
  FORMAT_ETIQUETTE, etiquetteConcernee, nomEtiquette, quandEtiquette, articlesEtiquette,
  contenuEtiquette, ETIQUETTE_ESSAI, hauteurEtiquetteMm, etiquettesPourSacs, SACS_MAX, SUPPLEMENT_ADRESSE_MM,
} from '../lib/etiquette-commande.js'
import {
  CLE_ETIQUETTES_APPAREIL, lireImpressionActive, ecrireImpressionActive, feuilleEtiquette,
  imprimerEtiquette, imprimerSiActive,
} from '../lib/impression-etiquette.js'
import { euros } from '../lib/montants.js'

let ok = 0
const echecs = []
const v = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  echecs.push(`${nom}${detail ? ` — ${detail}` : ''}`)
}
const lire = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
const code = (f) => sansProse(lire(f))

// ═══ 1) CE QUE PORTE L'ÉTIQUETTE ════════════════════════════════════════════
{
  v('🔴 un nom complet devient prénom + initiale', nomEtiquette('Marie Dupont') === 'Marie D.', nomEtiquette('Marie Dupont'))
  v('un prénom composé reste entier', nomEtiquette('Jean-Pierre Van Damme') === 'Jean-Pierre V.')
  v('l’initiale est en majuscule', nomEtiquette('marie dupont') === 'marie D.')
  v('un seul mot reste tel quel', nomEtiquette('Marie') === 'Marie')
  v('sans nom : « Client »', nomEtiquette('') === 'Client' && nomEtiquette(null) === 'Client' && nomEtiquette('   ') === 'Client')

  v('🔴 un Click & Collect a une étiquette', etiquetteConcernee({ mode_retrait: 'retrait', creneau_id: 'x' }))
  v('🔴 une commande de boutique aussi', etiquetteConcernee({ mode_retrait: 'retrait' }))
  v('🔴 une livraison en a une (Alex, 01/10 : « surtout en alimentaire »)', etiquetteConcernee({ mode_retrait: 'livraison' }))
  v('🔴 une expédition n’en a pas (l’étiquette est celle du transporteur)', !etiquetteConcernee({ mode_retrait: 'expedition' }))
  v('rien ne s’imprime sans commande', !etiquetteConcernee(null) && !etiquetteConcernee({}))

  const cc = { date_commande: '2026-10-01', creneau: { heure_debut: '11:15:00', heure_fin: '11:30:00' } }
  const q = quandEtiquette(cc)
  v('🔴 le créneau est sur l’étiquette', q.includes('11:15 – 11:30'), q)
  v('le jour aussi, en abrégé', /oct/.test(q) && q.includes(' · '), q)
  v('un créneau sans jour garde son heure', quandEtiquette({ creneau: { heure_debut: '09:00', heure_fin: '09:15' } }) === '09:00 – 09:15')
  v('🔴 une commande liée à un rendez-vous se remet au rendez-vous',
    quandEtiquette({ ...cc, rdv: { heure_debut: '14:30:00' } }) === 'À remettre au rendez-vous de 14:30')
  v('🔴 même quand seul le lien est connu (le Poste n’a pas la jointure)',
    quandEtiquette({ ...cc, rdv_reservation_id: 'r1' }) === 'À remettre au rendez-vous')
  v('une commande de boutique se retire en boutique', quandEtiquette({ date_commande: '2026-10-01' }) === 'Retrait en boutique')
  const li = { mode_retrait: 'livraison', date_commande: '2026-10-01', creneau_livraison: { heure_debut: '18:00:00', heure_fin: '18:30:00' } }
  const ql = quandEtiquette(li)
  v('🔴 une livraison lit SON créneau (une autre table)', ql.startsWith('Livraison ') && ql.includes('18:00 – 18:30'), ql)
  v('une livraison sans créneau dit son jour', /^Livraison .*oct/.test(quandEtiquette({ mode_retrait: 'livraison', date_commande: '2026-10-01' })))

  v('🔴 les articles se comptent en QUANTITÉS, pas en lignes',
    articlesEtiquette({ commande_articles: [{ quantite: 2 }, { quantite: 1 }] }) === '3 articles')
  v('un seul article au singulier', articlesEtiquette({ commande_articles: [{ quantite: 1 }] }) === '1 article')
  v('une quantité illisible ne compte pas', articlesEtiquette({ commande_articles: [{ quantite: 'x' }, { quantite: -2 }, { quantite: 1 }] }) === '1 article')
  v('sans articles : rien plutôt que « 0 article »', articlesEtiquette({}) === null && articlesEtiquette({ commande_articles: [] }) === null)

  const base = {
    mode_retrait: 'retrait', numero_commande: 12, numero_prefixe: 'CC', client_nom: 'Marie Dupont',
    client_telephone: '0470 12 34 56', client_email: 'marie@exemple.be', date_commande: '2026-10-01',
    creneau: { heure_debut: '11:15', heure_fin: '11:30' }, commande_articles: [{ quantite: 3 }], total: 36,
  }
  const paye = contenuEtiquette({ ...base, paye_en_ligne: true })
  v('🔴 la référence du comptoir est sur l’étiquette', paye.reference === 'CC12', String(paye.reference))
  v('🔴 payé en ligne : rien à encaisser', paye.aEncaisser === false && /Payé/.test(paye.paiement || ''), JSON.stringify(paye))
  const du = contenuEtiquette({ ...base, paye_en_ligne: false, fidelite_remise: 10 })
  v('🔴 à payer : le montant RÉEL, récompense déduite (la règle de la carte)',
    du.aEncaisser === true && du.paiement === `À payer ${euros(26)}`, JSON.stringify(du))
  const tout = JSON.stringify(contenuEtiquette(base))
  v('🔴 ni téléphone, ni email, ni nom complet sur le sac',
    !tout.includes('0470') && !tout.includes('@') && !tout.includes('Dupont'), tout)
  const avecRue = { ...base, adresse_livraison: 'Rue de Prée 9G, 5640 Mettet' }
  v('🔴 un sac de RETRAIT ne porte pas la rue, même si elle est connue', contenuEtiquette(avecRue).adresse === null)
  const livre = contenuEtiquette({ ...avecRue, mode_retrait: 'livraison', numero_prefixe: 'LI' })
  v('🔴 un sac de LIVRAISON porte sa rue', livre.adresse === 'Rue de Prée 9G, 5640 Mettet', String(livre.adresse))
  const toutLivre = JSON.stringify(livre)
  v('🔴 et toujours ni téléphone, ni email, ni nom complet', !toutLivre.includes('0470') && !toutLivre.includes('@') && !toutLivre.includes('Dupont'), toutLivre)
  // ⚠️ REDIRIGÉES LE 01/10 (premier essai sur la machine) : l'étiquette a
  // désormais un MINIMUM, un millimètre de plus que sa largeur, pour partir en
  // portrait. Les comparaisons se font donc sur une commande assez longue pour
  // le dépasser ; en dessous, toutes les étiquettes font le minimum.
  const longue = Array.from({ length: 8 }, (_, i) => ({ article: `1 × Article ${i + 1}`, options: null }))
  v('🔴 la rue a sa place (étiquette plus haute)',
    hauteurEtiquetteMm({ ...livre, lignes: longue }) === hauteurEtiquetteMm({ ...paye, lignes: longue }) + SUPPLEMENT_ADRESSE_MM)
  v('🔴 TOUJOURS plus haute que large (sinon Chrome l’imprime en paysage, en travers du ruban)',
    [{}, { ...paye, lignes: [] }, ETIQUETTE_ESSAI, { ...livre, lignes: [] }].every(e => hauteurEtiquetteMm(e) > FORMAT_ETIQUETTE.largeurMm))

  // Le bon de préparation (Alex, 01/10 : l'étiquette sort au démarrage de la prépa).
  const prepa = contenuEtiquette({
    ...base,
    commande_articles: [
      { quantite: 2, article_nom: 'Margherita', article: { nom: 'Nouveau nom au catalogue' }, options: [{ groupe_nom: 'Supplément', valeur_nom: 'olives' }] },
      { quantite: 1, article: { nom: 'Tiramisu' } },
      { quantite: 1, options: [] },
      { quantite: 0, article_nom: 'Ligne vide' },
    ],
  })
  // ⚠️ `?.` partout : une liste vide doit faire ROUGIR le banc, pas le planter.
  const lp = Array.isArray(prepa.lignes) ? prepa.lignes : []
  v('🔴 l’étiquette liste les articles à préparer', lp.length === 3 && lp[0]?.article === '2 × Margherita', JSON.stringify(prepa.lignes))
  v('🔴 avec leurs options (ce qui se rate en cuisine)', /Supplément.: olives/.test(lp[0]?.options || ''), String(lp[0]?.options))
  v('🔴 le nom FIGÉ à la vente passe avant le catalogue', lp.length > 0 && !JSON.stringify(lp).includes('Nouveau nom'))
  v('sans nom figé, le catalogue ; sans rien, « retiré du catalogue »',
    lp[1]?.article === '1 × Tiramisu' && lp[2]?.article === '1 × Article retiré du catalogue' && lp[1]?.options === null)
  v('une ligne à zéro ne s’imprime pas', !JSON.stringify(prepa.lignes).includes('Ligne vide'))
  const huit = Array.from({ length: 8 }, (_, i) => ({ article: `1 × Article ${i + 1}`, options: null }))
  v('🔴 l’étiquette s’allonge avec la commande',
    hauteurEtiquetteMm({ ...prepa, lignes: [...huit, ...huit] }) > hauteurEtiquetteMm({ ...prepa, lignes: huit })
    && hauteurEtiquetteMm({ ...prepa, lignes: huit }) > FORMAT_ETIQUETTE.largeurMm + 1)
  const court = hauteurEtiquetteMm({ lignes: [...huit, { article: '1 × Pain', options: null }] })
  const long = hauteurEtiquetteMm({ lignes: [...huit, { article: `1 × ${'Pain aux céréales et graines '.repeat(3)}`, options: null }] })
  v('🔴 un nom trop long pour la ligne compte pour deux (sinon il serait coupé)', long > court, `${court} / ${long}`)
  v('l’étiquette d’essai a sa liste', Array.isArray(ETIQUETTE_ESSAI.lignes) && ETIQUETTE_ESSAI.lignes.length === 2)

  const trois = etiquettesPourSacs(paye, 3)
  v('🔴 trois sacs, trois étiquettes numérotées',
    trois.length === 3 && trois.map(e => e.sac).join(',') === 'Sac 1/3,Sac 2/3,Sac 3/3' && trois.every(e => e.reference === 'CC12'), JSON.stringify(trois.map(e => e.sac)))
  v('un seul sac : pas de numéro', etiquettesPourSacs(paye, 1).length === 1 && etiquettesPourSacs(paye, 1)[0].sac === null)
  v('🔴 un nombre illisible vaut un sac, jamais zéro étiquette',
    [0, -2, 'x', null, undefined].every(n => etiquettesPourSacs(paye, n).length === 1))
  v('pas plus de vingt', etiquettesPourSacs(paye, 50).length === SACS_MAX && SACS_MAX === 20)
  v('l’étiquette d’essai a tout ce qu’une vraie porte', ['reference', 'client', 'quand', 'articles', 'paiement'].every(k => ETIQUETTE_ESSAI[k]))
  v('le rouleau fait 62 mm', FORMAT_ETIQUETTE.largeurMm === 62)
}

// ═══ 2) L'IMPRESSION, SUR UN FAUX NAVIGATEUR ════════════════════════════════
function fauxNavigateur({ stockage = {}, stockageCasse = false, printCasse = false, sansPrint = false } = {}) {
  const etat = { impressions: 0, innerHTML: false, ecouteurs: {}, ecouteursPage: {}, minuteries: [] }
  const creer = (tag) => ({
    tagName: tag.toUpperCase(), id: '', className: '', textContent: '', enfants: [], parent: null, attributs: {},
    setAttribute(k, val) { this.attributs[k] = val },
    appendChild(e) { e.parent = this; this.enfants.push(e); return e },
    remove() { if (this.parent) { this.parent.enfants = this.parent.enfants.filter(x => x !== this); this.parent = null } },
    set innerHTML(_) { etat.innerHTML = true },
  })
  const head = creer('head')
  const body = creer('body')
  const chercher = (el, id) => {
    if (el.id === id) return el
    for (const e of el.enfants) { const r = chercher(e, id); if (r) return r }
    return null
  }
  const document = {
    head, body, createElement: creer, getElementById: (id) => chercher(head, id) || chercher(body, id),
    addEventListener: (t, fn) => { (etat.ecouteursPage[t] ||= []).push(fn) },
    removeEventListener: (t, fn) => { etat.ecouteursPage[t] = (etat.ecouteursPage[t] || []).filter(f => f !== fn) },
  }
  const memoire = { ...stockage }
  const localStorage = stockageCasse
    ? { getItem() { throw new Error('bloqué') }, setItem() { throw new Error('bloqué') }, removeItem() { throw new Error('bloqué') } }
    : { getItem: (k) => (k in memoire ? memoire[k] : null), setItem: (k, val) => { memoire[k] = String(val) }, removeItem: (k) => { delete memoire[k] } }
  const window = {
    document, localStorage,
    addEventListener: (t, fn) => { (etat.ecouteurs[t] ||= []).push(fn) },
    removeEventListener: (t, fn) => { etat.ecouteurs[t] = (etat.ecouteurs[t] || []).filter(f => f !== fn) },
  }
  if (!sansPrint) window.print = () => { etat.impressions++; if (printCasse) throw new Error('pas d’imprimante') }
  const declencher = (t) => [...(etat.ecouteurs[t] || [])].forEach(fn => fn())
  const toucher = (t = 'pointerdown') => [...(etat.ecouteursPage[t] || [])].forEach(fn => fn())
  // La fin d'une impression telle qu'un commerçant la vit : la fenêtre se
  // ferme, puis il touche la page.
  const finImpression = () => { declencher('afterprint'); toucher() }
  return { window, document, etat, memoire, declencher, toucher, finImpression }
}
const texte = (el) => [el.textContent, ...el.enfants.map(texte)].filter(Boolean).join(' ')
const vraiTimeout = globalThis.setTimeout
const vraiClear = globalThis.clearTimeout
function dans(nav, travail) {
  const avant = globalThis.window
  globalThis.window = nav.window
  globalThis.setTimeout = (fn) => { nav.etat.minuteries.push(fn); return nav.etat.minuteries.length }
  globalThis.clearTimeout = () => {}
  try { return travail() } finally {
    globalThis.window = avant
    globalThis.setTimeout = vraiTimeout
    globalThis.clearTimeout = vraiClear
  }
}

{
  const nav = fauxNavigateur()
  const r = dans(nav, () => imprimerEtiquette({ ...ETIQUETTE_ESSAI, client: '<img src=x onerror=alert(1)>' }))
  v('🔴 l’impression est demandée, une fois', r === true && nav.etat.impressions === 1, `${r} / ${nav.etat.impressions}`)
  const zone = nav.document.getElementById('yoppaa-etiquette')
  v('🔴 l’étiquette est posée dans la page AVANT l’impression', !!zone && zone.parent === nav.document.body)
  v('elle porte la référence et le paiement', zone && texte(zone).includes('ESSAI') && texte(zone).includes('À payer 12,50 €'), zone ? texte(zone) : '')
  v('🔴 le nom du client reste du TEXTE, jamais du HTML',
    !nav.etat.innerHTML && zone && texte(zone).includes('<img src=x onerror=alert(1)>'))
  const montant = zone && zone.enfants[0]?.enfants.at(-1)?.enfants.at(-1)
  v('« à payer » se détache (fond noir)', montant?.className === 'du', montant?.className)
  v('une étiquette = une page', zone?.enfants.length === 1 && zone.enfants[0].className === 'etiquette')
  const liste = zone?.enfants[0]?.enfants.find(e => e.className === 'liste')
  v('🔴 la liste des articles est imprimée', !!liste && texte(liste).includes('2 × Margherita') && texte(liste).includes('1 × Tiramisu'), liste ? texte(liste) : '')
  v('🔴 et leurs options aussi', !!liste && liste.enfants.some(e => e.className === 'options' && /olives/.test(e.textContent)))
  const style = nav.document.getElementById('yoppaa-etiquette-style')
  v('🔴 la page prend la taille de l’étiquette', !!style && style.textContent.includes(`@page { size: ${FORMAT_ETIQUETTE.largeurMm}mm ${hauteurEtiquetteMm(ETIQUETTE_ESSAI)}mm; margin: 0; }`))
  v('🔴 le reste de l’écran ne s’imprime pas, et SEULEMENT à l’impression',
    /@media print \{[\s\S]*body > \*:not\(#yoppaa-etiquette\) \{ display: none !important; \}/.test(style?.textContent || '')
    && /^#yoppaa-etiquette \{ display: none; \}/.test(style?.textContent || ''))
  dans(nav, () => nav.toucher())
  v('un toucher AVANT la fin de l’impression ne retire rien',
    !!nav.document.getElementById('yoppaa-etiquette') && !!nav.document.getElementById('yoppaa-etiquette-style'))
  dans(nav, () => nav.declencher('afterprint'))
  v('🔴 « afterprint » seul ne retire RIEN (sur iPhone il arrive avant l’aperçu : l’écran sortait sur le rouleau)',
    !!nav.document.getElementById('yoppaa-etiquette') && !!nav.document.getElementById('yoppaa-etiquette-style'))
  dans(nav, () => nav.toucher())
  v('🔴 après l’impression, au premier toucher, plus rien ne reste (une affichette s’imprimerait en étiquette)',
    !nav.document.getElementById('yoppaa-etiquette') && !nav.document.getElementById('yoppaa-etiquette-style'))
  v('et les écouteurs sont retirés', (nav.etat.ecouteurs.afterprint || []).length === 0
    && Object.values(nav.etat.ecouteursPage).every(l => l.length === 0))
}
{
  const nav = fauxNavigateur()
  dans(nav, () => imprimerEtiquette(ETIQUETTE_ESSAI))
  dans(nav, () => { nav.declencher('afterprint'); nav.toucher('keydown') })
  v('une touche du clavier (Ctrl+P d’une affichette) nettoie aussi', !nav.document.getElementById('yoppaa-etiquette-style'))
}
{
  const nav = fauxNavigateur()
  const sacs = etiquettesPourSacs({ ...ETIQUETTE_ESSAI, adresse: 'Rue de Prée 9G, 5640 Mettet' }, 3)
  const r = dans(nav, () => imprimerEtiquette(sacs))
  const zone = nav.document.getElementById('yoppaa-etiquette')
  const pages = zone ? zone.enfants.filter(e => e.className === 'etiquette') : []
  v('🔴 trois sacs : UNE impression, trois pages', r === true && nav.etat.impressions === 1 && pages.length === 3, `${nav.etat.impressions} impressions, ${pages.length} pages`)
  v('🔴 chaque page porte son numéro de sac', pages.map(p => texte(p)).every((t, i) => t.includes(`Sac ${i + 1}/3`)))
  v('🔴 la rue est imprimée', pages.length > 0 && texte(pages[0]).includes('Rue de Prée 9G'))
  const style = nav.document.getElementById('yoppaa-etiquette-style')?.textContent || ''
  v('🔴 la page prend la hauteur de l’étiquette (rue et liste comprises)',
    style.includes(`size: ${FORMAT_ETIQUETTE.largeurMm}mm ${hauteurEtiquetteMm(sacs[0])}mm`)
    && hauteurEtiquetteMm(sacs[0]) > FORMAT_ETIQUETTE.hauteurMm + SUPPLEMENT_ADRESSE_MM, String(hauteurEtiquetteMm(sacs[0])))
  v('🔴 la Brother coupe entre chaque sac (une page par étiquette)', /\.etiquette \{[^}]*break-after: page;/.test(style) && /\.etiquette:last-child \{ break-after: auto;/.test(style))
  dans(nav, () => nav.finImpression())
  v('une liste vide n’imprime rien', dans(fauxNavigateur(), () => imprimerEtiquette([])) === false)
}
{
  const nav = fauxNavigateur()
  dans(nav, () => imprimerEtiquette(ETIQUETTE_ESSAI))
  v('un filet est posé si « afterprint » ne vient pas', nav.etat.minuteries.length === 1)
  dans(nav, () => nav.etat.minuteries[0]?.())
  v('🔴 le filet nettoie aussi', !nav.document.getElementById('yoppaa-etiquette') && !nav.document.getElementById('yoppaa-etiquette-style'))
}
{
  const nav = fauxNavigateur()
  dans(nav, () => { imprimerEtiquette(ETIQUETTE_ESSAI); imprimerEtiquette(ETIQUETTE_ESSAI) })
  const zones = nav.document.body.enfants.filter(e => e.id === 'yoppaa-etiquette').length
  const styles = nav.document.head.enfants.filter(e => e.id === 'yoppaa-etiquette-style').length
  v('🔴 deux impressions de suite : une seule étiquette dans la page', zones === 1 && styles === 1, `${zones} zones, ${styles} styles`)
  dans(nav, () => nav.finImpression())
}
{
  const nav = fauxNavigateur({ printCasse: true })
  let leve = false
  let r
  try { r = dans(nav, () => imprimerEtiquette(ETIQUETTE_ESSAI)) } catch { leve = true }
  v('🔴 une imprimante qui lâche ne lève RIEN (la commande doit passer prête)', !leve && r === false)
  v('et la page est nettoyée quand même', !nav.document.getElementById('yoppaa-etiquette'))
  const sans = fauxNavigateur({ sansPrint: true })
  v('un navigateur sans impression : non, sans erreur', dans(sans, () => imprimerEtiquette(ETIQUETTE_ESSAI)) === false)
  v('sans contenu : rien', dans(fauxNavigateur(), () => imprimerEtiquette(null)) === false)
}
{
  const cc = { mode_retrait: 'retrait', numero_commande: 3, numero_prefixe: 'CC', client_nom: 'Léa Martin', total: 10, paye_en_ligne: true }
  const eteint = fauxNavigateur()
  v('🔴 par défaut, cet appareil n’imprime pas', dans(eteint, () => lireImpressionActive()) === false)
  v('🔴 et rien ne s’ouvre sur un « prête »', dans(eteint, () => imprimerSiActive(cc)) === false && eteint.etat.impressions === 0)
  const allume = fauxNavigateur({ stockage: { [CLE_ETIQUETTES_APPAREIL]: '1' } })
  v('🔴 activé : la commande prête imprime', dans(allume, () => imprimerSiActive(cc)) === true && allume.etat.impressions === 1)
  v('l’étiquette est celle de la commande', texte(allume.document.getElementById('yoppaa-etiquette')).includes('CC3'))
  dans(allume, () => allume.finImpression())
  v('🔴 activé, une expédition n’imprime pas', dans(allume, () => imprimerSiActive({ ...cc, mode_retrait: 'expedition' })) === false && allume.etat.impressions === 1)
  v('🔴 activé, une livraison imprime', dans(allume, () => imprimerSiActive({ ...cc, mode_retrait: 'livraison' })) === true && allume.etat.impressions === 2)
  dans(allume, () => allume.finImpression())
  const casse = fauxNavigateur({ stockageCasse: true })
  let leve = false
  try { dans(casse, () => { ecrireImpressionActive(true); imprimerSiActive(cc) }) } catch { leve = true }
  v('🔴 un stockage bloqué (navigation privée) ne lève rien et n’imprime pas', !leve && casse.etat.impressions === 0)
  const regle = fauxNavigateur()
  dans(regle, () => ecrireImpressionActive(true))
  v('activer écrit le réglage', regle.memoire[CLE_ETIQUETTES_APPAREIL] === '1')
  dans(regle, () => ecrireImpressionActive(false))
  v('désactiver l’efface', !(CLE_ETIQUETTES_APPAREIL in regle.memoire))
  v('la feuille suit le format partagé', feuilleEtiquette({ largeurMm: 58, hauteurMm: 30, margeMm: 2 }).includes('size: 58mm 30mm'))
}

// ═══ 3) LE GESTE, LÀ OÙ IL SE FAIT ══════════════════════════════════════════
const avantPremierAwait = (corps, appel) => {
  const i = corps.indexOf(appel)
  const a = corps.indexOf('await ')
  return i >= 0 && (a < 0 || i < a)
}
{
  const bord = code('app/dashboard/page.js')
  const i = bord.indexOf('async function changerStatut(commandeId, statut, { champs = null } = {}) {')
  const corps = i >= 0 ? bord.slice(i, bord.indexOf('async function signalerEnvoi(', i)) : ''
  v('le passage de statut du tableau de bord a été retrouvé', corps.length > 500, String(corps.length))
  v('🔴 tableau de bord : l’étiquette part AVANT le premier await (sinon Safari n’imprime rien)',
    avantPremierAwait(corps, 'imprimerSiActive(aImprimer, { categorie: commercant?.categorie })'))
  v('🔴 l’étiquette sort au DÉMARRAGE de la prépa, depuis « en attente » seulement',
    /if \(statut === 'en_preparation'\) \{\s*const aImprimer = commandes\.find\(x => x\.id === commandeId\)\s*if \(aImprimer\?\.statut === 'en_attente'\) imprimerSiActive\(/.test(corps))
  v('🔴 et UNE seule fois : plus rien à « prête »', (corps.match(/imprimerSiActive\(/g) || []).length === 1)
  v('🔴 le bouton appelle ce passage sans rien attendre avant',
    /onClick=\{\(\) => onChangerStatut\(commande\.id, statut\.next\)\}/.test(bord) && /onChangerStatut=\{changerStatut\}/.test(bord))
  v('🔴 le rattrapage existe sur la carte, DÈS la préparation', /\{etiquettes && !modeHistorique && \['en_preparation', 'pret'\]\.includes\(commande\.statut\) && etiquetteConcernee\(commande\) && \(\s*<BoutonEtiquettes commande=\{commande\} categorie=\{categorie\}\/>/.test(bord))
  v('🔴 le réglage est aussi sur l’écran des livraisons',
    /\{!modeHistorique && \(\s*<ReglageEtiquettes actif=\{etiquettesIci\} onChanger=\{reglerEtiquettes\}\/>/.test(bord) && /etiquettes=\{etiquettesIci\}/.test(bord))

  const poste = code('app/equipe/PosteEquipe.js')
  const j = poste.indexOf('avancer: (c) => geste(c.id, async () => {')
  const avancer = j >= 0 ? poste.slice(j, poste.indexOf('nonRetire:', j)) : ''
  v('le geste « avancer » du Poste a été retrouvé', avancer.length > 200, String(avancer.length))
  v('🔴 Poste : l’étiquette part AVANT le premier await, au démarrage de la prépa',
    avantPremierAwait(avancer, "if (vers === 'en_preparation') imprimerSiActive(c, { categorie })"))
  v('🔴 Poste : une seule fois', (avancer.match(/imprimerSiActive\(/g) || []).length === 1)
  const k = poste.indexOf('async function geste(id, travail) {')
  const geste = k >= 0 ? poste.slice(k, poste.indexOf('}', poste.indexOf('await travail()', k))) : ''
  v('🔴 et `geste` lance le travail sans rien attendre avant',
    /await travail\(\)/.test(geste) && geste.indexOf('await ') === geste.indexOf('await travail()'), geste.slice(0, 200))
  v('🔴 le rattrapage existe sur la carte du Poste, dès la préparation', /\{etiquettes && \['en_preparation', 'pret'\]\.includes\(c\.statut\) && etiquetteConcernee\(c\) && \(\s*<BoutonEtiquettes commande=\{c\} categorie=\{commerce\.categorie\}\/>/.test(poste))
  v('🔴 sans le droit « commandes », pas de réglage ni de bouton',
    /\{gestes && <ReglageEtiquettes actif=\{etiquettesIci\} onChanger=\{reglerEtiquettes\}\/>\}/.test(poste) && /etiquettes=\{etiquettesIci && !!gestes\}/.test(poste))

  const reglage = code('app/dashboard/ReglageEtiquettes.js')
  v('🔴 le réglage part éteint, puis lit l’appareil', /const \[actif, setActif\] = useState\(false\)/.test(reglage) && /setActif\(lireImpressionActive\(\)\)/.test(reglage))
  v('🔴 « Imprimer » imprime UNE étiquette PAR SAC, dans le clic',
    /onClick=\{\(\) => imprimerEtiquette\(etiquettesPourSacs\(contenuEtiquette\(commande, \{ categorie \}\), sacs\)\)\}/.test(reglage))
  v('le compteur part d’un sac', /const \[sacs, setSacs\] = useState\(1\)/.test(reglage))
}

console.log(`\nÉtiquette de commande : ${ok} vérifications`)
if (echecs.length > 0) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
