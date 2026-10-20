// Banc de l'heure limite de la veille (20/10, 7 Abbayes : « je commande chez
// mon fournisseur à 18 h ») : `npm run verif:heure-veille`.
//
// 🔴 L'APP EST EN SERVICE (Alex : « pas de raté possible »). La première chose
// vérifiée est donc qu'un commerce SANS heure réglée ne voit RIEN changer : ni
// circuit, ni refus, ni calendrier, ni mention, ni message. Puis la règle, en
// l'exécutant (17:59 / 18:00, été et hiver, J+1 et J+2, jour même, duo), puis
// chaque endroit qui doit la lire.
//
// ⚠️ LE COMMERCE EST PRIS TEL QUE LA VUE LE REND : l'heure arrive « 18:00:00 ».

import { readFileSync } from 'node:fs'
import { sansProse } from './lire-code.mjs'
import { heureLimite, limiteDeLaVeille, delaiEnClair, phraseLimiteFiche, refusDeSaisieLimite } from '../lib/heure-veille.js'
import { circuitsDeLArticle, circuitsCommuns } from '../lib/stock-article.js'
import { refusDuJour, premierJourPossible, longueurCalendrier, mentionDisponibilite, delaiEnJours } from '../lib/delai-commande.js'
import { articleHorsJour } from '../lib/commande-encodee.js'

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}
const brut = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
const code = (f) => sansProse(brut(f))
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// Le mardi 20/10/2026 (heure d'été, UTC+2) et le mardi 10/11/2026 (hiver, UTC+1).
const AUJ = '2026-10-20', DEMAIN = '2026-10-21', APRES = '2026-10-22', J3 = '2026-10-23'
const ETE_1759 = new Date('2026-10-20T15:59:00Z')
const ETE_1800 = new Date('2026-10-20T16:00:00Z')
const ETE_2359 = new Date('2026-10-20T21:59:00Z')
const ETE_0000 = new Date('2026-10-20T22:00:00Z') // minuit pile, le 21 à Bruxelles
const HIVER_1759 = new Date('2026-11-10T16:59:00Z')
const HIVER_1800 = new Date('2026-11-10T17:00:00Z')

const SANS = { id: 1, categorie: 'boulangerie' }
const VIDE = { id: 1, categorie: 'boulangerie', commande_veille_avant: null }
const MINUIT = { id: 1, categorie: 'boulangerie', commande_veille_avant: '00:00:00' }
const ABBAYES = { id: 1, categorie: 'boulangerie', commande_veille_avant: '18:00:00' }
const BOUTIQUE = { id: 2, categorie: 'detail', commande_veille_avant: '18:00:00' }

// Les articles d'une boulangerie, comme la base les rend.
const CROISSANT = { id: 10, nom: 'Croissant', vente_jour: true, commande_active: true, delai_minutes: 1440 }
const PAIN_SPECIAL = { id: 11, nom: 'Pain spécial', vente_jour: false, commande_active: true, delai_minutes: 1440 }
const TARTE = { id: 12, nom: 'Tarte', vente_jour: false, commande_active: true, delai_minutes: 2880 }
const SANDWICH = { id: 13, nom: 'Sandwich', vente_jour: true, commande_active: false, delai_minutes: 0 }
const CONFITURE = { id: 14, nom: 'Confiture', vente_jour: true, commande_active: false, stock_mode: 'magasin' }
const BRIOCHE = { id: 15, nom: 'Brioche', vente_jour: true, commande_active: true, delai_minutes: 2880 }

const regle = (article, commercant, maintenant) => ({ delaiJours: delaiEnJours(article), indispo: [], circuits: circuitsDeLArticle(article, commercant, maintenant) })
const jugement = (article, commercant, maintenant, jour) => refusDuJour({ ...regle(article, commercant, maintenant), jour, aujourdhui: AUJ })

