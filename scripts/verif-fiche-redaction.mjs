// BANC — L'AIDE À LA RÉDACTION DE LA FICHE (26/08, demande d'Alex).
//
// Deux textes vendent le commerce : la PRÉSENTATION et les INFOS PRATIQUES.
// C'étaient les deux seuls champs du tableau de bord sans aide à la rédaction.
//
// Ce qui se vérifie ici :
//   • la règle de longueur, EXÉCUTÉE, y compris ses deux exemptions ;
//   • les phrases d'aide, RENDUES et relues ;
//   • le fait que l'IA des infos pratiques n'a PAS le droit d'inventer une
//     règle, ce qui est un risque juridique et pas un défaut de style ;
//   • que les écrans appellent tout ça au lieu de le recopier.
//
//   npm run verif:redaction

import { readFileSync } from 'node:fs'
import {
  MIN_DESCRIPTION,
  descriptionRefusee,
  jaugeDescription,
  motsInspirationDescription,
  MOTS_INSPIRATION_INFOS,
  astuceRedaction,
} from '../lib/fiche-redaction.js'
import { IA_FICHE_CONFIG, getIaFicheConfig } from '../lib/plans.js'
import { sansProse } from './lire-code.mjs'

const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')
// Le code SANS sa prose : une garde verte grâce au commentaire qui EXPLIQUE la
// règle, au lieu du code qui l'applique, s'est produite huit fois sur ce projet.
// ⚠️ LE DÉPOUILLEUR EST PARTAGÉ (`scripts/lire-code.mjs`) : il vivait recopié
// dans huit bancs, et le défaut du 29/08 aurait dû être corrigé huit fois.
const lireCode = (chemin) => sansProse(lire(chemin))

let ok = 0
const echecs = []
function verifie(nom, condition, detail) {
  if (condition) { ok++; return }
  echecs.push(detail ? `${nom} — ${detail}` : nom)
}

// ═══ 1. La règle de longueur, EXÉCUTÉE ════════════════════════════════════
{
  const court = 'Salon sympa.'
  const long = 'x'.repeat(MIN_DESCRIPTION)

  verifie('une description trop courte, fraîchement écrite, est refusée',
    descriptionRefusee('', court) === true)
  verifie('une description assez longue passe',
    descriptionRefusee('', long) === true ? false : true)

  // ⚠️ LES DEUX EXEMPTIONS SONT LE CŒUR DE L'ARBITRAGE. Sans elles, le
  // commerçant venu corriger son téléphone serait bloqué par un champ qu'il
  // n'a pas touché, et qui date d'avant la règle.
  verifie('une description ANCIENNE et courte, non touchée, ne bloque personne',
    descriptionRefusee(court, court) === false)
  verifie('même en changeant un espace insignifiant',
    descriptionRefusee(court, `${court} `) === false)
  verifie('vider volontairement sa description n\'est pas un refus',
    descriptionRefusee(long, '') === false)
  verifie('mais la raccourcir sous le seuil, si',
    descriptionRefusee(long, 'Trop court maintenant.') === true)
  verifie('le seuil est un plancher raisonnable, pas un mur', MIN_DESCRIPTION >= 100 && MIN_DESCRIPTION <= 200)
}

// ═══ 2. Ce que le commerçant lit pendant qu'il tape ═══════════════════════
{
  const vide = jaugeDescription('')
  verifie('un champ vide annonce l\'objectif', vide.texte.includes(String(MIN_DESCRIPTION)))
  verifie('et ne prétend pas que c\'est atteint', vide.atteint === false)

  const enCours = jaugeDescription('x'.repeat(MIN_DESCRIPTION - 40))
  // ⚠️ ON DIT CE QU'IL RESTE À FAIRE. « Minimum non atteint » est un reproche,
  // « Encore 40 caractères » est une instruction.
  verifie('à mi-chemin, on dit combien il reste', /Encore 40 caractères/.test(enCours.texte))
  verifie('et jamais qu\'une règle n\'est pas respectée',
    !/minimum|obligatoire|invalide/i.test(enCours.texte))
  verifie('l\'accord suit le nombre',
    /Encore 1 caractère /.test(jaugeDescription('x'.repeat(MIN_DESCRIPTION - 1)).texte))

  const atteint = jaugeDescription('x'.repeat(MIN_DESCRIPTION + 10))
  verifie('atteint, on le félicite avec son compte', atteint.atteint === true && atteint.texte.includes(String(MIN_DESCRIPTION + 10)))
}

