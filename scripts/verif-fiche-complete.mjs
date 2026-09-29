// BANC : une fiche n'est montrée aux clients que complète.
//
// 🔴 CE QU'ON PROTÈGE (Alex, 28/09) : « je ne peux pas laisser les fiches non
// complétées être publiées ». Valider ouvrait l'espace ET publiait la fiche,
// alors que le catalogue ne se remplit que depuis cet espace : toute fiche
// partait en ligne à moitié vide.
//
// ⚠️ LE PIRE CAS N'EST PAS UNE FICHE QUI ATTEND TROP, c'est l'un de ces trois :
//   • une fiche incomplète publiée quand même ;
//   • un commerçant bloqué à vie par un critère qui ne le concerne pas
//     (un paiement exigé en Exister, où rien ne s'encaisse) ;
//   • une relance qui réclame ce qui est déjà fait.
//
//   npm run verif:fiche-complete

import { readFileSync } from 'node:fs'
import { sansProse } from './lire-code.mjs'
import {
  ficheComplete, ficheAPublier, phraseManquants, motCatalogue,
  horairesRequis, paiementRequis, COLONNES_FICHE_COMPLETE,
  MIN_CATALOGUE, MIN_PHOTOS, MIN_PRESENTATION,
} from '../lib/fiche-complete.js'
import { emailRelanceFiche, emailEspaceOuvert, emailDemandePublicationAdmin } from '../lib/resend.js'
import { comptesDeLaFiche } from '../lib/fiche-complete-server.js'

let ok = 0
const echecs = []
const v = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  echecs.push(`${nom}${detail ? ` — ${detail}` : ''}`)
}
const lire = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
const code = (f) => sansProse(lire(f))

// Une date fixe : aucune garde ne dépend du jour où le banc tourne.
const MAINTENANT = new Date('2026-09-28T10:00:00Z')
const HORAIRES = { lundi: { ouvert: true, debut: '08:00', fin: '18:00' }, mardi: { ouvert: false } }

// Une boulangerie en Vendre, complète, qui encaisse sur place.
const BOULANGERIE = {
  id: 'b', nom: 'Le Fournil', categorie: 'alimentaire', plan: 'vendre', created_at: '2026-01-01',
  logo_url: 'https://x/logo.png', description: 'Pain au levain et viennoiseries du matin.',
  horaires_detail: HORAIRES, accepte_paiement_cash: true, stripe_account_charges_enabled: false,
  statut: 'valide', statut_publication: 'en_attente',
}
const bilan = (c, nbCatalogue = 5, nbPhotos = 3) => ficheComplete({ commercant: c, nbCatalogue, nbPhotos, maintenant: MAINTENANT })
const cles = (b) => b.criteres.map(k => k.cle).join(',')
const manque = (b) => b.manquants.map(k => k.cle).join(',')

// ═══ 1) LA LISTE D'ALEX, ET RIEN QU'ELLE ════════════════════════════════════
{
  v('les seuils sont ceux décidés le 28/09', MIN_CATALOGUE === 3 && MIN_PHOTOS === 2 && MIN_PRESENTATION === 20,
    `${MIN_CATALOGUE}/${MIN_PHOTOS}/${MIN_PRESENTATION}`)
  const b = bilan(BOULANGERIE)
  v('une fiche en Vendre porte les six critères', cles(b) === 'catalogue,photos,logo,presentation,horaires,paiement', cles(b))
  v('une fiche qui a tout est complète', b.complet === true && b.manquants.length === 0, manque(b))
  v('le compte « fait » suit', b.faits === 6 && b.total === 6, `${b.faits}/${b.total}`)
  v('chaque critère mène à un onglet du tableau de bord',
    b.criteres.every(k => ['menu', 'rdv', 'profil', 'paiements'].includes(k.onglet)), b.criteres.map(k => k.onglet).join(','))
}

