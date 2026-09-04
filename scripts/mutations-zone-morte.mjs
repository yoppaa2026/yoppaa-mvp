// HARNAIS DE MUTATION — LA ZONE MORTE TEMPORELLE (29/08).
//
// 🔴 CE QU'ON MESURE : que `verif:zone-morte` aurait attrapé l'écran blanc de
// production. Un banc neuf qui verdit sur un dépôt déjà réparé ne prouve RIEN ;
// il faut lui remettre le défaut sous le nez.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
//
//   node scripts/mutations-zone-morte.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const FICHE = 'app/commander/[slug]/page.js'

const MUTATIONS = [
  // 🔴 LE DÉFAUT DU 29/08, REMIS À L'IDENTIQUE. Un tableau de dépendances posé
  // ligne 1560 qui lit `peutCommander`, déclaré ligne 2926 : c'est exactement
  // ce qui a rendu toutes les fiches commerçant blanches.
  { nom: '🔴 L’ÉCRAN BLANC DE PRODUCTION : un tableau de dépendances lit un const déclaré 1 400 lignes plus bas',
    banc: 'verif:zone-morte', fichier: FICHE,
    de: '  }, [slug])', vers: '  }, [slug, peutCommander])' },

  // La même chose avec une variable d'ÉTAT : c'est la forme du 17/08, et elle
  // emprunte un autre chemin dans le banc, celui de la déstructuration
  // `const [x, setX] = useState()`. ⚠️ Ma première version de cette mutation
  // ajoutait `panierRepris` à l'effet du bouton flottant, qui est DÉSORMAIS
  // tout en bas : le nom y était déjà déclaré plus haut, donc elle ne créait
  // aucun défaut et le banc avait raison de rester vert. Une mutation qui ne
  // mute rien est une non-mesure.
  { nom: '🔴 la variante du 17/08 : un useState lu avant sa déclaration',
    banc: 'verif:zone-morte', fichier: FICHE,
    de: '  }, [slug])', vers: '  }, [slug, panierRepris])' },

  // ⚠️ ET LA GARDE ELLE-MÊME. Si le banc cesse de regarder les déclarations
  // POSTÉRIEURES, il verdit sur tout et ne surveille plus rien.
  { nom: '🔴 le banc cesse de regarder ce qui est déclaré APRÈS : il verdirait sur tout',
    banc: 'verif:zone-morte', fichier: 'scripts/verif-zone-morte.mjs',
    de: '      const apres = lieux.find(l => l > i && frontiere[l] === frontiere[i])',
    vers: '      const apres = undefined' },
]

function lancer(banc) {
  try {
    execSync(`npm run ${banc}`, { cwd: RACINE, stdio: 'pipe', encoding: 'utf8' })
    return { rouge: false, plante: false }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    const aRougiProprement = /en échec|ÉCHEC\(S\)/.test(sortie)
    return { rouge: true, plante: !aRougiProprement, extrait: sortie.slice(-320) }
  }
}

// ⚠️ La troisième mutation casse la garde et doit donc laisser le banc VERT :
// c'est l'inverse des deux premières. Un banc qui verdit alors qu'il ne
// surveille plus rien est le défaut qu'on traque, pas une réussite.
const ATTENDU_VERT = new Set(['🔴 le banc cesse de regarder ce qui est déclaré APRÈS : il verdirait sur tout'])

for (const banc of [...new Set(MUTATIONS.map(m => m.banc))]) {
  const avant = lancer(banc)
  if (avant.rouge) { console.log(`✕ ${banc} DÉJÀ rouge.`); console.log(avant.extrait); process.exit(1) }
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

  let res
  if (ATTENDU_VERT.has(m.nom)) {
    // On casse la garde, PUIS on remet le défaut : le banc doit alors rester
    // vert, ce qui prouve que c'est bien cette ligne qui surveille.
    const ff = chemin(FICHE)
    const orig2 = readFileSync(ff, 'utf8')
    ecrireSur(ff, orig2.replace('  }, [slug])', '  }, [slug, peutCommander])'))
    const r = lancer(m.banc)
    ecrireSur(ff, orig2)
    if (readFileSync(ff, 'utf8') !== orig2) { console.log('\n🔴 RESTAURATION RATÉE.'); process.exit(2) }
    res = { rouge: !r.rouge, plante: false }  // vert = la garde est bien morte = mutation attrapée
  } else {
    res = lancer(m.banc)
  }

  ecrireSur(f, original)
  if (readFileSync(f, 'utf8') !== original) {
    console.log(`\n🔴 RESTAURATION RATÉE sur ${m.fichier}. On s'arrête.`)
    process.exit(2)
  }

  if (res.rouge && !res.plante) { attrapees++; console.log(`  ✓ attrapée : ${m.nom}`) }
  else if (res.plante) { manquees.push(`${m.nom} — le banc a PLANTÉ`); console.log(`  ⚠ plantage : ${m.nom}`) }
  else { manquees.push(`${m.nom} — RESTÉ VERT`); console.log(`  ✕ MANQUÉE : ${m.nom}`) }
}

console.log(`\n${attrapees}/${MUTATIONS.length} mutations attrapées.`)
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach(x => console.log('   • ' + x)) }

const finalRouge = lancer('verif:zone-morte').rouge
if (finalRouge) console.log('🔴 verif:zone-morte ROUGE APRÈS RESTAURATION.')
else console.log('\nBanc vert après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
