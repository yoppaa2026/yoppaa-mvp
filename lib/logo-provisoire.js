// UN LOGO PROVISOIRE QUI DIT LE MÉTIER, PAS UNE INITIALE.
//
// ⚠️ L'INITIALE NE SERT À RIEN, ET C'EST LE REPROCHE D'ALEX LE 14/08. Sur
// l'accueil, la vignette d'un commerce fait 68 pixels de côté : un « C » blanc
// dans un cercle violet peut être Ciseaux, Carrefour ou Chez Momo. Ça ressemble
// à un avatar par défaut, c'est-à-dire à l'absence de logo, et ça dessert
// exactement ce qu'un logo doit servir : permettre au Yopper de reconnaître un
// commerce d'un coup d'œil, sans lire.
//
// Un symbole de métier, lui, se lit à 68 pixels et dit quelque chose : une
// paire de ciseaux, un croissant, un vélo. Et la couleur, dérivée du nom,
// distingue deux coiffeurs de la même rue.
//
// ⚠️ CELA RESTE UN DÉPANNAGE. Le vrai logo du commerçant vaudra toujours mieux,
// et l'écran doit le dire : c'est son identité, pas la nôtre.

// Les symboles, en tracé SVG. On ne dépend pas d'une bibliothèque d'icônes ici :
// ce fichier doit pouvoir être dessiné sur un canvas, et un composant React ne
// s'y dessine pas. Les tracés viennent du jeu Lucide, sous licence ISC.
const SYMBOLES = {
  ciseaux:   '<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>',
  pain:      '<path d="M4 10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4c0 4-2 8-8 8s-8-4-8-8Z"/><path d="M10 6v12"/><path d="M14 6v12"/>',
  panier:    '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  fourchette:'<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  vetement:  '<path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23Z"/>',
  fleur:     '<circle cx="12" cy="12" r="3"/><path d="M12 16.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 1 1 4.5 4.5 4.5 4.5 0 1 1-4.5 4.5"/>',
  livre:     '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/>',
  cle:       '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z"/>',
  velo:      '<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>',
  patte:     '<circle cx="11" cy="4" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="20" cy="16" r="2"/><path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z"/>',
  appareil:  '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3Z"/><circle cx="12" cy="13" r="3"/>',
  halteres:  '<path d="m6.5 6.5 11 11"/><path d="m21 21-1-1"/><path d="m3 3 1 1"/><path d="m18 22 4-4"/><path d="m2 6 4-4"/><path d="m3 10 7-7"/><path d="m14 21 7-7"/>',
  boutique:  '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  // Les seconds choix : un métier n'a pas qu'un symbole possible, et laisser
  // choisir vaut mieux qu'imposer. Un logo qu'on choisit devient le sien.
  croissant: '<path d="M4.6 13.11l5.79-3.21c1.89-1.05 4.79 1.78 3.71 3.71l-3.22 5.81C8.8 23.16.79 15.23 4.6 13.11"/><path d="M7 17l-2 2"/><path d="M12 4a8 8 0 0 1 8 8"/>',
  etoile:    '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.12 2.12 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.12 2.12 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.12 2.12 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.12 2.12 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.12 2.12 0 0 0 1.597-1.16z"/>',
  coeur:     '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  feuille:   '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
  eclair:    '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  tasse:     '<path d="M10 2v2"/><path d="M14 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/><path d="M6 2v2"/>',
  main:      '<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
}

// Le métier vers SES symboles, du plus évident au plus libre. Ce qui n'est pas
// listé prend la boutique, qui n'invente rien : elle dit « un commerce », ce
// qui est toujours vrai.
//
// ⚠️ PLUSIEURS PROPOSITIONS, PAS UNE SEULE (Alex, 14/08). Un logo qu'on choisit
// devient le sien ; un logo imposé reste « celui de Yoppaa », et le commerçant
// s'en détache. Le premier de la liste reste le plus attendu pour son métier,
// c'est celui qu'on montre en premier.
const PAR_TYPE = [
  [/coiffeur|barbier|esthét|institut|onglerie|tatoueur/i, ['ciseaux', 'etoile', 'coeur']],
  [/boulangerie|pâtisserie|patisserie|chocolat|viennois/i, ['pain', 'croissant', 'etoile']],
  [/restaurant|friterie|snack|pizzeria|sandwich|traiteur|brasserie|food truck/i, ['fourchette', 'etoile', 'coeur']],
  [/coffee|bar|torréfacteur|torrefacteur/i, ['tasse', 'fourchette', 'etoile']],
  [/épicerie|epicerie|supérette|superette|boucherie|poissonnerie|fromagerie|primeur|caviste|ferme/i, ['panier', 'feuille', 'etoile']],
  [/vêtement|vetement|chaussure|maroquinerie|puéricult|puericult|seconde main/i, ['vetement', 'etoile', 'coeur']],
  [/fleuriste|jardinerie/i, ['fleur', 'feuille', 'coeur']],
  [/librairie|papeterie|jouet|loisirs créatifs|loisirs creatifs|cadeaux|artisanat/i, ['livre', 'etoile', 'main']],
  [/garagiste|carwash|bricolage|quincaillerie|électroménager|electromenager|informatique|téléphonie|telephonie/i, ['cle', 'eclair', 'etoile']],
  [/cordonnier|pressing|retouches/i, ['main', 'etoile', 'cle']],
  [/vélo|velo/i, ['velo', 'eclair', 'etoile']],
  [/toiletteur|animalerie/i, ['patte', 'coeur', 'etoile']],
  [/studio photo|photo|opticien/i, ['appareil', 'etoile', 'eclair']],
  // ⚠️ LE BIEN-ÊTRE AVANT LE SPORT, et l'ordre compte : la première expression
  // qui reconnaît le métier gagne. Ces deux familles étaient sur une seule
  // ligne, donc un studio de yoga se voyait proposer un HALTÈRE en premier
  // choix. Une professeure de yoga ne se reconnaît pas dans un haltère, et le
  // commerçant pressé prend toujours la première proposition.
  [/yoga|pilates|massage|bien-être|bien-etre|méditation|meditation|sophro/i, ['feuille', 'coeur', 'halteres']],
  [/salle de sport|coach|cours/i, ['halteres', 'feuille', 'coeur']],
  [/auto-école|auto-ecole/i, ['cle', 'eclair', 'etoile']],
  [/pharmacie/i, ['coeur', 'feuille', 'etoile']],
]