// ═══ 2) LE CATALOGUE : TROIS, ET PAS DEUX ═══════════════════════════════════
{
  const deux = bilan(BOULANGERIE, 2)
  v('2 produits ne suffisent pas', manque(deux) === 'catalogue', manque(deux))
  v('3 produits suffisent', bilan(BOULANGERIE, 3).complet === true)
  const k = deux.criteres.find(x => x.cle === 'catalogue')
  v('l avancement se lit « 2 sur 3 »', k.avancement === '2 sur 3', k.avancement)
  v('il manque « encore 1 produit », au singulier', k.manque === 'encore 1 produit', k.manque)
  const vide = bilan(BOULANGERIE, 0).criteres.find(x => x.cle === 'catalogue')
  v('à zéro, on parle du catalogue', vide.manque === 'ton catalogue', vide.manque)
  // ⚠️ LA MENTION D'ALEX : trois est le seuil, pas l'objectif.
  v('la mention du catalogue complet accompagne le critère',
    /tout ce que tu vends/.test(k.aide), k.aide)
  v('un comptage illisible vaut zéro, jamais « complet »', bilan(BOULANGERIE, NaN).complet === false)
  v('le mot suit le métier : boutique', motCatalogue({ categorie: 'detail' }) === 'articles')
  v('le mot suit le métier : service', motCatalogue({ categorie: 'vitrine' }, 1) === 'prestation ou article')
}

// ═══ 3) PHOTOS, LOGO, PRÉSENTATION ══════════════════════════════════════════
{
  v('une seule photo ne suffit pas', manque(bilan(BOULANGERIE, 5, 1)) === 'photos')
  v('deux photos suffisent', bilan(BOULANGERIE, 5, 2).complet === true)
  v('un logo fait d espaces n est pas un logo', manque(bilan({ ...BOULANGERIE, logo_url: '   ' })) === 'logo')
  const d19 = 'x'.repeat(19)
  v('19 caractères de présentation ne suffisent pas', manque(bilan({ ...BOULANGERIE, description: d19 })) === 'presentation')
  v('20 caractères suffisent', bilan({ ...BOULANGERIE, description: 'x'.repeat(20) }).complet === true)
  v('des espaces ne comptent pas dans la présentation',
    manque(bilan({ ...BOULANGERIE, description: `  ${d19}  ` })) === 'presentation')
}

// ═══ 4) LES HORAIRES, ET CEUX QUI N'EN ONT PAS ══════════════════════════════
{
  v('aucun jour ouvert : il manque les horaires',
    manque(bilan({ ...BOULANGERIE, horaires_detail: { lundi: { ouvert: false } } })) === 'horaires')
  v('pas d horaires du tout : il manque les horaires', manque(bilan({ ...BOULANGERIE, horaires_detail: null })) === 'horaires')
  // 🔴 UN CRITÈRE QUI NE LE CONCERNE PAS LE BLOQUERAIT À VIE.
  const coiffeur = { ...BOULANGERIE, categorie: 'vitrine', plan: 'exister', horaires_detail: null }
  v('un service en Exister n a pas d horaires à fournir', horairesRequis(coiffeur) === false && !cles(bilan(coiffeur)).includes('horaires'))
  const camion = { ...BOULANGERIE, siege_social_est_lieu_activite: false, horaires_detail: null }
  v('un commerce qui change d endroit non plus', !cles(bilan(camion)).includes('horaires') && bilan(camion).complet === true)
}

