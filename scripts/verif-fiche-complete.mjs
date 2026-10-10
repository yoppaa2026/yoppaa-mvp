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
const bilan = (c, nbCatalogue = 5, nbPhotos = 3, nbLieuxSitues = 1) => ficheComplete({ commercant: c, nbCatalogue, nbPhotos, nbLieuxSitues, maintenant: MAINTENANT })
const cles = (b) => b.criteres.map(k => k.cle).join(',')
const manque = (b) => b.manquants.map(k => k.cle).join(',')

// ═══ 1) LA LISTE D'ALEX, ET RIEN QU'ELLE ════════════════════════════════════
{
  v('les seuils sont ceux décidés le 28/09', MIN_CATALOGUE === 3 && MIN_PHOTOS === 2 && MIN_PRESENTATION === 20,
    `${MIN_CATALOGUE}/${MIN_PHOTOS}/${MIN_PRESENTATION}`)
  const b = bilan(BOULANGERIE)
  // ⚠️ REPOINTÉE LE 06/10 : un septième critère, « Où me trouver » (Alex).
  v('une fiche en Vendre porte les sept critères', cles(b) === 'catalogue,photos,logo,presentation,lieu,horaires,paiement', cles(b))
  v('une fiche qui a tout est complète', b.complet === true && b.manquants.length === 0, manque(b))
  v('le compte « fait » suit', b.faits === 7 && b.total === 7, `${b.faits}/${b.total}`)
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

// ═══ 3 bis) « OÙ ME TROUVER » EST OBLIGATOIRE (Alex, 06/10) ═════════════════
//
// 🔴 L'adresse d'inscription ne localise JAMAIS le commerce : c'est d'un lieu
// situé que se mesure la distance des cards. Une seule règle, pour tous, sans
// exception : le food truck la remplit avec ses emplacements.
{
  v('aucun lieu situé : il manque l adresse', manque(bilan(BOULANGERIE, 5, 3, 0)) === 'lieu')
  v('un lieu situé suffit', bilan(BOULANGERIE, 5, 3, 1).complet === true)
  v('un comptage illisible vaut zéro, jamais « complet »', bilan(BOULANGERIE, 5, 3, NaN).complet === false)
  v('sans comptage fourni, le lieu manque (jamais présumé)', manque(ficheComplete({ commercant: BOULANGERIE, nbCatalogue: 5, nbPhotos: 3, maintenant: MAINTENANT })) === 'lieu')
  const camion = { ...BOULANGERIE, siege_social_est_lieu_activite: false, horaires_detail: null }
  v('🔴 le commerce mobile n en est PAS dispensé', manque(bilan(camion, 5, 3, 0)) === 'lieu')
  const coiffeur = { ...BOULANGERIE, categorie: 'vitrine', plan: 'exister', horaires_detail: null }
  v('le service en Exister non plus', manque(bilan(coiffeur, 5, 3, 0)) === 'lieu')
  const k = bilan(BOULANGERIE, 5, 3, 0).criteres.find(x => x.cle === 'lieu')
  v('le critère mène au sous-onglet « Où me trouver »', k.onglet === 'profil' && k.sousOnglet === 'lieux', `${k.onglet}/${k.sousOnglet}`)
  v('l aide dit que l inscription ne localise pas', /inscription ne sert qu’à valider ton dossier/.test(k.aide), k.aide)
  const bandeau = code('app/dashboard/BandeauFicheAPublier.js')
  v('« Compléter » écrit le sous-onglet AVANT d ouvrir le Profil',
    /if \(k\.sousOnglet\) ecrireSousOnglet\(k\.sousOnglet\)\s*onAllerA\(k\.onglet\)/.test(bandeau))
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
  // 🔴 REPOINTÉE LE 03/10 : elle cherchait « Fait » dans TOUT l'email, et la
  // pastille des deux temps de l'inscription (`deuxTemps`, ajoutée le 30/09) en
  // porte un. Depuis ce jour-là, retirer « Fait » du tableau des critères la
  // laissait verte : la mutation du harnais survivait. Elle vise désormais la
  // cellule de CHAQUE critère atteint, juste après son libellé.
  const atteints = b.criteres.filter(k => k.atteint)
  const echappe = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  v('la relance montre aussi ce qui est fait, critère par critère',
    atteints.length > 0 && atteints.every(k => new RegExp(`${echappe(k.label)}\\s*</td>\\s*<td[^>]*>\\s*Fait\\s*</td>`).test(html)),
    `${atteints.length} critère(s) atteint(s)`)
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
    // ⚠️ REPOINTÉE LE 06/10 : le select lit aussi `kyb_statut`.
    /\.select\('id, nom, slug, statut_publication, kyb_statut'\)/.test(valider))
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
  // ⚠️ REPOINTÉE LE 06/10 : quatre comptes, les lieux situés en plus.
  v('le serveur compte quatre choses', fs.length === 4, fs.join(' | '))
  v('le serveur compte les lieux actifs ET situés',
    fs.includes("commercant_lieux.eq('commercant_id',ID).eq('actif',true).not('latitude','is',null).not('longitude','is',null"), fs.join(' | '))
  v('l encart compte les quatre mêmes, avec les mêmes filtres', fs.join(' | ') === fb.join(' | '), `serveur: ${fs.join(' | ')} / encart: ${fb.join(' | ')}`)
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
  const sain = { articles: { count: 2, error: null }, rdv_prestations: { count: 1, error: null }, commercant_photos: { count: 2, error: null }, commercant_lieux: { count: 1, error: null } }
  const comptes = await comptesDeLaFiche(fauxClient(sain), 'id')
  v('le serveur additionne articles et prestations', comptes.nbCatalogue === 3 && comptes.nbPhotos === 2, JSON.stringify(comptes))
  v('le serveur rend le nombre de lieux situés', comptes.nbLieuxSitues === 1, JSON.stringify(comptes))
  let leveLieux = null
  try {
    await comptesDeLaFiche(fauxClient({ ...sain, commercant_lieux: { count: null, error: { message: 'refus' } } }), 'id')
  } catch (e) { leveLieux = e.message }
  v('une lecture des lieux en échec n est pas un zéro', /lieux impossible : refus/.test(leveLieux || ''), String(leveLieux))
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
  // ⚠️ RETIRÉES LE 06/10 (décision d'Alex : inscription en 3 étapes) : la
  // présentation a quitté l'inscription, son compteur avec elle. Le blocage du
  // 29/09 ne peut donc plus se produire ici ; la présentation s'écrit au
  // tableau de bord, et « fiche complète » l'exige avant la publication avec le
  // même seuil (MIN_PRESENTATION, gardé plus haut dans ce banc).
  v('🔴 la présentation ne bloque plus l’inscription (06/10)',
    !/presentationManque/.test(signup) && !/MIN_PRESENTATION/.test(signup)
    && /const valide =\s*form\.nom\.trim\(\)\.length >= 2 &&\s*form\.type\.trim\(\)\.length > 0 &&\s*form\.adresse\.trim\(\)\.length > 0 &&\s*form\.telephone\.trim\(\)\.length >= 8 &&\s*\(\(form\.latitude && form\.longitude\) \|\| sansPositionAssumee\)/.test(signup))
  // 🔴 CE QU'IL FAUT AVOIR SOUS LA MAIN, DIT EN PREMIER (Alex, 29/09) : le
  // contrôle d'identité arrive à la dernière étape, c'est là qu'on abandonne.
  const iAvant = signup.indexOf('Avant de commencer, garde ceci sous la main')
  const iOffre = signup.indexOf('La formule <span style={{ color: T.light }}>Exister</span> est gratuite à vie.')
  const iCompte = signup.indexOf('<Card titre="Ton compte">')
  v('l inscription annonce les papiers AVANT tout le reste de la première page',
    iAvant > 0 && iAvant < iOffre && iAvant < iCompte)
  // ⚠️ REPOINTÉE LE 09/10 : la carte d'identité n'est plus demandée (Alex,
  // « socle minimal »). L'encadré nomme le numéro, et DIT qu'aucune pièce
  // d'identité n'est demandée : c'est elle qui faisait fuir.
  v('elle nomme le numéro d entreprise, et dit qu aucune pièce d identité n est demandée',
    /Ton numéro d&rsquo;entreprise \(BCE\)<\/strong>/.test(signup) && !/Ta carte d&rsquo;identité<\/strong>/.test(signup)
    && /Aucune pièce d&rsquo;identité n&rsquo;est demandée/.test(signup))
  const landing = code('app/components/LandingReveal.js')
  // ⚠️ REPOINTÉE LE 06/10 : trois étapes, plus cinq (décision d'Alex). La
  // landing et sa maquette disent le parcours tel qu'il est.
  v('la landing ne promet plus la page en ligne au bout des étapes',
    !/étapes, et ta page part en ligne/.test(landing) && /Trois étapes, et ton espace s&rsquo;ouvre\./.test(landing))
  v('🔴 la maquette de la landing montre les trois étapes, sans score de 60',
    /\['Compte', 'L’essentiel', 'Vérification'\]\.map/.test(landing) && !/Minimum 60 \/ 100/.test(landing) && !/Étape 5 sur 5/.test(landing))
  // ⚠️ REPOINTÉE LE 09/10 : le numéro seul, et plus de carte, ni dans le
  // texte ni dans la maquette.
  v('la landing prévient du numéro, et plus de la carte',
    /garde sous la main ton numéro d&rsquo;entreprise/.test(landing) && !/carte d&rsquo;identité|Carte d’identité/.test(landing))
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
  // ⚠️ REPOINTÉE LE 06/10 : l'inscription n'envoie plus aucune image (étape
  // « Visuels » supprimée) ; le logo provisoire, venu d'elle, passe par la règle
  // au tableau de bord (compté dans la ligne au-dessus).
  v('l inscription n envoie plus aucune image au bucket public (06/10)', envois(signup) === 0, `${envois(signup)}`)
  v('aucune suppression ne coupe l adresse au dernier « / »',
    !/split\('\/'\)\.pop\(\)/.test(dash + signup) && !/segments\[segments\.length - 1\]/.test(signup))
  // ⚠️ RETIRÉE LE 09/10, AVEC SON MOTIF : elle gardait le rangement des
  // pièces d'identité, et il n'y a plus de pièces d'identité. Remplacée par
  // l'inverse : plus aucun envoi vers leur espace, nulle part.
  v('🔴 plus aucun envoi vers l espace des cartes d identité (09/10)',
    !/kyb_documents/.test(signup) && !/kyb_documents/.test(dash) && !/kyb_id_(recto|verso)_url/.test(signup + dash))
}