// Les symboles proposés pour ce métier, le plus évident en tête.
export function symbolesPourType(type) {
  const t = String(type || '')
  for (const [motif, cles] of PAR_TYPE) if (motif.test(t)) return cles
  return ['boutique', 'etoile', 'coeur']
}

// Le symbole par défaut, quand on n'en propose qu'un.
export function symbolePourType(type) {
  return symbolesPourType(type)[0]
}

// La couleur, dérivée du NOM. Deux coiffeurs de la même rue n'ont donc pas la
// même vignette, alors qu'ils partagent le même symbole. Toujours la même pour
// un nom donné : un logo qui changerait à chaque affichage ne serait pas un logo.
//
// Les teintes restent dans la famille Yoppaa, du violet au bleu-violet, pour
// qu'une fiche reste reconnaissable comme une fiche Yoppaa.
export function couleurPourNom(nom) {
  return teinteVers(teintePourNom(nom))
}

function teintePourNom(nom) {
  let h = 0
  const t = String(nom || 'Yoppaa')
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0
  return 250 + (h % 40) - 20                // 230 → 269, autour du violet Yoppaa
}

function teinteVers(teinte) {
  return {
    clair: `hsl(${teinte}, 62%, 58%)`,
    fonce: `hsl(${teinte}, 68%, 32%)`,
  }
}

// ⚠️ LES AUTRES COULEURS S'ÉLOIGNENT DU VIOLET, ET C'EST VOULU. La teinte
// dérivée du nom reste dans la famille Yoppaa, mais un fleuriste ou une
// boucherie peuvent vouloir du vert ou du rouge : leur imposer notre violet
// reviendrait à leur imposer notre identité, alors que c'est la leur qu'un
// logo doit porter. Elles restent sourdes et compatibles avec du blanc dessus.
const AUTRES_TEINTES = [
  152,   // vert profond
  200,   // bleu ardoise
  22,    // terre cuite
  340,   // framboise
]

// LES PROPOSITIONS À MONTRER AU COMMERÇANT.
//
// La première est la plus attendue : le symbole évident de son métier, dans la
// couleur dérivée de son nom. Les suivantes ouvrent, sans jamais partir loin :
// un autre symbole possible, puis d'autres couleurs.
//
// Chaque proposition porte une `cle` stable, ce qui permet de retenir celle
// qu'il a choisie et de la lui remontrer telle quelle.
export function propositionsLogo({ nom, type } = {}) {
  const symboles = symbolesPourType(type)
  const teinteNom = teintePourNom(nom)
  const propositions = []

  // Les symboles du métier, dans la couleur du nom.
  for (const symbole of symboles) {
    propositions.push({ cle: `${symbole}-${teinteNom}`, symbole, teinte: teinteNom })
  }
  // Puis le symbole principal décliné dans les autres familles de couleur.
  for (const teinte of AUTRES_TEINTES) {
    propositions.push({ cle: `${symboles[0]}-${teinte}`, symbole: symboles[0], teinte })
  }
  return propositions.map(p => ({
    ...p,
    couleurs: teinteVers(p.teinte),
    svg: logoProvisoireSvg({ nom, type, symbole: p.symbole, teinte: p.teinte }),
  }))
}

// Le SVG complet, prêt à être affiché ou converti en image.
// `symbole` et `teinte` sont facultatifs : sans eux, on rend la proposition par
// défaut, celle du métier dans la couleur du nom. Avec eux, on rend exactement
// ce que le commerçant a choisi dans la grille.
export function logoProvisoireSvg({ nom, type, taille = 512, symbole = null, teinte = null } = {}) {
  const { clair, fonce } = teinte === null ? couleurPourNom(nom) : teinteVers(teinte)
  const trace = SYMBOLES[symbole] || SYMBOLES[symbolePourType(type)]
  // Le symbole est dessiné dans une boîte de 24, agrandie et centrée sur 56 %
  // de la largeur : assez grand pour se lire à 68 pixels, assez petit pour
  // respirer dans le cercle.
  const echelle = (taille * 0.56) / 24
  const decalage = (taille - 24 * echelle) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${taille}" height="${taille}" viewBox="0 0 ${taille} ${taille}">
  <defs><radialGradient id="g" cx="38%" cy="32%" r="78%">
    <stop offset="0" stop-color="${clair}"/><stop offset="1" stop-color="${fonce}"/>
  </radialGradient></defs>
  <rect width="${taille}" height="${taille}" rx="${taille * 0.22}" fill="url(#g)"/>
  <g transform="translate(${decalage} ${decalage}) scale(${echelle})"
     fill="none" stroke="#FFFFFF" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    ${trace}
  </g>
</svg>`
}