// ═══ 5) ENCAISSER : UN SUR DEUX, ET SEULEMENT SI LA FORMULE ENCAISSE ═════════
{
  const rien = { ...BOULANGERIE, accepte_paiement_cash: false, stripe_account_charges_enabled: false }
  v('ni Stripe ni sur place : il manque le paiement', manque(bilan(rien)) === 'paiement')
  v('Stripe seul suffit', bilan({ ...rien, stripe_account_charges_enabled: true }).complet === true)
  v('sur place seul suffit', bilan({ ...rien, accepte_paiement_cash: true }).complet === true)
  // 🔴 EN EXISTER, RIEN NE S'ENCAISSE PAR YOPPAA : exiger un paiement, ce serait
  // interdire la publication pour toujours.
  const exister = { ...rien, plan: 'exister' }
  v('en Exister, le paiement n est pas demandé', paiementRequis(exister, MAINTENANT) === false && bilan(exister).complet === true, cles(bilan(exister)))
  v('en Communiquer non plus', bilan({ ...rien, plan: 'communiquer' }).complet === true)
  // La boutique : la règle est celle du tunnel (lib/modes-paiement.js).
  const boutique = { ...rien, categorie: 'detail' }
  v('boutique au retrait, paiement au magasin : suffit',
    bilan({ ...boutique, boutique_mode_vente: 'retrait', boutique_retrait_paiement: 'magasin' }).complet === true)
  v('boutique qui expédie : le paiement sur place ne compte pas',
    manque(bilan({ ...boutique, boutique_mode_vente: 'expedition', accepte_paiement_cash: true, boutique_retrait_paiement: 'magasin' })) === 'paiement')
  v('boutique qui expédie avec Stripe : suffit',
    bilan({ ...boutique, boutique_mode_vente: 'expedition', stripe_account_charges_enabled: true }).complet === true)
}

// ═══ 6) QUI ATTEND UNE MISE EN LIGNE ════════════════════════════════════════
{
  v('validé et en attente : oui', ficheAPublier({ statut: 'valide', statut_publication: 'en_attente' }) === true)
  v('compte « actif » retiré par Alex : oui', ficheAPublier({ statut: 'actif', statut_publication: 'suspendu' }) === true)
  v('déjà en ligne : non', ficheAPublier({ statut: 'valide', statut_publication: 'publie' }) === false)
  v('pas encore validé : non', ficheAPublier({ statut: 'en_attente', statut_publication: 'en_attente' }) === false)
  v('inscription jamais soumise : non', ficheAPublier({ statut: null, statut_publication: 'brouillon' }) === false)
  v('rejeté : non', ficheAPublier({ statut: 'rejete', statut_publication: 'en_attente' }) === false)
}

// ═══ 7) CE QU'ON ÉCRIT AU COMMERÇANT ════════════════════════════════════════
{
  const m = (...xs) => xs.map(x => ({ manque: x }))
  v('rien ne manque : phrase vide', phraseManquants([]) === '')
  v('un manque', phraseManquants(m('ton logo')) === 'ton logo')
  v('deux manques', phraseManquants(m('ton logo', 'tes horaires')) === 'ton logo et tes horaires')
  v('trois manques', phraseManquants(m('a', 'b', 'c')) === 'a, b et c')

  const b = bilan({ ...BOULANGERIE, logo_url: null }, 1, 0)
  const reste = phraseManquants(b.manquants)
  v('la relance nomme ce qui manque, dans l ordre',
    reste === 'encore 2 produits, 2 photos et ton logo', reste)
  const html = emailRelanceFiche({ nom: '<b>Chez Momo</b>', criteres: b.criteres, resteAFaire: reste })
  v('la relance échappe le nom du commerce', html.includes('&lt;b&gt;Chez Momo') && !html.includes('<b>Chez Momo'))
  v('la relance porte ce qui reste à faire', html.includes('encore 2 produits, 2 photos et ton logo'))
  v('la relance montre aussi ce qui est fait', /Fait/.test(html))
  // Le texte seul : les styles portent des « 100% » qui ne sont pas des mots.
  const texte = html.replace(/style="[^"]*"/g, '')
  v('la relance ne parle jamais en pourcentage', !/\d+ ?%/.test(texte), (texte.match(/.{0,30}\d+ ?%.{0,30}/) || [''])[0])
  v('l email d ouverture échappe le nom', emailEspaceOuvert({ nom: '<i>x</i>', criteres: b.criteres }).includes('&lt;i&gt;x'))
  v('l email d ouverture sans liste ne montre pas un tableau vide',
    !emailEspaceOuvert({ nom: 'x', criteres: [] }).includes('Voici ce qu'))
  v('l alerte à Alex échappe le nom', emailDemandePublicationAdmin({ nom: '<s>y</s>', commercant_id: 'id' }).includes('&lt;s&gt;y'))
}

