// HARNAIS DE MUTATION — LA JAUGE DES PAGES IMPRIMABLES (29/08).
//
// ⚠️ POURQUOI CE HARNAIS EXISTE. La jauge est un INSTRUMENT DE MESURE : elle
// décide si un A4 part à l'imprimante. Un instrument qui se trompe de verdict
// est PIRE que pas d'instrument, parce qu'il donne une confiance fausse sur un
// support qu'on ne peut plus corriger. Le harnais de la veille avait fait
// exactement ça en prenant des rouges pour des plantages. On ne se contente
// donc pas d'un banc vert : on casse la jauge, exprès, et on exige le rouge.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout` :
// le dépôt porte du travail non commité, et un checkout l'effacerait.
//
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON. Un banc qui
// PLANTE n'a rien prouvé : il faut qu'il rougisse en le disant.
//
//   node scripts/mutations-jauge-kit.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`

const MUTATIONS = [
  // ══ LA RÈGLE ══
  { nom: '🔴 LE SENS S’INVERSE : ce qui déborde annoncerait qu’il reste de la place',
    banc: 'verif:kit', fichier: 'lib/jauge-page.js',
    de: '  if (v > 0) {', vers: '  if (v < 0) {' },

  { nom: '🔴 le piège du zéro revient : « pas mesuré » deviendrait « 0 mm, ça tient »',
    banc: 'verif:kit', fichier: 'lib/jauge-page.js',
    de: "  if (mm === null || mm === undefined || mm === '') return null\n  const v = Number(mm)\n  if (!Number.isFinite(v)) return null",
    vers: '  const v = Number(mm)\n  if (!Number.isFinite(v)) return null' },

  { nom: '🔴 le seuil bas disparaît : une page à ras bord serait annoncée bonne à tirer',
    banc: 'verif:kit', fichier: 'lib/jauge-page.js',
    de: 'export const MARGE_MINI = 3', vers: 'export const MARGE_MINI = 0' },

  { nom: '🔴 le seuil haut s’envole : une page à moitié vide passerait pour réussie',
    banc: 'verif:kit', fichier: 'lib/jauge-page.js',
    de: 'export const MARGE_MAXI = 18', vers: 'export const MARGE_MAXI = 100' },

  { nom: '🔴 le millimétrage s’arrondit : je ne saurais plus combien couper',
    banc: 'verif:kit', fichier: 'lib/jauge-page.js',
    de: "return { etat: 'deborde', marge: 0, texte: `DÉBORDE DE ${dire(v)}, à raccourcir` }",
    vers: "return { etat: 'deborde', marge: 0, texte: `DÉBORDE DE ${dire(Math.round(v))}, à raccourcir` }" },

  { nom: '🔴 le point décimal anglais revient dans la jauge',
    banc: 'verif:kit', fichier: 'lib/jauge-page.js',
    de: "  const dire = (n) => `${String(n).replace('.', ',')} mm`",
    vers: '  const dire = (n) => `${n} mm`' },

  // ══ CE QUI REND LA MESURE POSSIBLE ══
  //
  // ⚠️ LA MUTATION LA PLUS IMPORTANTE DU LOT. Sans `overflow:hidden`, la page
  // s'étire au lieu de couper, `scrollHeight` égale `clientHeight`, et la
  // jauge affiche un VERT PERMANENT ET FAUX. Rien ne casse, rien n'alerte :
  // l'instrument devient aveugle en gardant l'air de fonctionner.
  { nom: '🔴 LA FEUILLE NE COUPE PLUS : la jauge deviendrait aveugle, et verte pour toujours',
    banc: 'verif:kit', fichier: 'app/brand-kit/commercant/page.js',
    de: "width: '210mm', height: '297mm', overflow: 'hidden'",
    vers: "width: '210mm', height: '297mm', overflow: 'visible'" },

  { nom: '🔴 un repère de mesure disparaît : la marge ne se calcule plus',
    banc: 'verif:kit', fichier: 'app/brand-kit/commercant/page.js',
    de: '<div ref={versoPied} style={{ marginTop: \'auto\', background: T.panel,',
    vers: '<div style={{ marginTop: \'auto\', background: T.panel,' },

  { nom: '🔴 l’écran cesse de lire le module et se remet à décider tout seul',
    banc: 'verif:kit', fichier: 'app/brand-kit/commercant/page.js',
    de: "import { verdictJauge, TEINTES_JAUGE, PX_MM } from '@/lib/jauge-page'\n",
    vers: '' },

  // ══ LE RACCOURCISSEMENT LUI-MÊME ══
  { nom: '🔴 le verso reprend la marge haute du recto et redéborde',
    banc: 'verif:kit', fichier: 'app/brand-kit/commercant/page.js',
    de: "const padVerso = { padding: '13mm 17mm 0' }",
    vers: "const padVerso = { padding: '15mm 17mm 0' }" },

  // ══ L'EXPORT SVG / PNG ══
  //
  // ⚠️ LA MUTATION LA PLUS IMPORTANTE DE CE GROUPE. Sans le refus, l'export
  // produirait un fichier d'apparence normale DANS LA MAUVAISE POLICE, et
  // personne ne le verrait avant l'imprimeur.
  { nom: '🔴 L’EXPORT N’EXIGE PLUS LA POLICE : il produirait un fichier faux, sans le dire',
    banc: 'verif:kit', fichier: 'lib/export-feuille.js',
    de: '  if (css === null) {', vers: '  if (false) {' },

  { nom: '🔴 la réponse du fetch de la fonte n’est plus lue : un 404 deviendrait une police',
    banc: 'verif:kit', fichier: 'lib/export-feuille.js',
    de: '        if (essai.ok) { rep = essai; break }',
    vers: '        { rep = essai; break }' },

  // 🔴 LE DÉFAUT AUX DIX-SEPT 404 DU 29/08, remis exprès. Les deux lignes se
  // ressemblent tellement qu'aucune relecture ne les distingue : seule
  // l'exécution les sépare.
  { nom: '🔴 l’adresse de la fonte se résout de nouveau contre la PAGE et non contre sa feuille',
    banc: 'verif:kit', fichier: 'lib/export-feuille.js',
    de: '    const base = r.parentStyleSheet?.href || location.href',
    vers: '    const base = location.href' },

  // ⚠️ LES DEUX SUSPECTS DU REFUS VU EN PRODUCTION LE 29/08, mis au banc pour
  // qu'ils ne reviennent jamais. La jauge était verte, la page parfaite, et
  // l'export refusait : je ne pouvais pas ouvrir un navigateur pour regarder.
  { nom: '🔴 la collecte cesse de descendre dans les @layer : la fonte redevient invisible',
    banc: 'verif:kit', fichier: 'lib/export-feuille.js',
    de: '    if (r.cssRules) reglesDePolice(r.cssRules, sortie)', vers: '' },

  { nom: '🔴 la règle se reconnaît de nouveau à son `type`, déprécié et pas rendu partout',
    banc: 'verif:kit', fichier: 'lib/export-feuille.js',
    de: "    if (/^@font-face/i.test(r.cssText || '')) { sortie.push(r); continue }",
    vers: '    if (r.type === 5) { sortie.push(r); continue }' },

  { nom: '🔴 une famille non reconnue refait échouer l’export au lieu de tout embarquer',
    banc: 'verif:kit', fichier: 'lib/export-feuille.js',
    de: '  const retenues = voulues.length > 0 ? voulues : toutes',
    vers: '  const retenues = voulues' },

  { nom: '🔴 le refus cesse de dire ce qu’il a vu',
    banc: 'verif:kit', fichier: 'lib/export-feuille.js',
    de: "    return { css: null, diag: `aucune règle @font-face dans les ${feuilles.length} feuilles de style`",
    vers: "    return { css: null, diag: `rien à faire`.replace('x', `${feuilles.length}`)" },

  { nom: '🔴 le base64 repasse en un seul coup : la pile déborderait sur une vraie fonte',
    banc: 'verif:kit', fichier: 'lib/export-feuille.js',
    de: '  const TRANCHE = 8192\n  for (let i = 0; i < octets.length; i += TRANCHE) {\n    binaire += String.fromCharCode.apply(null, octets.subarray(i, i + TRANCHE))\n  }',
    vers: '  binaire = String.fromCharCode.apply(null, octets)' },

  { nom: '🔴 le PNG repasse par un blob: et pourrait teinter la toile',
    banc: 'verif:kit', fichier: 'lib/export-feuille.js',
    de: "    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgTexte)",
    vers: '    img.src = URL.createObjectURL(new Blob([svgTexte], { type: \'image/svg+xml\' }))' },

  { nom: '🔴 le PNG perd son fond blanc et sortirait transparent',
    banc: 'verif:kit', fichier: 'lib/export-feuille.js',
    de: "        ctx.fillStyle = '#ffffff'\n        ctx.fillRect(0, 0, l, h)\n", vers: '' },

  { nom: '🔴 une carte de visite perd ses boutons de téléchargement',
    banc: 'verif:kit', fichier: 'app/brand-kit/commercant/page.js',
    de: '<Telechargements cible={carteQr}', vers: '<Rien cible={carteQr}' },

  // ══ LE PDF RECTO/VERSO ══
  // ⚠️ Ses deux défauts ne se voient qu'une fois la pile imprimée.
  { nom: '🔴 LE PDF SORT AVEC UNE PREMIÈRE PAGE BLANCHE et le recto en page 2',
    banc: 'verif:kit', fichier: 'lib/export-feuille.js',
    de: '    if (i > 0) doc.addPage([largeurMm, hauteurMm], \'portrait\')',
    vers: '    doc.addPage([largeurMm, hauteurMm], \'portrait\')' },

  // ══ LE KIT PAR SEGMENT (14/10) ══ Les erreurs de l'ancien papier ne
  // reviennent pas : un papier plastifié ne se corrige plus.
  { nom: '🔴 la carte de visite repromet le 8 janvier',
    banc: 'verif:kit', fichier: 'app/brand-kit/commercant/page.js',
    de: "{ESSAI_JOURS_MINIMUM} jours offerts, dès l&rsquo;inscription</p>",
    vers: "Gratuit jusqu&rsquo;au 8 janvier 2027</p>" },
  { nom: '🔴 « la place de marché » revient dans le descripteur',
    banc: 'verif:kit', fichier: 'app/brand-kit/commercant/page.js',
    // ⚠️ ANCRE RECALÉE LE 14/10 (version tunnel) : la ligne des métiers.
    // ⚠️ RECALÉE UNE 2e FOIS LE 14/10 (option 1) : la liste de métiers est
    // devenue les manières de vendre (`facons`).
    de: '                    {seg.facons}',
    vers: '                    La place de marché du commerce local belge' },
  { nom: '🔴 les deux faces partent dans le mauvais ordre',
    banc: 'verif:kit', fichier: 'app/brand-kit/commercant/page.js',
    // ⚠️ ANCRE RECALÉE LE 14/10 : la balise porte maintenant le nom du segment.
    de: '<TelechargementCombine pages={[recto, verso]}',
    vers: '<TelechargementCombine pages={[verso, recto]}' },

  { nom: '🔴 jspdf repart dans le bundle de tout le monde',
    banc: 'verif:kit', fichier: 'lib/export-feuille.js',
    de: "  const { jsPDF } = await import('jspdf')", vers: '  const jsPDF = globalThis.jsPDF' },

  { nom: '🔴 le PDF se remet à rastériser de son côté, et divergera du PNG',
    banc: 'verif:kit', fichier: 'lib/export-feuille.js',
    de: '    const toile = await svgEnToile(svg, largeurMm, hauteurMm, dpi)\n    // ⚠️ LA PAGE',
    vers: '    const toile = document.createElement(\'canvas\')\n    // ⚠️ LA PAGE' },

  { nom: '🔴 les boutons réapparaîtraient sur le papier imprimé',
    banc: 'verif:kit', fichier: 'app/brand-kit/commercant/page.js',
    de: '.atelier, .jauge, .notice, .outils { display:none !important }',
    vers: '.atelier, .jauge, .notice { display:none !important }' },

  // ══ LES TARIFS SUR LE PAPIER ══
  //
  // 🔴 UN PRIX RECOPIÉ SUR UN PAPIER PLASTIFIÉ NE SE CORRIGE PLUS, et les
  // tarifs sont paramétrables par variable d'environnement dans `lib/plans.js`.
  { nom: '🔴 un tarif est écrit en dur sur le papier au lieu d’être lu dans lib/plans.js',
    banc: 'verif:kit', fichier: 'app/brand-kit/commercant/page.js',
    // ⚠️ ANCRE RECALÉE LE 14/10 : les formules sont un tableau au verso.
    de: "prix: euros(getPrixPlan('communiquer').mensuel)", vers: "prix: '19,90 €'" },

  { nom: '🔴 le HTVA disparaît : un prix TTC sous-entendu chez un professionnel',
    banc: 'verif:kit', fichier: 'app/brand-kit/commercant/page.js',
    // ⚠️ ANCRE RECALÉE LE 14/10 (formules au verso).
    de: "prix: euros(getPrixPlan('vendre').mensuel), sous: 'HTVA par mois'",
    vers: "prix: euros(getPrixPlan('vendre').mensuel), sous: 'par mois'" },

  // ══ LES APLATS PÂLES (29/08) ══
  //
  // 🔴 CE DÉFAUT NE SE VOIT NULLE PART À L'ÉCRAN. Le violet très clair ressort
  // BLEU CIEL au tirage, et ça coûte une feuille pour l'apprendre.
  // ⚠️ ANCRE RECALÉE LE 14/10 : le « closer » est devenu le bloc « l'abonnement
  // n'enferme personne », tenu par le même filet violet.
  { nom: '🔴 un aplat pâle revient sur le closer : il ressortira bleu à l’impression',
    banc: 'verif:kit', fichier: 'app/brand-kit/commercant/page.js',
    // ⚠️ ANCRE RECALÉE LE 14/10 (version tunnel) : les blocs clairs sont les
    // trois atouts du recto, tenus par un filet.
    de: "border: `0.9pt solid ${FILET}`, borderRadius: '3.5mm'",
    vers: "background: T.bg, border: `0.9pt solid ${FILET}`, borderRadius: '3.5mm'" },

  { nom: '🔴 le logo du bandeau repasse en clair et disparaît sur le fond foncé',
    banc: 'verif:kit', fichier: 'app/brand-kit/commercant/page.js',
    de: '<YoppaaLogo size={22} mode="dark"/>', vers: '<YoppaaLogo size={22} mode="light"/>' },

  // ══ ✅ LA FEUILLE GÉNÉRALISTE, LE MÉTIER EN OPTION (Alex, 14/10, option 1) ══
  { nom: '🔴 un métier tapé fait d’espaces vide la pastille',
    banc: 'verif:kit', fichier: 'lib/kit-accroche.js',
    de: '  if (libre) return', vers: '  if (metierLibre != null) return' },

  { nom: '🔴 le métier tapé est ignoré, la feuille reste générale',
    banc: 'verif:kit', fichier: 'lib/kit-accroche.js',
    de: "return { verbe: 'Tu tiens', pastille: libre }", vers: 'return { verbe: accroche.verbe, pastille: accroche.pastille }' },

  { nom: '⚠️ un métier tapé n’est plus nettoyé de ses espaces',
    banc: 'verif:kit', fichier: 'lib/kit-accroche.js',
    de: ".replace(/\\s+/g, ' ').trim()", vers: '' },

  { nom: '⚠️ un métier tapé n’est plus borné en longueur',
    banc: 'verif:kit', fichier: 'lib/kit-accroche.js',
    de: '.slice(0, METIER_LIBRE_MAX)', vers: '' },

  { nom: '🔴 le cornet de frites revient et vexe la sandwicherie',
    banc: 'verif:kit', fichier: 'app/brand-kit/commercant/page.js',
    de: "pique: 'Ce que tu vends, ce n’est pas à nous d’en manger une part.'",
    vers: "pique: 'Ton cornet de frites, ce n’est pas à nous d’en manger une part.'" },

  { nom: '🔴 la ligne du haut redevient une liste de métiers',
    banc: 'verif:kit', fichier: 'app/brand-kit/commercant/page.js',
    de: "facons: 'En vitrine, en rayon, à retirer sur place'",
    vers: "facons: 'Mode, fleuristes, librairies, décoration'" },

  { nom: '🔴 la pastille généraliste redevient un métier en exemple',
    banc: 'verif:kit', fichier: 'app/brand-kit/commercant/page.js',
    de: "pastille: 'un commerce de bouche'", vers: "pastille: 'une friterie'" },

  { nom: '🔴 la pastille ignore le champ de l’atelier',
    banc: 'verif:kit', fichier: 'app/brand-kit/commercant/page.js',
    de: 'accrocheKit(seg.accroche, metierLibre)', vers: "accrocheKit(seg.accroche, '')" },

  { nom: '🔴 la jauge du recto ne remesure plus quand on tape un métier',
    banc: 'verif:kit', fichier: 'app/brand-kit/commercant/page.js',
    de: 'useAjustement(recto, rectoCorps, rectoPied, `${seg.cle}|${accroche.pastille}`)',
    vers: 'useAjustement(recto, rectoCorps, rectoPied, seg.cle)' },

  { nom: '🔴 le QR du recto ne dit plus où il mène',
    banc: 'verif:kit', fichier: 'app/brand-kit/commercant/page.js',
    de: '                    Scanne pour découvrir\n                  </p>', vers: '                    Scanne et regarde\n                  </p>' },

  { nom: '🔴 le QR du verso ne dit plus qu’il inscrit',
    banc: 'verif:kit', fichier: 'app/brand-kit/commercant/page.js',
    de: 'Scanne pour t&rsquo;inscrire', vers: 'Scanne-moi' },

  // ══ ✅ L'AFFICHE ET LE CARTON : LE NOM EN GRAND, LES BADGES (Alex, 14/10) ══
  { nom: '🔴 le logo reprend toute la place du nom',
    banc: 'verif:kit', fichier: 'lib/affiche-kit.js',
    de: '  const WM = 72', vers: '  const WM = 110' },

  { nom: '🔴 un long nom se coupe au premier espace, une ligne d’un mot puis le reste',
    banc: 'verif:kit', fichier: 'lib/affiche-kit.js',
    de: 'if (!meilleure || ecart < meilleure.ecart) meilleure', vers: 'if (!meilleure) meilleure' },

  { nom: '🔴 le nom est dessiné petit, la taille calculée part à la poubelle',
    banc: 'verif:kit', fichier: 'lib/affiche-kit.js',
    de: '  ctx.font = police(800, tailleNom)', vers: '  ctx.font = police(800, 42)' },

  { nom: '🔴 un long nom rapetisse au lieu de passer sur deux lignes',
    banc: 'verif:kit', fichier: 'lib/affiche-kit.js',
    de: '  if (tailleNom < NOM_MINI_UNE_LIGNE) {', vers: '  if (false) {' },

  { nom: '🔴 les badges sont chargés mais jamais dessinés',
    banc: 'verif:kit', fichier: 'lib/affiche-kit.js',
    // ⚠️ ANCRE RECALÉE LE 14/10 : le dessin rogne la marge transparente.
    de: '      ctx.drawImage(b.img,\n', vers: '      void (b.img,\n' },

  { nom: '🔴 un badge absent laisse un trou au milieu du papier',
    banc: 'verif:kit', fichier: 'lib/affiche-kit.js',
    de: '  const yPied       = badges ? yBadges + hauteurBadges + 48 : yAccroche2 + 54',
    vers: '  const yPied       = yBadges + hauteurBadges + 48' },

  { nom: '⚠️ le badge Google repasse à la hauteur d’Apple et paraît plus petit',
    // ⚠️ ANCRE RECALÉE LE 14/10 : on aligne la partie OPAQUE (Alex : « même
    // taille, surtout en hauteur »). Sans le recadrage, Google redevient petit.
    banc: 'verif:kit', fichier: 'lib/stores.js',
    de: "visible: { y: 29, hauteur: 192 } }", vers: "visible: { y: 0, hauteur: 250 } }" },

  { nom: '🔴 le dessin reprend le fichier entier, marge transparente comprise',
    banc: 'verif:kit', fichier: 'lib/affiche-kit.js',
    de: '0, b.badge.visible.y * k, b.img.naturalWidth, b.badge.visible.hauteur * k,',
    vers: '0, 0, b.img.naturalWidth, b.img.naturalHeight,' },

  { nom: '🔴 la landing revient à la correction à l’œil (46 / 68)',
    banc: 'verif:kit', fichier: 'app/components/LandingReveal.js',
    de: "style={{ width: Math.round(t.largeur), height: t.hauteur, objectFit: 'cover' }}", vers: '' },

  // ══ 🔴 LES DÉMOS DES RELECTEURS N'ONT NI KIT NI INVITATION PUBLICS (14/10) ══
  { nom: '🔴 ?ref=chez-momo invite de nouveau au nom d une démo',
    banc: 'verif:kit', fichier: 'lib/kit-resolve.js',
    de: '  if (com && ficheEnRelecture(com)) return null\n', vers: '' },

  { nom: '🔴 /kit/chez-momo montre de nouveau la démo',
    banc: 'verif:kit', fichier: 'app/kit/[slug]/page.js',
    de: '  if (com && ficheEnRelecture(com)) return null\n', vers: '' },

  // ══ ✅ GOOGLE PLAY EN LIGNE, « TÉLÉCHARGER » RÉPARÉ (15/10) ══
  { nom: '🔴 un Android ne part plus sur Google Play',
    banc: 'verif:kit', fichier: 'lib/stores.js',
    de: '  if (/Android/i.test(ua)) return GOOGLE_PLAY_URL || REPLI_TELECHARGEMENT', vers: '' },
  { nom: '🔴 la page /download ne redirige plus (page introuvable)',
    banc: 'verif:kit', fichier: 'app/download/page.js',
    de: '  redirect(cibleTelechargement(ua))', vers: '  return null' },
  { nom: '🔴 le bouton « Telecharger » retourne vers une adresse absolue',
    banc: 'verif:kit', fichier: 'app/commander/[slug]/page.js',
    de: '<a href="/download"', vers: '<a href="https://yoppaa.app/download"' },
  { nom: '⚠️ la phrase des badges redit « Bientot » pour les deux stores',
    banc: 'verif:kit', fichier: 'lib/stores.js',
    // ⚠️ ANCRE RECALÉE LE 15/10 : les liens passent en paramètres (`apple`, `google`).
    de: "  return !apple ? 'Bientôt disponible sur l’App Store.' : 'Bientôt disponible sur Google Play.'",
    vers: "  return 'Bientôt disponible sur l’App Store et Google Play.'" },

  // ══ LE DÉPOUILLEUR PARTAGÉ ══
  //
  // 🔴 CELLE-CI PROUVE QUE LE BANC VOIT SA PROPRE CÉCITÉ. Sans la
  // neutralisation, un « /* » écrit dans un commentaire « // » ouvre un faux
  // bloc qui avale 2 000 caractères de vrai code, et toutes les gardes en
  // « ce motif ne doit PAS apparaître » deviennent vraies sans rien prouver.
  { nom: '🔴 LE DÉPOUILLEUR REDEVIENT AVEUGLE et avale du vrai code en silence',
    banc: 'verif:kit', fichier: 'scripts/lire-code.mjs',
    de: "ligne.replace(/\\/\\*|\\*\\//g, '  ')", vers: 'ligne' },
]

