// Banc de la plage de retrait par article (19/10, 7 Abbayes) :
// `npm run verif:plage`.
//
// 🔴 L'APP EST EN SERVICE (Alex : « pas de raté possible »). La première chose
// vérifiée est donc qu'une plage VIDE ne change RIEN : ni créneau filtré, ni
// refus, ni avertissement. Puis la règle, puis chaque endroit qui doit la lire.

import { readFileSync } from 'node:fs'
import { sansProse } from './lire-code.mjs'
import {
  heureDePlage, plageDeLArticle, plageVide, plageImpossible, plageCommune, plageDeLaLigne,
  creneauDansPlage, libellePlage, refusDePlageALAjout, raisonDeLaPlage, refusDePlageAuCreneau,
  refusDeSaisiePlage, plageSansCreneau,
} from '../lib/plage-retrait.js'
import { avertissementsPlage } from '../lib/commande-encodee.js'
import { patchsDuLot, ecartsDuLot, refusDuLot, resumeDuLot, ACTIONS_LOT } from '../lib/catalogue-lot.js'
import { CHAMPS_COPIES } from '../lib/catalogue-copie.js'
import { SELECT_ARTICLES } from '../lib/lignes-commande.js'

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}
const brut = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
const code = (f) => sansProse(brut(f))

const cr = (heure_debut, heure_fin, extra = {}) => ({ heure_debut, heure_fin, actif: true, ...extra })
const VIDE = { de: null, a: null }
const SANDWICH = { de: null, a: '15:00' }

// ═══════════════════════════════════════════════════════════════════════════
// 0. 🔴 SANS PLAGE, RIEN NE CHANGE
// ═══════════════════════════════════════════════════════════════════════════
verifier('🔴 un article sans plage a une plage vide', plageVide(plageDeLArticle({ nom: 'Pain' })))
verifier('🔴 une plage vide accepte tout créneau', [cr('07:00', '07:30'), cr('17:00', '17:30'), cr('22:00', '01:00')].every(c => creneauDansPlage(c, VIDE)))
verifier('🔴 même un créneau mal écrit (l’ancien comportement)', creneauDansPlage({ heure_debut: null }, VIDE))
verifier('🔴 aucun refus à l’ajout sans plage', refusDePlageALAjout({ nom: 'Pain', plage: VIDE }, [{ nom: 'Croissant', plage: VIDE }]) === null)
verifier('🔴 aucune phrase au choix du créneau sans plage', raisonDeLaPlage([{ nom: 'Pain', plage: VIDE }]) === null)
verifier('🔴 aucun refus serveur sans plage', refusDePlageAuCreneau([{ nom: 'Pain', plage: VIDE }], cr('17:00', '17:30')) === null)
verifier('🔴 aucun avertissement à l’encodage sans plage', avertissementsPlage([{ article_id: 1, article_nom: 'Pain' }], cr('17:00', '17:30')).length === 0)
verifier('aucune mention sur la carte sans plage', libellePlage(VIDE) === null)

// ═══════════════════════════════════════════════════════════════════════════
// 1. LA RÈGLE
// ═══════════════════════════════════════════════════════════════════════════
verifier('l’heure de la base se lit', heureDePlage('15:00:00') === '15:00' && heureDePlage('9:05') === '09:05')
verifier('une absence n’est pas minuit', heureDePlage('') === null && heureDePlage(null) === null && heureDePlage('abc') === null)
verifier('la plage d’un article', JSON.stringify(plageDeLArticle({ retrait_des: '11:00:00', retrait_jusqua: '15:00:00' })) === JSON.stringify({ de: '11:00', a: '15:00' }))

