// BANC : la règle de qualité des images.
//
// ⚠️ CE BANC EXÉCUTE `avertissementTaille` ET LIT CE QUI EN SORT. Il ne cherche
// aucun mot dans aucun fichier source : c'est exactement ce qui a produit trois
// gardes fausses le 21/08 (feedback_bancs_code_et_comportement).
//
// ⚠️ CE QU'IL PROTÈGE VRAIMENT, ET C'EST L'INVERSE DE L'HABITUDE : le 21/08,
// une image sous 800 px était REFUSÉE. Alex a tranché qu'elle devait PASSER,
// avec un avertissement, et qu'il demanderait la reprise avant de valider le
// compte. Un banc qui exigerait un refus verrouillerait donc le défaut qu'on
// vient de corriger (reference_tests_faussement_verts). Il vérifie l'inverse :
// que rien ne bloque, que l'avertissement DIT la taille réelle, et que le
// bilan admin COMPTE au lieu de se contenter de signaler.
//
//   npm run verif:images

import { readFileSync } from 'node:fs'
import {
  TAILLE_CONSEILLEE,
  avertissementTaille,
  refusFichierImage,
  bilanTaillesImages,
} from '../lib/image-qualite.js'

let ok = 0
const echecs = []

function verifie(nom, condition, detail = '') {
  if (condition) { ok++; return }
  echecs.push(`${nom}${detail ? ` — ${detail}` : ''}`)
}

// ─── 1) LES SEUILS ────────────────────────────────────────────────────────
// Ils valent la taille de RENDU après compression, pas un chiffre décoratif.
verifie('seuil logo = 400', TAILLE_CONSEILLEE.logo === 400, `reçu ${TAILLE_CONSEILLEE.logo}`)
verifie('seuil photo = 800', TAILLE_CONSEILLEE.photo === 800, `reçu ${TAILLE_CONSEILLEE.photo}`)

// ─── 2) L'AVERTISSEMENT SE DÉCLENCHE SUR LE GRAND CÔTÉ ────────────────────
{
  const cas = [
    ['photo 640x480 → avertit', { w: 640, h: 480 }, 800, 'photo', true, 640],
    ['photo 480x640 → avertit sur 640 (portrait)', { w: 480, h: 640 }, 800, 'photo', true, 640],
    ['photo 800x600 → pile au seuil, silence', { w: 800, h: 600 }, 800, 'photo', false, null],
    ['photo 1200x900 → silence', { w: 1200, h: 900 }, 800, 'photo', false, null],
    ['photo 799 → avertit', { w: 799, h: 799 }, 800, 'photo', true, 799],
    ['logo 300 → avertit', { w: 300, h: 300 }, 400, 'logo', true, 300],
    ['logo 400 → silence', { w: 400, h: 400 }, 400, 'logo', false, null],
  ]
  for (const [nom, dims, minPx, quoi, attenduAvertit, grandCote] of cas) {
    const av = avertissementTaille(dims, minPx, quoi)
    verifie(nom, attenduAvertit ? !!av : av === null, av ? `rendu « ${av.titre} »` : 'rendu null')
    if (attenduAvertit && av) {
      verifie(`${nom} : donne la taille réelle`, av.grandCote === grandCote, `attendu ${grandCote}, reçu ${av.grandCote}`)
      // ⚠️ LE CHIFFRE DOIT ÊTRE DANS LE TEXTE. Un avertissement qui dit « trop
      // petite » sans dire COMBIEN ne se répare pas : c'est le défaut exact du
      // message d'origine, qui annonçait le seuil et taisait l'image.
      verifie(`${nom} : le texte porte le chiffre`, av.titre.includes(String(grandCote)), `titre « ${av.titre} »`)
      verifie(`${nom} : le texte porte le seuil`, av.detail.includes(String(minPx)), `detail « ${av.detail} »`)
      // ⚠️ IL DIT AUSSI LE GESTE, pas seulement le constat.
      verifie(`${nom} : le texte dit qu'on garde l'image`, /On la garde|On le garde/.test(av.detail), `detail « ${av.detail} »`)
    }
  }
}

