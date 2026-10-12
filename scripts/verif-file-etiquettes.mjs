// BANC — LA FILE DES ÉTIQUETTES ET LA TABLETTE DU COMPTOIR (« Yoppaa Comptoir », 11/10)
//
// Décisions d'Alex (tableau, 11/10) : une app sur la tablette du kit ; la
// tablette appartient au commerce PAR LA CONNEXION ; TOUTES les étiquettes
// passent PAR LA FILE (un seul chemin, une trace, jamais deux fois la même).
//
// ⚠️ LE BANC EXÉCUTE LES RÈGLES (lib/file-etiquettes.js) ET LIT LE CODE QUI LES
// APPELLE : routes, dépôt au démarrage de la prépa, silence du navigateur.
//
//   npm run verif:file-etiquettes

import { readFileSync } from 'node:fs'
import { sansProse } from './lire-code.mjs'
import {
  stationEnLigne, etiquetteADeposer, sacsBornes, contenusAImprimer, phraseEchec, raisonValide,
  STATION_EN_LIGNE_MS, REPRISE_EN_COURS_MS, PAR_PASSAGE, RAISONS_ECHEC,
} from '../lib/file-etiquettes.js'

const RACINE = new URL('../', import.meta.url)
const lire = (f) => readFileSync(new URL(f, RACINE), 'utf8')
const code = (f) => sansProse(lire(f))

let ok = 0
const echecs = []
function v(nom, condition, detail = '') {
  if (condition) ok++
  else echecs.push(detail ? `${nom} — ${detail}` : nom)
}

// ═══ 1. LES RÈGLES, EXÉCUTÉES ════════════════════════════════════════════════
{
  const t0 = new Date('2026-10-12T08:00:00Z')
  const ilYa = (ms) => new Date(t0.getTime() - ms).toISOString()
  v('🔴 en ligne : nouvelles de moins de 20 s ; au-delà, hors ligne ; sans nouvelles, hors ligne',
    stationEnLigne(ilYa(5000), t0) && !stationEnLigne(ilYa(STATION_EN_LIGNE_MS), t0) && !stationEnLigne(null, t0) && !stationEnLigne('pas une date', t0))
  v('les délais : 20 s pour « en ligne », 90 s pour reprendre une étiquette, 5 par passage',
    STATION_EN_LIGNE_MS === 20000 && REPRISE_EN_COURS_MS === 90000 && PAR_PASSAGE === 5)

  const retrait = { id: 'c1', mode_retrait: 'retrait' }
  const depot = (o) => etiquetteADeposer({ commande: retrait, deStatut: 'en_attente', versStatut: 'en_preparation', stationExiste: true, ...o })
  v('🔴 dépôt : au DÉMARRAGE de la prépa, depuis « en attente », avec une station',
    depot({}) === true)
  v('🔴 pas de dépôt sans station (personne ne viderait la file), ni à « prête », ni depuis un autre statut',
    depot({ stationExiste: false }) === false && depot({ versStatut: 'pret', deStatut: 'en_preparation' }) === false
    && depot({ deStatut: 'pret' }) === false)
  v('🔴 retrait et livraison oui, expédition non (la règle des étiquettes)',
    depot({ commande: { mode_retrait: 'livraison' } }) === true && depot({ commande: { mode_retrait: 'expedition' } }) === false)

  v('sacs : bornés de 1 à 20, un nombre illisible donne 1',
    sacsBornes(3) === 3 && sacsBornes(0) === 1 && sacsBornes(99) === 20 && sacsBornes('x') === 1 && sacsBornes(2.7) === 2)

  const essai = contenusAImprimer({ origine: 'essai', sacs: 2 }, { commerce: 'Chez Momo' })
  v('🔴 l’étiquette d’essai : une par sac, au nom du commerce, sans commande',
    Array.isArray(essai) && essai.length === 2 && essai.every(e => e.reference === 'ESSAI' && e.commerce === 'Chez Momo'), JSON.stringify(essai))
  const commande = {
    id: 'c1', mode_retrait: 'retrait', client_nom: 'Alex Verstappen', numero_commande: 5, numero_prefixe: 'CC',
    date_commande: '2026-10-12', creneau: { heure_debut: '07:15:00', heure_fin: '07:30:00' }, total: 5.4, paye_en_ligne: false,
    statut: 'en_preparation', commande_articles: [{ quantite: 2, article_nom: 'Croissant', options: null }],
  }
  const deux = contenusAImprimer({ origine: 'demarrage', sacs: 2, commande_id: 'c1' }, { commande, categorie: 'alimentaire', commerce: 'La Mie' })
  v('🔴 une commande : son contenu, calculé MAINTENANT depuis la commande relue, une étiquette par sac',
    Array.isArray(deux) && deux.length === 2 && deux[0].client === 'Alex V.' && deux[0].commerce === 'La Mie' && /Sac 1\/2|1\/2/.test(JSON.stringify(deux[0])), JSON.stringify(deux?.[0]))
  // ⚠️ Une exception compte comme un échec, pas comme un plantage du banc.
  let disparue
  try { disparue = contenusAImprimer({ origine: 'demarrage', sacs: 1, commande_id: 'c1' }, { commande: null }) } catch (e) { disparue = `exception : ${e.message}` }
  v('🔴 une commande disparue : rien à imprimer (la ligne passera en échec)', disparue === null, String(disparue))

  v('les raisons d’échec se disent ; une raison inconnue devient « autre »',
    phraseEchec('papier') === RAISONS_ECHEC.papier && phraseEchec('n importe quoi') === RAISONS_ECHEC.autre
    && raisonValide('couvercle') === 'couvercle' && raisonValide('<script>') === 'autre')
}