verifier('« jusqu’à 15 h » : le créneau qui finit à 15 h passe', creneauDansPlage(cr('14:30', '15:00'), SANDWICH))
verifier('🔴 le créneau qui DÉBORDE 15 h ne passe pas (il tient entier ou rien)', !creneauDansPlage(cr('14:45', '15:15'), SANDWICH))
verifier('le créneau de 17 h ne passe pas', !creneauDansPlage(cr('17:00', '17:30'), SANDWICH))
verifier('« à partir de 11 h » : 11 h passe', creneauDansPlage(cr('11:00', '11:30'), { de: '11:00', a: null }))
verifier('« à partir de 11 h » : 10 h 30 non', !creneauDansPlage(cr('10:30', '11:00'), { de: '11:00', a: null }))
verifier('un créneau qui passe minuit finit le lendemain', !creneauDansPlage(cr('22:00', '01:00'), { de: null, a: '23:00' }) && creneauDansPlage(cr('22:00', '01:00'), { de: '21:00', a: null }))
verifier('une plage avec un créneau illisible : non', !creneauDansPlage({ heure_debut: 'x', heure_fin: '15:00' }, SANDWICH))

verifier('plage impossible : « de 15 h à 11 h »', plageImpossible({ de: '15:00', a: '11:00' }) && plageImpossible({ de: '15:00', a: '15:00' }))
verifier('plage possible', !plageImpossible({ de: '11:00', a: '15:00' }) && !plageImpossible(SANDWICH))
{
  const c = plageCommune([{ nom: 'Pain', plage: VIDE }, { nom: 'Sandwich', plage: SANDWICH }, { nom: 'Wrap', plage: { de: '11:00', a: '16:00' } }])
  verifier('l’intersection prend le plus tard « de » et le plus tôt « à »', c.de === '11:00' && c.a === '15:00' && c.nomA === 'Sandwich' && c.nomDe === 'Wrap', JSON.stringify(c))
  // Deux « à partir de » ET deux « jusqu'à » : sinon un sens inversé passe.
  const d = plageCommune([{ nom: 'A', plage: { de: '10:00', a: '16:00' } }, { nom: 'B', plage: { de: '11:00', a: '15:00' } }, { nom: 'C', plage: { de: '09:00', a: '17:00' } }])
  verifier('🔴 avec plusieurs bornes : le « de » le plus TARD, le « à » le plus TÔT', d.de === '11:00' && d.a === '15:00' && d.nomDe === 'B' && d.nomA === 'B', JSON.stringify(d))
}

// Le panier.
verifier('✅ pain + sandwich : ils vont ensemble (créneaux communs)', refusDePlageALAjout({ nom: 'Sandwich', plage: SANDWICH }, [{ nom: 'Pain', plage: VIDE }]) === null)
{
  const m = refusDePlageALAjout({ nom: 'Plat du soir', plage: { de: '17:00', a: null } }, [{ nom: 'Sandwich', plage: SANDWICH }])
  verifier('🔴 aucun moment commun : refus à l’ajout', !!m)
  verifier('🔴 et le message nomme les DEUX articles et le geste', !!m && m.includes('« Plat du soir »') && m.includes('« Sandwich »') && /deux commandes/.test(m), m)
}
verifier('deux sandwichs : pas de refus', refusDePlageALAjout({ nom: 'Sandwich 2', plage: SANDWICH }, [{ nom: 'Sandwich', plage: SANDWICH }]) === null)

// La ligne.
verifier('⚠️ l’invendu garde sa fenêtre : pas de plage',
  plageVide(plageDeLaLigne({ offre: { heure_debut: '17:00', heure_fin: '18:00' } }, { retrait_jusqua: '15:00' })))
verifier('un lot ordinaire garde la plage de son article',
  plageDeLaLigne({ offre: { heure_debut: null, heure_fin: null } }, { retrait_jusqua: '15:00' }).a === '15:00')
verifier('⚠️ un duo n’a que la plage commune à ses deux articles',
  JSON.stringify(plageDeLaLigne({}, { retrait_jusqua: '15:00' }, { retrait_des: '11:00' })) === JSON.stringify({ de: '11:00', a: '15:00' }))
verifier('une ligne serveur porte sa plage', plageDeLaLigne({ retrait_jusqua: '15:00:00' }, { retrait_jusqua: '15:00:00' }).a === '15:00')