// ═══ 3. Les mots qui inspirent l'IA ══════════════════════════════════════
{
  // ⚠️ SANS MATIÈRE, L'IA PRODUIT DU VIDE POLI. Ces exemples sont ce qui
  // transforme un bouton magique en outil : ils disent quoi taper.
  const vitrine = motsInspirationDescription('vitrine')
  const detail = motsInspirationDescription('detail')
  const alim = motsInspirationDescription('alimentaire')
  verifie('chaque métier a ses propres exemples',
    vitrine.join() !== detail.join() && detail.join() !== alim.join())
  verifie('et il y en a assez pour amorcer', vitrine.length >= 3 && detail.length >= 3 && alim.length >= 3)
  verifie('un salon parle de savoir-faire, pas de rayons', /savoir-faire/.test(vitrine.join()))
  verifie('une boutique parle de ce qu\'elle vend', /vends/.test(detail.join()))

  const astuce = astuceRedaction(vitrine)
  verifie('l\'astuce invite à noter en vrac', /en vrac/.test(astuce))
  // ⚠️ ET ELLE DIT QUE L'IA N'INVENTE PAS. C'est ce qui rassure le commerçant
  // sur le fait que le texte restera le sien.
  verifie('et promet que l\'IA n\'invente rien', /n’invente rien/.test(astuce))
  verifie('sans mots, pas d\'astuce vide', astuceRedaction([]) === '')

  verifie('les infos pratiques parlent Bancontact, jamais CB',
    /Bancontact/.test(MOTS_INSPIRATION_INFOS.join()) && !/\bCB\b/.test(MOTS_INSPIRATION_INFOS.join()))
  verifie('et couvrent l\'annulation', /annulation/.test(MOTS_INSPIRATION_INFOS.join()))
}