function lancer(banc) {
  try {
    execSync(`npm run ${banc}`, { cwd: RACINE, stdio: 'pipe', encoding: 'utf8' })
    return { rouge: false, plante: false }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    // ⚠️ DISTINGUER UN BANC QUI ROUGIT D'UN BANC QUI PLANTE. Les bancs ne le
    // disent pas tous avec les mêmes mots : « en échec » ici, « ÉCHEC(S) » là.
    const aRougiProprement = /en échec|ÉCHEC\(S\)/.test(sortie)
    return { rouge: true, plante: !aRougiProprement, extrait: sortie.slice(-260) }
  }
}

for (const banc of [...new Set(MUTATIONS.map(m => m.banc))]) {
  const avant = lancer(banc)
  if (avant.rouge) { console.log(`✕ ${banc} DÉJÀ rouge.`); console.log(avant.extrait); process.exit(1) }
}
console.log('Bancs verts au départ.\n')

let attrapees = 0
const manquees = []

for (const m of MUTATIONS) {
  const f = chemin(m.fichier)
  const original = readFileSync(f, 'utf8')
  // ⚠️ « TEXTE INTROUVABLE » EST UNE NON-MESURE QUI PASSE POUR UNE MESURE.
  // Arrivé trois fois : une espace insécable, une apostrophe typographique.
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
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach(x => console.log('   • ' + x)) }

let finalRouge = false
for (const banc of [...new Set(MUTATIONS.map(m => m.banc))]) {
  if (lancer(banc).rouge) { finalRouge = true; console.log(`🔴 ${banc} ROUGE APRÈS RESTAURATION.`) }
}
console.log(finalRouge ? '' : '\nBancs verts après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
