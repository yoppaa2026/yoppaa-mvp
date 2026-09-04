// JUGER L'AUDIT DE SÉCURITÉ, EN DISTINGUANT UNE FAILLE D'UNE PANNE.
//
// 🔴 CE QUI SE PASSAIT (constaté le 04/09 sur le run #176). L'étape « Aucune
// faille en production » lançait :
//
//     npm audit --omit=dev --audit-level=moderate
//
// et `npm audit` REND 1 DANS DEUX CAS TOTALEMENT DIFFÉRENTS :
//   • il a trouvé une faille  → c'est le but, il faut rougir ;
//   • il n'a pas pu joindre le service d'avis de sécurité (503, coupure,
//     lenteur) → il n'a RIEN trouvé, il n'a rien pu REGARDER.
//
// Le second cas se produisait à chaque poussée. Alex recevait un courriel
// d'échec systématique et a appris à l'ignorer, ce qui est parfaitement
// rationnel.
//
// ⚠️ ET C'EST LE VRAI DANGER : UNE ALARME QUI SONNE TOUT LE TEMPS NE PROTÈGE
// PLUS RIEN. Le jour où une faille réelle apparaît, le signal est identique à
// celui de la veille, et personne ne le lit.
//
// ⚠️ LE REMÈDE N'EST PAS DE FAIRE TAIRE L'ÉTAPE. `continue-on-error` aurait
// produit l'inverse : une faille réelle passerait sans bruit. On DISTINGUE les
// deux cas, et on dit lequel s'est produit.
//
//   node scripts/lire-audit.mjs <fichier.json>
//
// Sortie 0 : rien à signaler, OU le service n'a pas répondu (dit clairement).
// Sortie 1 : au moins une faille au niveau retenu, listée.

import { readFileSync } from 'node:fs'

// Le seuil du dépôt. En dessous, on ne réveille personne.
const SEUIL = ['moderate', 'high', 'critical']

/**
 * Que dit cette sortie d'audit ?
 *
 * Rend { lisible, compte, total } :
 *   • `lisible: false` → le service n'a pas répondu, il n'y a RIEN à conclure ;
 *   • `lisible: true`  → `compte` porte les failles au niveau retenu.
 *
 * ⚠️ LA PREUVE QU'ON A UNE VRAIE RÉPONSE EST LA PRÉSENCE DES COMPTEURS, pas
 * l'absence d'erreur. Un JSON qui ne porte pas `metadata.vulnerabilities` n'est
 * pas un audit, quelle qu'en soit la raison : panne, version de npm différente,
 * sortie tronquée. On ne devine pas, on exige la donnée.
 */
export function jugerAudit(texte) {
  let brut = null
  try { brut = JSON.parse(String(texte ?? '')) } catch { brut = null }
  const compteurs = brut?.metadata?.vulnerabilities
  if (!compteurs || typeof compteurs !== 'object') {
    return { lisible: false, compte: 0, total: 0, detail: {} }
  }
  const detail = {}
  let compte = 0
  for (const niveau of SEUIL) {
    const n = Number(compteurs[niveau] || 0)
    if (n > 0) { detail[niveau] = n; compte += n }
  }
  return { lisible: true, compte, total: Number(compteurs.total || 0), detail }
}

// ─── Exécution ───────────────────────────────────────────────────────────────
// ⚠️ `import.meta.main` n'existe pas partout : on compare les chemins.
const lanceDirectement = process.argv[1] && import.meta.url.endsWith(
  process.argv[1].replace(/\\/g, '/').split('/').pop()
)

if (lanceDirectement) {
  const fichier = process.argv[2]
  if (!fichier) {
    console.error('Usage : node scripts/lire-audit.mjs <fichier.json>')
    process.exit(2)
  }
  let texte = ''
  try { texte = readFileSync(fichier, 'utf8') } catch { texte = '' }
  const verdict = jugerAudit(texte)

  if (!verdict.lisible) {
    // ⚠️ ON LE DIT, ET ON NE FAIT PAS ÉCHOUER. Une panne du service de npm
    // n'est pas une faille dans Yoppaa, et la confondre avec une faille rend
    // l'étape inutile pour toujours.
    console.log('⚠️  LE SERVICE D\'AVIS DE SÉCURITÉ N\'A PAS RÉPONDU.')
    console.log('    Rien n\'a pu être vérifié. Ce n\'est PAS « aucune faille ».')
    console.log('    Extrait de ce qui a été reçu :')
    console.log(String(texte).slice(0, 600) || '    (vide)')
    process.exit(0)
  }

  if (verdict.compte === 0) {
    console.log(`Aucune faille au niveau retenu (${SEUIL.join(', ')}).`)
    console.log(`${verdict.total} avis au total, tous en dessous du seuil.`)
    process.exit(0)
  }

  console.log(`🔴 ${verdict.compte} faille(s) en production au niveau retenu :`)
  for (const [niveau, n] of Object.entries(verdict.detail)) {
    console.log(`   • ${niveau} : ${n}`)
  }
  console.log('\nDétail : npm audit --omit=dev')
  process.exit(1)
}
