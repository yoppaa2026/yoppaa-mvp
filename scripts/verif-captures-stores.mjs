// BANC DES VISUELS DES STORES.
//
// ⚠️ IL EXÉCUTE LA COMPOSITION, il ne lit pas du code. Le contexte de canvas
// est simulé et ENREGISTRE ce qu'on lui demande de dessiner ; on mesure ensuite
// les nombres. Un banc qui chercherait « on ne déforme pas » dans un
// commentaire resterait vert sur une composition qui déforme.
//
// 🔴 CE QUE CE BANC EXISTE POUR ATTRAPER, et que rien d'autre n'attrape :
//   - une capture ÉTIRÉE : invisible à 2,5 %, et c'est exactement l'écart entre
//     le format d'Alex et celui d'Apple ;
//   - un format HORS RÈGLES : Google refuse un ratio sous 9:16, Apple refuse
//     toute dimension absente de sa liste, et le rejet arrive APRÈS la revue ;
//   - un titre qui MORD sur la capture ;
//   - la palette qui DIVERGE de celle du brand-kit.

import { readFileSync } from 'node:fs'
import {
  T, FORMATS, VISUELS, P, RATIO_MINIMUM_GOOGLE, RECADRAGE_DEFAUT,
  enLignes, dessiner,
} from '../lib/captures-stores.js'

let passees = 0
const echecs = []

function verifier(nom, condition, detail) {
  if (condition) { passees++; return }
  echecs.push(nom + (detail ? ' — ' + detail : ''))
}

// ────────── LE CONTEXTE SIMULÉ ──────────
// Il n'imite pas un canvas : il ENREGISTRE. C'est ce qui rend la composition
// mesurable hors d'un navigateur.
function ctxFactice() {
  const j = { fillRect: [], fillText: [], drawImage: [], arcs: [], couleursFill: [], clips: 0 }
  return {
    fillStyle: '', font: '', textAlign: '', textBaseline: '',
    clearRect() {},
    fillRect(x, y, l, h) { j.fillRect.push({ x, y, l, h, couleur: this.fillStyle }) },
    fillText(t, x, y) { j.fillText.push({ t, x, y, couleur: this.fillStyle, font: this.font }) },
    measureText(t) {
      // Approximation volontaire : le banc mesure la LOGIQUE de coupe, pas le
      // crénage réel d'une police. Une largeur proportionnelle suffit.
      const m = /(\d+(?:\.\d+)?)px/.exec(this.font)
      return { width: String(t).length * (m ? Number(m[1]) : 16) * 0.55 }
    },
    beginPath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, closePath() {},
    arc(x, y, r) { j.arcs.push({ x, y, r }) },
    fill() { j.couleursFill.push(this.fillStyle) },
    save() {}, restore() {}, clip() { j.clips++ },
    drawImage(img, sx, sy, sl, sh, dx, dy, dl, dh) { j.drawImage.push({ sx, sy, sl, sh, dx, dy, dl, dh }) },
    j,
  }
}

// La vraie capture d'Alex : 1080 × 2400, un ratio Android.
const CAPTURE = { naturalWidth: 1080, naturalHeight: 2400 }

console.log('\n── A. Ce que les stores exigent ──')

// 🔴 Apple refuse au pixel près, et le rejet arrive APRÈS la soumission.
const LISTE_APPLE = [[1290, 2796], [1320, 2868], [1242, 2688], [1284, 2778]]
for (const f of FORMATS.filter((x) => x.store === 'apple')) {
  verifier(
    'A1 ' + f.nom + ' est dans la liste d Apple',
    LISTE_APPLE.some(([l, h]) => l === f.l && h === f.h),
    f.l + ' x ' + f.h + ' absent de la liste',
  )
}

// 🔴 LA BORNE QUE L ANCIEN FORMAT VIOLAIT. Google veut un ratio entre 16:9 et
// 9:16 ; en portrait, largeur/hauteur au moins 0,5625. L ancien 1080 x 2340
// valait 0,4615 et serait passe en revue sans que personne ne le voie.
for (const f of FORMATS.filter((x) => x.store === 'google')) {
  const ratio = f.l / f.h
  verifier(
    'A2 ' + f.nom + ' respecte le ratio minimum de Google',
    ratio >= RATIO_MINIMUM_GOOGLE - 1e-9,
    'ratio ' + ratio.toFixed(4) + ', minimum ' + RATIO_MINIMUM_GOOGLE.toFixed(4),
  )
}

for (const f of FORMATS) {
  verifier(
    'A3 ' + f.nom + ' tient entre 320 et 3840 px',
    Math.min(f.l, f.h) >= 320 && Math.max(f.l, f.h) <= 3840,
  )
}
verifier('A4 les trois formats ont un identifiant unique', new Set(FORMATS.map((f) => f.id)).size === FORMATS.length)

