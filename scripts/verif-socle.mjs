// BANC DU SOCLE : NEXT ET REACT NE BOUGENT QUE SUR DÉCISION (17/09).
//
// 🔴 CE QUI A DÉCLENCHÉ CE BANC. Dependabot a proposé une montée de DIX-SEPT
// paquets, intitulée « montées mineures », et `next` y était : 16.3.4 vers
// 16.3.5, noyé entre `lucide-react` et `@types/node`. Personne ne l'aurait vu
// en survolant le titre.
//
// ⚠️ ET CE N'EST PAS LA VERSION QU'ON GARDE ICI, C'EST LE PRINCIPE. Figer
// « 16.3.4 » dans une garde interdirait à Alex de monter Next délibérément, et
// la garde deviendrait un obstacle au lieu d'une protection : au premier
// blocage, on la désarmerait. Ce qu'on refuse, c'est la PLAGE DE VERSIONS.
//
// 🔴 POURQUOI UNE PLAGE EST LE VRAI DANGER. `^16.3.4` autorise npm à installer
// n'importe quelle 16.x, à n'importe quel `npm install`, sans qu'aucun commit
// ne le montre. Le dépôt dirait 16.3.4, la machine tournerait en 16.9.0, et le
// jour où quelque chose casse, `package.json` mentirait sur ce qui s'exécute.
// C'est le cas où le code paraît innocent parce qu'il n'a pas changé.
//
// ⚠️ ET CE DÉPÔT N'EST PAS LE NEXT CONNU (voir AGENTS.md) : ses conventions
// diffèrent des versions précédentes, donc une montée se lit, se teste et se
// décide. Elle ne se clique pas dans un lot de dix-sept.

import { readFileSync } from 'node:fs'

const lire = (chemin) =>
  readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

let ok = 0
const echecs = []
const verifie = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  echecs.push(`${nom}${detail ? ` — ${detail}` : ''}`)
}
const egal = (nom, obtenu, attendu) =>
  verifie(nom, obtenu === attendu, `« ${obtenu} » au lieu de « ${attendu} »`)

const pkg = JSON.parse(lire('package.json'))
const lock = JSON.parse(lire('package-lock.json'))

// Le socle : ce qui, en bougeant, change le comportement de TOUTE l'application
// sans qu'une seule ligne de code n'ait été touchée.
const SOCLE = ['next', 'react', 'react-dom']

// Une version exacte, c'est trois nombres et rien d'autre. Tout le reste est
// une plage : `^`, `~`, `>=`, `*`, `x`, `||`, un intervalle.
const EXACTE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/

// ═══ 1) LE SOCLE EST ÉPINGLÉ, PAS ENCADRÉ ══════════════════════════════════
for (const nom of SOCLE) {
  const declaree = pkg.dependencies?.[nom] ?? pkg.devDependencies?.[nom]
  verifie(`🔴 ${nom} est déclaré`, typeof declaree === 'string', String(declaree))
  // 🔴 LE CONTRÔLE QUI COMPTE. Un `^` ici et le dépôt cesse de dire la vérité
  // sur ce qui tourne.
  verifie(`🔴 ${nom} est épinglé à une version exacte`,
    EXACTE.test(String(declaree || '')),
    `« ${declaree} » est une plage : npm choisira tout seul`)
}

// ═══ 2) CE QUI EST INSTALLÉ EST CE QUI EST DÉCLARÉ ═════════════════════════
// ⚠️ UN `package.json` JUSTE NE SUFFIT PAS. Si le verrou porte autre chose,
// c'est le verrou qui gagne à l'installation, et personne ne lit un lock.
for (const nom of SOCLE) {
  const declaree = String(pkg.dependencies?.[nom] ?? pkg.devDependencies?.[nom] ?? '')
  const installee = lock.packages?.[`node_modules/${nom}`]?.version
  verifie(`🔴 ${nom} : le verrou porte la version déclarée`,
    !!installee && installee === declaree,
    `déclaré ${declaree}, verrouillé ${installee}`)
}

// ═══ 3) REACT ET REACT-DOM AVANCENT ENSEMBLE ═══════════════════════════════
// 🔴 DEUX VERSIONS DIFFÉRENTES NE LÈVENT AUCUNE ERREUR AU BUILD : elles
// produisent des défauts de rendu que rien ne relie à leur cause.
egal('🔴 react et react-dom portent la même version',
  String(pkg.dependencies?.react), String(pkg.dependencies?.['react-dom']))

// ═══ 4) LES MAJEURES NE SE PROPOSENT PAS TOUTES SEULES ═════════════════════
{
  const dep = lire('.github/dependabot.yml')
  // ⚠️ ON VISE LA RÈGLE, PAS SON COMMENTAIRE : le dépouillement grossier retire
  // les lignes commentées, sinon la garde se satisferait de l'intention écrite.
  const regles = dep.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n')
  verifie('🔴 aucune montée majeure n’est proposée automatiquement',
    /version-update:semver-major/.test(regles))
  verifie('⚠️ une seule proposition ouverte à la fois',
    /open-pull-requests-limit:\s*1\b/.test(regles))
  // ⚠️ LES CORRECTIFS DE SÉCURITÉ RESTENT DANS LEUR PROPRE PROPOSITION : on ne
  // mélange pas ce qui est urgent avec ce qui ne l'est pas.
  verifie('🔴 les correctifs de sécurité ont leur propre groupe',
    /applies-to:\s*security-updates/.test(regles))
}

console.log(`\nSocle du dépôt : ${ok} vérifications`)
if (echecs.length) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