// ─── 3) LOGO ET PHOTO NE PARLENT PAS PAREIL ───────────────────────────────
{
  const logo = avertissementTaille({ w: 200, h: 200 }, 400, 'logo')
  const photo = avertissementTaille({ w: 200, h: 200 }, 800, 'photo')
  verifie('le logo est nommé « logo »', /[Ll]ogo/.test(logo.titre), logo.titre)
  verifie('la photo est nommée « photo »', /[Pp]hoto/.test(photo.titre), photo.titre)
  verifie('conseils différents', logo.detail !== photo.detail)
  // Conseiller « reprends-la depuis ton téléphone » pour un LOGO serait absurde.
  verifie('le conseil du logo ne parle pas de téléphone', !/téléphone/.test(logo.detail), logo.detail)
  verifie('le conseil de la photo parle de la reprendre', /Reprends-la/.test(photo.detail), photo.detail)
}

// ─── 4) L'ABSENCE DE MESURE NE DOIT PAS INVENTER UN DÉFAUT ────────────────
// ⚠️ `Number(null)` vaut 0, et un test écrit à l'envers ferait passer une image
// non mesurée pour une image de 0 px. Voir reference_deux_formes_absence.
{
  const rien = [null, undefined, {}, { w: 0, h: 0 }, { w: null, h: null }, { w: 'abc', h: 'abc' }, { w: -100, h: -100 }]
  for (const d of rien) {
    verifie(`non mesurée (${JSON.stringify(d)}) → aucun avertissement`,
      avertissementTaille(d, 800, 'photo') === null)
  }
}

// ─── 5) CE QUI BLOQUE ENCORE, ET CE QUI NE BLOQUE PLUS ────────────────────
{
  const img = (type, mo) => ({ type, size: Math.round(mo * 1024 * 1024) })
  verifie('un JPEG normal passe', refusFichierImage(img('image/jpeg', 2)) === null)
  verifie('un PNG passe', refusFichierImage(img('image/png', 1)) === null)
  verifie('un WEBP passe', refusFichierImage(img('image/webp', 1)) === null)
  // ⚠️ LE HEIC D'IPHONE PASSE. Le signup n'acceptait que trois formats là où le
  // tableau de bord acceptait tout : la même photo était refusée le premier
  // jour et acceptée le lendemain.
  verifie('un HEIC d\'iPhone passe', refusFichierImage(img('image/heic', 3)) === null,
    String(refusFichierImage(img('image/heic', 3))))
  verifie('un PDF est refusé', typeof refusFichierImage(img('application/pdf', 1)) === 'string')
  verifie('un fichier de 20 Mo est refusé', typeof refusFichierImage(img('image/jpeg', 20)) === 'string')
  verifie('15 Mo pile passe', refusFichierImage(img('image/jpeg', 15)) === null)
  verifie('aucun fichier est refusé', typeof refusFichierImage(null) === 'string')
  // ⚠️ LE POINT CENTRAL DE LA JOURNÉE : la taille en pixels n'apparaît NULLE
  // PART dans ce qui bloque. `refusFichierImage` ne reçoit même pas les
  // dimensions, donc il ne PEUT PAS refuser sur ce motif.
  verifie('refusFichierImage ne prend pas les dimensions', refusFichierImage.length <= 2,
    `arité ${refusFichierImage.length}`)
}

