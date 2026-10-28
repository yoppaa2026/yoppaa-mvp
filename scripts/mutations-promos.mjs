// HARNAIS DE MUTATION — LE MODULE PROMO (28/10)
//
// 🔴 CE QU'ON MESURE : qu'une promo SE VOIE, au bon jour. Chaque mutation remet
// une forme fausse plausible : l'affichage rejugé sur aujourd'hui, une promo
// passée qui s'annonce encore, la pastille qui double le prix barré, une offre
// achetable un autre jour, l'économie qui disparaît du récapitulatif…
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ CHAQUE MUTATION NOMME LA GARDE QU'ELLE DOIT FAIRE ROUGIR.
//
//   npm run mutations:promos

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:promos'

const LIB = 'lib/promos-visibles.js'
const FICHE = 'app/commander/[slug]/page.js'
const FICHE_RDV = 'app/commander/rdv/[slug]/page.js'

const MUTATIONS = [
  { nom: '🔴 demain ne se dit plus « Demain »', fichier: LIB,
    de: "    if (avant === 1) return 'Demain'", vers: "    if (avant === 1) return 'Bientôt'",
    garde: 'demain' },
  { nom: '🔴 une promo passée s annonce encore', fichier: LIB,
    de: '.filter(({ fenetre }) => fenetre && fenetre.fin >= aujourdhui && fenetre.debut <= limite)',
    vers: '.filter(({ fenetre }) => fenetre && fenetre.debut <= limite)',
    garde: 'en cours et à venir sur 14 jours' },
  { nom: '🔴 les invendus du soir entrent dans la section', fichier: LIB,
    de: '.filter(d => d && d.actif !== false && !estInvendu(d) && garder(d))',
    vers: '.filter(d => d && d.actif !== false && garder(d))',
    garde: 'en cours et à venir sur 14 jours' },
  { nom: '🔴 la pastille double le prix barre le jour meme', fichier: LIB,
    de: '  if (candidats.some(p => dealActifCeJour(p.deal, jourChoisi))) return null',
    vers: '',
    garde: 'le mercredi choisi, plus de pastille' },
  { nom: '🔴 l economie ignore la quantite', fichier: LIB,
    de: '    cents += (Math.round(plein * 100) - Math.round(paye * 100)) * q',
    vers: '    cents += (Math.round(plein * 100) - Math.round(paye * 100))',
    garde: 'l’économie en centimes, quantité comprise' },
  { nom: '🔴 la fiche rejuge ses deals sur aujourd hui', fichier: FICHE,
    de: '  const jourDesPromos = dateDeLaCommande()',
    vers: '  const jourDesPromos = aujourdhuiPromos',
    garde: 'la fiche boutique juge ses deals au jour choisi' },
  { nom: '🔴 une carte relit la liste du jour', fichier: FICHE,
    de: 'remise={remiseSurArticle(a, dealsDuJourChoisi, jourDesPromos)}',
    vers: 'remise={remiseSurArticle(a, dealsActifs)}',
    garde: 'plus aucune remise affichée sur la liste d’aujourd’hui' },
  { nom: '🔴 une offre redevient achetable un autre jour', fichier: FICHE,
    de: '    if (!dealActifCeJour(deal, jourDesPromos)) return false',
    vers: '',
    garde: 'une offre ne s’achète qu’au jour choisi' },
  { nom: '🔴 le recapitulatif tait l economie', fichier: FICHE,
    de: '<span style={{ fontWeight: 800 }}>Tu économises {euros(economiePanier())}</span>',
    vers: '<span style={{ fontWeight: 800 }}>{euros(economiePanier())}</span>',
    garde: 'le récapitulatif dit l’économie' },
  { nom: '🔴 la fiche RDV annonce aussi les promos du jour en double', fichier: FICHE_RDV,
    de: 'const promosAVenirFiche = promosAVenir(dealsActifs, aujourdhuiPromos).filter(p => !p.enCours)',
    vers: 'const promosAVenirFiche = promosAVenir(dealsActifs, aujourdhuiPromos)',
    garde: 'la fiche RDV annonce les promos à venir' },
  { nom: '🔴 la prestation perd sa pastille', fichier: FICHE_RDV,
    de: 'const venir = promoAVenirPourPrestation(p, dealsActifs, jourPrix, aujourdhuiPromos)',
    vers: 'const venir = null',
    garde: 'la pastille sur la prestation' },
  { nom: '🔴 l email ne barre plus le prix plein', fichier: 'lib/resend.js',
    de: '  if (!Number.isFinite(plein) || !Number.isFinite(paye) || plein <= paye) return \'\'',
    vers: '  return \'\'',
    garde: 'l’email client barre le prix plein de la ligne en promo' },
  { nom: '🔴 les notifications ne lisent plus le prix plein', fichier: 'lib/commande-notifs.js',
    de: 'quantite_fournisseur, prix_unitaire, prix_plein, options,',
    vers: 'quantite_fournisseur, prix_unitaire, options,',
    garde: 'les notifications lisent le prix plein en base' },
  { nom: '🔴 l email commercant tait la promo', fichier: 'lib/resend.js',
    de: '        ${ligneEconomiePromo(economie_promo, { pourCommercant: true })}',
    vers: '',
    garde: 'l’email commerçant dit ce que la promo a offert' },
  // ── Lot 1c : la trace sur le rendez-vous ──
  { nom: '🔴 la trace RDV garde une remise qui ne baisse rien', fichier: 'lib/prix-prestation-server.js',
    de: '  if (!remise?.deal?.id || !Number.isFinite(plein) || !Number.isFinite(paye) || plein <= paye) {',
    vers: '  if (!remise?.deal?.id || !Number.isFinite(plein) || !Number.isFinite(paye)) {',
    garde: 'une « remise » qui ne baisse rien n’est pas une promo' },
  { nom: '🔴 le webhook oublie la trace de l acompte', fichier: 'app/api/stripe/webhook/route.js',
    de: '      prix_plein: Number(meta.prix_plein) > 0 ? Number(meta.prix_plein) : null,',
    vers: '',
    garde: 'le webhook la relit dans les métadonnées' },
  { nom: '🔴 la reservation directe n ecrit plus la trace', fichier: 'app/api/rdv/reserver/route.js',
    de: '        ...traceRdv(remiseRdv),\n        // ✅ 18/10',
    vers: '        // ✅ 18/10',
    garde: 'la réservation directe écrit la trace' },
  { nom: '🔴 l email RDV ne barre plus le prix plein', fichier: 'lib/resend.js',
    de: '${prixPleinBarre({ prix_plein_total: prix_plein, prix_total: prix_estime })}${euros(Number(prix_estime))}</td></tr>${prix_plein != null ? ligneEconomiePromo(Number(prix_plein) - Number(prix_estime)) : \'\'}',
    vers: '${euros(Number(prix_estime))}</td></tr>',
    garde: 'l’email RDV barre le prix plein et dit l’économie' },
]