// Les phrases.
verifier('la carte : « Retrait jusqu’à 15 h »', libellePlage(SANDWICH) === 'Retrait jusqu’à 15 h', libellePlage(SANDWICH))
verifier('la carte : « Retrait de 11 h à 14 h 30 »', libellePlage({ de: '11:00', a: '14:30' }) === 'Retrait de 11 h à 14 h 30')
verifier('la carte : « Retrait à partir de 17 h »', libellePlage({ de: '17:00', a: null }) === 'Retrait à partir de 17 h')
verifier('le choix du créneau, un article',
  raisonDeLaPlage([{ nom: 'Pain', plage: VIDE }, { nom: 'Sandwich', plage: SANDWICH }]) === '« Sandwich » se retire jusqu’à 15 h : seuls ces créneaux sont proposés.')
verifier('le choix du créneau, plusieurs articles',
  /^Certains articles de ton panier se retirent jusqu’à 15 h/.test(raisonDeLaPlage([{ nom: 'A', plage: SANDWICH }, { nom: 'B', plage: { de: null, a: '16:00' } }])))
{
  const m = refusDePlageAuCreneau([{ nom: 'Pain', plage: VIDE }, { nom: 'Sandwich', plage: SANDWICH }], cr('16:00', '16:30'))
  verifier('🔴 le serveur refuse un créneau hors plage, en nommant l’article', !!m && m.includes('« Sandwich »'), m)
  verifier('le serveur accepte un créneau dans la plage', refusDePlageAuCreneau([{ nom: 'Sandwich', plage: SANDWICH }], cr('12:00', '12:30')) === null)
}

// La saisie du commerçant.
verifier('saisie : les deux vides, c’est valable', refusDeSaisiePlage('', '') === null)
verifier('saisie : « de » après « à » refusé', /avant/.test(refusDeSaisiePlage('15:00', '11:00') || ''))
verifier('saisie : une heure illisible refusée', !!refusDeSaisiePlage('25:00', ''))
verifier('⚠️ une plage sans aucun créneau est signalée', plageSansCreneau({ de: '06:00', a: '07:00' }, [cr('11:00', '11:30'), cr('17:00', '17:30')]))
verifier('une plage avec un créneau ne l’est pas', !plageSansCreneau(SANDWICH, [cr('11:00', '11:30'), cr('17:00', '17:30')]))
verifier('un créneau désactivé ne compte pas', plageSansCreneau(SANDWICH, [cr('11:00', '11:30', { actif: false }), cr('17:00', '17:30')]))
verifier('sans créneau du tout, on ne crie pas (autre message ailleurs)', !plageSansCreneau(SANDWICH, []))