console.log('   ' + passees + ' verifications')

console.log('\n── B. Les textes ──')
const avantB = passees

verifier('B1 il y a huit visuels', VISUELS.length === 8, VISUELS.length + ' trouves')
verifier(
  'B2 ils sont numerotes de 1 a 8 sans trou',
  VISUELS.map((v) => v.n).join(',') === '1,2,3,4,5,6,7,8',
)
for (const v of VISUELS) {
  // ⚠️ PAS DE TIRET CADRATIN EN FRANCAIS, ni de demi-cadratin. Ils se voient
  // enormes sur un visuel de store.
  verifier(
    'B3 visuel ' + v.n + ' sans tiret cadratin',
    !/[–—]/.test(v.titre + ' ' + v.sous),
    'trouve dans « ' + v.titre + ' »',
  )
  verifier('B4 visuel ' + v.n + ' a un titre et un sous-titre', Boolean(v.titre && v.sous && v.attendu))
  // ⚠️ UN SEUL CHIFFRE CHEZ YOPPAA, ET C EST 100. Aucun visuel ne doit en
  // porter un autre : un nombre de commerces vieillit, et se dement tout seul.
  verifier(
    'B5 visuel ' + v.n + ' n annonce aucun chiffre',
    !/\d/.test(v.titre + ' ' + v.sous),
    'chiffre dans « ' + v.titre + ' / ' + v.sous + ' »',
  )
}
console.log('   ' + (passees - avantB) + ' verifications')

console.log('\n── C. La composition, executee sur 3 formats x 8 visuels ──')
const avantC = passees

for (const f of FORMATS) {
  for (const v of VISUELS) {
    const ctx = ctxFactice()
    const plan = dessiner(ctx, f, v, CAPTURE, RECADRAGE_DEFAUT)
    const cle = f.id + '/' + v.n

    // Le fond couvre exactement le cadre, dans la couleur de la marque.
    const fond = ctx.j.fillRect[0]
    verifier(
      'C1 ' + cle + ' le fond couvre tout le cadre',
      fond && fond.x === 0 && fond.y === 0 && fond.l === f.l && fond.h === f.h && fond.couleur === T.ink,
    )

    // 🔴 LE CONTROLE QUI COMPTE LE PLUS. Une capture etiree de 2,5 % ne se voit
    // pas a l oeil, et c est exactement l ecart entre le format d Alex et celui
    // d Apple. On compare le ratio DESSINE au ratio SOURCE.
    const d = ctx.j.drawImage[0]
    verifier('C2 ' + cle + ' la capture est bien dessinee', Boolean(d))
    if (d) {
      const ratioSource = d.sl / d.sh
      const ratioDessine = d.dl / d.dh
      verifier(
        'C3 ' + cle + ' la capture n est PAS deformee',
        Math.abs(ratioDessine - ratioSource) < 0.0005,
        'source ' + ratioSource.toFixed(4) + ' vs dessine ' + ratioDessine.toFixed(4),
      )
      verifier(
        'C4 ' + cle + ' la capture ne depasse pas sa largeur maximale',
        d.dl <= f.l * P.largeurCaptureMax + 0.5,
        'largeur ' + Math.round(d.dl) + ' pour un plafond de ' + Math.round(f.l * P.largeurCaptureMax),
      )
      verifier(
        'C5 ' + cle + ' la capture est centree',
        Math.abs((d.dx + d.dl / 2) - f.l / 2) < 0.5,
      )
      // Elle doit ATTEINDRE le bas : un vide sous la capture trahit une
      // composition qui n a pas ete pensee pour ce format.
      verifier(
        'C6 ' + cle + ' la capture touche le bas du cadre',
        d.dy + d.dh >= f.h - 1,
        'elle s arrete a ' + Math.round(d.dy + d.dh) + ' sur ' + f.h,
      )
      // 🔴 LE TITRE NE MORD PAS SUR LA CAPTURE. Le dernier texte ecrit doit
      // finir au-dessus du haut de la capture.
      const dernierTexte = ctx.j.fillText[ctx.j.fillText.length - 1]
      const tailleDernier = Number(/(\d+(?:\.\d+)?)px/.exec(dernierTexte.font)[1])
      verifier(
        'C7 ' + cle + ' le texte ne mord pas sur la capture',
        dernierTexte.y + tailleDernier * 1.35 <= plan.hautCapture + 0.5,
        'texte jusqu a ' + Math.round(dernierTexte.y + tailleDernier * 1.35) + ', capture des ' + Math.round(plan.hautCapture),
      )
      // La barre d etat est bien coupee : on ne part jamais du pixel 0.
      verifier(
        'C8 ' + cle + ' la barre d etat est coupee',
        d.sy > 0 && d.sy < CAPTURE.naturalHeight * 0.2,
        'coupe a ' + d.sy,
      )
      // Et la capture est detouree, sinon le surplus deborde du cadre arrondi.
      verifier('C9 ' + cle + ' la capture est detouree', ctx.j.clips >= 1)
    }

    // Les cinq dots, aux proportions du logo.
    verifier('C10 ' + cle + ' les cinq dots sont dessines', ctx.j.arcs.length === 5, ctx.j.arcs.length + ' trouves')
  }
}
console.log('   ' + (passees - avantC) + ' verifications')