const lancer = () => {
  try {
    const sortie = execSync(`npm run ${BANC}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, sortie }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    const plante = !/vérifications/.test(sortie)
    return { rouge: true, plante, sortie }
  }
}

const depart = lancer()
if (depart.rouge) {
  console.log(`🔴 ${BANC} EST DÉJÀ ROUGE. On ne mesure rien sur un banc rouge.`)
  console.log(depart.sortie.slice(-400))
  process.exit(1)
}
console.log('Banc vert au départ.\n')

let attrapees = 0
const manquees = []

for (const m of MUTATIONS) {
  const f = chemin(m.fichier)
  const original = readFileSync(f, 'utf8')
  if (!original.includes(m.de)) {
    manquees.push(`${m.nom} — TEXTE INTROUVABLE`)
    console.log(`  ? introuvable : ${m.nom}`)
    continue
  }
  ecrireSur(f, original.replace(m.de, m.vers))
  const res = lancer()
  ecrireSur(f, original)

  if (readFileSync(f, 'utf8') !== original) {
    console.log(`\n🔴 RESTAURATION RATÉE sur ${m.fichier}. On s'arrête.`)
    process.exit(2)
  }

  const nommee = res.sortie.includes(m.garde)
  if (res.rouge && !res.plante && nommee) { attrapees++; console.log(`  ✓ attrapée : ${m.nom}`) }
  else if (res.plante) { manquees.push(`${m.nom} — le banc a PLANTÉ`); console.log(`  ⚠ plantage : ${m.nom}`) }
  else if (res.rouge) { manquees.push(`${m.nom} — rouge, mais PAS sur « ${m.garde} »`); console.log(`  ✕ AUTRE GARDE : ${m.nom}`) }
  else { manquees.push(`${m.nom} — RESTÉ VERT`); console.log(`  ✕ MANQUÉE : ${m.nom}`) }
}

console.log(`\n${attrapees}/${MUTATIONS.length} mutations attrapées.`)
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach((x) => console.log('   • ' + x)) }
const fin = lancer()
console.log(fin.rouge ? '\n🔴 BANC ROUGE APRÈS RESTAURATION.' : '\nBanc vert après restauration. Dépôt intact.')
process.exit(manquees.length || fin.rouge ? 1 : 0)
