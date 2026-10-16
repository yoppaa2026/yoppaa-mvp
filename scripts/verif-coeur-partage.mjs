// Banc du CŒUR ET DU PARTAGE D'UN ARTICLE (16/10 soir).
//
// ✅ ALEX, 16/10 soir (tableau, les quatre) : aperçu de l'article partagé,
// badge « Coup de cœur » dans la carte, « Les plus aimés » côté commerçant,
// « Tes coups de cœur » pour le Yopper.
//
// ⚠️ TOUT S'EXÉCUTE (les règles), puis on vérifie que chaque écran les APPELLE
// à l'endroit qui compte.

import { readFileSync } from 'node:fs'
import { sansProse } from './lire-code.mjs'
import { SEUIL_COUP_DE_COEUR, compteurAffiche, coupsDeCoeur, plusAimes, mesCoupsDeCoeur } from '../lib/coups-de-coeur.js'
import { lienPartageArticle, ficheSurArticle, prixLisible, texteApercuArticle } from '../lib/partage-article.js'

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}
const egal = (nom, a, b) => verifier(nom, JSON.stringify(a) === JSON.stringify(b), `obtenu ${JSON.stringify(a)}, attendu ${JSON.stringify(b)}`)
const lu = (f) => sansProse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'))

// ═══ 1. LE CŒUR ═══════════════════════════════════════════════════════════
{
  egal('le seuil est de 3', SEUIL_COUP_DE_COEUR, 3)
  egal('🔴 « 1 » ne s’affiche pas', compteurAffiche(1), null)
  egal('« 2 » non plus', compteurAffiche(2), null)
  egal('« 3 » s’affiche', compteurAffiche(3), 3)
  egal('un texte se lit', compteurAffiche('7'), 7)
  egal('rien, rien', compteurAffiche(undefined), null)

  egal('🔴 le plus aimé porte le badge', [...coupsDeCoeur({ a: 5, b: 2, c: 4 })], ['a'])
  egal('🔴 sous le seuil, aucun badge', [...coupsDeCoeur({ a: 2, b: 1 })], [])
  egal('un ex aequo partage le badge', [...coupsDeCoeur({ a: 4, b: 4, c: 1 })].sort(), ['a', 'b'])
  egal('🔴 trois ex aequo : plus de badge du tout', [...coupsDeCoeur({ a: 4, b: 4, c: 4 })], [])
  egal('des compteurs absents', [...coupsDeCoeur(null)], [])

  const arts = [{ id: 1, nom: 'Jambon' }, { id: 2, nom: 'Fromage' }, { id: 3, nom: 'Poulet' }]
  egal('🔴 les plus aimés, du plus aimé au moins aimé', plusAimes({ 1: 2, 2: 5, 3: 1 }, arts).map(l => l.nom), ['Fromage', 'Jambon', 'Poulet'])
  egal('le commerçant voit aussi « 1 »', plusAimes({ 3: 1 }, arts).map(l => l.n), [1])
  egal('un article retiré disparaît', plusAimes({ 9: 8, 1: 1 }, arts).map(l => l.nom), ['Jambon'])
  egal('ex aequo : par nom', plusAimes({ 1: 2, 2: 2 }, arts).map(l => l.nom), ['Fromage', 'Jambon'])
  egal('cinq au plus', plusAimes(Object.fromEntries(Array.from({ length: 8 }, (_, i) => [i, 1])), Array.from({ length: 8 }, (_, i) => ({ id: i, nom: `A${i}` }))).length, 5)

  egal('🔴 tes coups de cœur, dans l’ordre de la carte', mesCoupsDeCoeur(arts, ['3', 1]).map(a => a.nom), ['Jambon', 'Poulet'])
  egal('un article qui n’est plus en vente ne revient pas', mesCoupsDeCoeur(arts, ['42']), [])
}

// ═══ 2. LE PARTAGE ═══════════════════════════════════════════════════════
{
  egal('🔴 le lien partagé porte l’aperçu de l’article', lienPartageArticle('aux-delices', 'abc'), 'https://www.yoppaa.app/commander/aux-delices/article/abc')
  egal('le site d’essai partage un lien d’essai', lienPartageArticle('x', 'y', 'https://test.yoppaa.app'), 'https://test.yoppaa.app/commander/x/article/y')
  egal('sans article, pas de lien', lienPartageArticle('x', null), null)
  egal('🔴 le clic ouvre la fiche sur l’article', ficheSurArticle('aux-delices', 'abc'), '/commander/aux-delices?article=abc')
  egal('le prix à la belge', prixLisible(4), '4,00 €')
  egal('pas de prix, pas de « 0,00 € »', prixLisible(0), null)
  const t = texteApercuArticle({ commerce: { nom: 'Aux Délices des 7 Abbayes' }, article: { nom: 'Jambon', prix: 4, description: '' } })
  egal('🔴 le titre dit l’article, son prix et le commerce', t.titre, 'Jambon · 4,00 € · Aux Délices des 7 Abbayes')
  egal('une description vide dit où le trouver', t.description, 'À commander chez Aux Délices des 7 Abbayes sur Yoppaa, sans faire la file.')
  const long = texteApercuArticle({ commerce: { nom: 'X' }, article: { nom: 'Y', description: 'a'.repeat(300) } })
  verifier('une longue description est coupée', long.description.length === 158 && long.description.endsWith('…'), String(long.description.length))
  egal('rien à lire, rien à dire', texteApercuArticle({}), null)
}

