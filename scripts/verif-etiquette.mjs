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
  contenuEtiquette, ETIQUETTE_ESSAI,
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
  v('🔴 une livraison n’en a pas (périmètre d’Alex)', !etiquetteConcernee({ mode_retrait: 'livraison' }))
  v('🔴 une expédition n’en a pas', !etiquetteConcernee({ mode_retrait: 'expedition' }))
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
  v('l’étiquette d’essai a tout ce qu’une vraie porte', ['reference', 'client', 'quand', 'articles', 'paiement'].every(k => ETIQUETTE_ESSAI[k]))
  v('le rouleau fait 62 mm', FORMAT_ETIQUETTE.largeurMm === 62)
}

// ═══ 2) L'IMPRESSION, SUR UN FAUX NAVIGATEUR ════════════════════════════════
function fauxNavigateur({ stockage = {}, stockageCasse = false, printCasse = false, sansPrint = false } = {}) {
  const etat = { impressions: 0, innerHTML: false, ecouteurs: {}, minuteries: [] }
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
  const document = { head, body, createElement: creer, getElementById: (id) => chercher(head, id) || chercher(body, id) }
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
  return { window, document, etat, memoire, declencher }
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
  const montant = zone && zone.enfants.at(-1)?.enfants.at(-1)
  v('« à payer » se détache (fond noir)', montant?.className === 'du', montant?.className)
  const style = nav.document.getElementById('yoppaa-etiquette-style')
  v('🔴 la page prend la taille de l’étiquette', !!style && style.textContent.includes(`@page { size: ${FORMAT_ETIQUETTE.largeurMm}mm ${FORMAT_ETIQUETTE.hauteurMm}mm; margin: 0; }`))
  v('🔴 le reste de l’écran ne s’imprime pas, et SEULEMENT à l’impression',
    /@media print \{[\s\S]*body > \*:not\(#yoppaa-etiquette\) \{ display: none !important; \}/.test(style?.textContent || '')
    && /^#yoppaa-etiquette \{ display: none; \}/.test(style?.textContent || ''))
  dans(nav, () => nav.declencher('afterprint'))
  v('🔴 après l’impression, plus rien ne reste (une affichette s’imprimerait en étiquette)',
    !nav.document.getElementById('yoppaa-etiquette') && !nav.document.getElementById('yoppaa-etiquette-style'))
  v('et l’écouteur est retiré', (nav.etat.ecouteurs.afterprint || []).length === 0)
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
  dans(nav, () => nav.declencher('afterprint'))
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
  dans(allume, () => allume.declencher('afterprint'))
  v('🔴 activé, une livraison n’imprime pas', dans(allume, () => imprimerSiActive({ ...cc, mode_retrait: 'livraison' })) === false && allume.etat.impressions === 1)
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
  v('🔴 seulement depuis « en préparation » (une remise en prête ne réimprime pas)',
    /if \(aImprimer\?\.statut === 'en_preparation'\) imprimerSiActive\(/.test(corps))
  v('🔴 le bouton appelle ce passage sans rien attendre avant',
    /onClick=\{\(\) => onChangerStatut\(commande\.id, statut\.next\)\}/.test(bord) && /onChangerStatut=\{changerStatut\}/.test(bord))
  v('le rattrapage existe sur la carte', /\{etiquettes && !modeHistorique && commande\.statut === 'pret' && etiquetteConcernee\(commande\) && \(\s*<button type="button" onClick=\{\(\) => imprimerEtiquette\(contenuEtiquette\(commande, \{ categorie \}\)\)\}/.test(bord))
  v('le réglage est sur l’écran des retraits', /<ReglageEtiquettes actif=\{etiquettesIci\} onChanger=\{reglerEtiquettes\}\/>/.test(bord) && /etiquettes=\{etiquettesIci\}/.test(bord))

  const poste = code('app/equipe/PosteEquipe.js')
  const j = poste.indexOf('avancer: (c) => geste(c.id, async () => {')
  const avancer = j >= 0 ? poste.slice(j, poste.indexOf('nonRetire:', j)) : ''
  v('le geste « avancer » du Poste a été retrouvé', avancer.length > 200, String(avancer.length))
  v('🔴 Poste : l’étiquette part AVANT le premier await', avantPremierAwait(avancer, "if (vers === 'pret') imprimerSiActive(c, { categorie })"))
  const k = poste.indexOf('async function geste(id, travail) {')
  const geste = k >= 0 ? poste.slice(k, poste.indexOf('}', poste.indexOf('await travail()', k))) : ''
  v('🔴 et `geste` lance le travail sans rien attendre avant',
    /await travail\(\)/.test(geste) && geste.indexOf('await ') === geste.indexOf('await travail()'), geste.slice(0, 200))
  v('le rattrapage existe sur la carte du Poste', /\{etiquettes && c\.statut === 'pret' && etiquetteConcernee\(c\) && \(/.test(poste))
  v('🔴 sans le droit « commandes », pas de réglage ni de bouton',
    /\{gestes && <ReglageEtiquettes actif=\{etiquettesIci\} onChanger=\{reglerEtiquettes\}\/>\}/.test(poste) && /etiquettes=\{etiquettesIci && !!gestes\}/.test(poste))

  const reglage = code('app/dashboard/ReglageEtiquettes.js')
  v('🔴 le réglage part éteint, puis lit l’appareil', /const \[actif, setActif\] = useState\(false\)/.test(reglage) && /setActif\(lireImpressionActive\(\)\)/.test(reglage))
}

console.log(`\nÉtiquette de commande : ${ok} vérifications`)
if (echecs.length > 0) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