// ─── 6) LE BILAN ADMIN COMPTE, IL NE SE CONTENTE PAS DE SIGNALER ──────────
{
  verifie('aucune image → aucun bilan', bilanTaillesImages([]) === null)
  verifie('liste absente → aucun bilan', bilanTaillesImages(null) === null)

  const toutesGrandes = bilanTaillesImages([
    { libelle: 'le logo', dims: { w: 512, h: 512 }, quoi: 'logo' },
    { libelle: 'la photo 1', dims: { w: 1600, h: 1200 }, quoi: 'photo' },
  ])
  verifie('toutes assez grandes → aucun bilan', toutesGrandes === null)

  const une = bilanTaillesImages([
    { libelle: 'le logo', dims: { w: 512, h: 512 }, quoi: 'logo' },
    { libelle: 'la photo 1', dims: { w: 640, h: 480 }, quoi: 'photo' },
  ])
  verifie('une seule petite → nb = 1', une?.nb === 1, `reçu ${une?.nb}`)
  verifie('une seule petite → texte au singulier', /^1 image /.test(une.texte), une.texte)
  verifie('une seule petite → NOMME laquelle', une.texte.includes('la photo 1'), une.texte)
  verifie('une seule petite → donne sa taille', une.texte.includes('640'), une.texte)

  // ⚠️ LA PLUS PETITE EST VOLONTAIREMENT EN DERNIER DANS L'ENTRÉE, et cette
  // mesure vient d'une mutation. Avec le logo de 180 px placé en tête, la
  // vérification du tri passait même après SUPPRESSION du `sort` : la donnée
  // de test était déjà triée, le banc lisait donc l'ordre d'entrée et se
  // félicitait. Un jeu d'essai trop docile rend une garde muette.
  const trois = bilanTaillesImages([
    { libelle: 'la photo 1', dims: { w: 640, h: 480 }, quoi: 'photo' },
    { libelle: 'la photo 3', dims: { w: 1600, h: 1200 }, quoi: 'photo' },
    { libelle: 'la photo 2', dims: { w: 500, h: 400 }, quoi: 'photo' },
    { libelle: 'le logo', dims: { w: 180, h: 180 }, quoi: 'logo' },
  ])
  verifie('trois petites sur quatre → nb = 3', trois?.nb === 3, `reçu ${trois?.nb}`)
  verifie('trois petites → le texte donne le NOMBRE', trois.texte.includes('3 images'), trois.texte)
  // ⚠️ LA PLUS PETITE EN PREMIER : c'est celle qu'il faut reprendre d'abord.
  verifie('la plus petite est nommée', trois.texte.includes('le logo'), trois.texte)
  verifie('la plus petite est la première de la liste', trois.petites[0].grandCote === 180,
    `reçu ${trois.petites[0].grandCote}`)
  // ⚠️ LE SEUIL DU LOGO N'EST PAS CELUI D'UNE PHOTO. Un logo de 500 px est
  // parfait, une photo de 500 px ne l'est pas : le bilan doit distinguer.
  const seuilsDistincts = bilanTaillesImages([
    { libelle: 'le logo', dims: { w: 500, h: 500 }, quoi: 'logo' },
    { libelle: 'la photo 1', dims: { w: 500, h: 500 }, quoi: 'photo' },
  ])
  verifie('un logo de 500 px ne compte pas, une photo de 500 px si', seuilsDistincts?.nb === 1,
    `reçu ${seuilsDistincts?.nb}`)
  verifie('et c\'est bien la photo qui est nommée', seuilsDistincts.texte.includes('la photo 1'),
    seuilsDistincts.texte)
}

// ─── 7) AUCUN TEXTE NE CONTIENT DE TIRET CADRATIN ─────────────────────────
// Règle Yoppaa : pas de tiret cadratin en français (feedback_pas_em_dash_francais).
{
  const textes = [
    avertissementTaille({ w: 100, h: 100 }, 800, 'photo').titre,
    avertissementTaille({ w: 100, h: 100 }, 800, 'photo').detail,
    avertissementTaille({ w: 100, h: 100 }, 400, 'logo').titre,
    avertissementTaille({ w: 100, h: 100 }, 400, 'logo').detail,
    refusFichierImage({ type: 'application/pdf', size: 10 }),
    refusFichierImage({ type: 'image/jpeg', size: 99 * 1024 * 1024 }),
    bilanTaillesImages([{ libelle: 'la photo 1', dims: { w: 100, h: 100 }, quoi: 'photo' }]).texte,
  ]
  for (const t of textes) {
    verifie(`pas de tiret cadratin dans « ${String(t).slice(0, 40)}… »`, !/[—–]/.test(String(t)))
  }
}

