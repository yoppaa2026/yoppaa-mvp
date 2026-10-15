// BANC : LA CARTE QU'ON LIT À TABLE (29/09).
//
// Un restaurateur pose un QR sur ses tables ; le client scanne et lit la
// carte. Ce banc vérifie ce que la carte MONTRE (exécuté, pas cherché) et les
// endroits où une erreur ne se verrait pas à l'écran : la clé utilisée, une
// fiche non publiée, une panne rendue comme « introuvable », un QR qui
// mènerait à la fiche au lieu de la carte.
//
//   npm run verif:carte-table

import { readFileSync } from 'node:fs'
import { sansProse } from './lire-code.mjs'
import { carteDeLaTable, prixALaCarte, servieAujourdhui, TITRE_SANS_CATEGORIE } from '../lib/carte-table.js'
import { lienCarte, lienFiche } from '../lib/lien-fiche.js'
import { placementsFeuille, traitsDeCoupe, FORMATS_FEUILLE, FORMATS_AFFICHE, FORMATS_CARTE_TABLE, LIBELLES_AFFICHE, LIBELLES_CARTE_TABLE, TEXTES_CARTE_TABLE, TEXTES_AFFICHE, nomFichierCarteTable } from '../lib/affiche-kit.js'

let ok = 0
const echecs = []
const v = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  echecs.push(`${nom}${detail ? ` — ${detail}` : ''}`)
}
const lire = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
const code = (f) => sansProse(lire(f))

// ═══ 1) LE PRIX QUI S'ÉCRIT ═════════════════════════════════════════════════
// ⚠️ L'ESPACE AVANT « € » EST INSÉCABLE (`lib/montants.js`) : le prix ne se
// coupe jamais en fin de ligne.
const EURO = String.fromCharCode(160) + '€'
{
  v('un prix se lit à la belge', prixALaCarte({ prix: 12.5 }) === '12,50' + EURO, prixALaCarte({ prix: 12.5 }))
  v('un prix en texte aussi', prixALaCarte({ prix: '9' }) === '9,00' + EURO)
  // 🔴 LE PIÈGE DU ZÉRO : Number(null) vaut 0.
  v('🔴 sans prix saisi, rien ne s\'écrit (pas « 0,00 € »)',
    prixALaCarte({ prix: null }) === null && prixALaCarte({ prix: undefined }) === null && prixALaCarte({ prix: '' }) === null)
  // ⚠️ RÉORIENTÉES LE 30/09 : « le prix est toujours un prix ferme » (Alex).
  v('🔴 un article de vitrine a son prix FERME, sans « dès »', prixALaCarte({ prix: 8, est_vitrine: true }) === '8,00' + EURO, prixALaCarte({ prix: 8, est_vitrine: true }))
  v('🔴 et plus de « Prix sur demande » : sans prix, rien', prixALaCarte({ prix: 0, est_vitrine: true }) === null)
  v('une formule qui masque les prix n\'en montre aucun', prixALaCarte({ prix: 12 }, { prixAffiches: false }) === null)
}

// ═══ 2) CE QUI EST SERVI AUJOURD'HUI ════════════════════════════════════════
{
  const lunch = { id: 'l', nom: 'Lunch du lundi', prix: 14, categorie: 'Lunch' }
  v('sans réglage pour ce jour, le plat est servi', servieAujourdhui(lunch, []) === true)
  v('🔴 désactivé ce jour-ci, il disparaît', servieAujourdhui(lunch, [{ article_id: 'l', actif: false }]) === false)
  v('actif ce jour-ci, il reste', servieAujourdhui(lunch, [{ article_id: 'l', actif: true }]) === true)
  v('le réglage d\'un autre plat ne le touche pas', servieAujourdhui(lunch, [{ article_id: 'x', actif: false }]) === true)
  // ⚠️ Le stock parle de la commande en ligne, pas de la salle.
  v('un stock à zéro ne retire pas le plat de la salle',
    servieAujourdhui(lunch, [{ article_id: 'l', actif: true, stock: 0 }]) === true)
}