// ═══════════════════════════════════════════════════════════════════════════
// 0. 🔴 SANS HEURE RÉGLÉE, RIEN NE CHANGE
// ═══════════════════════════════════════════════════════════════════════════
for (const [nom, c] of [['colonne absente', SANS], ['colonne vide', VIDE], ['minuit', MINUIT], ['chaîne vide', { ...SANS, commande_veille_avant: '' }]]) {
  verifier(`🔴 ${nom} : aucune limite`, limiteDeLaVeille(c, ETE_2359) === null)
  verifier(`🔴 ${nom} : les circuits gardent EXACTEMENT leur forme d’avant`,
    egal(circuitsDeLArticle(CROISSANT, c, ETE_2359), { aujourdhui: true, surCommande: true })
    && egal(circuitsDeLArticle(TARTE, c, ETE_2359), { aujourdhui: false, surCommande: true }))
  verifier(`🔴 ${nom} : à 23 h 59, le croissant se commande encore pour demain`, jugement(CROISSANT, c, ETE_2359, DEMAIN) === null)
  verifier(`🔴 ${nom} : la tarte à J+2 se commande encore pour après-demain`, jugement(TARTE, c, ETE_2359, APRES) === null)
  verifier(`🔴 ${nom} : le calendrier garde sa longueur`,
    longueurCalendrier({ horizon: 2, articles: [regle(CROISSANT, c, ETE_2359)] }) === 2)
}
verifier('🔴 sans heure, les mentions de carte sont MOT POUR MOT celles d’avant',
  mentionDisponibilite(regle(PAIN_SPECIAL, VIDE, ETE_2359)) === 'Commande 1 jour à l\'avance'
  && mentionDisponibilite(regle(BRIOCHE, VIDE, ETE_2359)) === 'Le jour même, ou commande 2 jours à l\'avance'
  && mentionDisponibilite({ ...regle(TARTE, VIDE, ETE_2359), indispo: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'] }) === 'Samedi et dimanche seulement · commande au plus tard jeudi pour samedi, vendredi pour dimanche'
  && mentionDisponibilite(regle(CROISSANT, VIDE, ETE_2359)) === null,
  JSON.stringify([mentionDisponibilite(regle(PAIN_SPECIAL, VIDE, ETE_2359)), mentionDisponibilite(regle(BRIOCHE, VIDE, ETE_2359))]))
verifier('🔴 sans heure, la durée se dit comme avant', delaiEnClair(1) === '1 jour à l\'avance' && delaiEnClair(2, null) === '2 jours à l\'avance')
verifier('🔴 sans heure, aucune phrase sur la fiche', phraseLimiteFiche({ limite: null, surCommande: true, demain: true }) === null)
{
  const e = articleHorsJour({ article: TARTE, commercant: VIDE, jour: DEMAIN, aujourdhui: AUJ, maintenant: ETE_2359 })
  verifier('🔴 sans heure, l’avertissement de l’encodage est celui d’avant',
    e?.raison === 'delai' && e.message.startsWith('« Tarte » se commande 2 jours à l’avance.') && e.court.startsWith('Trop tôt'), JSON.stringify(e))
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. L'HEURE ET L'HORLOGE
// ═══════════════════════════════════════════════════════════════════════════
verifier('l’heure de la vue se lit', heureLimite('18:00:00') === '18:00' && heureLimite('7:30') === '07:30')
verifier('vide, illisible ou minuit : aucune limite', heureLimite(null) === null && heureLimite('') === null && heureLimite('abc') === null && heureLimite('00:00:00') === null)
verifier('🔴 17 h 59 (été) : avant la limite', limiteDeLaVeille(ABBAYES, ETE_1759)?.apresLimite === false)
verifier('🔴 18 h 00 pile (été) : trop tard, comme « avant 18 h » au comptoir', limiteDeLaVeille(ABBAYES, ETE_1800)?.apresLimite === true)
verifier('23 h 59 : toujours trop tard', limiteDeLaVeille(ABBAYES, ETE_2359)?.apresLimite === true)
verifier('minuit : un nouveau jour, de nouveau avant la limite', limiteDeLaVeille(ABBAYES, ETE_0000)?.apresLimite === false)
verifier('🔴 à l’HEURE DE BRUXELLES en hiver aussi (UTC+1)',
  limiteDeLaVeille(ABBAYES, HIVER_1759)?.apresLimite === false && limiteDeLaVeille(ABBAYES, HIVER_1800)?.apresLimite === true)
verifier('la limite est rendue « HH:MM »', limiteDeLaVeille(ABBAYES, ETE_1759)?.limite === '18:00')

// ═══════════════════════════════════════════════════════════════════════════
// 2. LA RÈGLE DU JOUR
// ═══════════════════════════════════════════════════════════════════════════
verifier('les circuits portent la limite quand l’article est sur commande',
  egal(circuitsDeLArticle(CROISSANT, ABBAYES, ETE_1800), { aujourdhui: true, surCommande: true, limite: '18:00', apresLimite: true }))
verifier('🔴 le jour même seulement : pas de limite (Alex : le jour même ne change pas)',
  egal(circuitsDeLArticle(SANDWICH, ABBAYES, ETE_1800), { aujourdhui: true, surCommande: false }))
verifier('le stock qui baisse n’a toujours pas de circuit', circuitsDeLArticle(CONFITURE, ABBAYES, ETE_1800) === null)
verifier('hors alimentaire, rien', circuitsDeLArticle(CROISSANT, BOUTIQUE, ETE_1800) === null)

verifier('🔴 17 h 59 : le croissant se commande pour demain', jugement(CROISSANT, ABBAYES, ETE_1759, DEMAIN) === null)
{
  const r = jugement(CROISSANT, ABBAYES, ETE_1800, DEMAIN)
  verifier('🔴 18 h 00 : plus pour demain, et le refus nomme l’heure', egal(r, { raison: 'delai', plancher: APRES, jours: 1, limite: '18:00' }), JSON.stringify(r))
}
verifier('🔴 18 h 00 : le croissant se commande pour après-demain', jugement(CROISSANT, ABBAYES, ETE_1800, APRES) === null)
verifier('🔴 18 h 00 : le croissant du JOUR MÊME reste en vente', jugement(CROISSANT, ABBAYES, ETE_1800, AUJ) === null)
verifier('18 h 00 : le sandwich du jour même reste en vente, et ne se commande toujours pas pour demain',
  jugement(SANDWICH, ABBAYES, ETE_1800, AUJ) === null && jugement(SANDWICH, ABBAYES, ETE_1800, DEMAIN)?.raison === 'aujourdhui_seulement')
verifier('🔴 le pain sur commande seul, aujourd’hui après 18 h : trop tôt, premier jour après-demain',
  egal(jugement(PAIN_SPECIAL, ABBAYES, ETE_1800, AUJ), { raison: 'delai', plancher: APRES, jours: 1, limite: '18:00' }))
verifier('🔴 la tarte à J+2 : après-demain à 17 h 59, J+3 à 18 h',
  jugement(TARTE, ABBAYES, ETE_1759, APRES) === null
  && jugement(TARTE, ABBAYES, ETE_1800, APRES)?.plancher === J3
  && jugement(TARTE, ABBAYES, ETE_1800, J3) === null)
verifier('avant la limite, le refus ne porte pas d’heure (la phrase d’avant)',
  egal(jugement(TARTE, ABBAYES, ETE_1759, DEMAIN), { raison: 'delai', plancher: APRES, jours: 2 }))
verifier('le premier jour possible recule aussi',
  premierJourPossible({ regle: regle(PAIN_SPECIAL, ABBAYES, ETE_1800), aujourdhui: AUJ }) === APRES
  && premierJourPossible({ regle: regle(PAIN_SPECIAL, ABBAYES, ETE_1759), aujourdhui: AUJ }) === DEMAIN)
verifier('l’invendu ignore toujours tout', refusDuJour({ ...regle(PAIN_SPECIAL, ABBAYES, ETE_1800), jour: AUJ, aujourdhui: AUJ, invendu: true }) === null)
verifier('les jours de vente passent toujours avant', refusDuJour({ ...regle(CROISSANT, ABBAYES, ETE_1800), indispo: ['jeudi'], jour: APRES, aujourdhui: AUJ })?.raison === 'jour')

// Le duo : la limite suit B.
{
  const a = circuitsDeLArticle(CROISSANT, ABBAYES, ETE_1800)
  const b = circuitsDeLArticle(TARTE, ABBAYES, ETE_1800)
  const s = circuitsDeLArticle(SANDWICH, ABBAYES, ETE_1800)
  verifier('duo de deux articles sur commande : la limite reste', egal(circuitsCommuns(a, b), { aujourdhui: false, surCommande: true, limite: '18:00', apresLimite: true }))
  verifier('duo avec un article du jour même seulement : plus de B, plus de limite', egal(circuitsCommuns(a, s), { aujourdhui: true, surCommande: false }))
  verifier('duo sans heure : la forme d’avant', egal(circuitsCommuns(circuitsDeLArticle(CROISSANT, VIDE), circuitsDeLArticle(TARTE, VIDE)), { aujourdhui: false, surCommande: true }))
  verifier('🔴 duo après 18 h : plus pour demain', refusDuJour({ delaiJours: 1, circuits: circuitsCommuns(a, a), jour: DEMAIN, aujourdhui: AUJ })?.limite === '18:00')
}

// Le calendrier.
verifier('🔴 après 18 h, le calendrier gagne un jour (après-demain apparaît)',
  longueurCalendrier({ horizon: 2, articles: [regle(CROISSANT, ABBAYES, ETE_1800)] }) === 3
  && longueurCalendrier({ horizon: 2, articles: [regle(CROISSANT, ABBAYES, ETE_1759)] }) === 2)
verifier('un seul jour de plus, même avec plusieurs articles sur commande',
  longueurCalendrier({ horizon: 2, articles: [regle(CROISSANT, ABBAYES, ETE_1800), regle(BRIOCHE, ABBAYES, ETE_1800)] })
  === longueurCalendrier({ horizon: 2, articles: [regle(CROISSANT, VIDE), regle(BRIOCHE, VIDE)] }) + 1)
verifier('sans article sur commande, la limite ne change rien au calendrier',
  longueurCalendrier({ horizon: 2, articles: [regle(SANDWICH, ABBAYES, ETE_1800)] }) === 2)

// ═══════════════════════════════════════════════════════════════════════════
// 3. CE QUI SE DIT
// ═══════════════════════════════════════════════════════════════════════════
verifier('« la veille avant 18 h »', delaiEnClair(1, '18:00') === 'la veille avant 18 h' && delaiEnClair(1, '17:30:00') === 'la veille avant 17 h 30')
verifier('« 2 jours à l’avance, avant 18 h »', delaiEnClair(2, '18:00') === '2 jours à l\'avance, avant 18 h')
verifier('le pain sur commande seul le dit sur sa carte', mentionDisponibilite(regle(PAIN_SPECIAL, ABBAYES, ETE_1759)) === 'Commande la veille avant 18 h')
verifier('la mention ne bouge pas avec l’heure (avant comme après 18 h)', mentionDisponibilite(regle(PAIN_SPECIAL, ABBAYES, ETE_1800)) === 'Commande la veille avant 18 h')
verifier('le jour limite du week-end porte l’heure',
  mentionDisponibilite({ ...regle(TARTE, ABBAYES, ETE_1759), indispo: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'] }) === 'Samedi et dimanche seulement · commande au plus tard jeudi 18 h pour samedi, vendredi 18 h pour dimanche')
verifier('la brioche du jour même ou à J+2 le dit', mentionDisponibilite(regle(BRIOCHE, ABBAYES, ETE_1759)) === 'Le jour même, ou commande 2 jours à l\'avance, avant 18 h')
verifier('🔴 RIEN SUR LE CROISSANT (règle du 04/09 : pas de mention sur chaque baguette)', mentionDisponibilite(regle(CROISSANT, ABBAYES, ETE_1759)) === null)

verifier('la phrase de la fiche avant 18 h', phraseLimiteFiche({ limite: '18:00', apresLimite: false, surCommande: true, demain: true }) === 'Pour demain, commande avant 18 h.')
verifier('la phrase de la fiche après 18 h', phraseLimiteFiche({ limite: '18:00', apresLimite: true, surCommande: true, demain: true }) === 'Il est plus de 18 h : trop tard pour demain. Les commandes à l’avance se décalent d’un jour.')
verifier('sans article pour demain, elle ne parle pas de demain',
  phraseLimiteFiche({ limite: '18:00', apresLimite: false, surCommande: true, demain: false }) === 'Les commandes à l’avance se prennent jusqu’à 18 h.'
  && phraseLimiteFiche({ limite: '18:00', apresLimite: true, surCommande: true, demain: false }) === 'Il est plus de 18 h : les commandes à l’avance se décalent d’un jour.')
verifier('sans article sur commande, aucune phrase', phraseLimiteFiche({ limite: '18:00', apresLimite: true, surCommande: false, demain: false }) === null)
verifier('la saisie du commerçant', refusDeSaisieLimite('') === null && refusDeSaisieLimite('18:00') === null && refusDeSaisieLimite('25:00') !== null)

{
  const e = articleHorsJour({ article: CROISSANT, commercant: ABBAYES, jour: DEMAIN, aujourdhui: AUJ, maintenant: ETE_1800 })
  // ⚠️ Le croissant se vend AUSSI le jour même : son premier jour reste aujourd'hui.
  verifier('🔴 l’encodage PRÉVIENT après 18 h, et nomme l’heure',
    e?.raison === 'delai' && e.premier === AUJ
    && e.message.startsWith('« Croissant » se commande la veille avant 18 h, et il est plus de 18 h.')
    && e.court.startsWith('Après 18 h'), JSON.stringify(e))
  const p = articleHorsJour({ article: PAIN_SPECIAL, commercant: ABBAYES, jour: DEMAIN, aujourdhui: AUJ, maintenant: ETE_1800 })
  verifier('le pain sur commande seul : premier jour après-demain', p?.premier === APRES && p.court.startsWith('Après 18 h'), JSON.stringify(p))
  verifier('l’encodage ne dit rien à 17 h 59', articleHorsJour({ article: CROISSANT, commercant: ABBAYES, jour: DEMAIN, aujourdhui: AUJ, maintenant: ETE_1759 }) === null)
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. CHAQUE PORTE LIT L'HEURE
// ═══════════════════════════════════════════════════════════════════════════
{
  const R = code('app/api/stripe/checkout/create-commande/route.js')
  verifier('🔴 le serveur lit l’heure du commerce', /\.from\('commercants'\)\s*\.select\('id, nom, slug, [^']*, commande_veille_avant'\)/.test(R))
  verifier('🔴 il juge avec le commerce entier (sa propre horloge)', R.includes('let circuits = circuitsDeLArticle(articleEnBase[String(l.article_id)], commercant)'))
  verifier('et son message nomme l’heure', R.includes("se commande ${delaiEnClair(j, refus.limite || null)} : le premier jour possible"))
}
{
  const E = code('app/api/equipe/commande/creer/route.js')
  const K = code('app/api/equipe/commande/catalogue/route.js')
  verifier('l’encodage lit l’heure (création)', /horizon_commande, horaires_detail, commande_veille_avant'\)/.test(E))
  verifier('l’encodage lit l’heure (grille et calendrier)', /ordre_categories, horizon_commande, horaires_detail, commande_veille_avant'\)/.test(K))
  verifier('🔴 l’encodage prévient, il ne refuse pas', /const hors = articleHorsJour\(/.test(E) && !/articleHorsJour[\s\S]{0,300}return non\(/.test(E))
  const S = code('lib/calendrier-commande-server.js')
  verifier('le calendrier de l’encodage passe le commerce entier', S.includes('circuits: circuitsDeLArticle(a, commercant)'))
}
{
  const F = code('app/commander/[slug]/page.js')
  verifier('🔴 la fiche lit la vue entière (la colonne y vient)', F.includes(".from('commercants_public').select('*').eq('slug', slug)"))
  verifier('la phrase est sous le calendrier', F.includes('const phrase = phraseHeureLimite()'))
  verifier('la carte dit « À commander la veille avant 18 h »', F.includes('? `À commander ${delaiEnClair(etatJour.delaiJours, etatJour.limite)}`') && F.includes('limite: refus.limite || null,'))
  verifier('le panier bloqué nomme l’heure', F.includes('if (refus.limite) {') && F.includes('se commande ${delaiEnClair(n, refus.limite)} : trop tard pour ${quand}.'))
}
{
  const C = code('app/dashboard/ConfigDashboard.js')
  verifier('le réglage relit l’heure', C.includes("supabase.from('commercants').select('horizon_commande, mode_capacite, horaires_detail, planning_par_lieu, commande_veille_avant')"))
  verifier('🔴 il écrit l’heure normalisée, ou vide', C.includes("update({ commande_veille_avant: valeur })") && C.includes('const valeur = heureLimite(val)'))
  verifier('🔴 une écriture refusée se dit', C.includes("if (error) { toast('L’heure limite n’a pas été enregistrée. Réessaie dans un instant.', 'error'); return }"))
}
{
  const M = brut('migrations/MIGRATION_HEURE_LIMITE_VEILLE_20_10.sql')
  verifier('la migration ajoute une colonne vide', /ADD COLUMN IF NOT EXISTS commande_veille_avant time;/.test(M))
  verifier('🔴 elle n’écrit l’heure d’aucun commerce', !/UPDATE public\.commercants/i.test(M))
  verifier('🔴 la vue la porte, en DERNIÈRE colonne', /ordre_categories,\s*--[^\n]*\n\s*commande_veille_avant\s*FROM commercants/.test(M))
  verifier('la vue garde la relecture des stores', M.includes("OR (statut_publication = 'relecture'::text AND public.est_compte_relecture())"))
  verifier('les droits sont explicites', M.includes('GRANT SELECT (commande_veille_avant) ON public.commercants TO anon, authenticated;') && M.includes('GRANT UPDATE (commande_veille_avant) ON public.commercants TO authenticated;'))
}

console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko) {
  for (const e of echecs) console.log(`  ✕ ${e}`)
  process.exit(1)
}
console.log('Heure limite de la veille verte.')