// ─── 8) LE PLACEMENT DES MESSAGES, QUI NE S'EXÉCUTE PAS ───────────────────
//
// ⚠️ CETTE SECTION LIT DU SOURCE, ET C'EST UN AVEU. Le défaut d'origine est un
// message rendu au MAUVAIS ENDROIT d'un arbre JSX : rien à exécuter, rien à
// mesurer sans un navigateur. Alors on découpe LA SECTION concernée avant de
// chercher, jamais le fichier entier. C'est précisément la cause des deux
// gardes muettes du 21/08 : `background: '#ECFDF5'` apparaît TROIS fois dans
// ce fichier, et une garde qui cherchait dans tout le source restait verte en
// trouvant l'occurrence d'à côté.
{
  const src = readFileSync('app/signup/page.js', 'utf8').replace(/\r\n/g, '\n')

  // Découpe d'une carte : de son titre jusqu'à sa fermeture.
  function carte(marqueurTitre) {
    const debut = src.indexOf(marqueurTitre)
    if (debut === -1) return null
    const fin = src.indexOf('</Card>', debut)
    return fin === -1 ? null : src.slice(debut, fin)
  }

  const carteGalerie = carte('<Card titre={`Mon commerce en images')
  const carteLogo = carte('<Card titre="Ton logo"')
  verifie('la carte « Mon commerce en images » se découpe', !!carteGalerie)
  verifie('la carte « Ton logo » se découpe', !!carteLogo)

  if (carteGalerie && carteLogo) {
    // ⚠️ LE CŒUR DU CORRECTIF : chaque message est DANS sa carte, et le message
    // de l'autre n'y est PAS. C'est ce croisement qui attrape une inversion.
    verifie('le message galerie est dans la carte galerie', carteGalerie.includes('<MessageImage msg={msgGalerie}'))
    verifie('le message logo n\'est PAS dans la carte galerie', !carteGalerie.includes('msgLogo'))
    verifie('le message logo est dans la carte logo', carteLogo.includes('<MessageImage msg={msgLogo}'))
    verifie('le message galerie n\'est PAS dans la carte logo', !carteLogo.includes('msgGalerie'))
  }

  // ⚠️ ET PLUS AUCUN BANDEAU EN PIED D'ÉTAPE. On découpe entre la fin de la
  // carte logo et le `<NavEtape` : c'est là que vivait le bandeau fautif.
  const finLogo = src.indexOf('<Card titre="Ton logo"')
  const nav = src.indexOf('<NavEtape', finLogo)
  const pied = finLogo !== -1 && nav !== -1 ? src.slice(src.indexOf('</Card>', finLogo), nav) : null
  verifie('le pied de l\'étape Visuels se découpe', !!pied)
  if (pied) {
    verifie('plus aucun bandeau d\'erreur en pied d\'étape', !/\{error &&/.test(pied),
      'un `{error &&` subsiste entre la carte logo et NavEtape')
  }

  // Le texte d'aide ne doit plus annoncer un minimum qu'on n'applique plus.
  const aide = src.slice(src.indexOf('Format accepté'), src.indexOf('Format accepté') + 120)
  verifie('l\'aide dit « conseillés » et non « minimum »',
    /conseill/.test(aide) && !/minimum/.test(aide), aide.trim())

  // La taille en pixels ne doit plus produire de refus nulle part dans le signup.
  verifie('aucun refus « Image trop petite » dans le signup', !/Image trop petite/.test(src))
}

// ─── 9) L'ÉCRAN DE VALIDATION VOIT LES PHOTOS ─────────────────────────────
//
// ⚠️ C'EST LA MOITIÉ QU'ON OUBLIE. Alex a tranché « je demanderai la modif
// avant validation du compte » : si l'information n'arrive pas sur SON écran,
// l'arbitrage ne s'applique jamais. La carte n'affichait AUCUNE photo.
{
  const src = readFileSync('app/admin/page.js', 'utf8').replace(/\r\n/g, '\n')
  const debut = src.indexOf('function CarteAValider')
  const carte = debut === -1 ? null : src.slice(debut)
  verifie('la carte de validation se découpe', !!carte)
  if (carte) {
    verifie('elle reçoit les photos', /function CarteAValider\(\{[^}]*photos/.test(carte))
    // ⚠️ ON EXIGE LE RENDU, PAS LE MOT. `photos.map(` apparaît DEUX fois dans
    // cette carte : une fois pour dessiner la bande d'images, une fois pour
    // nourrir le bilan. Une garde qui cherchait `photos.map(` restait verte
    // après suppression de la bande, en trouvant l'occurrence du bilan.
    // C'est l'homonyme voisin, mesuré par mutation.
    verifie('elle affiche vraiment la bande d\'images', /\{photos\.map\(\(p, i\) => \{/.test(carte))
    // ⚠️ ET ON EXIGE LE CODE, PAS LE MOT NON PLUS. `naturalWidth` figure aussi
    // dans le COMMENTAIRE écrit deux lignes au-dessus : chercher le mot seul
    // laissait la garde verte alors que la mesure était retirée.
    verifie('elle mesure chaque image au chargement', /e\?\.currentTarget\?\.naturalWidth/.test(carte))
    verifie('elle compte les images trop petites', /bilanTaillesImages\(/.test(carte))
    // ⚠️ ET ELLE DIT QUOI FAIRE. Un constat sans geste ne se traite pas.
    verifie('elle dit de demander la reprise avant de publier', /avant de publier/.test(carte))
    // Une fiche sans aucune photo est une information, pas un vide.
    verifie('elle nomme le cas « aucune photo »', /Aucune photo/.test(carte))
  }

  // ⚠️ LA LECTURE PASSE PAR L'API, ET C'EST UNE CONSÉQUENCE DE LA RLS DU 21/08 :
  // une requête directe sur `commercant_photos` rendrait une liste VIDE SANS
  // ERREUR pour un commerçant non publié. Si quelqu'un « simplifie » en
  // rebranchant Supabase directement, l'écran redevient muet.
  const chargement = src.slice(src.indexOf('const charger = useCallback'), src.indexOf('useEffect(() => { charger() }'))
  verifie('la zone de chargement se découpe', chargement.length > 100)
  verifie('les photos sont lues via l\'API admin', /\/api\/admin\/commercants/.test(chargement))
  // ⚠️ LA BRANCHE D'ÉCHEC, PAS LE NOM DE LA FONCTION. `setPhotosKo(null)` vit
  // dans la branche de SUCCÈS : chercher `setPhotosKo(` laissait la garde verte
  // après suppression du `catch`, donc sur un écran redevenu muet. Mesuré.
  verifie('un échec de lecture est dit, pas avalé', /setPhotosKo\(e\.message/.test(chargement))

  const api = readFileSync('app/api/admin/commercants/route.js', 'utf8').replace(/\r\n/g, '\n')
  const get = api.slice(api.indexOf('export async function GET'), api.indexOf('export async function DELETE'))
  verifie('la route GET existe', get.length > 100)
  verifie('elle est gardée par requireAdmin', /requireAdmin\(request\)/.test(get))
  // ⚠️ LA LISTE DES COMMERÇANTS EST CALCULÉE SERVEUR, jamais reçue du client.
  verifie('elle calcule elle-même les commerçants en attente', /statut_publication'?,?\s*'en_attente'/.test(get))
  verifie('elle ne lit aucun identifiant du corps de la requête', !/request\.json\(\)/.test(get))
}

console.log(`\nQualité des images : ${ok} vérifications`)

// ═══ REMPLACER UNE PHOTO NE LUI FAIT PAS PERDRE SA PLACE ═══════════════════
//
// ⚠️ CE QUE CETTE GARDE PROTÈGE EST UNE RÈGLE, PAS UNE IMPLÉMENTATION.
// Avant le 26/08, changer une photo de galerie demandait de la supprimer puis
// d'en charger une autre — qui repartait en DERNIÈRE position. L'ordre n'est
// pourtant pas décoratif : l'écran dit lui-même au commerçant qu'« on regarde
// rarement plus loin que la troisième ». Lui faire refaire son classement à
// chaque retouche, c'est le décourager de retoucher.
//
// Le remplacement doit donc être un UPDATE de l'URL sur la ligne existante, et
// jamais un couple suppression/insertion. La tentation de « simplifier » en
// réutilisant les deux fonctions voisines est réelle, et elle ferait
// disparaître la règle sans qu'aucun écran ne change d'apparence.
{
  // Découpe sur les FRONTIÈRES DE FONCTION, jamais sur un nombre de caractères :
  // une fenêtre glissante lit chez le voisin et verdit au gré d'une accolade
  // déplacée (piège du 15/08).
  const corpsDe = (src, nom) => {
    const debut = src.indexOf(`async function ${nom}(`)
    if (debut < 0) return null
    const suite = src.indexOf('\n  async function ', debut + 10)
    return src.slice(debut, suite < 0 ? src.length : suite)
  }

  for (const [chemin, etiquette] of [
    ['app/dashboard/ConfigDashboard.js', 'le tableau de bord'],
    ['app/signup/page.js', "l'inscription"],
  ]) {
    const src = readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')
    const corps = corpsDe(src, 'remplacerPhotoGalerie')
    verifie(`${etiquette} sait remplacer une photo`, corps !== null)
    if (!corps) continue
    verifie(`${etiquette} remplace l'image sur la ligne existante`,
      /\.update\(\{ url:/.test(corps))
    verifie(`${etiquette} ne détruit jamais la ligne pour la remplacer`,
      !/\.delete\(\)/.test(corps) && !/\.insert\(/.test(corps),
      'un supprimer/rajouter ferait perdre sa place à la photo')
    // ⚠️ L'ORDRE COMPTE : effacer l'ancien fichier AVANT d'avoir écrit le
    // nouveau laisserait, si l'envoi échoue, une ligne qui pointe vers un objet
    // disparu — une image cassée sur la fiche publique, et personne pour s'en
    // apercevoir.
    verifie(`${etiquette} n'efface l'ancien fichier qu'après avoir écrit le nouveau`,
      corps.indexOf('.update({ url:') < corps.indexOf('storage.from(\'logos\').remove'),
      'le nettoyage passe avant l\'enregistrement')
  }
}

if (echecs.length > 0) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