// ═══ 8) LES COLONNES QUE LA RÈGLE LIT SONT CHARGÉES ═════════════════════════
//
// ⚠️ UNE COLONNE ABSENTE DU SELECT fait paraître un critère manquant : le
// commerçant serait relancé pour un logo qu'il a mis.
{
  const colonnes = COLONNES_FICHE_COMPLETE.split(',').map(s => s.trim())
  const regle = code('lib/fiche-complete.js')
  // Les deux formes d'écriture du fichier : `c.logo_url` et `commercant?.plan`.
  const luesParLaRegle = [...new Set([...regle.matchAll(/\b(?:c|commercant\?)\.([a-z_]+)/g)].map(x => x[1]))]
  const externes = [
    // lib/plans.js : peut() et le plan effectif
    'plan', 'essai_plan', 'created_at', 'categorie',
    // lib/modes-paiement.js
    'stripe_account_charges_enabled', 'accepte_paiement_cash', 'boutique_retrait_paiement',
    // lu par ficheAPublier et par les routes
    'statut', 'statut_publication', 'publication_demandee_at', 'relance_fiche_envoyee_at', 'relances_fiche_nb', 'email', 'nom',
  ]
  const requises = [...new Set([...luesParLaRegle, ...externes])]
  v('la règle lit au moins ses six colonnes propres', luesParLaRegle.length >= 6, luesParLaRegle.join(','))
  const absentes = requises.filter(x => !colonnes.includes(x))
  v('chaque colonne lue est chargée', absentes.length === 0, absentes.join(','))
  const paiement = code('lib/modes-paiement.js')
  const luesPaiement = [...paiement.matchAll(/commercant\?\.([a-z_]+)/g)].map(x => x[1])
  const absentesPaiement = luesPaiement.filter(x => !colonnes.includes(x))
  v('les colonnes du paiement sont chargées', luesPaiement.length >= 3 && absentesPaiement.length === 0, absentesPaiement.join(','))
}

