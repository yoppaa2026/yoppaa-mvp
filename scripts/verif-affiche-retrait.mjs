// Banc de L'AFFICHE DU POINT DE RETRAIT (16/10 soir).
//
// ✅ ALEX, 16/10 soir : le bandeau aux points Yoppaa (1 B), flèche au choix +
// phrase libre, A4 paysage + 2 A5, les deux fonds du kit, sans filigrane,
// l'intitulé gros (« c'est quand même important comme message »), la consigne
// mot pour mot.
//
// ⚠️ LE PLAN S'EXÉCUTE avec une mesure de texte GÉNÉREUSE (plus large que la
// vraie police) : s'il tient avec elle, il tient à l'impression.

import { readFileSync } from 'node:fs'
import { sansProse } from './lire-code.mjs'
import {
  PAGE_RETRAIT, TEXTES_RETRAIT, SENS_RETRAIT, sensRetrait, PHRASE_MAX, nettoyerPhrase, paletteRetrait,
  POINTS_FLECHE, pointsFlecheTournes, couperLignes, planAfficheRetrait, FORMATS_RETRAIT, LIBELLES_RETRAIT,
  placementsRetrait, nomFichierRetrait,
} from '../lib/affiche-retrait.js'
import { paletteAffiche } from '../lib/affiche-kit.js'

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}
const egal = (nom, a, b) => verifier(nom, JSON.stringify(a) === JSON.stringify(b), `obtenu ${JSON.stringify(a)}, attendu ${JSON.stringify(b)}`)
const lu = (f) => sansProse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'))
// Une mesure plus large que DM Sans (gras ≈ 0,6 em, 900 ≈ 0,64 em).
const mesurer = (t, taille, poids) => String(t).length * taille * (poids >= 900 ? 0.66 : poids >= 700 ? 0.62 : 0.56)

// ═══ 1. LES RÈGLES ════════════════════════════════════════════════════════
{
  egal('🔴 la consigne, mot pour mot (Alex)', TEXTES_RETRAIT.consigne, 'Donne ton numéro de commande et ton prénom pour le retrait.')
  egal('🔴 l’intitulé, sur deux lignes', TEXTES_RETRAIT.intitule, ['RETRAIT DES COMMANDES', 'YOPPAA'])
  egal('la pastille', TEXTES_RETRAIT.pastille, 'Sans faire la file !')
  egal('quatre sens', SENS_RETRAIT.map(s => s.id), ['gauche', 'droite', 'ici', 'droit'])
  egal('le titre suit la flèche (ici)', sensRetrait('ici').titre, ['C’est', 'ici !'])
  egal('le titre suit la flèche (tout droit)', sensRetrait('droit').titre, ['Tout', 'droit !'])
  egal('un sens inconnu : à gauche', sensRetrait('nimporte').id, 'gauche')

  egal('la phrase se nettoie', nettoyerPhrase('  À   gauche du\ncomptoir '), 'À gauche du comptoir')
  egal('une phrase vide reste vide', nettoyerPhrase(null), '')
  const longue = nettoyerPhrase('Au fond, près de la caisse, derrière le présentoir des gâteaux')
  verifier('🔴 une phrase trop longue tient en 48 caractères', longue.length <= PHRASE_MAX, String(longue.length))
  verifier('🔴 et se coupe au dernier mot entier', longue === 'Au fond, près de la caisse, derrière le', longue)

  egal('🔴 les deux fonds sont ceux du kit (blanc)', paletteRetrait(true).fond, paletteAffiche(true).fond)
  egal('🔴 les deux fonds sont ceux du kit (violet)', paletteRetrait(false).fond, paletteAffiche(false).fond)
  egal('les couleurs du logo sont celles du kit', paletteRetrait(false).wm, paletteAffiche(false).wm)

  // La flèche pointe où on le lui dit : la pointe (le plus gros point) part du bon côté.
  const pointe = (angle) => { const pts = pointsFlecheTournes(angle, 0, 0, 100); return pts.reduce((a, b) => (b.r > a.r ? b : a)) }
  verifier('🔴 à droite, la pointe est à droite', pointe(0).x > 80)
  verifier('🔴 à gauche, la pointe est à gauche', pointe(180).x < 20)
  verifier('🔴 ici, la pointe est en bas', pointe(90).y > 80)
  verifier('🔴 tout droit, la pointe est en haut', pointe(-90).y < 20)
  // ⚠️ UNE ROTATION, PAS UN MIROIR : un point du chevron (61, 19) tourné d'un
  // quart de tour vers le bas arrive en (81, 61). Un miroir garderait la pointe
  // au même endroit et passerait le test de la pointe seule.
  const bras = pointsFlecheTournes(90, 0, 0, 100)[4]
  verifier('🔴 la flèche tourne, elle ne se retourne pas', Math.abs(bras.x - 81) < 0.01 && Math.abs(bras.y - 61) < 0.01, `${bras.x},${bras.y}`)
  egal('neuf points, la pointe la plus forte', [POINTS_FLECHE.length, POINTS_FLECHE.find(p => p.r === Math.max(...POINTS_FLECHE.map(q => q.r))).rang], [9, 0])
  verifier('les points grossissent vers la pointe (la tige)', POINTS_FLECHE.slice(0, 4).every((p, i, a) => i === 0 || p.r > a[i - 1].r))
  egal('les lignes se coupent à la largeur', couperLignes('un deux trois quatre', 10, t => t.length), ['un deux', 'trois'])
}

