// HARNAIS DE MUTATION — COPIER ET AGIR EN LOT SUR LE CATALOGUE (25/09)
//
// 🔴 CE QU ON MESURE. Alex : « une liste complete de sauces, des garnitures de
// pizza ne peuvent pas etre reecrites sur 40 pizzas differentes ». Le pire cas
// de ces deux modules n est pas une copie ratee : c est une copie qui ECRASE
// un reglage existant, une copie qui arrive TOUTE SEULE sur la fiche publique,
// ou un lot qui touche plus d articles que ce que le commercant a lu.
//
// ⚠️ INSTANTANE DE CONTENU, RESTAURATION CONTROLEE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RESULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
// ⚠️ CHAQUE MUTATION NOMME LE BANC qui doit la faire rougir.
//
//   node scripts/mutations-catalogue-copie.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:copie'

const COPIE = 'lib/catalogue-copie.js'
const LOT = 'lib/catalogue-lot.js'
const ECRAN = 'app/dashboard/ConfigDashboard.js'

const MUTATIONS = [
  // ─── LA COPIE D UN ARTICLE ───────────────────────────────────────────────
  //
  // 🔴 UNE COPIE QUI NAIT ACTIVE est une promesse faite au client : elle porte
  // le nom et le prix de sa voisine, avant toute relecture.
  { nom: '🔴 la copie d un article arrive en ligne toute seule',
    fichier: COPIE,
    de: '  sortie.actif = false',
    vers: '  sortie.actif = true' },

  { nom: '⚠️ la copie garde le nom exact de l original',
    fichier: COPIE,
    de: '  sortie.nom = nomDeLaCopie(article.nom, nomsExistants)',
    vers: '  sortie.nom = article.nom' },

  // 🔴 L IDENTIFIANT COPIE ECRASERAIT L ORIGINAL a l insertion.
  { nom: '🔴 la copie emporte l identifiant de l original',
    fichier: COPIE,
    de: '  for (const champ of CHAMPS_COPIES) sortie[champ] = article[champ] ?? null',
    vers: '  Object.assign(sortie, article)' },

  { nom: '⚠️ le numerotage des copies ne regarde plus les noms pris',
    fichier: COPIE,
    de: '  if (!pris.has(candidat.toLowerCase())) return candidat',
    vers: '  if (true) return candidat' },

  // ─── VERS QUI ON COPIE ───────────────────────────────────────────────────
  { nom: '🔴 l article source se propose a lui-meme',
    fichier: COPIE,
    de: '    a && String(a.id) !== String(sourceId) && a.est_vitrine !== true',
    vers: '    a && a.est_vitrine !== true' },

  { nom: '⚠️ un article de vitrine recoit des options invisibles',
    fichier: COPIE,
    de: '    a && String(a.id) !== String(sourceId) && a.est_vitrine !== true',
    vers: '    a && String(a.id) !== String(sourceId)' },

  // ─── CE QU ON REFUSE D ECRASER ───────────────────────────────────────────
  //
  // 🔴 LE CONFLIT NON VU, c est le reglage du commercant remplace ou double.
  { nom: '🔴 le conflit devient sensible a la casse et aux espaces',
    fichier: COPIE,
    de: '    return groupes.some(g => String(g?.nom || \'\').trim().toLowerCase() === nom)',
    vers: '    return groupes.some(g => String(g?.nom || \'\') === nom)' },

  { nom: '🔴 les articles en conflit ne sont plus ecartes',
    fichier: COPIE,
    de: '    aCopier: liste.filter(id => !bloques.has(String(id))),',
    vers: '    aCopier: liste.slice(),' },

  // ─── CE QUE LA COPIE D UN GROUPE EMPORTE ─────────────────────────────────
  //
  // 🔴 UNE SAUCE A 0,50 € COPIEE A ZERO se vend gratuitement sur 39 pizzas, et
  // personne ne le voit avant la comptabilite.
  { nom: '🔴 le supplement de prix est perdu a la copie',
    fichier: COPIE,
    de: '      prix_supplement: Number(v?.prix_supplement) || 0,',
    vers: '      prix_supplement: 0,' },

  { nom: '⚠️ « un seul choix » devient « plusieurs » a la copie',
    fichier: COPIE,
    de: "      type: groupe.type === 'multiple' ? 'multiple' : 'unique',",
    vers: "      type: 'multiple'," },

  { nom: '⚠️ le resume annonce les coches au lieu de ce qui sera ecrit',
    fichier: COPIE,
    de: '  const aCopier = Math.max(0, cibles - conflits)',
    vers: '  const aCopier = cibles' },

  // ─── LES VARIANTES, CHEZ QUI N A PAS DE GROUPES (25/09) ──────────────────
  //
  // 🔴 LE TROU TROUVE PAR ALEX : dupliquer un t-shirt rendait une fiche NUE,
  // sans meme la definition de ses axes.
  { nom: '🔴 la copie d un article perd ses axes de variantes',
    fichier: COPIE,
    de: '    if (article[champ] !== undefined) sortie[champ] = article[champ]',
    vers: '    if (false) sortie[champ] = article[champ]' },

  // 🔴 « 12 EN TAILLE M » DECRIT UN CARTON, pas un modele : recopier le stock
  // vendrait douze t-shirts qui n existent pas.
  { nom: '🔴 le stock des variantes est recopie au lieu de repartir a zero',
    fichier: COPIE,
    de: '    stock: 0,',
    vers: '    stock: Number(v?.stock) || 0,' },

  { nom: '⚠️ la copie de variantes n allume pas le drapeau de gestion',
    fichier: COPIE,
    de: '  sortie.gere_variantes = true',
    vers: '  sortie.gere_variantes = false' },

  // 🔴 UNE MATRICE REMPLACE CELLE QUI EST LA : copier vers un article equipe
  // detruirait ses tailles, ses prix et ses stocks.
  { nom: '🔴 les articles deja equipes ne sont plus ecartes',
    fichier: COPIE,
    de: '    return a.gere_variantes === true && axes.length > 0',
    vers: '    return false' },

  { nom: '⚠️ le resume des variantes ne dit plus le stock a zero',
    fichier: COPIE,
    de: '  const base = `Les mêmes variantes seront créées sur ${quoi}, à stock zéro.`',
    vers: '  const base = `Les mêmes variantes seront créées sur ${quoi}.`' },

  // ─── LA BIBLIOTHEQUE (25/09) ─────────────────────────────────────────────
  //
  // 🔴 LA PLUS COMPLETE SERT DE MODELE : ajouter une valeur oubliee ne coute
  // rien, retrouver une valeur silencieusement retiree coute quarante
  // relectures.
  { nom: '🔴 le modele de la bibliotheque n est plus le plus complet',
    fichier: COPIE,
    de: '      if ((g?.valeurs?.length || 0) > (modele?.valeurs?.length || 0)) modele = g',
    vers: '      if (false) modele = g' },

  // 🔴 SANS CE COMPTE, on applique une version que le commercant n a pas
  // choisie, sans qu il le sache.
  { nom: '🔴 les versions differentes ne sont plus comptees',
    fichier: COPIE,
    de: '    const versions = new Set(mêmes.map(signature)).size',
    vers: '    const versions = 1' },

  { nom: '⚠️ l ordre des valeurs fabrique de fausses versions differentes',
    fichier: COPIE,
    de: '      .sort()',
    vers: '      ' },

  { nom: '⚠️ la bibliotheque ne met plus le plus utilise en tete',
    fichier: COPIE,
    de: '  return sortie.sort((a, b) => (b.articles.length - a.articles.length) || a.nom.localeCompare(b.nom))',
    vers: '  return sortie' },

  // ─── LES PRESTATIONS (25/09) ─────────────────────────────────────────────
  //
  // 🔴 DEUX JOINTURES SUR LES MEMES TABLES feraient compter deux fois le meme
  // inventaire, et le service afficherait des places qui n existent pas.
  { nom: '🔴 une jointure de tables se duplique',
    fichier: COPIE,
    de: '  if (prestation.jointure_de) return null',
    vers: '  if (false) return null' },

  { nom: '🔴 la prestation copiee arrive en ligne toute seule',
    fichier: COPIE,
    de: '  sortie.nom = nomDeLaCopie(prestation.nom, nomsExistants)',
    vers: '  sortie.nom = prestation.nom' },

  // ─── LA FENETRE DE VERIFICATION (25/09) ──────────────────────────────────
  //
  // 🔴 ALEX : « il faut juste une fenetre qui explique ce qui n est pas copie
  // et la verification necessaire. S il est informe, c est tres bien. »
  //
  // ⚠️ LE PIRE CAS N EST PAS UNE LIGNE OUBLIEE, c est une liste GENERIQUE dont
  // la moitie ne s applique pas : on cesse de la lire.
  { nom: '🔴 la liste parle de photos a qui n en a pas',
    fichier: COPIE,
    de: '  if (galerie > 0) {',
    vers: '  if (galerie >= 0) {' },

  { nom: '🔴 la liste ne dit plus que les variantes sont a zero',
    fichier: COPIE,
    de: '  if (variantes > 0) {',
    vers: '  if (false) {' },

  { nom: '⚠️ elle ne dit plus la consequence : rien ne se vend',
    fichier: COPIE,
    de: "      faire: 'Remets les quantités : tant qu’elles sont à zéro, rien ne se vend.',",
    vers: "      faire: 'Remets les quantités.'," },

  { nom: '⚠️ elle ne dit plus que la copie est invisible du client',
    fichier: COPIE,
    de: "      ? 'Personne ne peut la réserver tant que tu ne l’as pas activée.'",
    vers: "      ? 'Elle est inactive.'" },

  { nom: '⚠️ elle n annonce plus que les stocks par jour n ont pas suivi',
    fichier: COPIE,
    de: '  if (stocksJour > 0) {',
    vers: '  if (false) {' },

  // ─── AGIR EN LOT ─────────────────────────────────────────────────────────
  //
  // 🔴 LA DERIVE BINAIRE SUR DE L ARGENT : `9.5 * 0.99` vaut 9,404999… donc
  // 9,40 € au lieu de 9,41 €. Un centime par article, a chaque saison.
  // ⚠️ CETTE CIBLE EST L ANCIENNE FORMULE, MOT POUR MOT. Une premiere version
  // mutait `Math.round(base * 100)` en `base * 100` : sur 9,50 € les deux
  // donnent 950, la mutation ne changeait donc RIEN et restait verte. Une
  // mutation doit rejouer le defaut, pas le frole.
  { nom: '🔴 l ajustement de prix repart des euros et derive d un centime',
    fichier: LOT,
    banc: 'verif:lot',
    de: '  return Math.round(centimes * (1 + p / 100)) / 100',
    vers: '  return Math.round(base * (1 + p / 100) * 100) / 100' },

  // 🔴 -100 % MET LE CATALOGUE A ZERO EURO sur la fiche publique.
  { nom: '🔴 une baisse de 100 % passe',
    fichier: LOT,
    banc: 'verif:lot',
    de: "  if (p <= -100) return 'Un article ne peut pas tomber à 0 €. Choisis une baisse plus petite.'",
    vers: '  if (false) return null' },

  { nom: '⚠️ une baisse sous le centime passe',
    fichier: LOT,
    banc: 'verif:lot',
    de: '    return nouveau !== null && nouveau < 0.01',
    vers: '    return false' },

  // ⚠️ UNE ECRITURE POUR RIEN reveille le temps reel de la fiche publique et
  // fausse le compte annonce au commercant.
  { nom: '⚠️ on reecrit les articles qui n ont rien a changer',
    fichier: LOT,
    banc: 'verif:lot',
    de: '      if (a.actif === cible) continue',
    vers: '      if (false) continue' },

  // 🔴 UNE CHAINE VIDE FABRIQUE UNE CATEGORIE FANTOME au nom invisible.
  { nom: '🔴 vider la categorie ecrit une chaine vide au lieu de null',
    fichier: LOT,
    banc: 'verif:lot',
    de: "      const cible = typeof valeur === 'string' && valeur.trim() ? valeur.trim() : null",
    vers: "      const cible = typeof valeur === 'string' ? valeur : null" },

  { nom: '🔴 le resume oublie de dire que les anciens prix sont perdus',
    fichier: LOT,
    banc: 'verif:lot',
    de: '  return `Le prix de ${quoi} ${sens} de ${Math.abs(p)} %. Les anciens prix ne sont pas conservés.`',
    vers: '  return `Le prix de ${quoi} ${sens} de ${Math.abs(p)} %.`' },

  { nom: '⚠️ rendre indisponible ne dit plus la consequence visible',
    fichier: LOT,
    banc: 'verif:lot',
    de: "  if (action === 'indisponible') return `${quoi} deviendront indisponibles, et disparaîtront de ta fiche.`",
    vers: "  if (action === 'indisponible') return `${quoi} deviendront indisponibles.`" },

  // 🔴 LES CASES A COCHER RENDENT DU TEXTE, la base des nombres.
  { nom: '🔴 la selection ne reconnait plus un identifiant en texte',
    fichier: LOT,
    banc: 'verif:lot',
    de: '  const vises = new Set((Array.isArray(ids) ? ids : []).map(String))',
    vers: '  const vises = new Set(Array.isArray(ids) ? ids : [])' },

  // ─── L ECRAN ─────────────────────────────────────────────────────────────
  //
  // 🔴 SANS LES OPTIONS, DUPLIQUER NE SERT A RIEN : c est justement la liste
  // des garnitures qu on ne veut plus reecrire.
  { nom: '🔴 la duplication d article n emporte plus les options',
    fichier: ECRAN,
    de: "      .eq('article_id', a.id)",
    vers: "      .eq('article_id', '00000000-0000-0000-0000-000000000000')" },

  // 🔴 UNE ACTION QUI NE SE DEFAIT PAS NE PART PAS SUR UN CLIC.
  //
  // ⚠️ ON MUTE LE VERDICT, PAS LE LIBELLE DU BOUTON. Une premiere version
  // changeait « Oui, changer les prix » en « Oui » : la confirmation restait
  // la, la garde restait verte, et la mutation ne mesurait rien. Ici la boite
  // s affiche encore mais sa reponse n arrete plus rien — une confirmation
  // decorative, exactement le defaut qu on veut voir rougir.
  { nom: '🔴 le refus de la confirmation n arrete plus l ecriture des prix',
    fichier: ECRAN,
    banc: 'verif:lot',
    de: '      if (!okPrix) return',
    vers: '      if (!okPrix) void 0' },

  // ⚠️ LES REGLES VIENNENT DU MODULE : une copie dans l ecran, et le resume lu
  // par le commercant finit par ne plus decrire ce qui s ecrit.
  { nom: '⚠️ l ecran refait le tri des cibles au lieu d appeler la regle',
    fichier: ECRAN,
    de: '    const { aCopier } = repartirCibles(cibles, conflits)',
    vers: '    const aCopier = cibles.filter(id => !conflits.includes(id))' },

  // 🔴 LES VALEURS SE RATTACHENT PAR ARTICLE, jamais par l ordre de retour.
  //
  // ⚠️ L INDENTATION FAIT PARTIE DE L ANCRE. Cette ligne vivait dans un
  // composant (6 espaces) ; depuis que l ecriture est partagee entre deux
  // ecrans, elle vit au niveau du module (4 espaces). Le harnais a dit
  // « TEXTE INTROUVABLE » — c est exactement ce qu on lui demande, et c est
  // pour ca qu une ancre introuvable ne compte jamais comme une reussite.
  { nom: '🔴 les options copiees se rattachent par l ordre d insertion',
    fichier: ECRAN,
    de: '    const groupeId = idParArticle.get(String(g.article_id))',
    vers: '    const groupeId = (crees || [])[i]?.id' },
]

const lancer = (banc = BANC) => {
  try {
    const sortie = execSync(`npm run ${banc}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    const plante = !/vérifications/.test(sortie)
    return { rouge: true, plante, extrait: sortie.slice(-400) }
  }
}

const BANCS = [...new Set(MUTATIONS.map((m) => m.banc || BANC))]
for (const banc of BANCS) {
  const depart = lancer(banc)
  if (depart.rouge) {
    console.log(`🔴 ${banc} EST DÉJÀ ROUGE. On ne mesure rien sur un banc rouge.`)
    console.log(depart.extrait)
    process.exit(1)
  }
}
console.log(`Bancs verts au départ : ${BANCS.join(', ')}.\n`)

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
  const res = lancer(m.banc)
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
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach((x) => console.log('   • ' + x)) }

const finalRouge = BANCS.some((banc) => lancer(banc).rouge)
if (finalRouge) console.log(`🔴 UN BANC EST ROUGE APRÈS RESTAURATION (${BANCS.join(', ')}).`)
else console.log('\nBancs verts après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