// ═══ 3) LA CARTE, RANGÉE COMME LE COMMERÇANT L'A VOULUE ═════════════════════
{
  const articles = [
    { id: '1', nom: 'Vol-au-vent', prix: 19, categorie: 'Plats', photo_url: 'https://x/1.jpg' },
    { id: '2', nom: 'Carbonnades', prix: 18, categorie: 'Plats' },
    { id: '3', nom: 'Suggestion du chef', prix: 22, categorie: 'Suggestions de la semaine' },
    { id: '4', nom: 'Café', prix: 2.8, categorie: 'Boissons · Chaudes' },
    { id: '5', nom: 'Thé', prix: 2.8, categorie: 'Boissons · Chaudes' },
    { id: '6', nom: 'Coca', prix: 3, categorie: 'Boissons · Froides' },
    { id: '7', nom: 'Pain', prix: 1 },
    { id: '8', nom: 'Lunch du lundi', prix: 14, categorie: 'Lunch' },
    { id: '9', nom: 'Ancien plat', prix: 10, categorie: 'Plats', actif: false },
  ]
  const commercant = { ordre_categories: ['Suggestions de la semaine', 'Lunch', 'Plats'] }
  const { sections, total } = carteDeLaTable({ commercant, articles, reglagesDuJour: [{ article_id: '8', actif: false }] })
  const titres = sections.map(s => s.titre)

  v('🔴 l\'ordre voulu passe devant', titres[0] === 'Suggestions de la semaine' && titres[1] === 'Plats', titres.join(' | '))
  v('🔴 le lunch désactivé aujourd\'hui ne fait aucune section vide', !titres.includes('Lunch'), titres.join(' | '))
  v('un article inactif n\'apparaît pas', !sections.some(s => s.articles.some(a => a.id === '9')))
  v('le tas sans catégorie ferme la carte', titres[titres.length - 1] === TITRE_SANS_CATEGORIE)
  v('le total compte ce qui est servi', total === 7, String(total))
  // Sous-catégories : le parent ne s'écrit qu'une fois par groupe.
  const chaudes = sections.find(s => s.titre === 'Chaudes')
  const froides = sections.find(s => s.titre === 'Froides')
  v('le parent s\'écrit sur la première sous-catégorie', chaudes?.parent === 'Boissons')
  v('et pas une seconde fois', froides?.parent === null)
  v('chaque section a une ancre unique', new Set(sections.map(s => s.ancre)).size === sections.length)
  v('les ancres se lisent sans échappement', sections.every(s => /^c\d+$/.test(s.ancre)))
  v('la photo suit', sections.find(s => s.titre === 'Plats').articles.find(a => a.id === '1').photo === 'https://x/1.jpg')

  // ⚠️ L'interrupteur des photos du catalogue vaut aussi à table.
  const sansPhotos = carteDeLaTable({ commercant: { photos_catalogue_actif: false }, articles })
  v('🔴 photos coupées au catalogue, coupées à table', sansPhotos.sections.every(s => s.articles.every(a => a.photo === null)))

  // ⚠️ Un parent qui revient après une autre catégorie se réécrit.
  const alterne = carteDeLaTable({ commercant: { ordre_categories: ['Boissons · Chaudes', 'Plats', 'Boissons · Froides'] }, articles })
  v('un parent séparé par une autre catégorie se réécrit',
    alterne.sections.find(s => s.titre === 'Froides')?.parent === 'Boissons')

  v('une carte vide reste une carte', carteDeLaTable({ commercant: {}, articles: [] }).total === 0)
  v('sans commerçant rangé, l\'ordre d\'origine', carteDeLaTable({ commercant: null, articles }).sections[0].titre === 'Plats')
}

// ═══ 4) LE LIEN DU QR ═══════════════════════════════════════════════════════
{
  v('🔴 le QR des tables mène à la carte', lienCarte('chez-marcel') === 'https://www.yoppaa.app/menu/chez-marcel')
  v('et pas à la fiche', lienCarte('chez-marcel') !== lienFiche('chez-marcel'))
  v('🔴 pas sous /carte/, qui est la carte de fidélité', !lienCarte('x').includes('/carte/'))
  v('le slug est encodé (un QR imprimé ne se corrige pas)', lienCarte("chez l'ami") === "https://www.yoppaa.app/menu/chez%20l'ami")
  v('sans slug, pas de lien', lienCarte('') === null && lienCarte(null) === null)
}