// ═══ 2. LE PLAN, POUR CHAQUE SENS, CHAQUE FOND, PHRASE COURTE ET LONGUE ═══
{
  const { largeur: W } = PAGE_RETRAIT
  for (const s of SENS_RETRAIT) {
    for (const clair of [true, false]) {
      for (const phrase of ['', 'À gauche du comptoir', 'Au fond, près de la caisse, derrière la vitrine']) {
        const cas = `${s.id}/${clair ? 'blanc' : 'violet'}/${phrase.length}`
        const plan = planAfficheRetrait({ sens: s.id, phrase, clair, nomCommerce: 'La Boulangerie du Coin de la Grand-Place', mesurer })
        const ops = plan.operations
        const bloc = plan.bloc
        // Le bord gauche d'un texte, qu'il soit aligné à gauche ou centré.
        const gauche = (t) => (t.aligne === 'center' ? t.x - mesurer(t.texte, t.taille, t.poids) / 2 : t.x)
        verifier(`🔴 ${cas} : le bloc est du côté de la flèche`, s.id === 'droite' ? bloc.x === W - bloc.largeur : bloc.x === 0)
        // ⚠️ REPOINTÉES LE 17/10 (bis) : « QR + logos des stores », PAS dans
        // le bandeau (Alex), dans le PIED (« 2 »). Un seul QR, en bas à droite
        // du côté texte, sous le filet ; légende, badges et logo à sa gauche,
        // sans se toucher ; rien sous 205 mm.
        const qrs = ops.filter(o => o.type === 'qr')
        const q = qrs[0]
        const zone = plan.zoneTexte
        const filet = ops.find(o => o.type === 'trait')
        verifier(`🔴 ${cas} : jamais de QR dans le bandeau (Alex)`, qrs.length === 1 && (q.x >= bloc.x + bloc.largeur || q.x + q.cote <= bloc.x))
        verifier(`🔴 ${cas} : le QR en bas à droite du côté texte, sous le filet`,
          Math.abs(q.x + q.cote - (zone.x + zone.largeur)) < 0.01 && q.y > filet.y1 && q.y + q.cote <= 205, `${q.x},${q.y}`)
        verifier(`🔴 ${cas} : le QR se scanne de près (≥ 30 mm de code)`, q.cote - q.marge * 2 >= 30, String(q.cote - q.marge * 2))
        const legende = ops.find(o => o.role === 'legende-qr')
        egal(`${cas} : la légende du QR`, legende.texte, 'Pas encore sur Yoppaa ?')
        verifier(`🔴 ${cas} : la légende à gauche du QR, sous le filet`,
          legende.y - legende.taille > filet.y1 && legende.x + mesurer(legende.texte, legende.taille, legende.poids) <= q.x - 4)
        const rangee = ops.find(o => o.type === 'badges')
        const finBadges = Math.max(...rangee.badges.map(b => b.x + b.largeur))
        verifier(`🔴 ${cas} : les deux badges officiels, sous la légende, à gauche du QR`,
          rangee.badges.length === 2 && rangee.y > legende.y && rangee.y + rangee.hauteur <= 205 && finBadges <= q.x - 4 && rangee.badges[0].x >= zone.x)
        // ⚠️ REPOINTÉE LE 17/10 (ter) : le logo en bas du BANDEAU, centré, même
        // taille (Alex), dans les couleurs de la flèche ; plus à côté du QR.
        const logos = ops.filter(o => o.type === 'logo')
        const logo = logos[0]
        verifier(`🔴 ${cas} : un seul logo, centré en bas du bandeau`,
          logos.length === 1 && logo.xCentre === bloc.x + bloc.largeur / 2 && logo.y >= 185 && logo.corps === 8, JSON.stringify(logo))
        verifier(`🔴 ${cas} : le logo se lit sur le bloc (couleurs de la flèche)`, JSON.stringify(logo.couleurs) === JSON.stringify(paletteRetrait(clair).blocWm))
        verifier(`${cas} : le logo ne touche pas la flèche`, logo.y - logo.corps > Math.max(...ops.filter(o => o.type === 'point').map(p => p.y + p.r)) + 10)
        const commerce = ops.find(o => o.role === 'commerce')
        verifier(`${cas} : le nom du commerce en tête`, commerce && commerce.y < Math.min(...ops.filter(o => o.role === 'intitule').map(o => o.y)) - 8)
        verifier(`🔴 ${cas} : la flèche reste dans son bloc`, ops.filter(o => o.type === 'point').every(p => p.x - p.r >= bloc.x && p.x + p.r <= bloc.x + bloc.largeur))
        // 🔴 LE SENS CHOISI EST CELUI DESSINÉ : la pointe (le plus gros point)
        // part du bon côté du centre de la flèche.
        const pts = ops.filter(o => o.type === 'point')
        const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length, cy = pts.reduce((a, p) => a + p.y, 0) / pts.length
        const tip = pts.reduce((a, b) => (b.r > a.r ? b : a))
        const bonSens = { gauche: tip.x < cx - 10, droite: tip.x > cx + 10, ici: tip.y > cy + 10, droit: tip.y < cy - 10 }[s.id]
        verifier(`🔴 ${cas} : « ${s.libelle} » dessine la flèche dans ce sens`, bonSens, `${tip.x.toFixed(1)},${tip.y.toFixed(1)} / ${cx.toFixed(1)},${cy.toFixed(1)}`)
        verifier(`${cas} : la flèche a la couleur du bloc en contraste`, ops.filter(o => o.type === 'point').every(p => paletteRetrait(clair).blocWm.includes(p.couleur)))
        // ⚠️ REPOINTÉES LE 17/10 (bis) : la légende du QR vit côté texte, elle
        // aussi ne déborde pas et ne touche jamais le bloc.
        const textes = ops.filter(o => o.type === 'texte')
        const cote = textes
        const deborde = cote.filter(t => gauche(t) + mesurer(t.texte, t.taille, t.poids) > W - 15 || gauche(t) < 15)
        egal(`🔴 ${cas} : aucun texte ne déborde`, deborde.map(t => t.texte), [])
        const surLeBloc = cote.filter(t => t.x < bloc.x + bloc.largeur && t.x + mesurer(t.texte, t.taille, t.poids) > bloc.x)
        egal(`🔴 ${cas} : aucun texte sur le bloc`, surLeBloc.map(t => t.texte), [])
        verifier(`🔴 ${cas} : rien sous 205 mm (marge d’imprimante)`, textes.every(t => t.y <= 200) && ops.filter(o => o.type === 'logo').every(l => l.y + l.corps * 0.95 <= 205))
        const intitule = textes.filter(t => t.role === 'intitule')
        verifier(`🔴 ${cas} : l’intitulé reste gros (Alex)`, intitule.length === 2 && intitule.every(t => t.taille >= 10), intitule.map(t => t.taille).join(','))
        egal(`${cas} : le titre suit la flèche`, textes.filter(t => t.role === 'titre').map(t => t.texte), s.titre)
        egal(`🔴 ${cas} : la consigne est entière`, textes.filter(t => t.role === 'consigne').map(t => t.texte).join(' '), TEXTES_RETRAIT.consigne)
        const derniereConsigne = Math.max(...textes.filter(t => t.role === 'consigne').map(t => t.y))
        verifier(`🔴 ${cas} : la consigne passe au-dessus du filet`, derniereConsigne <= ops.find(o => o.type === 'trait').y1 - 3, String(derniereConsigne))
        verifier(`${cas} : le titre ne remonte pas dans l’intitulé`, textes.find(t => t.role === 'titre').y - textes.find(t => t.role === 'titre').taille * 0.75 > Math.max(...intitule.map(t => t.y)))
        verifier(`🔴 ${cas} : la phrase tient en deux lignes au plus`, textes.filter(t => t.role === 'phrase').length <= 2)
        egal(`${cas} : la phrase, telle qu’écrite`, textes.filter(t => t.role === 'phrase').map(t => t.texte).join(' '), nettoyerPhrase(phrase))
        verifier(`${cas} : une pastille, un logo`, ops.filter(o => o.type === 'pastille').length === 1 && ops.filter(o => o.type === 'logo').length === 1)
      }
    }
  }
  const sansNom = planAfficheRetrait({ nomCommerce: '', mesurer }).operations
  verifier('sans nom de commerce, pas de ligne vide', !sansNom.some(o => o.role === 'commerce'))
}