// ═══════════════════════════════════════════════════════════════════════════
// 2. L'ENCODAGE : ON PRÉVIENT, ON N'INTERDIT PAS
// ═══════════════════════════════════════════════════════════════════════════
{
  const lignes = [
    { article_id: 7, article_nom: 'Sandwich jambon', retrait_jusqua: '15:00:00' },
    { article_id: 7, article_nom: 'Sandwich jambon', retrait_jusqua: '15:00:00' },
    { article_id: 8, article_nom: 'Pain' },
  ]
  const avis = avertissementsPlage(lignes, cr('16:00', '16:30'))
  verifier('un avertissement par article hors plage (pas par ligne)', avis.length === 1 && avis[0].code === 'plage:7', JSON.stringify(avis))
  verifier('il nomme l’article et la plage', avis[0]?.message.includes('« Sandwich jambon »') && avis[0]?.message.includes('jusqu’à 15 h'))
  verifier('dans la plage : rien', avertissementsPlage(lignes, cr('12:00', '12:30')).length === 0)
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. LA SÉLECTION GROUPÉE (« Sandwichs : jusqu'à 15 h » d'un coup)
// ═══════════════════════════════════════════════════════════════════════════
{
  const arts = [
    { id: 1, nom: 'Sandwich jambon', categorie: 'Sandwichs' },
    { id: 2, nom: 'Sandwich fromage', categorie: 'Sandwichs', retrait_jusqua: '15:00:00' },
    { id: 3, nom: 'Sandwich vitrine', categorie: 'Sandwichs', est_vitrine: true },
  ]
  const valeur = { de: '', a: '15:00' }
  const patchs = patchsDuLot({ action: 'plage', articles: arts, valeur, deuxCircuits: true })
  verifier('l’action existe', ACTIONS_LOT.includes('plage'))
  verifier('le lot écrit la plage des articles qui changent', patchs.length === 1 && patchs[0].id === 1
    && patchs[0].patch.retrait_jusqua === '15:00' && patchs[0].patch.retrait_des === null, JSON.stringify(patchs))
  verifier('l’article déjà réglé n’est pas réécrit', !patchs.some(p => p.id === 2))
  const ecarts = ecartsDuLot({ action: 'plage', articles: arts, valeur, deuxCircuits: true })
  verifier('l’article en vitrine est laissé de côté et nommé', ecarts.length === 1 && ecarts[0].id === 3 && /vitrine/.test(ecarts[0].raison))
  verifier('🔴 hors alimentaire : rien n’est écrit', patchsDuLot({ action: 'plage', articles: arts, valeur, deuxCircuits: false }).length === 0)
  verifier('une saisie à l’envers est refusée', !!refusDuLot({ action: 'plage', articles: arts, valeur: { de: '16:00', a: '15:00' } }))
  verifier('et n’écrit rien', patchsDuLot({ action: 'plage', articles: arts, valeur: { de: '16:00', a: '15:00' }, deuxCircuits: true }).length === 0)
  const vider = patchsDuLot({ action: 'plage', articles: arts, valeur: { de: '', a: '' }, deuxCircuits: true })
  verifier('vider la plage la retire (tous les créneaux)', vider.length === 1 && vider[0].id === 2 && vider[0].patch.retrait_jusqua === null)
  const r = resumeDuLot({ action: 'plage', patchs, coches: 3, valeur, ecarts })
  verifier('le résumé dit ce qui change', /1 article : « Retrait jusqu’à 15 h »/.test(r) && /laissé de côté/.test(r), r)
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. CHAQUE ENDROIT QUI DOIT LA LIRE
// ═══════════════════════════════════════════════════════════════════════════
verifier('🔴 le serveur lit la plage en base (lignes de commande)', /\bretrait_des\b/.test(SELECT_ARTICLES) && /\bretrait_jusqua\b/.test(SELECT_ARTICLES))
verifier('la copie de catalogue emporte la plage', CHAMPS_COPIES.includes('retrait_des') && CHAMPS_COPIES.includes('retrait_jusqua'))
{
  const L = code('lib/lignes-commande.js')
  verifier('la ligne serveur porte la plage de l’article résolu',
    L.includes('retrait_des: article.retrait_des ?? null,') && L.includes('retrait_jusqua: article.retrait_jusqua ?? null,'))
}
{
  const R = code('app/api/stripe/checkout/create-commande/route.js')
  verifier('🔴 le second article d’un duo est lu avec sa plage',
    R.includes(".from('articles').select('id, delai_minutes, vente_jour, commande_active, stock_mode, retrait_des, retrait_jusqua')"))
  const iCheck = R.indexOf('const refusPlage = refusDePlageAuCreneau(entreesPlage, creneau)')
  // ⚠️ L'INSERTION DOIT ÊTRE TROUVÉE : une garde qui ne la trouve pas
  // passerait à vide (leçon des gardes muettes).
  const iInsert = R.search(/\.from\('commandes'\)\s*\.insert\(\{/)
  verifier('🔴 create-commande refuse un créneau hors plage', iCheck > 0
    && R.includes("return NextResponse.json({ ok: false, error: refusPlage, creneau_indisponible: true }, { status: 409 })"))
  verifier('🔴 AVANT d’enregistrer la commande', iCheck > 0 && iInsert > 0 && iCheck < iInsert, `${iCheck} / ${iInsert}`)
  verifier('le duo passe son second article', R.includes('plageDeLaLigne(l, l, l.deal_article2_id ? secondDuDuoParId[String(l.deal_article2_id)] || null : null)'))
  verifier('ni en boutique (pas de créneau)', /if \(creneau && !estBoutique\) \{\s*const entreesPlage/.test(R))
}
{
  const R = code('app/api/equipe/commande/creer/route.js')
  verifier('l’encodage prévient (« Encoder quand même »)', R.includes('avertissements.push(...avertissementsPlage(lignes, creneau))'))
}
{
  const F = code('app/commander/[slug]/page.js')
  verifier('🔴 la fiche filtre les créneaux de retrait par la plage du panier',
    F.includes('return liste.filter(cr => creneauCommandable(cr, { dateStr, instantDebut: brusselsInstant }).ok && creneauDansPlage(cr, plage))'))
  verifier('🔴 et les tournées de livraison', F.includes('if (!creneauDansPlage(slot, plagePanierCourante())) return false'))
  verifier('le refus à l’ajout, article', /if \(refuseParDelai\(article, \{ article, options, variante \}\)\) return\s*if \(refuseParPlage\(article\)\) return/.test(F))
  verifier('le refus à l’ajout, lot et duo', F.includes('if (refuseParPlage({ id: article.id, nom: deal.titre, deal_id: deal.id, offre: { heure_debut: deal.heure_debut, heure_fin: deal.heure_fin } })) return'))
  verifier('⚠️ un créneau choisi avant le sandwich ne compte plus', F.includes("(!!creneauChoisi && creneauChoisiDansPlage())"))
  verifier('⚠️ le créneau choisi est retrouvé par son identifiant', F.includes('.find(c => c.id === creneauChoisi)'))
  verifier('la carte dit la plage, aux trois endroits', (F.match(/mentionDispo=\{mentionCarte\(a\)\}/g) || []).length === 3)
  verifier('🔴 et la mention de la carte contient bien la plage',
    F.includes("return [mentionDisponibilite(regleArticle(a)), libellePlage(plageDeLArticle(a))].filter(Boolean).join(' · ') || null"))
  verifier('le choix du créneau dit pourquoi', (F.match(/\{raisonDeLaPlage\(entreesPlagePanier\(\)\)\}/g) || []).length === 2)
}
{
  const C = code('app/dashboard/ConfigDashboard.js')
  verifier('l’éditeur enregistre la plage (alimentaire, vendu en ligne)',
    C.includes('retrait_des: avecPlage ? heureDePlage(form.retrait_des) : null,')
    && C.includes('retrait_jusqua: avecPlage ? heureDePlage(form.retrait_jusqua) : null,')
    && C.includes('const avecPlage = estAlimentaire && form.vendable'))
  verifier('🔴 une saisie à l’envers est refusée avant d’écrire', C.includes('const refusPlage = avecPlage ? refusDeSaisiePlage(form.retrait_des, form.retrait_jusqua) : null'))
  verifier('l’éditeur relit la plage', C.includes("retrait_des: heureDePlage(a.retrait_des) || ''") && C.includes("retrait_jusqua: heureDePlage(a.retrait_jusqua) || ''"))
  verifier('⚠️ il prévient si la plage ne tombe sur aucun créneau', C.includes('if (plageSansCreneau(plageReglee, crs || [])) {'))
  verifier('la sélection groupée la propose en alimentaire', C.includes("{ val: 'plage', label: 'Heures de retrait' },"))
  verifier('et la contrôle avant d’écrire', C.includes("const ACTIONS_AVEC_REFUS = ['prix', 'stock', 'tva', 'temps_prepa', 'vente', 'jour_meme', 'sur_commande', 'plage']"))
}
{
  const M = brut('migrations/MIGRATION_PLAGE_RETRAIT_ARTICLE_19_10.sql')
  verifier('la migration ajoute deux colonnes vides', /ADD COLUMN IF NOT EXISTS retrait_des\s+time,/.test(M) && /ADD COLUMN IF NOT EXISTS retrait_jusqua time;/.test(M))
  verifier('🔴 elle ne réécrit aucun article', !/UPDATE public\.articles/i.test(M))
  verifier('la contrainte d’ordre est posée', M.includes('CHECK (retrait_des IS NULL OR retrait_jusqua IS NULL OR retrait_des < retrait_jusqua)'))
  verifier('les droits sont explicites', M.includes('GRANT SELECT (retrait_des, retrait_jusqua) ON public.articles TO anon, authenticated;'))
}

console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko) {
  for (const e of echecs) console.log(`  ✕ ${e}`)
  process.exit(1)
}
console.log('Plage de retrait verte.')