// ═══ 2. LES ROUTES ═══════════════════════════════════════════════════════════
const ROUTES = ['station', 'file', 'resultat', 'demander'].map(n => [n, code(`app/api/impression/${n}/route.js`)])
for (const [nom, c] of ROUTES) {
  v(`🔴 /api/impression/${nom} : la garde de l’équipe, droit « commandes », avant tout`,
    /const garde = await gardeEquipe\(request, admin, commercant_id, 'commandes'\)\s*if \(!garde\.ok\) return NextResponse\.json/.test(c))
}
{
  const file = ROUTES.find(r => r[0] === 'file')[1]
  v('🔴 file : seule la station DÉCLARÉE vide la file (autre appareil = refus qui le dit)',
    /if \(!station \|\| station\.appareil_id !== appareil_id\) \{\s*return NextResponse\.json\(\{ ok: false, error: 'Cette tablette n’est plus l’imprimante du comptoir\.', pas_la_station: true \}, \{ status: 409 \}\)/.test(file))
  v('🔴 file : une étiquette prise et jamais rendue revient après 90 s',
    /\.update\(\{ statut: 'en_attente', pris_le: null, appareil_id: null \}\)\s*\.eq\('commercant_id', commercant_id\)\.eq\('statut', 'en_cours'\)\.lt\('pris_le', limite\)/.test(file))
  v('🔴 file : JAMAIS DEUX FOIS LA MÊME (prise conditionnelle sur « en attente »)',
    /\.update\(\{ statut: 'en_cours', pris_le: maintenant\.toISOString\(\), appareil_id \}\)\s*\.in\('id', candidates\.map\(c => c\.id\)\)\.eq\('commercant_id', commercant_id\)\.eq\('statut', 'en_attente'\)/.test(file))
  v('file : au plus 5 par passage, les plus anciennes d’abord',
    /\.order\('cree_le', \{ ascending: true \}\)\.limit\(PAR_PASSAGE\)/.test(file))
  v('🔴 file : les commandes relues sont CELLES DE CE COMMERCE',
    /\.from\('commandes'\)\.select\(SELECT_COMMANDE_ETIQUETTE\)\s*\.in\('id', ids\)\.eq\('commercant_id', commercant_id\)/.test(file))
  v('file : une commande disparue passe en échec, et l’écriture est LUE',
    /raison: 'commande_introuvable'/.test(file) && /if \(errD\) console\.error/.test(file))

  const resultat = ROUTES.find(r => r[0] === 'resultat')[1]
  v('🔴 résultat : seule la station qui l’a prise la rend, et seulement « en cours »',
    /\.eq\('id', id\)\.eq\('commercant_id', commercant_id\)\.eq\('appareil_id', appareil_id\)\.eq\('statut', 'en_cours'\)/.test(resultat)
    && /raison: raisonValide\(raison\)/.test(resultat))

  const demander = ROUTES.find(r => r[0] === 'demander')[1]
  v('🔴 demander : sans station, on le DIT (409), au lieu de laisser l’étiquette attendre',
    /if \(!station\) return NextResponse\.json\(\{ ok: false, error: 'Aucune tablette n’est l’imprimante du comptoir\.', sans_station: true \}, \{ status: 409 \}\)/.test(demander))
  v('🔴 demander : la réimpression vise une commande DE CE COMMERCE, relue',
    /\.from\('commandes'\)\.select\('id, commercant_id, mode_retrait'\)\s*\.eq\('id', commande_id\)\.eq\('commercant_id', commercant_id\)\.maybeSingle\(\)/.test(demander)
    && /sacs: sacsBornes\(sacs\)/.test(demander))

  const station = ROUTES.find(r => r[0] === 'station')[1]
  v('🔴 station : une lecture ratée n’est pas « aucune station »',
    /if \(errS \|\| errE\) return NextResponse\.json\(\{ ok: false, error: 'Lecture impossible, réessaie\.' \}, \{ status: 500 \}\)/.test(station)
    && /\{ onConflict: 'commercant_id' \}/.test(station))
}

// ═══ 3. LE DÉPÔT AU DÉMARRAGE DE LA PRÉPA ════════════════════════════════════
{
  const statut = code('app/api/equipe/commande/statut/route.js')
  const iEcrit = statut.indexOf("if (!ecrit) return NextResponse.json")
  const iDepot = statut.indexOf('const etiquette = await deposerEtiquette(admin,')
  v('🔴 l’étiquette est déposée APRÈS l’écriture du statut (jamais pour une commande qui n’a pas avancé)',
    iEcrit > 0 && iDepot > iEcrit)
  v('🔴 la règle de dépôt est celle du module, avec la station lue en base',
    /if \(!etiquetteADeposer\(\{ commande, deStatut, versStatut, stationExiste: !!station \}\)\)/.test(statut)
    && /origine: 'demarrage', sacs: 1,/.test(statut))
  v('🔴 un échec de dépôt ne refuse pas la commande : il se dit dans la réponse',
    /return NextResponse\.json\(\{ ok: true, commande_id, statut, encaisse: champs, etiquette \}\)/.test(statut)
    && /if \(error\) \{ console\.error\('\[equipe\/commande\/statut\] étiquette non déposée', error\.message\); return 'echec' \}/.test(statut))
}

// ═══ 4. LE NAVIGATEUR SE TAIT QUAND IL Y A UNE TABLETTE ═════════════════════
{
  const bord = code('app/dashboard/page.js')
  const poste = code('app/equipe/PosteEquipe.js')
  v('🔴 tableau de bord : pas d’impression navigateur quand une tablette existe (sinon deux étiquettes)',
    /if \(aImprimer\?\.statut === 'en_attente' && !comptoir\.aStation\) imprimerSiActive\(/.test(bord)
    && bord.indexOf('const comptoir = useStationComptoir(commercant?.id)') > bord.indexOf('const [commercant, setCommercant] = useState(null)'))
  v('🔴 Poste : idem',
    /if \(vers === 'en_preparation' && !comptoir\.aStation\) imprimerSiActive\(/.test(poste)
    && /const comptoir = useStationComptoir\(equipe\.commercant_id\)/.test(poste))
  const reglage = code('app/dashboard/ReglageEtiquettes.js')
  v('le crochet lit l’état par la route du serveur, et le relit toutes les 20 s',
    /postPro\('\/api\/impression\/station', \{ commercant_id: commercantId, action: 'etat' \}\)/.test(reglage) && /setInterval\(relire, 20000\)/.test(reglage))
  v('les boutons de la tablette travaillent visiblement (DotsAttente) et disent le résultat',
    /\{envoi === 'essai' \? <DotsAttente\/> : null\}/.test(reglage) && /setMessage\(r\.ok \? 'Étiquette d’essai envoyée à la tablette\.' : r\.error\)/.test(reglage))
}

// ═══ 5. LA MIGRATION ═════════════════════════════════════════════════════════
{
  const sql = lire('migrations/MIGRATION_FILE_ETIQUETTES.sql')
  v('🔴 serveur seulement : RLS active, aucun droit pour anon ni authenticated',
    sql.includes('ALTER TABLE public.etiquettes_impression ENABLE ROW LEVEL SECURITY;')
    && sql.includes('ALTER TABLE public.stations_impression ENABLE ROW LEVEL SECURITY;')
    && sql.includes('REVOKE ALL ON public.etiquettes_impression FROM PUBLIC, anon, authenticated;')
    && sql.includes('REVOKE ALL ON public.stations_impression FROM PUBLIC, anon, authenticated;')
    && !/CREATE POLICY/i.test(sql))
  v('🔴 une station par commerce ; la file effacée avec le commerce et la commande',
    /commercant_id\s+uuid PRIMARY KEY REFERENCES public\.commercants\(id\) ON DELETE CASCADE/.test(sql)
    && /commande_id\s+uuid REFERENCES public\.commandes\(id\) ON DELETE CASCADE/.test(sql))
  v('🔴 les statuts, les sacs et l’essai bornés en base',
    sql.includes("CHECK (statut IN ('en_attente', 'en_cours', 'imprimee', 'echec'))")
    && sql.includes('CHECK (sacs BETWEEN 1 AND 20)')
    && sql.includes("CHECK (origine = 'essai' OR commande_id IS NOT NULL)"))
}

// ═══ 6. L'ÉTIQUETTE EN IMAGE (12/10), EXÉCUTÉE ══════════════════════════════
{
  const I = await import('../lib/etiquette-image.js')
  // Une mesure de substitution : 0,55 × le corps par caractère.
  const corpsDe = (fonte) => Number((String(fonte).match(/ ([\d.]+)px /) || [])[1]) || 10
  const mesurer = (t, fonte) => String(t).length * corpsDe(fonte) * 0.55
  const dansLaMarge = (page) => {
    const g = I.PX_PAR_MM * I.IMAGE_ETIQUETTE.margeCoteMm - 0.5
    const d = page.largeur - g
    return page.elements.filter(e => e.type === 'texte').every(e => {
      // L'espacement du logo (serré, négatif) compte dans la largeur réelle.
      const w = mesurer(e.texte, e.fonte) + (e.espacement || 0) * String(e.texte).length
      const x0 = e.aligne === 'droite' ? e.x - w : e.aligne === 'centre' ? e.x - w / 2 : e.x
      return x0 >= g && x0 + w <= d + 0.5
    })
  }
  const base = {
    reference: 'CC5', client: 'Alex V.', commerce: 'Boulangerie Dupuis', quand: 'lun. 12 oct. · 07:15 – 07:30',
    lignes: [{ article: '4 × Croissant', options: null }], articles: '4 articles', paiement: 'Payé en ligne', aEncaisser: false,
  }
  const p = I.miseEnPageEtiquette(base, { mesurer })
  const textes = p.elements.filter(e => e.type === 'texte').map(e => e.texte)
  v('🔴 image : exactement 696 points de large (300 dpi, zone imprimable du rouleau de 62 mm)',
    I.IMAGE_ETIQUETTE.largeurPx === 696 && p.largeur === 696 && Math.abs(I.PX_PAR_MM - 300 / 25.4) < 1e-9)
  v('🔴 image : la référence, le client, le créneau, l’article, le paiement et le commerce y sont',
    ['CC5', 'Alex V.', 'lun. 12 oct. · 07:15 – 07:30', '4 × Croissant', '4 articles', 'Payé en ligne', 'Boulangerie Dupuis', 'yoppaa'].every(t => textes.includes(t)), JSON.stringify(textes))
  v('🔴 image : rien ne dépasse des marges', dansLaMarge(p))
  v('🔴 image : le logo, cinq points sous « yoppaa », et deux filets (liste, pied)',
    p.elements.filter(e => e.type === 'point').length === 5 && p.elements.filter(e => e.type === 'filet').length === 2)
  // 🔴 (Alex, 12/10) les points touchaient les « p » : ils commencent sous les
  // jambes (≈ 22 % du corps) PLUS l'écart de la charte (0,28 du corps).
  {
    const mot = p.elements.find(e => e.texte === 'yoppaa')
    const corpsMot = corpsDe(mot.fonte)
    const hautPoints = Math.min(...p.elements.filter(e => e.type === 'point').map(e => e.y - e.r))
    v('🔴 image : les points du logo ne touchent pas les lettres (sous les jambes + 0,28 du corps)',
      hautPoints - mot.y >= corpsMot * (0.22 + 0.28) - 0.01, `${(hautPoints - mot.y).toFixed(1)} px pour un corps de ${corpsMot.toFixed(1)}`)
  }

  const longue = I.miseEnPageEtiquette({ ...base, lignes: [
    { article: '2 × Pizza quatre fromages avec supplément de mozzarella di bufala', options: 'Base : tomate, Cuisson : bien cuite, Supplément : olives noires' },
    { article: '1 × Coca', options: null },
  ] }, { mesurer })
  const lignesArticle = longue.elements.filter(e => e.type === 'texte' && /Pizza|bufala|mozzarella/.test(e.texte))
  v('🔴 image : un nom long passe à la ligne au lieu d’être coupé, et l’étiquette s’allonge',
    lignesArticle.length >= 2 && longue.hauteur > p.hauteur && dansLaMarge(longue), `${lignesArticle.length} lignes, ${longue.hauteur} > ${p.hauteur}`)
  const opt = longue.elements.find(e => e.type === 'texte' && /^Base/.test(e.texte))
  v('les options sont en retrait (3 mm)', !!opt && opt.x > I.PX_PAR_MM * 1.5 + I.PX_PAR_MM * 2.9)

  const du = I.miseEnPageEtiquette({ ...base, paiement: 'À payer 5,40 €', aEncaisser: true }, { mesurer })
  const fond = du.elements.find(e => e.type === 'rect')
  const blanc = du.elements.find(e => e.type === 'texte' && e.texte === 'À payer 5,40 €')
  v('🔴 image : « À payer » sur fond noir, en blanc, à droite (ce qui fait encaisser)',
    !!fond && blanc?.couleur === '#fff' && blanc?.aligne === 'droite' && blanc.x <= fond.x + fond.largeur && dansLaMarge(du))

  const sac = I.miseEnPageEtiquette({ ...base, sac: 'Sac 2/3' }, { mesurer })
  const eSac = sac.elements.find(e => e.texte === 'Sac 2/3')
  v('le sac s’écrit à droite de la référence, sur la même ligne',
    eSac?.aligne === 'droite' && Math.abs(eSac.y - sac.elements.find(e => e.texte === 'CC5').y) < 0.01)

  const commerceLong = I.miseEnPageEtiquette({ ...base, commerce: 'La très grande boulangerie pâtisserie chocolaterie artisanale du centre' }, { mesurer })
  const eCom = commerceLong.elements.find(e => e.type === 'texte' && e.texte.startsWith('La très'))
  const eLogo = commerceLong.elements.find(e => e.texte === 'yoppaa')
  const finCom = eCom ? eCom.x + mesurer(eCom.texte, eCom.fonte) : Infinity
  const debutLogo = eLogo ? eLogo.x - (mesurer('yoppaa', eLogo.fonte) + eLogo.espacement * 6) / 2 : 0
  v('🔴 image : un nom de commerce trop long tient sur UNE ligne, finit par « … » et s’arrête AVANT le logo',
    !!eCom && eCom.texte.endsWith('…') && eCom.texte.length > 'La très grande…'.length
    && commerceLong.elements.filter(e => e.type === 'texte' && /très|centre|artisanale/.test(e.texte)).length === 1
    && finCom < debutLogo && dansLaMarge(commerceLong), `${eCom?.texte} ${Math.round(finCom)} < ${Math.round(debutLogo)}`)

  v('couper : mot à mot ; un mot trop long lettre à lettre ; « … » au-delà du maximum',
    JSON.stringify(I.couperTexte('aa bb cc', 5 * 5.5 + 0.01, mesurer, '800 10px X')) === JSON.stringify(['aa bb', 'cc'])
    && I.couperTexte('abcdefghij', 3 * 5.5, mesurer, '800 10px X').every(l => l.length <= 3)
    && I.couperTexte('aa bb cc dd ee ff', 5 * 5.5, mesurer, '800 10px X', 2).at(-1).endsWith('…'))
  v('🔴 l’essai de la machine passe aussi (mêmes règles que l’étiquette du navigateur)',
    I.miseEnPageEtiquette({ reference: 'ESSAI', client: 'Marie D.', commerce: 'Chez Momo' }, { mesurer }).hauteur > 0)
  let sansMesure
  try { I.miseEnPageEtiquette(base) } catch (e) { sansMesure = e.message }
  v('sans mesure de texte, la mise en page refuse (jamais une image fausse)', sansMesure === 'mesurer requis')

  const reglage = code('app/dashboard/ReglageEtiquettes.js')
  v('l’aperçu de l’image est dans le réglage (pour juger le rendu sans la tablette)',
    /const canvas = dessinerEtiquette\(document\.createElement\('canvas'\), \{ \.\.\.ETIQUETTE_ESSAI, commerce: commerce \|\| null \}, \{ policeMarque: policeMarqueDeLaPage\(\) \}\)/.test(reglage))
}

console.log(`\nFile des étiquettes : ${ok} vérifications`)
if (echecs.length > 0) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
