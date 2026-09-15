// LIRE DU SQL SANS SA PROSE, ET TROUVER CE QUI LIT LES POLICIES (15/09).
//
// ═══════════════════════════════════════════════════════════════════════════
// 🔴 POURQUOI IL EXISTE : LE MÊME PIÈGE, TROIS FOIS.
//
// Une policy PostgreSQL est PERMISSIVE par défaut, et son TYPE ne se voit pas
// dans `qual`. Une requête qui lit `pg_policies` sans la colonne `permissive`
// ne prouve donc rien, et elle trompe dans les deux sens :
//   • une RESTRICTIVE large (`zz_commerce_ouvert`) a l'air d'ouvrir la table :
//     fausse alerte, le 12/09 puis le 15/09 ;
//   • une RESTRICTIVE comptée dans « au moins une policy permet de lire »
//     n'accorde RIEN à elle seule : faux vert.
// La règle était écrite en mémoire depuis le 24/08, juste, et je ne l'ai pas
// appliquée en écrivant. Une règle ne protège qu'au moment où l'on écrit : ce
// lecteur la porte dans `npm run verif`.
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ CE QU'IL RETIRE, À POSITIONS ÉGALES (chaque caractère retiré devient une
// espace, les sauts de ligne restent : une lecture se nomme par sa ligne) :
//   • les commentaires `--` et `/* */`, qui S'IMBRIQUENT en PostgreSQL : la
//     prose qui explique le piège contient ses mots, et des requêtes entières
//     dorment en commentaire ;
//   • le CONTENU des chaînes '…' et E'…' : les attendus écrivent « PERMISSIVE »
//     en toutes lettres, et ce mot-là ne prouve rien.
// ⚠️ ET CE QU'IL GARDE : le corps des blocs $$ … $$. Dans un `DO` ou une
// fonction, c'est du vrai code, qui peut lire le catalogue.
//
// ⚠️ SES LIMITES, DITES : il juge la LECTURE du catalogue, pas ce qu'une CTE en
// fait ensuite ; une requête construite dans une chaîne (`EXECUTE '…'`) lui
// échappe. Et un corps $$ … $$ qui serait de la prose avec une apostrophe
// ferait basculer le reste du fichier : c'est pourquoi il SIGNALE toute
// construction restée ouverte et toute parenthèse orpheline.

const blanc = (morceau) => morceau.replace(/[^\n]/g, ' ')

export const ligneDe = (texte, pos) => {
  let ligne = 1
  for (let i = 0; i < pos; i++) if (texte.charCodeAt(i) === 10) ligne++
  return ligne
}