console.log('\n── D. La coupe des lignes ──')
const avantD = passees
{
  const ctx = ctxFactice()
  ctx.font = '800 100px x'
  verifier('D1 un titre court tient sur une ligne', enLignes(ctx, 'Rien ne se perd', 1100).length === 1)
  verifier('D2 un titre long est coupe', enLignes(ctx, 'Prends rendez-vous quand tu veux, meme le dimanche', 1100).length > 1)
  // Un mot plus large que la boite ne doit ni boucler ni disparaitre.
  const seul = enLignes(ctx, 'Anticonstitutionnellementementement', 200)
  verifier('D3 un mot trop large sort quand meme', seul.length === 1 && seul[0].length > 0)
  verifier('D4 un texte vide ne casse rien', enLignes(ctx, '', 500).length === 0)
}
console.log('   ' + (passees - avantD) + ' verifications')

console.log('\n── E. Les cas limites du recadrage ──')
const avantE = passees
{
  // Un recadrage aberrant ne doit rien dessiner plutot que de produire une
  // image a l envers ou une division par zero.
  const ctx = ctxFactice()
  const plan = dessiner(ctx, FORMATS[0], VISUELS[0], CAPTURE, { haut: 60, bas: 60 })
  verifier('E1 un recadrage impossible ne dessine pas la capture', ctx.j.drawImage.length === 0)
  verifier('E2 et le fond est quand meme peint', ctx.j.fillRect.length === 1 && plan.capture === null)

  // Sans capture, la page doit rester utilisable : le gabarit se dessine seul.
  const ctx2 = ctxFactice()
  const plan2 = dessiner(ctx2, FORMATS[0], VISUELS[0], null, RECADRAGE_DEFAUT)
  verifier('E3 sans capture, le titre et les dots sont quand meme la', ctx2.j.fillText.length > 0 && ctx2.j.arcs.length === 5)
  verifier('E4 et aucune capture n est dessinee', ctx2.j.drawImage.length === 0 && plan2.capture === null)
}
console.log('   ' + (passees - avantE) + ' verifications')

console.log('\n── F. La palette ne diverge pas du brand-kit ──')
const avantF = passees
{
  // ⚠️ LA PALETTE EST RECOPIEE, faute de pouvoir importer une page. Ce controle
  // est ce qui empeche les deux de deriver : c est exactement le defaut qui
  // vient de se produire ailleurs, deux routes qui appellent les memes gabarits
  // avec des colonnes differentes.
  const src = readFileSync(new URL('../app/brand-kit/page.js', import.meta.url), 'utf8')
  const bloc = /const T = \{([^}]*)\}/.exec(src)
  verifier('F1 le bloc de palette du brand-kit est lisible', Boolean(bloc))
  if (bloc) {
    const refs = {}
    for (const m of bloc[1].matchAll(/(\w+):\s*'(#[0-9A-Fa-f]{6})'/g)) refs[m[1]] = m[2].toUpperCase()
    for (const cle of ['ink', 'main', 'mid', 'light', 'pale', 'bg']) {
      verifier(
        'F2 ' + cle + ' est identique au brand-kit',
        refs[cle] && refs[cle] === T[cle].toUpperCase(),
        'ici ' + T[cle] + ', brand-kit ' + (refs[cle] || 'absent'),
      )
    }
  }
}
console.log('   ' + (passees - avantF) + ' verifications')

console.log('')
if (echecs.length) {
  console.log('🔴 ' + echecs.length + ' verification(s) en echec :')
  for (const e of echecs.slice(0, 25)) console.log('   ' + e)
  if (echecs.length > 25) console.log('   ... et ' + (echecs.length - 25) + ' autres')
  console.log('\n' + passees + ' passees, ' + echecs.length + ' en echec.')
  process.exit(1)
}
console.log(passees + ' verifications passees, 0 en echec.')
console.log('Visuels des stores verts.')
