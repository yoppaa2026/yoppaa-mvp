// HARNAIS DE MUTATION — L'AFFICHE DU POINT DE RETRAIT (16/10 soir).
//
// ✅ ALEX, 16/10 soir : le bandeau aux points Yoppaa, flèche au choix + phrase,
// A4 paysage + 2 A5, deux fonds, l'intitulé gros, la consigne mot pour mot.
// Ce harnais casse chaque règle et chaque branchement un par un, et exige que
// `verif:retrait` rougisse à chaque fois.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES, vérifié par npm run verif:ancres.
//
//   node scripts/mutations-affiche-retrait.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANCS = ['verif:retrait']
const MODULE = 'lib/affiche-retrait.js'
const BORD = 'app/dashboard/ConfigDashboard.js'

const MUTATIONS = [
  { nom: '🔴 la consigne change un mot',
    de: "  consigne: 'Donne ton numéro de commande et ton prénom pour le retrait.',",
    vers: "  consigne: 'Donne ton prénom ou ton numéro de commande.'," },
  { nom: '🔴 l’intitulé revient sur une ligne (et rapetisse)',
    de: "  intitule: ['RETRAIT DES COMMANDES', 'YOPPAA'],",
    vers: "  intitule: ['RETRAIT DES COMMANDES YOPPAA', ''],"},
  { nom: '🔴 l’intitulé plafonné petit',
    // ⚠️ ANCRES RECALÉES LE 17/10 (bis) : la mise en page du pied.
    de: '  const tIntitule = Math.min(tenir(int1, 10.5, 800), tenir(int2, 10.5, 800))',
    vers: '  const tIntitule = Math.min(tenir(int1, 8, 800), tenir(int2, 8, 800))' },
  { nom: '🔴 « à gauche » pointe à droite',
    de: "  { id: 'gauche', libelle: 'À gauche', angle: 180,",
    vers: "  { id: 'gauche', libelle: 'À gauche', angle: 0," },
  { nom: '🔴 « ici » pointe en haut',
    de: "  { id: 'ici', libelle: 'Ici (en bas)', angle: 90,",
    vers: "  { id: 'ici', libelle: 'Ici (en bas)', angle: -90," },
  { nom: '🔴 le bloc reste à gauche quand la flèche va à droite',
    de: '  const xBloc = aDroite ? W - BLOC : 0',
    vers: '  const xBloc = 0' },
  { nom: '🔴 le texte reste à droite quand le bloc y passe',
    de: '  const xT = aDroite ? 20 : BLOC + 18',
    vers: '  const xT = BLOC + 18' },
  { nom: '🔴 la rotation de la flèche s’inverse',
    de: '      x: x + (50 + dx * Math.cos(a) - dy * Math.sin(a)) * k,',
    vers: '      x: x + (50 + dx * Math.cos(a) + dy * Math.sin(a)) * k,' },
  // ⚠️ PAS DE MUTATION « LA PHRASE TRONQUÉE À DEUX LIGNES » (17/10) : la bande
  // du pied force la phrase à une taille où ses 48 caractères tiennent TOUJOURS
  // en deux lignes. Tronquer ne change alors aucun résultat : mutant
  // équivalent, qu'aucun banc ne peut voir. Le banc vérifie le résultat (la
  // phrase entière, deux lignes au plus) et la borne de saisie (48).
  { nom: '🔴 la phrase coupée au milieu d’un mot',
    de: '  return (espace > 0 ? coupe.slice(0, espace) : t.slice(0, PHRASE_MAX)).replace(/[\\s,;:–-]+$/, \'\')',
    vers: '  return t.slice(0, PHRASE_MAX)' },
  { nom: '🔴 le logo descend dans la marge d’imprimante',
    de: "  ops.push({ type: 'logo', xFin: xT + LARGEUR_T - QR - 8, y: 192, corps: 8, couleurs: P.wm })",
    vers: "  ops.push({ type: 'logo', xFin: xT + LARGEUR_T - QR - 8, y: 202, corps: 8, couleurs: P.wm })" },
  { nom: '🔴 le fond violet n’est plus celui du kit',
    de: "    : { fond: '#201044', titre: '#FFFFFF',",
    vers: "    : { fond: '#2D0F6B', titre: '#FFFFFF'," },
  { nom: '🔴 les deux A5 sur une feuille couchée',
    de: "    return { orientation: 'portrait', cases: [{ x: 0, y: 0, w: 210, h: 148.5 }, { x: 0, y: 148.5, w: 210, h: 148.5 }],",
    vers: "    return { orientation: 'landscape', cases: [{ x: 0, y: 0, w: 210, h: 148.5 }, { x: 0, y: 148.5, w: 210, h: 148.5 }]," },
  { nom: '🔴 le trait de coupe disparaît',
    de: '      coupe: [{ x1: 0, y1: 148.5, x2: 210, y2: 148.5 }] }',
    vers: '      coupe: [] }' },
  { nom: '🔴 le canvas dessine avant les polices',
    de: "      document.fonts?.load('900 100px \"DM Sans\"'), document.fonts?.load('700 100px \"DM Sans\"'),",
    vers: "      null, document.fonts?.load('700 100px \"DM Sans\"')," },
  { nom: '🔴 le téléchargement oublie la phrase', fichier: BORD,
    // ⚠️ ANCRES RECALÉES LE 17/10 : avec le QR de la fiche.
    de: '      const fait = await telechargerAfficheRetraitPdf({ sens, phrase, clair, nomCommerce, slug, format, qrDataUrl: qr })',
    vers: "      const fait = await telechargerAfficheRetraitPdf({ sens, phrase: '', clair, nomCommerce, slug, format, qrDataUrl: qr })" },
  { nom: '🔴 l’aperçu n’est pas le vrai dessin', fichier: BORD,
    de: '      construireAfficheRetrait({ sens, phrase, clair, nomCommerce, qrDataUrl: qr })',
    vers: '      construireAfficheRetrait({ sens, phrase: \'\', clair, nomCommerce, qrDataUrl: qr })' },
  // ─── LE QR ET LES BADGES (Alex, 17/10) ─────────────────────────────────
  { nom: '🔴 le PDF part sans QR (carte blanche vide)',
    de: '  if (!gabarit || !qrDataUrl) return false',
    vers: '  if (!gabarit) return false' },
  { nom: '🔴 le QR rapetisse sous le seuil scannable',
    de: 'export const QR_RETRAIT = { carte: 37, marge: 2.5 }',
    vers: 'export const QR_RETRAIT = { carte: 32, marge: 2.5 }' },
  { nom: '🔴 le QR revient dans le bandeau (Alex : « pas dans le bandeau »)',
    de: "  ops.push({ type: 'qr', x: xT + LARGEUR_T - QR, y: 167.5, cote: QR, marge, bordure: clair ? P.filet : null })",
    vers: "  ops.push({ type: 'qr', x: xBloc + 30, y: 167.5, cote: QR, marge, bordure: clair ? P.filet : null })" },
  { nom: '🔴 la consigne retombe sur la bande du pied',
    de: '  while (finConsigne(tPhrase) > FILET - 3 && tPhrase > 6) tPhrase -= 0.25',
    vers: '  while (false) tPhrase -= 0.25' },
  { nom: '🔴 les badges descendent dans la marge d’imprimante',
    de: '  ops.push(badges({ x: xT, y: 182, hauteur: HAUTEUR_BADGES_RETRAIT }))',
    vers: '  ops.push(badges({ x: xT, y: 199, hauteur: HAUTEUR_BADGES_RETRAIT }))' },
  { nom: '🔴 un badge redessiné entier (marge transparente comprise)',
    de: '        ctx.drawImage(img, 0, b.badge.visible.y * echelle, img.naturalWidth, b.badge.visible.hauteur * echelle,',
    vers: '        ctx.drawImage(img, 0, 0 * echelle, img.naturalWidth, b.badge.hauteur * echelle,' },
  { nom: '🔴 le QR mène ailleurs que la fiche du commerce', fichier: BORD,
    de: '  const urlFiche = lienFiche(slug)',
    vers: "  const urlFiche = slug ? 'https://www.yoppaa.app/' : null" },
  { nom: '🔴 la phrase n’est plus bornée à la saisie', fichier: BORD,
    de: '      <Input id="phrase-retrait" value={phrase} maxLength={PHRASE_MAX} onChange={e => setPhrase(e.target.value)} placeholder="Ex. : À gauche du comptoir"/>',
    vers: '      <Input id="phrase-retrait" value={phrase} onChange={e => setPhrase(e.target.value)} placeholder="Ex. : À gauche du comptoir"/>' },
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
