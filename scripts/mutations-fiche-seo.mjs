// HARNAIS DE MUTATION — CE QUE GOOGLE LIT D'UNE FICHE (15/10).
//
// 🔴 CE QU'ON MESURE : que la fiche d'un salon reste visible pour Google, et
// qu'un commerce n'y ait qu'UNE page retenue. Le défaut d'origine ne faisait
// aucun bruit : la page s'affichait parfaitement, Google la rangeait sous le
// titre générique du site, et personne ne cherchait « Yoppaa, ton quartier
// dans ta poche » pour trouver son coiffeur.
//
// ⚠️ DEUX BANCS : `verif:fiche-seo` (la règle, exécutée) et `verif:avis`
// (les deux layouts l'appellent, le balisage lit le forfait).
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES, vérifié par npm run verif:ancres.
//
//   node scripts/mutations-fiche-seo.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANCS = ['verif:fiche-seo', 'verif:avis']
const MODULE = 'lib/fiche-seo.js'
const LAYOUT_RDV = 'app/commander/rdv/[slug]/layout.js'
const LAYOUT_FICHE = 'app/commander/[slug]/layout.js'
const SITEMAP = 'app/sitemap.js'
const GOOGLE = 'lib/action-google.js'
const LECTURE = 'lib/commande-realisable-lecture.js'