// ═══ 3. LES FORMATS ═══════════════════════════════════════════════════════
{
  egal('deux formats', FORMATS_RETRAIT, ['A4-paysage', 'A4-2-paysage'])
  egal('leurs mots', FORMATS_RETRAIT.map(f => LIBELLES_RETRAIT[f]), ['A4 paysage', 'A4, 2 affiches A5'])
  const a4 = placementsRetrait('A4-paysage')
  egal('🔴 A4 paysage : une affiche pleine page couchée', [a4.orientation, a4.cases, a4.coupe], ['landscape', [{ x: 0, y: 0, w: 297, h: 210 }], []])
  const a5 = placementsRetrait('A4-2-paysage')
  egal('🔴 2 A5 paysage : une A4 debout, deux affiches l’une sur l’autre', [a5.orientation, a5.cases.length], ['portrait', 2])
  verifier('🔴 chaque A5 garde les proportions de l’A4 paysage', a5.cases.every(c => Math.abs(c.w / c.h - 297 / 210) < 0.001))
  egal('🔴 le trait de coupe traverse la feuille au milieu', a5.coupe, [{ x1: 0, y1: 148.5, x2: 210, y2: 148.5 }])
  egal('un format inconnu : rien', placementsRetrait('A3'), null)
  egal('le nom du fichier dit le format et le fond', nomFichierRetrait('aux-delices', false, 'A4-2-paysage'), 'yoppaa-retrait-aux-delices-A4-2-paysage-violet.pdf')
}

