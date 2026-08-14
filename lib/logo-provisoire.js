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
}

// Le métier vers son symbole. Ce qui n'est pas listé prend la boutique, qui
// n'invente rien : elle dit « un commerce », ce qui est toujours vrai.
const PAR_TYPE = [
  [/coiffeur|barbier|esthét|institut|onglerie|tatoueur/i, 'ciseaux'],
  [/boulangerie|pâtisserie|patisserie|chocolat|viennois/i, 'pain'],
  [/restaurant|friterie|snack|pizzeria|sandwich|traiteur|brasserie|food truck|coffee|bar/i, 'fourchette'],
  [/épicerie|epicerie|supérette|superette|boucherie|poissonnerie|fromagerie|primeur|caviste|ferme/i, 'panier'],
  [/vêtement|vetement|chaussure|maroquinerie|puéricult|puericult|seconde main/i, 'vetement'],
  [/fleuriste|jardinerie/i, 'fleur'],
  [/librairie|papeterie|jouet|loisirs créatifs|loisirs creatifs/i, 'livre'],
  [/garagiste|carwash|cordonnier|bricolage|quincaillerie|électroménager|electromenager|informatique|téléphonie|telephonie/i, 'cle'],
  [/vélo|velo/i, 'velo'],
  [/toiletteur|animalerie/i, 'patte'],
  [/studio photo|photo/i, 'appareil'],
  [/salle de sport|coach|cours|yoga|pilates|auto-école|auto-ecole/i, 'halteres'],
]

export function symbolePourType(type) {
  const t = String(type || '')
  for (const [motif, cle] of PAR_TYPE) if (motif.test(t)) return cle
  return 'boutique'
}

// La couleur, dérivée du NOM. Deux coiffeurs de la même rue n'ont donc pas la
// même vignette, alors qu'ils partagent le même symbole. Toujours la même pour
// un nom donné : un logo qui changerait à chaque affichage ne serait pas un logo.
//
// Les teintes restent dans la famille Yoppaa, du violet au bleu-violet, pour
// qu'une fiche reste reconnaissable comme une fiche Yoppaa.
export function couleurPourNom(nom) {
  let h = 0
  const t = String(nom || 'Yoppaa')
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0
  const teinte = 250 + (h % 40) - 20        // 230 → 269, autour du violet Yoppaa
  return {
    clair: `hsl(${teinte}, 62%, 58%)`,
    fonce: `hsl(${teinte}, 68%, 32%)`,
  }
}

// Le SVG complet, prêt à être affiché ou converti en image.
export function logoProvisoireSvg({ nom, type, taille = 512 }) {
  const { clair, fonce } = couleurPourNom(nom)
  const symbole = SYMBOLES[symbolePourType(type)]
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
    ${symbole}
  </g>
</svg>`
}