// ═══ 5) LA PAGE ═════════════════════════════════════════════════════════════
{
  const page = code('app/menu/[slug]/page.js')
  v('rendue par le serveur', !/^\s*['"]use client['"]/.test(lire('app/menu/[slug]/page.js')))
  v('🔴 la clé publique, jamais la clé de service',
    /NEXT_PUBLIC_SUPABASE_ANON_KEY/.test(page) && !/SERVICE_ROLE/.test(page))
  v('🔴 elle lit la vue publique, pas la table', /from\('commercants_public'\)/.test(page) && !/from\('commercants'\)/.test(page))
  v('🔴 une fiche non publiée n\'a pas de carte', /if \(!commercant \|\| !fichePubliee\(commercant\)\) return null/.test(page))
  v('et c\'est un « introuvable »', /if \(!lu\) notFound\(\)/.test(page))
  // ⚠️ Une panne n'est pas une absence.
  v('🔴 une erreur de lecture du commerce ÉCHOUE', /if \(error\) throw new Error/.test(page))
  v('🔴 une erreur de lecture des articles aussi', /if \(articles\.error\) throw new Error/.test(page))
  v('🔴 et des réglages du jour', /if \(reglages\.error\) throw new Error/.test(page))
  v('🔴 le jour est le jour belge', /const jour = nomDuJour\(new Date\(\)\)/.test(page) && /\.eq\('jour_semaine', jour\)/.test(page))
  v('seuls les articles actifs', /\.eq\('commercant_id', commercant\.id\)\.eq\('actif', true\)/.test(page))
  v('les prix suivent la formule effective', /prixAffiches: canDo\(planEffectif\(commercant\), 'prix_affiches'\)/.test(page))
  v('🔴 aucun deal, aucun prix barré', !/@\/lib\/deals/.test(page) && !/remise/i.test(page))
  v('🔴 ni panier ni réservation', !/panier|reserver|réserver/i.test(page))
  v('pas indexée (la fiche l\'est)', /robots: \{ index: false, follow: true \}/.test(page))
  v('toujours fraîche', /export const dynamic = 'force-dynamic'/.test(page))
  // ⚠️ Chaque colonne lue par la carte ou par la formule est nommée.
  const cols = (page.match(/const COLONNES_COMMERCE = '([^']+)'/) || [])[1] || ''
  for (const c of ['slug', 'type', 'statut_publication', 'plan', 'essai_plan', 'created_at', 'ordre_categories', 'photos_catalogue_actif']) {
    v(`le commerce est lu avec « ${c} »`, cols.split(',').map(x => x.trim()).includes(c), cols)
  }
  const colsA = (page.match(/const COLONNES_ARTICLE = '([^']+)'/) || [])[1] || ''
  for (const c of ['id', 'nom', 'description', 'prix', 'categorie', 'photo_url', 'est_vitrine', 'actif']) {
    v(`l'article est lu avec « ${c} »`, colsA.split(',').map(x => x.trim()).includes(c), colsA)
  }
  // ⚠️ Un allergique ne doit pas conclure du silence.
  v('🔴 la carte dit où demander les allergènes',
    /\{total > 0 && sertAManger\(commercant\.type\) && \(/.test(page) && /Allergies ou intolérances/.test(lire('app/menu/[slug]/page.js')))
  v('les images de la carte ne bloquent pas l\'affichage', /loading="lazy" decoding="async"/.test(page))
}

// ═══ 6) LE CARTON DE TABLE ══════════════════════════════════════════════════
{
  // Le placement, exécuté, pour chaque format : rien ne déborde de sa case.
  // (12/10, Alex) tout sur A4 : affiche 1, 2 (A5) ou 8 ; cartons 2 (A5), 4 ou 8.
  const RATIO = 1.616 // les proportions réelles de l'affiche (932 × 1506)
  const page = (f) => FORMATS_FEUILLE[f].orientation === 'landscape' ? [297, 210] : [210, 297]
  for (const format of Object.keys(FORMATS_FEUILLE)) {
    const [W, H] = page(format)
    const cases = placementsFeuille(format, W, H, RATIO)
    const g = FORMATS_FEUILLE[format]
    v(`${format} : autant d'exemplaires que de cases`, cases?.length === g.colonnes * g.lignes, String(cases?.length))
    v(`🔴 ${format} : chaque exemplaire tient dans sa case, marge comprise`, (cases || []).every((p, i) => {
      const cx = (i % g.colonnes) * p.caseW, cy = Math.floor(i / g.colonnes) * p.caseH
      return p.x >= cx + g.marge - 1e-9 && p.y >= cy + g.marge - 1e-9
        && p.x + p.w <= cx + p.caseW - g.marge + 1e-9 && p.y + p.h <= cy + p.caseH - g.marge + 1e-9
    }))
    v(`${format} : l'exemplaire garde ses proportions`, (cases || []).every(p => Math.abs(p.h / p.w - RATIO) < 1e-9))
    const traits = traitsDeCoupe(format, W, H)
    v(`🔴 ${format} : un pointillé par coupe, d'un bord de la page à l'autre (trancheuse)`,
      traits.length === g.colonnes - 1 + g.lignes - 1
      && traits.every(t => (t.x1 === t.x2 && t.y1 === 0 && t.y2 === H) || (t.y1 === t.y2 && t.x1 === 0 && t.x2 === W)), JSON.stringify(traits))
  }
  const [W2, H2] = page('A4-2')
  const deux = placementsFeuille('A4-2', W2, H2, RATIO)
  v('🔴 deux A5 sur une A4 : l’A4 couchée, chaque moitié est une A5 debout (148,5 × 210)',
    FORMATS_FEUILLE['A4-2'].orientation === 'landscape' && deux[0].caseW === 148.5 && deux[0].caseH === 210)
  const plein = placementsFeuille('A4', 210, 297, RATIO)[0]
  v('🔴 l’A4 pleine page ne déborde plus (elle était posée à 184 mm de large)', plein.y >= 10 && plein.y + plein.h <= 287 + 1e-9, JSON.stringify(plein))
  // ⚠️ Huit plutôt que six : couchée, la hauteur limite, donc même taille.
  const huit = placementsFeuille('A4-8', 297, 210, RATIO)[0]
  v('⚠️ les huit petites font plus de 5 cm de large (QR lisible sur une table)', huit.w > 50, String(huit.w))
  v('une seule case : aucun pointillé', traitsDeCoupe('A4', 210, 297).length === 0)
  v('un format inconnu ne dessine rien', placementsFeuille('A3', 297, 420, 1.5) === null && traitsDeCoupe('A3', 297, 420).length === 0)
  v('🔴 les formats demandés par Alex (12/10)',
    FORMATS_AFFICHE.join('|') === 'A4|A4-2|A4-8' && FORMATS_CARTE_TABLE.join('|') === 'A4-2|A4-4|A4-8'
    && FORMATS_AFFICHE.every(f => LIBELLES_AFFICHE[f]) && FORMATS_CARTE_TABLE.every(f => LIBELLES_CARTE_TABLE[f]))

  v('le carton dit ce que fait le scan', TEXTES_CARTE_TABLE.accroche === 'SCANNE POUR' && TEXTES_CARTE_TABLE.accrocheSuite === 'VOIR LA CARTE')
  v('🔴 et l\'affiche de vitrine n\'a pas bougé', TEXTES_AFFICHE.accroche === 'TOUS LES COMMERCES DE TA COMMUNE')
  v('le nom du fichier dit le format et le fond', nomFichierCarteTable('x', true, 'A4-4') === 'yoppaa-carte-table-x-A4-4-blanc.pdf'
    && nomFichierCarteTable('x', false, 'A4-8') === 'yoppaa-carte-table-x-A4-8-violet.pdf')

  const kit = code('lib/affiche-kit.js')
  v('🔴 le carton porte les textes de table',
    /construireAffiche\(\{ qrDataUrl, nomCommerce, clair, textes: TEXTES_CARTE_TABLE \}\)/.test(kit))
  v('🔴 et se pose par le placement vérifié, dans l’orientation du format',
    /const cases = placementsFeuille\(format, W, H, canvas\.height \/ canvas\.width\)/.test(kit)
    && /for \(const p of cases\) pdf\.addImage\(image, 'PNG', p\.x, p\.y, p\.w, p\.h\)/.test(kit)
    && /new jsPDF\(\{ orientation: gabarit\.orientation, unit: 'mm', format: 'a4' \}\)/.test(kit)
    && /for \(const t of traits\) pdf\.line\(t\.x1, t\.y1, t\.x2, t\.y2\)/.test(kit))
  v('🔴 l’affiche ET les cartons passent par la même feuille',
    (kit.match(/const pdf = await feuillePdf\(canvas, format, clair\)/g) || []).length === 2)
}

// ═══ 7) LE TABLEAU DE BORD ══════════════════════════════════════════════════
{
  const dash = code('app/dashboard/ConfigDashboard.js')
  const i = dash.indexOf('function CarteTableBloc(')
  const bloc = i === -1 ? '' : dash.slice(i, dash.indexOf('\nfunction ', i + 10))
  v('le bloc des tables existe', bloc.length > 500, String(bloc.length))
  v('🔴 son QR mène à la carte', /const url = lienCarte\(slug\)/.test(bloc) && !/lienFiche\(/.test(bloc))
  v('🔴 et ce QR-là part dans le PDF', /telechargerCarteTablePdf\(\{ qrDataUrl: qr, nomCommerce, clair, slug, format \}\)/.test(bloc))
  v('les trois formats sont proposés, depuis la liste du module',
    /\{FORMATS_CARTE_TABLE\.map\(f => \(/.test(bloc) && /onClick=\{\(\) => telecharger\(f\)\}/.test(bloc) && /\{LIBELLES_CARTE_TABLE\[f\]\}/.test(bloc))
  v('un double clic ne lance pas deux PDF', /if \(enCours\) return/.test(bloc) && /disabled=\{!qr \|\| !!enCours\}/.test(bloc))
  const iAff = dash.indexOf('async function downloadPDF(')
  const blocAff = iAff === -1 ? '' : dash.slice(iAff, iAff + 6000)
  v('🔴 l’affiche propose ses trois formats, et ses boutons travaillent',
    /\{FORMATS_AFFICHE\.map\(f => \(/.test(blocAff) && /onClick=\{\(\) => downloadPDF\(f, fondClair\)\}/.test(blocAff)
    && /if \(pdfEnCours\) return/.test(blocAff) && /disabled=\{!qrDataUrl \|\| !!pdfEnCours\}/.test(blocAff))
  const pageKit = code('app/kit/[slug]/KitClient.js')
  v('🔴 la page du kit propose les mêmes formats, avec les mêmes mots',
    /\{FORMATS_AFFICHE\.map\(f => \(/.test(pageKit) && /LIBELLES_AFFICHE\[f\]/.test(pageKit) && !/telecharger\('A5'\)/.test(pageKit))
  v('le commerçant voit ce que voient ses clients', /href=\{url\}/.test(bloc))
  v('🔴 seulement pour un commerce qui sert à manger', /\{sertAManger\(typeCommerce\) && \(\s*<CarteTableBloc/.test(dash))
  // ⚠️ Une colonne absente d'un select ne lève rien : le bloc disparaîtrait.
  // ⚠️ REPOINTÉE LE 15/10 : la requête commence par `id` et les trois
  // interrupteurs (consigne Google) ; `type` reste en fin de liste.
  v('🔴 le type du commerce est lu', /select\('id, rdv_actif, commande_actif, livraison_actif, slug, nom, plan, essai_plan, created_at, categorie, type'\)/.test(dash)
    && /setTypeCommerce\(data\.type \|\| null\)/.test(dash))
}

console.log(`\nCarte de table : ${ok} vérifications`)
if (echecs.length > 0) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
