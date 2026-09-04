// Banc des ANCRES DE MUTATION.
//
// ═══════════════════════════════════════════════════════════════════════════
// 🔴 UNE MUTATION DONT L'ANCRE A DISPARU NE MESURE PLUS RIEN.
//
// Un harnais de mutation cherche un bout de code exact (`de:`) et le remplace
// pour vérifier que le banc rougit. Quand le code déménage, l'ancre ne
// correspond plus : la mutation ne s'applique pas, **le banc reste vert**, et
// la garde qu'elle était censée mesurer n'est plus surveillée par personne.
//
// Les harnais le signalent en « TEXTE INTROUVABLE » — encore faut-il les
// lancer, et les seize prennent une demi-heure. En pratique, ça se découvre par
// hasard : le 04/09, TREIZE ancres étaient périmées, dont onze sur le tunnel
// des rendez-vous, c'est-à-dire sur de l'argent.
//
// ⚠️ CE BANC EST LE DÉSARMEMENT DU PIÈGE. Il lit les seize harnais et vérifie
// que chaque `de:` se trouve encore dans son fichier. Il tourne en quelques
// secondes, dans `npm run verif`, à chaque fois.
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ IL NE REMPLACE PAS LES HARNAIS. Une ancre trouvée ne prouve pas que la
// mutation change quelque chose : le 04/09, deux d'entre elles visaient la
// bonne ligne et ne mutaient rien. Ce banc dit qu'on vise encore du code
// existant, la mesure par mutation dit que ça sert.

import { readFileSync, readdirSync } from 'node:fs'

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}

const HARNAIS = readdirSync('scripts')
  .filter(f => /^mutations-.*\.mjs$/.test(f))
  .sort()

verifier('les harnais de mutation sont là', HARNAIS.length >= 16, `${HARNAIS.length} trouvés`)

let ancres = 0
let perimees = 0
let sautDeLigne = 0

for (const nom of HARNAIS) {
  const src = readFileSync('scripts/' + nom, 'utf8')

  // Les constantes de chemin déclarées en tête du harnais (MODULE, FICHE…).
  const constantes = {}
  for (const m of src.matchAll(/const ([A-Z_][A-Z_0-9]*) = '([^']+)'/g)) constantes[m[1]] = m[2]

  // ⚠️ ON DÉCOUPE SUR LA FORME EXACTE DES ENTRÉES, `\n  { nom: `. Un découpage
  // plus large avalerait les commentaires et rendrait des ancres fantômes.
  const blocs = src.split(/\n {2}\{ nom: /).slice(1)

  for (const b of blocs) {
    const nomM = (b.match(/^'([^']*)'/) || b.match(/^"([^"]*)"/) || [])[1] || '(sans nom)'
    const fm = b.match(/fichier:\s*([A-Z_][A-Z_0-9]*|'[^']*')/)
    const dm = b.match(/\n\s*de:\s*((?:'(?:[^'\\]|\\.)*')|(?:"(?:[^"\\]|\\.)*")|(?:`(?:[^`\\]|\\.)*`))/)
    if (!dm) continue

    let de
    // ⚠️ `eval` SUR UNE LITTÉRALE DU DÉPÔT, et rien d'autre : c'est la seule
    // façon de reconstruire exactement la chaîne que le harnais utilisera,
    // avec ses échappements. La regex ci-dessus n'accepte qu'une littérale.
    try { de = eval(dm[1]) } catch { continue }

    let cible = null
    if (fm) cible = fm[1].startsWith("'") ? fm[1].slice(1, -1) : (constantes[fm[1]] || null)
    if (!cible) cible = constantes.MODULE || constantes.FICHIER || null
    if (!cible) continue

    ancres++

    let contenu = null
    try { contenu = readFileSync(cible, 'utf8') } catch { /* fichier disparu */ }
    if (contenu === null) {
      perimees++
      verifier(`${nom} · ${nomM}`, false, `fichier introuvable : ${cible}`)
      continue
    }
    if (!contenu.includes(de)) {
      perimees++
      // 🔴 ET ON NOMME LA CAUSE QUAND C'EST UN SAUT DE LIGNE, parce que celle-là
      // ne se voit pas à l'œil nu.
      //
      // Le dépôt est stocké en LF — un seul fichier sur des centaines porte du
      // CRLF. Une ancre écrite avec « \r\n » ne trouve donc sa ligne NULLE
      // PART, et sa garde n'est mesurée sur aucune machine. C'est ce qui a
      // rendu la CI rouge le 04/09 : deux ancres écrites en CRLF, sur la foi
      // d'un commentaire d'en-tête qui affirmait « le dépôt est en CRLF ».
      //
      // ⚠️ UNE AFFIRMATION EN COMMENTAIRE SE VÉRIFIE COMME DU CODE. Celle-là
      // était fausse, recopiée dans dix harnais, et elle a fabriqué le défaut.
      const cibleCRLF = contenu.includes('\r\n')
      const ancreCRLF = de.includes('\r\n')
      let cause = ''
      if (ancreCRLF && !cibleCRLF) { sautDeLigne++; cause = ' — ancre en CRLF, fichier en LF' }
      else if (/\n/.test(de) && cibleCRLF) { sautDeLigne++; cause = ' — ancre en LF, fichier en CRLF' }
      verifier(`${nom} · ${nomM}`, false,
        `ancre périmée dans ${cible}${cause} : ${JSON.stringify(de).slice(0, 120)}`)
    }
  }
}

verifier('aucune ancre périmée', perimees === 0, `${perimees} sur ${ancres}`)
verifier('🔴 aucune ancre au mauvais style de saut de ligne', sautDeLigne === 0, `${sautDeLigne} sur ${ancres}`)
// ⚠️ ET LA SONDE DOIT VRAIMENT AVOIR LU QUELQUE CHOSE. Un découpage cassé
// rendrait zéro ancre, donc zéro périmée, et ce banc verdirait sans rien avoir
// regardé. C'est le piège des tests faussement verts, la troisième fois cette
// semaine : on mesure la PRÉSENCE de la donnée, pas l'absence d'erreur.
verifier('🔴 la sonde a réellement lu des ancres', ancres > 400, `${ancres} lues`)

console.log(`\n${ancres} ancres de mutation relues dans ${HARNAIS.length} harnais.`)
console.log(`${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  console.log('\n⚠️ Une ancre périmée ne s\'applique pas : sa garde n\'est plus mesurée.')
  console.log('   Retrouve la ligne qu\'elle visait dans le code d\'aujourd\'hui, et vise la')
  console.log('   DÉFINITION plutôt que le mot, sinon elle périmera au prochain déplacement.')
  process.exit(1)
}
console.log('Ancres de mutation vertes.')