// ═══ 4. C'EST BRANCHÉ ? ══════════════════════════════════════════════════
{
  const lib = lu('lib/affiche-retrait.js')
  verifier('🔴 le canvas exécute le plan (une seule mise en page)', /const \{ operations \} = planAfficheRetrait\(\{ sens, phrase, clair, nomCommerce, mesurer \}\)/.test(lib))
  verifier('🔴 les polices avant le dessin', /document\.fonts\?\.load\('900 100px "DM Sans"'\)/.test(lib) && lib.indexOf("document.fonts?.load('900") < lib.indexOf('planAfficheRetrait({ sens, phrase, clair, nomCommerce, mesurer })'))
  verifier('🔴 le logo suit la règle de l’affiche QR', /const yDots = o\.y \* k \+ descente \+ L\.wordmarkToDots/.test(lib) && /pointsLogo\(corps\)/.test(lib))
  // ⚠️ REPOINTÉE LE 17/10 : le QR existe (Alex), mais ce fichier ne le
  // fabrique pas : il reçoit celui de la fiche, généré par le tableau de bord.
  verifier('🔴 le module ne fabrique aucun QR lui-même', !/from 'qrcode'|import\('qrcode'\)/.test(lib))
  verifier('🔴 pas de PDF sans QR (une carte blanche vide imprimée)', /if \(!gabarit \|\| !qrDataUrl\) return false/.test(lib))
  verifier('🔴 les badges : seulement la partie opaque, les deux ou aucun', /if \(!badgesPrets\) continue/.test(lib) && /b\.badge\.visible\.y \* echelle/.test(lib))

  const conf = lu('app/dashboard/ConfigDashboard.js')
  // Pour TOUS les commerces : hors de la condition des cartons de table.
  verifier('🔴 le bloc est dans le kit, pour tous les commerces',
    /<CarteTableBloc slug=\{slug\} nomCommerce=\{nomCommerce\} clair=\{fondClair\} toast=\{toast\}\/>\s*\)\}[^<]{0,120}<AfficheRetraitBloc slug=\{slug\} nomCommerce=\{nomCommerce\} clair=\{fondClair\} toast=\{toast\}\/>/.test(conf))
  // ⚠️ REPOINTÉES LE 17/10 : avec le QR de la fiche.
  verifier('🔴 le téléchargement passe le sens, la phrase et le QR', /telechargerAfficheRetraitPdf\(\{ sens, phrase, clair, nomCommerce, slug, format, qrDataUrl: qr \}\)/.test(conf))
  verifier('🔴 l’aperçu est le vrai dessin', /construireAfficheRetrait\(\{ sens, phrase, clair, nomCommerce, qrDataUrl: qr \}\)/.test(conf))
  verifier('🔴 le QR ouvre la FICHE de ce commerce (comme l’affiche de vitrine)',
    /const urlFiche = lienFiche\(slug\)/.test(conf) && /m\.default\.toDataURL\(urlFiche, \{/.test(conf))
  verifier('la phrase est bornée à la saisie', /maxLength=\{PHRASE_MAX\}/.test(conf))
  verifier('les quatre sens sont proposés', /\{SENS_RETRAIT\.map\(o => \(/.test(conf) && /onClick=\{\(\) => setSens\(o\.id\)\}/.test(conf))
}

console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('L’affiche du point de retrait : verte.')