// ═══ 3. C'EST BRANCHÉ ? ══════════════════════════════════════════════════
{
  const fiche = lu('app/commander/[slug]/page.js')
  verifier('🔴 « Partager » envoie le lien qui porte l’aperçu',
    /const url = lienPartageArticle\(commercant\?\.slug \|\| slug, a\.id, window\.location\.origin\)/.test(fiche))
  egal('🔴 les trois listes d’articles portent le badge', (fiche.match(/coupDeCoeur=\{badgesCoeur\.has\(String\(a\.id\)\)\}/g) || []).length, 3)
  verifier('🔴 le badge s’affiche sur la carte', /\{coupDeCoeur && \(\s*<span[^>]*>\s*<Heart[^>]*\/>\s*Coup de cœur/.test(fiche))
  verifier('🔴 le compteur suit le seuil', /\{compteurAffiche\(social\?\.count\) \?\? 'J’aime'\}/.test(fiche))
  verifier('🔴 « Tes coups de cœur » en tête de la carte', /\{mesCoeurs\.length > 0 && \(/.test(fiche) && /const mesCoeurs = mesCoupsDeCoeur\(articles, coeurs\.aimes\)/.test(fiche)
    && fiche.indexOf('{mesCoeurs.length > 0 && (') < fiche.indexOf('{categories.map((cat, catIdx) => {'))
  verifier('🔴 un cœur posé met tout à jour', /setCoeurs\(c => \(\{\s*compteurs: \{ \.\.\.c\.compteurs, \[id\]: j\.count \}/.test(fiche))
  verifier('le cœur dit ce qu’il fait', /\{social\?\.liked && \(/.test(fiche) && /Dans tes coups de cœur, en tête de la carte/.test(fiche))

  const page = lu('app/commander/[slug]/article/[id]/page.js')
  verifier('🔴 pas de redirection serveur (les robots liraient la fiche)', !/\bredirect\(/.test(page) && /<OuvrirLaFiche cible=\{ficheSurArticle\(slug, id\)\}/.test(page))
  verifier('🔴 la page de partage n’est jamais indexée', /robots: \{ index: false, follow: true \}/.test(page) && /canonical: adresseCanonique\(lu\.commerce\)/.test(page))
  verifier('un article introuvable : 404', /if \(!lu\) notFound\(\)/.test(page))
  verifier('le clic ouvre la fiche', /router\.replace\(cible\)/.test(lu('app/commander/[slug]/article/[id]/OuvrirLaFiche.js')))
  const image = lu('app/commander/[slug]/article/[id]/opengraph-image.js')
  verifier('🔴 une photo illisible ne casse pas l’image', /if \(type !== 'image\/jpeg' && type !== 'image\/png'\) return null/.test(image) && /catch \{\s*return null\s*\}/.test(image))
  verifier('🔴 l’adresse est écrite sur l’image', /const adresse = `yoppaa\.app\/commander\/\$\{slug\}`/.test(image) && /\{adresse\}/.test(image))
  const serveur = lu('lib/partage-article-server.js')
  verifier('🔴 seulement un article actif DE CE commerce publié',
    /\.eq\('id', articleId\)\.eq\('commercant_id', commerce\.id\)\.eq\('actif', true\)/.test(serveur) && /const commerce = await getCommercantPublic\(slug\)/.test(serveur))
  verifier('🔴 la photo seulement si le commerçant montre ses photos', /photo_url: photos \? article\.photo_url \|\| null : null/.test(serveur))
  verifier('🔴 la lecture se fait avec la clé publique', /NEXT_PUBLIC_SUPABASE_ANON_KEY/.test(serveur) && !/SERVICE_ROLE/.test(serveur))

  const route = lu('app/api/articles/coups-de-coeur/route.js')
  verifier('🔴 la route ne rend JAMAIS un identifiant d’appareil', /return NextResponse\.json\(\{ ok: true, compteurs, aimes \}\)/.test(route)
    && /if \(deviceId && l\.device_id === deviceId\) aimes\.push\(l\.article_id\)/.test(route))
  verifier('🔴 seulement un commerce publié et ses articles actifs', /from\('commercants_public'\)\.select\('id'\)\.eq\('id', commercantId\)/.test(route) && /\.eq\('commercant_id', commercantId\)\.eq\('actif', true\)/.test(route))
  verifier('la route est limitée en débit', /checkLimit\(likesLimiter, ip\)/.test(route))

  const conf = lu('app/dashboard/ConfigDashboard.js')
  verifier('🔴 « Les plus aimés » dans les statistiques', /setAimes\(plusAimes\(j\.compteurs, arts \|\| \[\]\)\)/.test(conf) && /<Bloc titre="Les plus aimés"/.test(conf))
}

console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Le cœur et le partage : vert.')