// ═══ 9) LE SERVEUR DÉCIDE, ET IL RECALCULE ══════════════════════════════════
{
  const publier = code('app/api/admin/publier/route.js')
  const iAdmin = publier.indexOf('adminVerifie(request, user)')
  const iComplet = publier.indexOf('if (!bilan.complet)')
  const iPublie = publier.indexOf("statut_publication: 'publie'")
  v('Publier : seul l admin passe', iAdmin > 0 && iAdmin < publier.indexOf('clientAdmin()'))
  v('Publier : une fiche incomplète est refusée AVANT d écrire', iComplet > 0 && iPublie > 0 && iComplet < iPublie)
  v('Publier : un compte non validé est refusé', /if \(!STATUTS_ACCES_AUTORISE\.includes\(commercant\.statut\)\)/.test(publier))
  v('Publier : la fiche est relue au moment du clic', /await bilanDeLaFiche\(admin, commercant_id\)/.test(publier))

  const relancer = code('app/api/admin/relancer-fiche/route.js')
  v('Relancer : seul l admin passe', /if \(!\(await adminVerifie\(request, user\)\)\) return/.test(relancer))
  v('Relancer : une fiche complète n est pas relancée', /if \(bilan\.complet\) \{\s*return/.test(relancer))
  const iEchec = relancer.indexOf('if (!envoi?.ok)')
  const iCompte = relancer.indexOf('relances_fiche_nb: nb')
  v('Relancer : on ne compte que ce qui est parti', iEchec > 0 && iCompte > iEchec)
  v('Relancer : seulement une fiche qui attend sa mise en ligne', /if \(!ficheAPublier\(commercant\)\)/.test(relancer))

  const demander = code('app/api/fiche/demander-publication/route.js')
  const iGarde = demander.indexOf('gardeCommercant(request, admin, commercant_id)')
  const iIncomplet = demander.indexOf('if (!bilan.complet)')
  const iEcrit = demander.indexOf('publication_demandee_at: maintenant')
  v('Demander : la fiche doit appartenir à l appelant', iGarde > 0 && /if \(!garde\.ok\) return/.test(demander))
  v('Demander : une fiche incomplète est refusée AVANT d écrire', iIncomplet > iGarde && iEcrit > iIncomplet)
  v('Demander : deux clics simultanés n envoient qu une alerte',
    /\.is\('publication_demandee_at', null\)[\s\S]{0,40}\.select\('id'\)/.test(demander))
  v('Demander : le commerçant ne publie jamais lui-même', !/statut_publication:/.test(demander))

  const valider = code('app/api/admin/valider/route.js')
  v('Valider : ne publie plus une fiche qui ne l était pas',
    /const dejaEnLigne = fichePubliee\(existant\)/.test(valider)
    && /statut_publication: dejaEnLigne \? 'publie' : 'en_attente'/.test(valider))
  v('Valider : ne force plus la publication nulle part', !/statut_publication: 'publie'/.test(valider))
  v('Valider : le kit ne part plus à la validation', !/emailKitBienvenue/.test(valider))
  v('Valider : l email annonce l espace ouvert', /emailEspaceOuvert\(/.test(valider))
  v('Valider : la statut_publication d origine est bien lue',
    /\.select\('id, nom, slug, statut_publication'\)/.test(valider))
  v('Publier : c est lui qui envoie désormais la page en ligne et le kit',
    /emailValidationCommercant\(/.test(publier) && /emailKitBienvenue\(/.test(publier))

  const liste = code('app/api/admin/fiches-a-publier/route.js')
  v('La liste : seul l admin passe', /if \(!\(await adminVerifie\(request, user\)\)\) return/.test(liste))
  v('La liste : validés seulement', /\.in\('statut', STATUTS_ACCES_AUTORISE\)/.test(liste))
  v('La liste : pas encore publiés seulement', /\.in\('statut_publication', PUBLICATIONS_EN_ATTENTE\)/.test(liste))
  v('La liste : une lecture en échec se dit', /if \(error\) return NextResponse\.json\(\{ ok: false/.test(liste))
}

// ═══ 10) LE COMMERÇANT ET LE SERVEUR COMPTENT LA MÊME CHOSE ═════════════════
//
// ⚠️ UN ENCART QUI COCHE CE QUE LE SERVEUR REFUSE : le commerçant clique sur
// « Demander », et se fait dire qu'il lui manque ce que son écran dit fait.
{
  const serveur = code('lib/fiche-complete-server.js')
  const bandeau = code('app/dashboard/BandeauFicheAPublier.js')
  const filtres = (src) => [...src.matchAll(/from\('([a-z_]+)'\)[\s\S]{0,80}?\.select\('id', \{ count: 'exact', head: true \}\)([\s\S]{0,160}?)(?=\)\s*,|\), ')/g)]
    .map(x => `${x[1]}${x[2].replace(/commercantId|commercant\.id/g, 'ID').replace(/\s+/g, '').replace(/\)+$/, '')}`)
    .sort()
  const fs = filtres(serveur), fb = filtres(bandeau)
  v('le serveur compte trois choses', fs.length === 3, fs.join(' | '))
  v('l encart compte les trois mêmes, avec les mêmes filtres', fs.join(' | ') === fb.join(' | '), `serveur: ${fs.join(' | ')} / encart: ${fb.join(' | ')}`)
  // ⚠️ UN ESSAI, PAS UN MOT CHERCHÉ. La première version cherchait
  // `if (error) throw` et le trouvait dans la fonction VOISINE du même
  // fichier : la mutation qui désarmait le comptage restait verte.
  const fauxClient = (reponses) => ({
    from: (table) => {
      const q = { select: () => q, eq: () => q, is: () => q, not: () => q,
        then: (ok, ko) => Promise.resolve(reponses[table]).then(ok, ko) }
      return q
    },
  })
  const sain = { articles: { count: 2, error: null }, rdv_prestations: { count: 1, error: null }, commercant_photos: { count: 2, error: null } }
  const comptes = await comptesDeLaFiche(fauxClient(sain), 'id')
  v('le serveur additionne articles et prestations', comptes.nbCatalogue === 3 && comptes.nbPhotos === 2, JSON.stringify(comptes))
  let leve = null
  try {
    await comptesDeLaFiche(fauxClient({ ...sain, articles: { count: null, error: { message: 'permission refusée' } } }), 'id')
  } catch (e) { leve = e.message }
  v('une lecture en échec n est pas un zéro, côté serveur', /articles impossible : permission refusée/.test(leve || ''), String(leve))
  v('une lecture en échec n est pas un zéro, côté encart', /if \(error\) throw/.test(bandeau) && /setErreur\(e\.message\)/.test(bandeau))
  v('l encart ne s affiche que pour une fiche qui attend', /if \(!concerne\) return null/.test(bandeau))
  v('le bouton ne s allume que sur une fiche complète', /disabled=\{!bilan\.complet \|\| envoi\}/.test(bandeau))
  v('l encart suit le commerçant sans rechargement', /setInterval\(/.test(bandeau) && /clearInterval\(t\)/.test(bandeau))

  const page = code('app/dashboard/page.js')
  v('l encart est dans la zone qui défile',
    /<div className="scroll-zone">[\s\S]{0,200}<BandeauFicheAPublier commercant=\{commercant\} onAllerA=\{ouvrirConfig\}/.test(page))
  const admin = code('app/admin/page.js')
  v('le bloc d admin est affiché', /<SectionFichesAPublier toast=/.test(admin))
  const section = code('app/admin/SectionFichesAPublier.js')
  v('Publier n apparaît que sur une fiche complète', /\{f\.complet && \(/.test(section))
  v('Relancer n apparaît que sur une fiche incomplète', /\{!f\.complet && f\.email && \(/.test(section))
  v('chaque envoi se confirme', /geste: 'relancer'/.test(section) && /geste: 'publier'/.test(section))

  // 🔴 ALEX, 29/09 : « Aperçu » menait à la liste des commerces, la fiche
  // n'existant pas avant sa publication. Même lien mort dans « À valider ».
  v('le bloc ne renvoie plus vers une fiche publique qui n existe pas', !/\/commander\//.test(section))
  v('il ouvre le tableau de bord en mode admin', /onClick=\{\(\) => voir\(f\)\}/.test(section) && /await demarrerModeAdmin\(f\.id,/.test(section))
  v('« À valider » ne renvoie plus vers une fiche publique', !/href=\{`\/commander\/\$\{c\.slug\}`\}/.test(admin))
}

// ═══ 11) LA PRÉSENTATION À L'INSCRIPTION (Alex, 29/09) ══════════════════════
//
// 🔴 « des commerçants se sont déjà retrouvés bloqués à cet endroit ». Le
// compteur comptait les espaces que la règle retire : « 20 / 20 » affiché,
// bouton toujours gris.
{
  const signup = code('app/signup/page.js')
  v('le compteur retire les espaces, comme la règle',
    /const presentationLongueur = form\.description\.trim\(\)\.length/.test(signup))
  v('le bouton se débloque sur le même compte',
    /const presentationManque = Math\.max\(0, MIN_PRESENTATION - presentationLongueur\)/.test(signup)
    && /presentationManque === 0 &&/.test(signup))
  v('le seuil vient de la règle de la fiche complète, pas d un 20 recopié',
    /import \{ MIN_PRESENTATION \} from '@\/lib\/fiche-complete'/.test(signup) && !/description\.trim\(\)\.length >= 20/.test(signup))
  v('rouge tant qu il manque, vert quand c est bon',
    /color: presentationManque > 0 \? '#B91C1C' : '#047857'/.test(signup))
  v('il dit combien il en manque', /`Encore \$\{presentationManque\} caractère/.test(signup))
  // ⚠️ LA CONDITION, PAS LA PHRASE : la première version cherchait « il en
  // manque », qui restait écrit même quand plus rien ne l'affichait.
  v('l aide du bas nomme la présentation quand c est elle qui bloque',
    /: presentationManque > 0\s*\? `Ta présentation doit faire au moins \$\{MIN_PRESENTATION\} caractères : il en manque \$\{presentationManque\}\.`/.test(signup))
  // 🔴 CE QU'IL FAUT AVOIR SOUS LA MAIN, DIT EN PREMIER (Alex, 29/09) : le
  // contrôle d'identité arrive à la dernière étape, c'est là qu'on abandonne.
  const iAvant = signup.indexOf('Avant de commencer, garde ceci sous la main')
  const iOffre = signup.indexOf('La formule <span style={{ color: T.light }}>Exister</span> est gratuite à vie.')
  const iCompte = signup.indexOf('<Card titre="Ton compte">')
  v('l inscription annonce les papiers AVANT tout le reste de la première page',
    iAvant > 0 && iAvant < iOffre && iAvant < iCompte)
  v('elle nomme la carte d identité et le numéro d entreprise',
    /Ta carte d&rsquo;identité<\/strong>/.test(signup) && /Ton numéro d&rsquo;entreprise \(BCE\)<\/strong>/.test(signup))
  const landing = code('app/components/LandingReveal.js')
  v('la landing ne promet plus la page en ligne au bout des cinq étapes',
    !/Cinq étapes, et ta page part en ligne/.test(landing) && /Cinq étapes, et ton espace s&rsquo;ouvre\./.test(landing))
  v('la landing prévient aussi des papiers', /garde sous la main ta carte d&rsquo;identité/.test(landing))
  v('le score d inscription exige la même longueur',
    /trim\(\)\.length >= MIN_PRESENTATION/.test(code('lib/score-onboarding.js')))
}

// ═══ 12) CHAQUE IMAGE DANS LE DOSSIER DE SON COMMERCE (29/09) ═══════════════
//
// 🔴 Tout compte connecté pouvait remplacer ou supprimer les images de
// n'importe quel commerce : rien dans leur chemin ne disait à qui elles
// étaient. La policy lit désormais le premier dossier.
{
  const { cheminImage, objetDepuisUrl, BUCKET_IMAGES } = await import('../lib/stockage-images.js')
  v('le bucket est celui des policies', BUCKET_IMAGES === 'logos')
  v('une image se range dans le dossier de son commerce', cheminImage('c1', 'gal-1.jpg') === 'c1/gal-1.jpg')
  let leve = false
  try { cheminImage('', 'gal.jpg') } catch { leve = true }
  v('une image sans commerce est refusée, jamais rangée à la racine', leve)
  let leve2 = false
  try { cheminImage('c1', 'a/b.jpg') } catch { leve2 = true }
  v('un nom ne peut pas s inventer un autre dossier', leve2)
  const base = 'https://x.supabase.co/storage/v1/object/public/logos/'
  v('le chemin complet se relit depuis l adresse', objetDepuisUrl(`${base}c1/gal-1.jpg?t=2`) === 'c1/gal-1.jpg')
  v('une ancienne image à plat se relit aussi', objetDepuisUrl(`${base}gal-c1-1.jpg`) === 'gal-c1-1.jpg')
  v('une adresse étrangère ne donne rien', objetDepuisUrl('https://exemple.be/photo.jpg') === null)

  const dash = code('app/dashboard/ConfigDashboard.js')
  const signup = code('app/signup/page.js')
  const envois = (src) => (src.match(/\.from\('logos'\)\.upload\(/g) || []).length
  const ranges = (src) => (src.match(/const fileName = cheminImage\(/g) || []).length
  v('chaque envoi du tableau de bord passe par la règle', envois(dash) >= 10 && ranges(dash) === envois(dash), `${ranges(dash)} / ${envois(dash)}`)
  v('chaque envoi de l inscription passe par la règle', envois(signup) >= 4 && ranges(signup) === envois(signup), `${ranges(signup)} / ${envois(signup)}`)
  v('aucune suppression ne coupe l adresse au dernier « / »',
    !/split\('\/'\)\.pop\(\)/.test(dash + signup) && !/segments\[segments\.length - 1\]/.test(signup))
  v('les pièces d identité gardent leur propre rangement',
    /const fileName = `\$\{user\.id\}\/\$\{commercant\.id\}_\$\{kind\}_/.test(signup))
}

console.log(`\nUne fiche n'est montrée que complète : ${ok} vérifications`)

if (echecs.length > 0) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