// ═══ L'INSCRIPTION EN 3 ÉTAPES ET LES CGU PROUVÉES (Alex, 06/10) ════════════
{
  const { ETAPES_INSCRIPTION, DERNIERE_ETAPE, etapeReprise, libelleEtape, decompteParEtape } = await import('../lib/etapes-inscription.js')
  v('🔴 trois étapes : Compte, L’essentiel, Vérification',
    ETAPES_INSCRIPTION.map(e => e.label).join('|') === 'Compte|L’essentiel|Vérification' && DERNIERE_ETAPE === 3)
  v('🔴 une inscription de l’ancien parcours reprend à la vérification',
    [3, 4, 5].every(n => etapeReprise(n) === 3), [3, 4, 5].map(etapeReprise).join(','))
  v('une étape absente ou illisible reprend à L’essentiel',
    etapeReprise(null) === 2 && etapeReprise(undefined) === 2 && etapeReprise('x') === 2 && etapeReprise(1) === 2 && etapeReprise(2) === 2)
  v('l’admin lit le nom de l’étape', libelleEtape(5) === 'Vérification' && libelleEtape(2) === 'L’essentiel')
  const d = decompteParEtape([{ id: 'a' }, { id: 'b' }, { id: 'c' }], { a: 2, b: 5, c: 4 })
  v('le décompte par étape compte les anciennes étapes à la vérification',
    d.map(e => `${e.label}:${e.nb}`).join(',') === 'L’essentiel:1,Vérification:2', JSON.stringify(d))

  const { CGU_COMMERCANT_VERSION, cguAJour } = await import('../lib/cgu.js')
  v('🔴 la version des CGU suit la date de la page légale',
    /Dernière mise à jour : 6 octobre 2026/.test(lire('app/legal/page.js')) && CGU_COMMERCANT_VERSION === '2026-10-06')
  v('🔴 seule la version EN VIGUEUR vaut acceptation',
    cguAJour({ cgu_version: CGU_COMMERCANT_VERSION }) && !cguAJour({ cgu_version: '2026-01-01' }) && !cguAJour({}) && !cguAJour(null))

  const signup = code('app/signup/page.js')
  // ⚠️ SUIVIE LE 09/10 : la déclaration sur l'honneur s'ajoute aux deux.
  v('🔴 l’envoi attend le KYB, la case des CGU ET la déclaration, plus aucun score',
    /const peutSoumettre = kybRempli && cguCochees && declarationCochee && !!texteDecl/.test(signup) && !/score\.peutSoumettre/.test(signup) && !/SEUIL_SOUMISSION/.test(signup))
  v('🔴 les CGU sont enregistrées par le serveur AVANT que le dossier parte',
    signup.indexOf("fetch('/api/commercant/accepter-cgu'") > 0
    && signup.indexOf("fetch('/api/commercant/accepter-cgu'") < signup.indexOf("statut: 'en_attente_validation'"))
  v('un refus d’enregistrement arrête l’envoi', /if \(!rCgu\.ok \|\| !jCgu\?\.ok\) \{[\s\S]{0,200}setSubmitting\(false\)\s*return\s*\}/.test(signup))
  // 🔴 07/10 : la fiche passait en troisième, sans que personne lise son
  // erreur. « Demande envoyée ! » s'affichait sur une fiche restée brouillon.
  const posFiche = signup.indexOf("statut_publication: 'en_attente',")
  v('🔴 la fiche passe en attente AVANT l’onboarding, une seule fois',
    posFiche > 0 && posFiche < signup.indexOf("statut: 'en_attente_validation'")
    && signup.indexOf("statut_publication: 'en_attente',", posFiche + 1) === -1)
  v('🔴 un échec de la fiche arrête l’envoi (rien n’est annoncé)',
    /if \(cErr \|\| !c\) \{[\s\S]{0,200}setSubmitting\(false\)\s*return\s*\}\s*onUpdate\(c\)/.test(signup))
  v('l’inscription reprend par la règle partagée', (signup.match(/etapeReprise\(/g) || []).length === 2)

  const route = code('app/api/commercant/accepter-cgu/route.js')
  v('🔴 la route n’accepte que la version en vigueur', /if \(version !== CGU_COMMERCANT_VERSION\) \{\s*return NextResponse\.json/.test(route))
  v('🔴 la route refuse qui n’est pas le titulaire (pas d’exception admin)',
    /\.eq\('auth_user_id', user\.id\)/.test(route) && /if \(!ids\.includes\(commercant_id\)\) \{\s*return NextResponse\.json\(\{ ok: false, error: 'accès refusé' \}, \{ status: 403 \}\)/.test(route)
    && !/adminVerifie|gardeCommercant/.test(route))
  v('🔴 l’heure est celle du serveur, et le journal est écrit avant la fiche',
    /const maintenant = new Date\(\)\.toISOString\(\)/.test(route)
    && route.indexOf(".from('cgu_acceptations').insert(") < route.indexOf(".from('commercants')\n      .update({ cgu_version"))

  const bord = code('app/dashboard/page.js')
  v('🔴 un inscrit d’avant accepte à sa prochaine connexion, jamais en mode emprunt',
    /if \(commercant && !impersonating && !cguAJour\(commercant\)\) return \(\s*<EcranCgu/.test(bord))
  v('l’écran d’acceptation passe par la route', /fetch\('\/api\/commercant\/accepter-cgu'/.test(code('app/dashboard/EcranCgu.js')))

  const sql = lire('migrations/MIGRATION_CGU_COMMERCANT.sql').split('-- ─── Contrôle')[0]
  v('🔴 la base refuse que le navigateur écrive l’acceptation',
    /IF auth\.uid\(\) IS NULL THEN\s*RETURN NEW;/.test(sql) && /BEFORE INSERT OR UPDATE OF cgu_version, cgu_acceptees_at ON public\.commercants/.test(sql))
  v('le journal est fermé à tous sauf au serveur',
    /ALTER TABLE public\.cgu_acceptations ENABLE ROW LEVEL SECURITY;/.test(sql) && /REVOKE ALL ON public\.cgu_acceptations FROM PUBLIC, anon, authenticated;/.test(sql) && !/CREATE POLICY/.test(sql))
}

// ═══ PAS D'ESPACE OUVERT NI DE FICHE EN LIGNE SANS KYB (Alex, 06/10) ═══════
// Trois portes, une règle (`refusKyb`), et la même en base.
{
  const { refusKyb } = await import('../lib/statut-commercant.js')
  v('🔴 KYB validé : rien ne bloque', refusKyb({ kyb_statut: 'valide' }) === null)
  v('🔴 KYB en attente, refusé, jamais démarré ou absent : refusé',
    ['en_attente', 'rejete', 'non_demarre', null, undefined].every(k => typeof refusKyb({ kyb_statut: k }) === 'string')
    && typeof refusKyb(null) === 'string')

  const valider = code('app/api/admin/valider/route.js')
  v('🔴 « Valider » lit le KYB et refuse AVANT d’écrire',
    /select\('id, nom, slug, statut_publication, kyb_statut'\)/.test(valider)
    && /const refusIdentite = refusKyb\(existant\)\s*if \(refusIdentite\) \{\s*return NextResponse\.json/.test(valider)
    && valider.indexOf('refusKyb(existant)') < valider.indexOf('.update(updates)'))
  const publier = code('app/api/admin/publier/route.js')
  v('🔴 « Publier » lit le KYB et refuse AVANT d’écrire',
    /\.select\('statut_publication, kyb_statut'\)/.test(publier)
    && /const refusIdentite = refusKyb\(identite\)\s*if \(refusIdentite\) \{\s*return NextResponse\.json/.test(publier)
    && publier.indexOf('refusKyb(identite)') < publier.indexOf("statut_publication: 'publie'"))
  v('« Publier » : une lecture du KYB en échec n’est pas un feu vert', /if \(errKyb\) return NextResponse\.json\(\{ ok: false/.test(publier))
  const modale = code('app/admin/ModalEditCommercant.js')
  v('🔴 la fenêtre « Modifier » ne met plus une fiche en ligne',
    /if \(form\.statut_publication === PUBLICATION_OUVERTE && commercant\.statut_publication !== PUBLICATION_OUVERTE\) \{\s*return setError\(/.test(modale)
    && modale.indexOf('PUBLICATION_OUVERTE && commercant.statut_publication !== PUBLICATION_OUVERTE) {') < modale.indexOf(".from('commercants')\n        .update(updates)"))
  const sql = lire('migrations/MIGRATION_KYB_AVANT_PUBLICATION.sql').split('-- ─── Contrôle')[0]
  v('🔴 la base refuse d’ouvrir sans KYB', /IF NEW\.statut IN \('valide', 'actif'\)\s*AND \(TG_OP = 'INSERT' OR OLD\.statut IS DISTINCT FROM NEW\.statut\) THEN\s*RAISE EXCEPTION/.test(sql))
  v('🔴 la base refuse de publier sans KYB', /IF NEW\.statut_publication = 'publie'\s*AND \(TG_OP = 'INSERT' OR OLD\.statut_publication IS DISTINCT FROM 'publie'\) THEN\s*RAISE EXCEPTION/.test(sql))
  v('le déclencheur porte sur ouverture, publication et KYB', /BEFORE INSERT OR UPDATE OF statut, statut_publication, kyb_statut ON public\.commercants/.test(sql))
}

// ═══ LA FIN DE LA CARTE D'IDENTITÉ, LA DÉCLARATION SUR L'HONNEUR (Alex, 09/10) ═
// « Socle minimal » : plus de carte, le BCE vérifié au registre, une
// déclaration PROUVÉE, et les colonnes sensibles réservées au serveur.
{
  const { DECLARATION_VERSION, texteDeclaration, declarationAJour, lienFicheBCE, origineRequete } = await import('../lib/declaration.js')
  // ⚠️ « a AVANT b » EXIGE QUE LES DEUX EXISTENT : un texte introuvable rend -1,
  // et -1 est « avant » tout. Sans cette exigence, la garde est verte à vide.
  const avant = (s, a, b) => { const i = s.indexOf(a), j = s.indexOf(b); return i >= 0 && j >= 0 && i < j }

  // ── La règle, EXÉCUTÉE ────────────────────────────────────────────────────
  const t = texteDeclaration({ prenom: ' Alex ', nom: 'Martin', bce: '0731.637.148', commerce: 'Chez Momo' })
  v('🔴 la déclaration nomme la personne, le numéro formaté et le commerce',
    typeof t === 'string' && t.includes('Alex Martin') && t.includes('0731.637.148') && t.includes('« Chez Momo »'), t)
  v('🔴 pas de déclaration à trous : numéro invalide, nom trop court ou commerce absent',
    texteDeclaration({ prenom: 'Alex', nom: 'Martin', bce: '0731.637.149', commerce: 'X' }) === null
    && texteDeclaration({ prenom: 'A', nom: 'Martin', bce: '0731637148', commerce: 'X' }) === null
    && texteDeclaration({ prenom: 'Alex', nom: 'Martin', bce: '0731637148', commerce: ' ' }) === null
    && texteDeclaration({}) === null)
  v('le même numéro saisi autrement donne le même texte (le serveur compare des textes)',
    texteDeclaration({ prenom: 'Alex', nom: 'Martin', bce: 'BE 0731 637 148', commerce: 'Chez Momo' }) === t)
  v('aucun tiret cadratin dans le texte déclaré', !/—/.test(t))
  v('🔴 seule la version EN VIGUEUR vaut déclaration',
    declarationAJour({ declaration_version: DECLARATION_VERSION }) && !declarationAJour({ declaration_version: '2026-01-01' })
    && !declarationAJour({}) && !declarationAJour(null))
  v('le lien du registre vise le numéro, et rien pour un numéro faux',
    lienFicheBCE('0731.637.148') === 'https://kbopub.economie.fgov.be/kbopub/toonondernemingps.html?ondernemingsnummer=0731637148&lang=fr'
    && lienFicheBCE('0731.637.149') === null && lienFicheBCE(null) === null)
  const h = (o) => ({ get: (k) => o[k] ?? null })
  const o1 = origineRequete(h({ 'x-forwarded-for': ' 81.2.3.4 , 10.0.0.1', 'user-agent': 'Mozilla/5.0' }))
  v('🔴 l’adresse IP est celle du client (la première), pas celle d’un relais',
    o1.ip === '81.2.3.4' && o1.navigateur === 'Mozilla/5.0', JSON.stringify(o1))
  const o2 = origineRequete(h({ 'x-real-ip': '9.9.9.9', 'user-agent': 'x'.repeat(900) }))
  v('repli sur x-real-ip, et un navigateur borné', o2.ip === '9.9.9.9' && o2.navigateur.length === 400)
  const o3 = origineRequete(h({}))
  v('sans en-têtes : null, jamais une chaîne vide', o3.ip === null && o3.navigateur === null)

  // ── La route : le titulaire seul, le texte vu, la preuve d'abord ──────────
  const route = code('app/api/commercant/declarer/route.js')
  v('🔴 la route refuse qui n’est pas le titulaire (pas d’exception admin)',
    /if \(!fiche \|\| fiche\.auth_user_id !== user\.id\) \{\s*return NextResponse\.json\(\{ ok: false, error: 'accès refusé' \}, \{ status: 403 \}\)/.test(route)
    && !/adminVerifie|gardeCommercant/.test(route))
  v('🔴 la route n’accepte que la version en vigueur', /if \(version !== DECLARATION_VERSION\) \{\s*return NextResponse\.json/.test(route))
  v('🔴 le texte enregistré est celui que l’écran a montré, sinon refus',
    /if \(!texteServeur \|\| texte !== texteServeur\) \{\s*return NextResponse\.json/.test(route)
    && avant(route, 'texte !== texteServeur', ".from('declarations_honneur').insert("))
  v('🔴 la fiche fait foi : la requête ne complète que ce qui manque',
    /const bce = bceFiche\.valide \? bceFiche\.raw : \(bceDemande\.valide \? bceDemande\.raw : null\)/.test(route)
    && /if \(!bceFiche\.valide\) complement\.bce = bce/.test(route))
  v('🔴 la preuve d’abord, la fiche ensuite, et les deux erreurs sont lues',
    avant(route, ".from('declarations_honneur').insert(", "declaration_version: DECLARATION_VERSION, declaration_acceptee_at: maintenant")
    && /if \(errJournal\) \{/.test(route) && /if \(errMaj\) return NextResponse\.json/.test(route))
  v('🔴 la preuve garde le texte, le numéro, les noms, l’IP et le navigateur',
    /texte: texteServeur,\s*bce,\s*representant_prenom: prenom,\s*representant_nom: nom,\s*ip,\s*navigateur,/.test(route))
  v('les CGU gardent aussi l’IP et le navigateur',
    /acceptee_at: maintenant, ip, navigateur \}/.test(code('app/api/commercant/accepter-cgu/route.js')))

  // ── Les écrans ────────────────────────────────────────────────────────────
  const bord = code('app/dashboard/page.js')
  v('🔴 un inscrit d’avant déclare à sa prochaine connexion, après les CGU, jamais en mode emprunt',
    /if \(commercant && !impersonating && !declarationAJour\(commercant\)\) return \(\s*<EcranDeclaration/.test(bord)
    && avant(bord, '!cguAJour(commercant)', '!declarationAJour(commercant)'))
  const ecran = code('app/dashboard/EcranDeclaration.js')
  v('l’écran envoie le texte qu’il affiche, construit par la règle partagée',
    /const texte = texteDeclaration\(/.test(ecran) && /fetch\('\/api\/commercant\/declarer'/.test(ecran)
    && /body: JSON\.stringify\(\{ commercant_id: commercant\.id, version: DECLARATION_VERSION, texte,/.test(ecran))
  v('l’écran dit à ceux qui en avaient envoyé une que leur carte est supprimée',
    /\{commercant\.carte_supprimee_at && \(/.test(ecran))
  v('le bouton montre qu’il travaille', /\{enCours && <DotsAttente/.test(ecran))

  const signup = code('app/signup/page.js')
  v('🔴 à l’inscription, la déclaration part APRÈS les CGU et AVANT le dossier',
    avant(signup, "fetch('/api/commercant/accepter-cgu'", "fetch('/api/commercant/declarer'")
    && avant(signup, "fetch('/api/commercant/declarer'", "statut_publication: 'en_attente',"))
  v('🔴 un refus de la déclaration arrête l’envoi', /if \(!rDecl\.ok \|\| !jDecl\?\.ok\) \{[\s\S]{0,200}setSubmitting\(false\)\s*return\s*\}/.test(signup))
  v('🔴 le texte déclaré vient de la fiche ENREGISTRÉE, pas de la saisie en cours',
    /const texteDecl = texteDeclaration\(\{\s*prenom: commercant\.representant_legal_prenom,\s*nom: commercant\.representant_legal_nom,\s*bce: commercant\.bce,\s*commerce: commercant\.nom,\s*\}\)/.test(signup))
  v('un texte qui change décoche la case', /useEffect\(\(\) => \{ setDeclarationCochee\(false\) \}, \[texteDecl\]\)/.test(signup))
  v('🔴 la carte d’identité n’est plus exigée pour envoyer', !/kybManques\.push\('carte/.test(signup) && !/UploadIdentite/.test(signup))

  // ── L'admin ──────────────────────────────────────────────────────────────
  const valider = code('app/api/admin/kyb/valider/route.js')
  v('🔴 pas de validation sans déclaration en vigueur, refus AVANT d’écrire',
    /if \(avant\.declaration_version !== DECLARATION_VERSION\) \{\s*return NextResponse\.json/.test(valider)
    && avant(valider, 'avant.declaration_version !== DECLARATION_VERSION', "kyb_statut: 'valide',"))
  for (const [nom, src] of [['valider', valider], ['rejeter', code('app/api/admin/kyb/rejeter/route.js')]]) {
    v(`🔴 « ${nom} » lit l’erreur du journal et la rend à l’écran`,
      /const \{ error: errJournal \} = await supabase\.from\('admin_validations'\)\.insert\(/.test(src)
      && /journal: errJournal \? `echec : \$\{errJournal\.message\}` : 'ecrit'/.test(src))
  }
  const section = code('app/admin/SectionKYBAValider.js')
  v('l’admin ouvre la fiche du registre, et ne valide pas sans déclaration',
    /const lienRegistre = lienFicheBCE\(dossier\.bce\)/.test(section) && /disabled=\{disabled \|\| !declare\}/.test(section)
    && !/kyb_documents|createSignedUrl|kyb_id_/.test(section))
  // 🔴 10/10, TROUVÉ PAR ALEX : « valider espace = erreur, accès refusé ». La
  // page admin gardait le jeton lu à son ouverture, AVANT le code à six
  // chiffres : sans double authentification, toutes les routes le refusaient.
  for (const f of ['app/admin/page.js', 'app/admin/SectionKYBAValider.js']) {
    const src = code(f)
    v(`🔴 ${f} relit le jeton au moment de l’appel, jamais celui de l’ouverture`,
      !/session\??\.access_token/.test(src) && (src.match(/await jetonActuel\(\)/g) || []).length >= 2
      && /async function jetonActuel\(\) \{\s*const \{ data: \{ session: s \} \} = await supabase\.auth\.getSession\(\)/.test(src))
  }
  v('la suppression d’un commerçant n’efface pas les preuves',
    !/'kyb_documents'|'cgu_acceptations'|'declarations_honneur'/.test(code('app/api/admin/commercants/route.js')))

  // ── Le compte de paiement s'écrit par le serveur ─────────────────────────
  const lien = code('app/api/stripe/connect/create-account-link/route.js')
  const etat = code('app/api/stripe/connect/refresh-status/route.js')
  v('🔴 la route de connexion écrit le compte avec la clé du serveur, deux fois',
    (lien.match(/await admin\s*\.from\('commercants'\)\s*\.update\(/g) || []).length === 2
    && !/await supabase\s*\.from\('commercants'\)\s*\.update\(/.test(lien))
  v('🔴 et la propriété est vérifiée AVANT', avant(lien, 'commercant.auth_user_id !== user.id', 'const admin = clientAdmin()'))
  v('🔴 la route d’état aussi, et elle lit son erreur',
    /const \{ error: errMaj \} = await clientAdmin\(\)\s*\.from\('commercants'\)\s*\.update\(updates\)/.test(etat)
    && !/await supabase\s*\.from\('commercants'\)\s*\.update\(/.test(etat)
    && avant(etat, 'commercant.auth_user_id !== user.id', 'clientAdmin()'))

  // ── Les migrations ────────────────────────────────────────────────────────
  const m1 = lire('migrations/MIGRATION_VERIFICATION_1_DECLARATION.sql').split('-- ─── CONTRÔLE')[0]
  v('🔴 le journal des déclarations est fermé à tous sauf au serveur',
    /ALTER TABLE public\.declarations_honneur ENABLE ROW LEVEL SECURITY;/.test(m1)
    && /REVOKE ALL ON public\.declarations_honneur FROM PUBLIC, anon, authenticated;/.test(m1) && !/CREATE POLICY/.test(m1))
  v('🔴 les preuves survivent au compte (SET NULL, et la date de suppression notée AVANT)',
    /commercant_id\s+uuid REFERENCES public\.commercants\(id\) ON DELETE SET NULL/.test(m1)
    && /FOREIGN KEY \(commercant_id\) REFERENCES public\.commercants\(id\) ON DELETE SET NULL/.test(m1)
    && /BEFORE DELETE ON public\.commercants/.test(m1))
  v('🔴 la base refuse que le navigateur écrive la déclaration',
    /BEFORE INSERT OR UPDATE OF declaration_version, declaration_acceptee_at, carte_supprimee_at/.test(m1))
  v('les contraintes sont LUES avant d’être remplacées',
    /RAISE EXCEPTION 'admin_validations : contrainte inattendue/.test(m1) && /RAISE EXCEPTION 'signalements_type_check : motif % absent/.test(m1))

  const m2 = lire('migrations/MIGRATION_VERIFICATION_2_VERROUS_FIN_CARTE.sql').split('-- ─── CONTRÔLE')[0]
  const verrou = (m2.split('CREATE OR REPLACE FUNCTION public.commercants_colonnes_serveur()')[1] || '').split('$$;')[0]
  const colonnesStripe = ['stripe_account_id', 'stripe_account_id_precedent', 'stripe_account_mode',
    'stripe_account_charges_enabled', 'stripe_account_details_submitted', 'stripe_account_payouts_enabled', 'stripe_onboarding_done_at']
  // 🔴 ORDRE MESURÉ PAR POSITION DE REGEX, JAMAIS PAR `indexOf` d'un texte à
  // espace simple : la migration aligne ses colonnes avec plusieurs espaces,
  // `indexOf` rendait -1, et -1 est plus petit que tout. La garde était verte
  // à vide ; la mutation « l'admin peut changer le compte » l'a montré.
  const posStripe = colonnesStripe.map(c => verrou.search(new RegExp(`NEW\\.${c}\\s+IS DISTINCT FROM OLD\\.${c}`)))
  const posAdmin = verrou.search(/IF public\.is_yoppaa_admin\(\) THEN/)
  v('🔴 le verrou refuse au navigateur CHAQUE colonne du compte de paiement, admin compris',
    posStripe.every(p => p > 0) && posAdmin > 0 && posStripe.every(p => p < posAdmin), `${posStripe.join(',')} / admin ${posAdmin}`)
  v('🔴 une entreprise vérifiée ne change plus d’identité depuis le navigateur',
    /IF coalesce\(OLD\.kyb_statut, ''\) = 'valide'\s*AND \(NEW\.bce IS DISTINCT FROM OLD\.bce/.test(verrou))
  v('🔴 une fiche créée depuis le navigateur naît sans compte de paiement',
    colonnesStripe.every(c => new RegExp(`NEW\\.${c}\\s*:=`).test(verrou)))
  v('🔴 le verrou s’arrête si une colonne qu’il nomme manque (sinon plus rien ne s’enregistre)',
    avant(m2, "RAISE EXCEPTION 'Colonnes absentes de commercants", 'CREATE OR REPLACE FUNCTION public.commercants_colonnes_serveur()'))
  v('🔴 plus aucune règle d’accès aux cartes, et les concernés marqués AVANT la suppression des chemins',
    ['kyb_insert_own', 'kyb_delete_own', 'kyb_select_own_or_admin'].every(p => m2.includes(`DROP POLICY IF EXISTS ${p} ON storage.objects;`))
    && avant(m2, 'SET carte_supprimee_at = now()', 'DROP COLUMN IF EXISTS kyb_id_recto_url'))
  const script = code('scripts/supprimer-cartes-identite.mjs')
  v('🔴 le script est à blanc par défaut, et exige l’identifiant du projet',
    /const supprimer = args\.includes\('--supprimer'\)/.test(script) && /if \(projetConfirme !== ref\) \{/.test(script)
    && avant(script, 'if (!supprimer)', '.remove(lot)'))
  v('le script relit avant de supprimer l’espace', avant(script, 'const restants = await lister()', 'deleteBucket(ESPACE)'))
}

console.log(`\nUne fiche n'est montrée que complète : ${ok} vérifications`)

if (echecs.length > 0) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
