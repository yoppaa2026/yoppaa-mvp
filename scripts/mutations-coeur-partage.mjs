// HARNAIS DE MUTATION — LE CŒUR ET LE PARTAGE D'UN ARTICLE (16/10 soir).
//
// ✅ ALEX, 16/10 soir (tableau, les quatre) : aperçu de l'article partagé,
// badge « Coup de cœur », « Les plus aimés », « Tes coups de cœur ». Ce
// harnais casse chaque règle et chaque branchement un par un, et exige que
// `verif:coeur` rougisse à chaque fois.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES, vérifié par npm run verif:ancres.
//
//   node scripts/mutations-coeur-partage.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANCS = ['verif:coeur']
const MODULE = 'lib/coups-de-coeur.js'
const PARTAGE = 'lib/partage-article.js'
const FICHE = 'app/commander/[slug]/page.js'

const MUTATIONS = [
  // ─── LES RÈGLES ─────────────────────────────────────────────────────────
  { nom: '🔴 le compteur s’affiche dès 1',
    de: '  return Number.isFinite(v) && v >= SEUIL_COUP_DE_COEUR ? v : null',
    vers: '  return Number.isFinite(v) && v >= 1 ? v : null' },
  { nom: '🔴 le badge sans seuil',
    de: '    .filter(([, n]) => Number.isFinite(n) && n >= SEUIL_COUP_DE_COEUR)',
    vers: '    .filter(([, n]) => Number.isFinite(n))' },
  { nom: '🔴 le badge sur toute une carte d’ex aequo',
    de: '  return tete.length > 2 ? new Set() : new Set(tete.map(([id]) => id))',
    vers: '  return new Set(tete.map(([id]) => id))' },
  { nom: '🔴 les plus aimés à l’envers',
    de: '    .sort((a, b) => b.n - a.n || String(a.nom).localeCompare(String(b.nom), \'fr\'))',
    vers: '    .sort((a, b) => a.n - b.n || String(a.nom).localeCompare(String(b.nom), \'fr\'))' },
  { nom: '🔴 un article retiré reste dans les plus aimés',
    de: '    .filter(l => l.nom && Number.isFinite(l.n) && l.n > 0)',
    vers: '    .filter(l => Number.isFinite(l.n) && l.n > 0)' },
  { nom: '🔴 tes coups de cœur oublient un identifiant en nombre',
    de: '  const set = new Set((Array.isArray(aimes) ? aimes : []).map(String))',
    vers: '  const set = new Set(Array.isArray(aimes) ? aimes : [])' },
  { nom: '🔴 le lien partagé mène à la fiche (aperçu du commerce)', fichier: PARTAGE,
    de: '  return `${base}/commander/${encodeURIComponent(slug)}/article/${encodeURIComponent(articleId)}`',
    vers: '  return `${base}/commander/${encodeURIComponent(slug)}?article=${encodeURIComponent(articleId)}`' },
  { nom: '🔴 « 0,00 € » sur un article sans prix', fichier: PARTAGE,
    de: '  if (!Number.isFinite(n) || n <= 0) return null',
    vers: '  if (!Number.isFinite(n)) return null' },
  { nom: '🔴 une description vide laisse un trou', fichier: PARTAGE,
    de: '    : `À commander ${chezLeCommerce(commerce.nom)} sur Yoppaa, sans faire la file.`',
    vers: "    : ''" },

  // ─── LES BRANCHEMENTS ───────────────────────────────────────────────────
  { nom: '🔴 « Partager » envoie l’ancien lien', fichier: FICHE,
    de: '    const url = lienPartageArticle(commercant?.slug || slug, a.id, window.location.origin)',
    vers: '    const url = `${window.location.origin}/commander/${commercant?.slug || slug}?article=${a.id}`' },
  { nom: '🔴 le compteur ignore le seuil', fichier: FICHE,
    de: '              {compteurAffiche(social?.count) ?? \'J’aime\'}',
    vers: '              {social?.count > 0 ? social.count : \'J’aime\'}' },
  { nom: '🔴 « Tes coups de cœur » ne s’affiche jamais', fichier: FICHE,
    de: '                {mesCoeurs.length > 0 && (',
    vers: '                {false && (' },
  { nom: '🔴 un cœur posé ne met plus la carte à jour', fichier: FICHE,
    de: '          compteurs: { ...c.compteurs, [id]: j.count },',
    vers: '          compteurs: c.compteurs,' },
  { nom: '🔴 la page de partage indexée', fichier: 'app/commander/[slug]/article/[id]/page.js',
    de: '    robots: { index: false, follow: true },',
    vers: '    robots: { index: true, follow: true },' },
  { nom: '🔴 un article d’un autre commerce se partage', fichier: 'lib/partage-article-server.js',
    de: ".eq('id', articleId).eq('commercant_id', commerce.id).eq('actif', true).maybeSingle(),",
    vers: ".eq('id', articleId).eq('actif', true).maybeSingle()," },
  { nom: '🔴 la photo sort malgré le réglage du commerçant', fichier: 'lib/partage-article-server.js',
    de: '    return { commerce, article: { ...article, photo_url: photos ? article.photo_url || null : null } }',
    vers: '    return { commerce, article }' },
  { nom: '🔴 la route rend les identifiants d’appareil', fichier: 'app/api/articles/coups-de-coeur/route.js',
    de: '    return NextResponse.json({ ok: true, compteurs, aimes })',
    vers: '    return NextResponse.json({ ok: true, compteurs, aimes, likes })' },
  { nom: '🔴 une photo illisible casse l’image', fichier: 'app/commander/[slug]/article/[id]/opengraph-image.js',
    de: "    if (type !== 'image/jpeg' && type !== 'image/png') return null",
    vers: '' },
  { nom: '🔴 « Les plus aimés » disparaît des statistiques', fichier: 'app/dashboard/ConfigDashboard.js',
    de: '      if (vivant && j?.ok) setAimes(plusAimes(j.compteurs, arts || []))',
    vers: '      if (vivant && j?.ok) setAimes([])' },
]

const lancer = () => {
  try {
    const sortie = execSync(BANCS.map(b => `npm run ${b}`).join(' && '), { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    // ⚠️ ON DISTINGUE « ROUGE » DE « PLANTÉ ».
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
if (finalRouge) console.log('🔴 BANCS ROUGES APRÈS RESTAURATION.')
else console.log('\nBancs verts après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