// ═══ 4. Le quota, par palier et par MOIS ═════════════════════════════════
{
  // ⚠️ ARBITRAGE D'ALEX : « 3 par mois pour EXISTER, les autres ont un forfait
  // plus élevé ».
  verifie('Exister a bien 3 propositions par mois', IA_FICHE_CONFIG.exister.quota_mois === 3)
  verifie('et les paliers payants davantage',
    IA_FICHE_CONFIG.communiquer.quota_mois > 3 && IA_FICHE_CONFIG.vendre.quota_mois > IA_FICHE_CONFIG.communiquer.quota_mois)
  // ⚠️ UN PALIER INCONNU NE DOIT PAS OUVRIR LE ROBINET : on retombe sur le plus bas.
  verifie('un palier inconnu retombe sur le plus prudent',
    getIaFicheConfig('n_importe_quoi').quota_mois === IA_FICHE_CONFIG.exister.quota_mois)
  verifie('et un palier absent aussi', getIaFicheConfig(null).quota_mois === IA_FICHE_CONFIG.exister.quota_mois)

  const route = lireCode('app/api/ia/presentation/route.js')
  verifie('la route compte sur le MOIS en cours, plus à vie',
    /\.gte\('created_at', debutMois\.toISOString\(\)\)/.test(route))
  verifie('et lit le quota du palier du commerçant',
    /getIaFicheConfig\(com\.plan\)\.quota_mois/.test(route))
  // ⚠️ LA COLONNE DOIT ÊTRE CHARGÉE, sinon tout le monde retombe sur Exister.
  verifie('le plan est bien demandé à la base', /auth_user_id, plan'/.test(route))
  // ⚠️ CHAQUE CHAMP SON COMPTEUR : épuiser la présentation ne doit pas fermer
  // les infos pratiques.
  verifie('chaque champ a son propre compteur', /\.eq\('type', CHAMPS\[champ\]\.log\)/.test(route))
}

// ═══ 5. 🔴 L'IA DES INFOS PRATIQUES N'A PAS LE DROIT D'INVENTER ══════════
//
// Ce texte s'affiche sur la fiche ET dans l'email de confirmation de rendez-
// vous. Une politique d'annulation inventée est une règle que le commerçant
// devra tenir face à un client qui l'a lue, ou un conflit au comptoir.
{
  const route = lire('app/api/ia/presentation/route.js')
  verifie('une consigne séparée existe pour les infos pratiques',
    /const SYSTEME_INFOS = /.test(route))
  verifie('elle interdit d\'ajouter une règle',
    /N'AJOUTE AUCUNE RÈGLE QUI N'EST PAS DANS CE QUE LE COMMERÇANT A ÉCRIT/.test(route))
  verifie('elle nomme les inventions les plus tentantes',
    /Pas de délai d'annulation, pas de moyen de paiement/.test(route))
  verifie('et elle impose le vocabulaire belge',
    /on dit Bancontact, jamais "CB"/.test(route))

  const code = lireCode('app/api/ia/presentation/route.js')
  verifie('la bonne consigne est réellement choisie',
    /systeme: champ === 'infos_pratiques' \? SYSTEME_INFOS : SYSTEME/.test(code))
  // ⚠️ ET PAS DE SITE WEB ICI : une page de conditions générales trouvée en
  // ligne ferait entrer des règles que le commerçant n'a pas relues.
  verifie('le site web n\'alimente jamais les infos pratiques',
    /champ === 'infos_pratiques'\s*\n?\s*\? null/.test(code))
  // ⚠️ LE CHAMP VIENT DU CLIENT : sans liste blanche, un appelant choisirait
  // le compteur qu'il consomme.
  verifie('le champ demandé est validé contre une liste connue',
    /CHAMPS\[body\?\.champ\] \? body\.champ : 'presentation'/.test(code))
}

// ═══ 6. Les écrans appellent tout ça, au lieu de le recopier ═════════════
{
  const dash = lireCode('app/dashboard/ConfigDashboard.js')

  // ⚠️ ON NOMME LE CHAMP DANS L'APPEL. Chercher `BoutonIaFiche` tout court
  // serait vert avec un seul des deux boutons, et vert aussi sur la ligne
  // d'import : deux gardes muettes pour le prix d'une, déjà vues cinq fois
  // aujourd'hui.
  verifie('la description a son bouton', /champ="presentation"/.test(dash))
  verifie('les infos pratiques aussi', /champ="infos_pratiques"/.test(dash))
  verifie('et les deux listes de propositions sont séparées',
    /setPropsIaDescription\(vs\)/.test(dash) && /setPropsIaInfos\(vs\)/.test(dash))

  verifie('la jauge est affichée sous le champ', /\{jauge\.texte\}/.test(dash))
  verifie('les exemples de la description suivent le métier',
    /astuceRedaction\(motsInspirationDescription\(form\.categorie\)\)/.test(dash))
  verifie('et ceux des infos pratiques sont là aussi',
    /astuceRedaction\(MOTS_INSPIRATION_INFOS\)/.test(dash))

  // ⚠️ LE REFUS EST DANS L'ENREGISTREMENT, pas seulement à l'écran : une garde
  // d'affichage n'est jamais une garde.
  verifie('l\'enregistrement refuse une description bâclée',
    /descriptionRefusee\(initial\?\.description, form\.description\)/.test(dash))
  // ⚠️ ET LE MESSAGE DIT QUOI FAIRE, pas seulement que c'est refusé.
  verifie('et le message renvoie vers le bouton de rédaction',
    /Le bouton ✨ le rédige à partir de tes mots/.test(lire('app/dashboard/ConfigDashboard.js')))

  // Le placeholder vouvoyait, seul de tout le tableau de bord.
  verifie('le placeholder ne vouvoie plus', !/Décrivez votre commerce/.test(dash))
}

if (echecs.length > 0) {
  console.log(`\n${ok} vérifications passées, ${echecs.length} en échec.\n`)
  console.log('ÉCHECS :')
  echecs.forEach(e => console.log(`  ✕ ${e}`))
  process.exit(1)
}
console.log(`\n${ok} vérifications passées, 0 en échec.`)
console.log('Aide à la rédaction de la fiche verte.')