const MUTATIONS = [
  // ─── LA PAGE RETENUE ────────────────────────────────────────────────────
  { nom: '🔴 un salon est retenu par sa boutique (verif:fiche-seo « un salon : sa fiche rendez-vous »)',
    de: '  return `${BASE_YOPPAA}${ficheDuCommerce(c)}`',
    vers: '  return `${BASE_YOPPAA}/commander/${c.slug}`' },

  { nom: '🔴 chaque page se croit la page retenue (« sa boutique ne l’est pas »)',
    de: '  return !!ici && ici === adresseCanonique(c)',
    vers: '  return !!ici' },

  { nom: '🔴 chaque page se déclare elle-même à Google (« la page de table renvoie Google vers la fiche »)',
    de: '  const url = adresseCanonique(c)',
    vers: '  const url = urlDePage(c, page)' },

  // ─── LES MÉTADONNÉES ────────────────────────────────────────────────────
  { nom: '🔴 la fiche rendez-vous redevient « Commander » (« le titre d’un salon dit le geste »)',
    de: '    titre = `${action} chez ${c.nom}${ou} · Yoppaa`',
    vers: '    titre = `${c.nom}${ou} · Commander sur Yoppaa`' },

  { nom: '🔴 la description par défaut d’un salon parle de commande (« parle de rendez-vous »)',
    de: '    descParDefaut = `Découvre ${c.nom}${ou} sur Yoppaa : infos, horaires et ${action.toLowerCase()} en ligne.`',
    vers: '    descParDefaut = `Découvre ${c.nom}${ou} sur Yoppaa : infos, horaires et commande en ligne sans faire la file.`' },

  { nom: '🔴 le titre promet « Commander » sans commande (« le titre ne promet pas Commander »)',
    de: '  } else if (page === PAGE_BOUTIQUE && commande) {',
    vers: '  } else if (page === PAGE_BOUTIQUE) {' },

  { nom: '🔴 le titre promet un rendez-vous éteint (« un salon aux rendez-vous éteints »)',
    de: '  if (page === PAGE_RDV && reservation) {',
    vers: '  if (page === PAGE_RDV) {' },

  { nom: '🔴 le titre ignore la preuve de commande (verif:avis « pose ses métadonnées »)',
    fichier: LAYOUT_FICHE,
    // ⚠️ ANCRE RECALÉE LE 27/10 : le titre reçoit aussi les lieux.
    de: '  return metadataFiche(c, PAGE_BOUTIQUE, { commandeRealisable, lieux })',
    vers: '  return metadataFiche(c, PAGE_BOUTIQUE, { lieux })' },

  { nom: '🔴 une fiche non publiée devient indexable (« jamais indexée »)',
    de: '      robots: { index: false, follow: false },',
    vers: '      robots: { index: true, follow: true },' },

  { nom: '🔴 la description du commerçant n’est plus nettoyée (« nettoyée »)',
    de: '  const desc = (c.description && String(c.description).trim()) || descParDefaut',
    vers: '  const desc = c.description || descParDefaut' },

  // ─── LE BALISAGE ────────────────────────────────────────────────────────
  { nom: '🔴 les deux pages déclarent le commerce (« la boutique d’un salon ne déclare rien »)',
    de: '  if (!c || !estPageCanonique(c, page)) return null',
    vers: '  if (!c) return null' },

  // ─── LES LAYOUTS L'APPELLENT ────────────────────────────────────────────
  { nom: '🔴 la fiche rendez-vous se prend pour la boutique (verif:avis « la fiche rendez-vous pose ses métadonnées »)',
    fichier: LAYOUT_RDV,
    // ⚠️ ANCRE RECALÉE LE 15/10 : le titre reçoit la preuve de commande.
    // ⚠️ ET LE 27/10 : les lieux.
    de: '  return metadataFiche(c, PAGE_RDV, { commandeRealisable, lieux })',
    vers: '  return metadataFiche(c, PAGE_BOUTIQUE, { commandeRealisable, lieux })' },

  { nom: '🔴 la fiche rendez-vous perd son balisage (verif:avis « pose le balisage »)',
    fichier: LAYOUT_RDV,
    // ⚠️ ANCRE RECALÉE LE 15/10 : le balisage reçoit la preuve de commande.
    // ⚠️ ET LE 27/10 : les lieux et la carte.
    de: '  const jsonLd = jsonLdFiche(c, PAGE_RDV, avis, { commandeRealisable, lieux, catalogue })',
    vers: '  const jsonLd = null' },

  { nom: '🔴 la fiche boutique perd son balisage (verif:avis « la fiche boutique pose le balisage »)',
    fichier: LAYOUT_FICHE,
    de: '  const jsonLd = jsonLdFiche(c, PAGE_BOUTIQUE, avis, { commandeRealisable, lieux, catalogue })',
    vers: '  const jsonLd = null' },

  // ─── LA PREUVE DE COMMANDE (15/10, le Bistrologue) ─────────────────────
  { nom: '🔴 la fiche boutique ne passe plus la preuve : la commande se tait toujours (verif:avis « avec la preuve de commande »)',
    fichier: LAYOUT_FICHE,
    de: '  const commandeRealisable = c ? await getCommandeRealisable(c) : false',
    vers: '  const commandeRealisable = false' },

  // ⚠️ 27/10 : le balisage lit la preuve dans un `Promise.all`.
  { nom: '🔴 le balisage de la boutique ne lit plus la preuve (verif:avis « avec la preuve de commande »)',
    fichier: LAYOUT_FICHE,
    de: '    ? await Promise.all([getAvisAgregat(c.id), getCommandeRealisable(c), getLieux(c.id), getArticles(c.id), getGroupesCommunes()])',
    vers: '    ? await Promise.all([getAvisAgregat(c.id), false, getLieux(c.id), getArticles(c.id), getGroupesCommunes()])' },

  { nom: '🔴 le balisage oublie la preuve et redevient muet sur la commande (verif:avis « le balisage appelle le geste »)',
    de: '    ...potentialActionJsonLd(c, options),',
    vers: '    ...potentialActionJsonLd(c),' },

  // ─── LES GESTES DÉCLARÉS À GOOGLE (15/10, le Bistrologue) ──────────────
  { nom: '🔴 la commande se déclare sans preuve (verif:avis « ne déclare QUE la réservation »)',
    fichier: GOOGLE,
    de: "&& canDo(plan, 'commande') && commandeAllumee(commercant) && commandeRealisable === true) {",
    vers: "&& canDo(plan, 'commande') && commandeAllumee(commercant)) {" },

  { nom: '🔴 une commande éteinte se déclare (« commande éteinte : rien »)',
    fichier: GOOGLE,
    de: "&& canDo(plan, 'commande') && commandeAllumee(commercant) && commandeRealisable === true) {",
    vers: "&& canDo(plan, 'commande') && commandeRealisable === true) {" },

  { nom: '🔴 la réservation se déclare sur le seul forfait (« un coiffeur qui a ÉTEINT ses rendez-vous »)',
    fichier: GOOGLE,
    de: '  if (reservationActive(commercant, maintenant)) {',
    vers: "  if (canDo(plan, 'rdv')) {" },

  { nom: '🔴 le restaurant « prend rendez-vous » (« Réserver une table »)',
    fichier: GOOGLE,
    de: '      libelle: motsReservation(commercant).action,',
    vers: "      libelle: 'Prendre rendez-vous'," },

  { nom: '🔴 le lien de table part dans le mauvais champ (« champ Réservations »)',
    fichier: GOOGLE,
    de: "      champGoogle: table ? 'Réservations' : 'Prendre rendez-vous',",
    vers: "      champGoogle: 'Prendre rendez-vous'," },

  { nom: '🔴 un coiffeur se commande (« un coiffeur ne se commande jamais »)',
    fichier: GOOGLE,
    de: "  if (commercant.categorie !== 'vitrine'",
    vers: '  if (true' },

  { nom: '🔴 le balisage ne garde qu’un geste sur deux (« les déclare TOUS LES DEUX »)',
    fichier: GOOGLE,
    de: '  return { potentialAction: blocs.length === 1 ? blocs[0] : blocs }',
    vers: '  return { potentialAction: blocs[0] }' },

  { nom: '🔴 le kit ne donne qu’un lien sur deux (« deux gestes, deux liens »)',
    fichier: GOOGLE,
    de: '    liens: actions.map(a => ({ champ: a.champGoogle, url: a.url, libelle: a.libelle })),',
    vers: '    liens: actions.slice(0, 1).map(a => ({ champ: a.champGoogle, url: a.url, libelle: a.libelle })),' },

  // ─── LA LECTURE DE LA PREUVE ────────────────────────────────────────────
  { nom: '🔴 une lecture en erreur ouvre (verif:fiche-seo « une lecture en erreur FERME »)',
    fichier: LECTURE,
    de: '    if (art.error || cre.error || liv.error) return false',
    vers: '    if (art.error) return false' },

  { nom: '🔴 la livraison ne compte plus (« sans créneau, la livraison suffit »)',
    fichier: LECTURE,
    de: '      livraisonDispo: livraisonDisponible(commercant, liv.data),',
    vers: '      livraisonDispo: false,' },

  { nom: '🔴 une boutique de détail exige un créneau (« pas besoin de créneau »)',
    fichier: LECTURE,
    de: '      alimentaire: isAlimentaire(commercant),',
    vers: '      alimentaire: true,' },

  { nom: '🔴 une livraison éteinte compte (« pas éteinte »)',
    fichier: 'lib/zone-etoile.js',
    de: '  return !!(commercant?.livraison_actif && config',
    vers: '  return !!(config' },

  { nom: '🔴 la lecture publique perd les interrupteurs (verif:avis « rapatrie … les interrupteurs »)',
    fichier: 'lib/fiche-seo-server.js',
    de: "'id, rdv_actif, commande_actif, livraison_actif, nom, description",
    vers: "'id, nom, description" },

  { nom: '🔴 le kit ne passe plus la preuve (verif:avis « la page de kit aussi passe la preuve »)',
    fichier: 'app/kit/[slug]/page.js',
    de: '    consigne = consigneGoogle(com, { commandeRealisable: await lireCommandeRealisable(supabase, com) })',
    vers: '    consigne = consigneGoogle(com)' },

  { nom: '🔴 le tableau de bord ne passe plus la preuve (« et lui passe la preuve »)',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: '        setConsigneG(consigneGoogle(data, { commandeRealisable: await lireCommandeRealisable(supabase, data) }))',
    vers: '        setConsigneG(consigneGoogle(data))' },

  { nom: '🔴 la fiche recalcule la livraison à sa façon (« la fiche lit la livraison par la même règle »)',
    fichier: 'app/commander/[slug]/page.js',
    de: '  const livraisonDispo = livraisonDisponible(commercant, livraisonConfig)',
    vers: '  const livraisonDispo = !!commercant?.livraison_actif' },

  // ─── LE SITEMAP, /commander, LE ROBOTS ──────────────────────────────────
  { nom: '🔴 le concours redevient indexable (Alex, 17/10)',
    fichier: 'app/concours/page.js',
    de: '  robots: { index: false, follow: true },',
    vers: '  robots: { index: true, follow: true },' },
  { nom: '🔴 le concours revient dans le plan du site (17/10)',
    fichier: SITEMAP,
    de: '    // ⚠️ PAS /concours : en noindex pour le moment (Alex, 17/10). Annoncer une',
    vers: '    { url: `${BASE_URL}/concours` }, // ⚠️ PAS /concours : en noindex pour le moment (Alex, 17/10). Annoncer une' },
  { nom: '🔴 le plan annonce « modifiée à l’instant » (17/10)',
    fichier: SITEMAP,
    de: "    { url: `${BASE_URL}/commander`, ...(liste ? { lastModified: liste } : {}), changeFrequency: 'daily', priority: 0.9 },",
    vers: "    { url: `${BASE_URL}/commander`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 }," },
  { nom: '🔴 la date du plan : la plus ANCIENNE au lieu de la plus récente (17/10)',
    fichier: 'lib/plan-du-site.js',
    de: '  return temps.length ? new Date(Math.max(...temps)) : undefined',
    vers: '  return temps.length ? new Date(Math.min(...temps)) : undefined' },
  { nom: '🔴 le sitemap annonce la boutique d’un salon (« le sitemap annonce la page retenue »)',
    fichier: SITEMAP,
    // ⚠️ ANCRE RECALÉE LE 17/10 : le plan du site a perdu un niveau de retrait.
    de: '    url: adresseCanonique(c),',
    vers: '    url: `${BASE_URL}/commander/${c.slug}`,' },

  { nom: '🔴 le sitemap ne lit plus la catégorie (« il lit la catégorie »)',
    fichier: SITEMAP,
    de: ".select('slug, categorie, created_at')",
    vers: ".select('slug, created_at')" },

  { nom: '🔴 /commander reprend le slogan générique (« le titre validé par Alex »)',
    fichier: 'app/commander/layout.js',
    de: "const TITRE = 'Les commerces de ton quartier · Yoppaa'",
    vers: "const TITRE = 'Yoppaa, ton quartier dans ta poche'" },

  { nom: '🔴 l’annulation de rendez-vous rouvre aux robots (« les pages d’annulation sont fermées »)',
    fichier: 'app/robots.js',
    de: "        '/commander/rdv/cancel',",
    vers: '' },

  // ─── 27/10 : LE SIÈGE SOCIAL NE SORT PLUS ──────────────────────────────
  { nom: '🔴 la ville du titre retombe sur le siège (« le siège seul ne donne jamais la ville »)',
    de: '  const ville = extraireVille(lieuPublic(options.lieux)?.adresse)',
    vers: '  const ville = extraireVille(lieuPublic(options.lieux)?.adresse || c.adresse)' },

  { nom: '🔴 le balisage publie le siège (« sans lieu, aucune adresse publiée »)',
    de: "    ...(lieu?.adresse ? { address: { '@type': 'PostalAddress', streetAddress: lieu.adresse, addressCountry: 'BE' } } : {}),",
    vers: "    ...((lieu?.adresse || c.adresse) ? { address: { '@type': 'PostalAddress', streetAddress: lieu?.adresse || c.adresse, addressCountry: 'BE' } } : {})," },

  { nom: '🔴 le balisage publie les coordonnées du siège (« ni ses coordonnées »)',
    de: "    ...(lieu?.latitude && lieu?.longitude ? { geo: { '@type': 'GeoCoordinates', latitude: lieu.latitude, longitude: lieu.longitude } } : {}),",
    vers: "    ...(c.latitude && c.longitude ? { geo: { '@type': 'GeoCoordinates', latitude: c.latitude, longitude: c.longitude } } : {})," },

  { nom: '🔴 la lecture rapatrie de nouveau le siège (« ne rapatrie plus le siège social »)',
    fichier: 'lib/fiche-seo-server.js',
    de: "      .select('id, rdv_actif, commande_actif, livraison_actif, nom, description, logo_url, slug, type, categorie, telephone, horaires_detail, ordre_categories, plan, essai_plan, created_at')",
    vers: "      .select('id, rdv_actif, commande_actif, livraison_actif, nom, description, logo_url, adresse, slug, type, categorie, telephone, horaires_detail, ordre_categories, plan, essai_plan, created_at')" },

  { nom: '🔴 une commune se déduit du siège (« jamais par son siège »)',
    fichier: 'lib/commerces-commune.js',
    de: '    const commune = communeDuCodePostal(codePostalDe(lieu?.adresse), communes)',
    vers: '    const commune = communeDuCodePostal(codePostalDe(lieu?.adresse || c.adresse), communes)' },

  // ─── 27/10 : LA FICHE COMPLÈTE CHEZ GOOGLE ─────────────────────────────
  { nom: '🔴 un jour fermé s’annonce ouvert (« un jour fermé n’est jamais annoncé ouvert »)',
    fichier: 'lib/fiche-contenu-seo.js',
    de: '  if (!jour || !jour.ouvert) return []',
    vers: '  if (!jour) return []' },

  { nom: '🔴 un itinérant annonce des heures d’ouverture (« aucune heure d’ouverture »)',
    fichier: 'lib/fiche-contenu-seo.js',
    de: '  if (estItinerant(lieux)) return []',
    vers: '' },

  { nom: '🔴 les tables et jointures deviennent des prestations (« ni table de restaurant ni jointure »)',
    fichier: 'lib/fiche-contenu-seo.js',
    de: '      .filter(p => p && p.nom && !estJointure(p) && !estParCouverts(p))',
    vers: '      .filter(p => p && p.nom)' },

  { nom: '🔴 un prix nul s’affiche (« un prix nul ne s’affiche pas »)',
    fichier: 'lib/fiche-contenu-seo.js',
    de: "  return valeur != null && valeur !== '' && Number.isFinite(n) && n > 0 ? n : null",
    vers: '  return Number.isFinite(n) ? n : null' },

  { nom: '🔴 le balisage perd les horaires (« le balisage porte les horaires »)',
    de: '    ...(horaires.length ? { openingHoursSpecification: horaires } : {}),',
    vers: '' },

  { nom: '🔴 le balisage perd la carte (« et la carte »)',
    de: '    ...catalogueJsonLd(options.catalogue || [], c.nom),',
    vers: '' },

  { nom: '🔴 la boutique remet les blocs gris (« montre la fiche du serveur pendant le chargement »)',
    fichier: 'app/commander/[slug]/page.js',
    de: '          {loading && (ficheServeur.resume ? (',
    vers: '          {loading && (false ? (' },

  { nom: '🔴 la fiche rendez-vous perd ses liens (« garde les liens en bas de la fiche »)',
    fichier: 'app/commander/rdv/[slug]/page.js',
    de: '              {etape === 1 && ficheServeur.liens}',
    vers: '' },

  { nom: '🔴 le plan du site oublie les communes (« le plan du site annonce les communes »)',
    fichier: SITEMAP,
    de: '  return [...staticRoutes, ...communes, ...fiches]',
    vers: '  return [...staticRoutes, ...fiches]' },
]

const lancer = () => {
  try {
    const sortie = execSync(BANCS.map(b => `npm run ${b}`).join(' && '), { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
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
  console.log(`🔴 ${BANCS.join(' + ')} DÉJÀ ROUGE. On ne mesure rien sur un banc rouge.`)
  console.log(depart.extrait)
  process.exit(1)
}
console.log('Bancs verts au départ.\n')

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
  ecrireSur(f, original.replace(m.de, m.vers))
  const res = lancer()
  ecrireSur(f, original)

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
if (finalRouge) console.log(`🔴 BANCS ROUGES APRÈS RESTAURATION.`)
else console.log('\nBancs verts après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