function depouiller(texte) {
  const src = String(texte ?? '')
  const n = src.length
  const morceaux = []
  let nonFerme = null
  let i = 0
  while (i < n) {
    const c = src[i]
    const d = src[i + 1]

    // Commentaire de ligne.
    if (c === '-' && d === '-') {
      let j = src.indexOf('\n', i)
      if (j === -1) j = n
      morceaux.push(blanc(src.slice(i, j)))
      i = j
      continue
    }

    // Commentaire de bloc. ⚠️ En PostgreSQL ils S'IMBRIQUENT : le premier
    // « */ » ne ferme pas forcément le commentaire.
    if (c === '/' && d === '*') {
      let niveau = 1
      let j = i + 2
      while (j < n && niveau > 0) {
        if (src[j] === '/' && src[j + 1] === '*') { niveau++; j += 2 }
        else if (src[j] === '*' && src[j + 1] === '/') { niveau--; j += 2 }
        else j++
      }
      const fin = Math.min(j, n)
      if (niveau > 0) nonFerme ??= `commentaire /* jamais fermé, ouvert ligne ${ligneDe(src, i)}`
      morceaux.push(blanc(src.slice(i, fin)))
      i = fin
      continue
    }

    // Chaîne. `''` reste dans la chaîne ; dans E'…', l'antislash échappe.
    if (c === "'") {
      const avecAntislash = /[eE]/.test(src[i - 1] || '') && !/[\w$]/.test(src[i - 2] || '')
      let j = i + 1
      let fermee = false
      while (j < n) {
        if (avecAntislash && src[j] === '\\') { j += 2; continue }
        if (src[j] === "'") {
          if (src[j + 1] === "'") { j += 2; continue }
          fermee = true
          break
        }
        j++
      }
      if (!fermee) {
        nonFerme ??= `chaîne jamais fermée, ouverte ligne ${ligneDe(src, i)}`
        morceaux.push(blanc(src.slice(i, n)))
        i = n
        continue
      }
      morceaux.push("'" + blanc(src.slice(i + 1, j)) + "'")
      i = j + 1
      continue
    }

    // Identifiant entre guillemets : c'est un nom, on le garde, sans rien de ce
    // qui pourrait passer pour une parenthèse ou une fin de requête.
    if (c === '"') {
      let j = i + 1
      let ferme = false
      while (j < n) {
        if (src[j] === '"') {
          if (src[j + 1] === '"') { j += 2; continue }
          ferme = true
          break
        }
        j++
      }
      const fin = ferme ? j + 1 : n
      if (!ferme) nonFerme ??= `identifiant entre guillemets jamais fermé, ouvert ligne ${ligneDe(src, i)}`
      morceaux.push(src.slice(i, fin).replace(/[^\w$"\n]/g, ' '))
      i = fin
      continue
    }

    morceaux.push(c)
    i++
  }
  return { code: morceaux.join(''), nonFerme }
}

export const sansProseSql = (texte) => depouiller(texte).code

const CATALOGUES = [
  // La vue lisible : le type est la colonne `permissive` (PERMISSIVE / RESTRICTIVE).
  { nom: 'pg_policies', type: 'permissive' },
  // Le catalogue brut : le type est le booléen `polpermissive`.
  { nom: 'pg_policy', type: 'polpermissive' },
]

const motEntier = (mot, drapeaux = 'i') => new RegExp(`(?<![\\w$])${mot}(?![\\w$])`, drapeaux)

// `SELECT *` et `p.*` ramènent toutes les colonnes, le type compris.
// ⚠️ Pas `count(*)` : une étoile entre parenthèses ne montre rien.
const ETOILE = /(?:\bSELECT\s+(?:DISTINCT\s+)?|,\s*)(?:[A-Za-z_][\w$]*\.)?\*/i

// Chaque lecture de `pg_policies` ou `pg_policy`, jugée dans SA requête : la
// sous-requête la plus intérieure qui la contient, puis, dans celle-ci, la
// branche d'UNION / INTERSECT / EXCEPT où elle se trouve.
//
// ⚠️ PAS LE FICHIER, NI MÊME LA REQUÊTE ENTIÈRE : un contrôle en UNION ALL peut
// ramener le type en C07 et l'oublier en C03. C'était le cas le 15/09.
export function lecturesDePolicies(texte) {
  const src = String(texte ?? '')
  const { code, nonFerme } = depouiller(src)
  const n = code.length

  // La profondeur de parenthèses AVANT chaque caractère.
  const prof = new Int32Array(n + 1)
  let p = 0
  let desequilibre = null
  for (let i = 0; i < n; i++) {
    prof[i] = p
    if (code[i] === '(') p++
    else if (code[i] === ')') {
      if (p === 0) { desequilibre ??= `parenthèse fermée sans ouverture, ligne ${ligneDe(code, i)}`; continue }
      p--
    }
  }
  prof[n] = p
  if (p !== 0) desequilibre ??= `${p} parenthèse(s) jamais fermée(s)`

  const lignes = src.split('\n')
  const lectures = []
  for (const cat of CATALOGUES) {
    const re = motEntier(cat.nom, 'gi')
    let m
    while ((m = re.exec(code)) !== null) {
      const pos = m.index
      const d = prof[pos]

      // 1) La portée : la sous-requête la plus intérieure, ou la requête
      //    entière entre deux « ; ».
      const ouvre = d > 0 ? '(' : ';'
      const ferme = d > 0 ? ')' : ';'
      let debut = 0
      let fin = n
      for (let j = pos - 1; j >= 0; j--) {
        if (code[j] === ouvre && prof[j] === (d > 0 ? d - 1 : 0)) { debut = j + 1; break }
      }
      for (let k = pos; k < n; k++) {
        if (code[k] === ferme && prof[k] === d) { fin = k; break }
      }

      // 2) Dans cette portée, la branche qui contient la lecture : chaque
      //    branche d'un UNION est une requête à part entière.
      const ops = /\b(?:UNION|INTERSECT|EXCEPT)\b/gi
      ops.lastIndex = debut
      let o
      let debutBranche = debut
      let finBranche = fin
      while ((o = ops.exec(code)) !== null && o.index < fin) {
        if (prof[o.index] !== d) continue
        if (o.index < pos) debutBranche = o.index + o[0].length
        else { finBranche = o.index; break }
      }
      const branche = code.slice(debutBranche, finBranche)
      const ligne = ligneDe(code, pos)

      lectures.push({
        catalogue: cat.nom,
        ligne,
        typeNomme: motEntier(cat.type).test(branche) || ETOILE.test(branche),
        extrait: (lignes[ligne - 1] || '').trim().slice(0, 110),
      })
    }
  }
  lectures.sort((a, b) => a.ligne - b.ligne)
  return { lectures, nonFerme, desequilibre }
}
