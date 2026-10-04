// BANC : L'ÉQUIPE D'UN COMMERCE (29/09).
//
// Le personnel et les livreurs entrent avec leur propre compte, et ne font que
// ce que le patron a coché. Ce banc EXÉCUTE les règles (`lib/equipe.js`), puis
// vise dans les routes les endroits où une erreur ouvrirait une porte : la
// garde, le commerce qui borne chaque écriture, le jeton jamais gardé en clair,
// l'adresse qui doit correspondre, les tables fermées en base.
//
//   npm run verif:equipe

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { sansProse } from './lire-code.mjs'
import {
  EQUIPE_MAX, DROITS, CLES_DROITS, colonneDroit, droitsDepuis, refusDroits, adresseValable,
  commerceAUneEquipe, refusInvitation, refusExpiration, membreEnActivite, peutAgir, invitationOuverte,
  refusAcceptation, membrePourLePatron, libelleFinAcces, EQUIPE_DANS_LA_BARRE,
} from '../lib/equipe.js'
import { empreinteJeton, nouveauJeton, adresseMasquee, lienInvitation, COLONNES_MEMBRE } from '../lib/equipe-server.js'
import { layout, emailInvitationEquipe } from '../lib/resend.js'
import { PLAN_FEATURES } from '../lib/plans.js'

let ok = 0
const echecs = []
const v = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  echecs.push(`${nom}${detail ? ` — ${detail}` : ''}`)
}
const lire = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
const code = (f) => sansProse(lire(f))
const leve = (fn) => { try { fn(); return false } catch { return true } }

const MAINTENANT = new Date('2026-10-01T10:00:00Z')
const HIER = '2026-09-30T10:00:00Z'
const DEMAIN = '2026-10-02T10:00:00Z'
const VENDRE = { id: 'c1', statut: 'valide', plan: 'vendre', created_at: '2026-01-01T00:00:00Z', auth_user_id: 'patron', email: 'patron@exemple.be' }
const EXISTER = { ...VENDRE, plan: 'exister' }
const cases = (o) => droitsDepuis(o)
const membre = (o = {}) => ({
  id: 'm1', commercant_id: 'c1', email: 'julie@exemple.be', prenom: 'Julie', auth_user_id: 'u-julie',
  statut: 'actif', expire_le: null, accepte_le: HIER, created_at: HIER,
  ...cases({ agenda: true }), ...o,
})

// ═══ 1) LES CASES ═══════════════════════════════════════════════════════════
{
  v('cinq cases, dans l’ordre validé', CLES_DROITS.join(',') === 'agenda,commandes,livraisons,argent,comptoir')
  v('chaque case a son libellé et son aide', DROITS.every(d => d.label && d.aide))
  v('🔴 un droit inconnu lève (une faute de frappe ne se lit ni oui ni non)', leve(() => colonneDroit('tout')))
  // 🔴 "false" est une chaîne non vide : vraie pour JavaScript.
  v('🔴 seul `true` coche', droitsDepuis({ argent: 'false', agenda: 'true', commandes: 1 }).droit_argent === false
    && droitsDepuis({ agenda: 'true' }).droit_agenda === false && droitsDepuis({ commandes: 1 }).droit_commandes === false)
  v('les colonnes aussi se lisent', droitsDepuis({ droit_livraisons: true }).droit_livraisons === true)
  v('🔴 aucune case : refusé', refusDroits(cases({})) !== null)
  v('🔴 « argent » sans « agenda » : refusé', refusDroits(cases({ argent: true, commandes: true })) !== null)
  v('« argent » avec « agenda » : accepté', refusDroits(cases({ argent: true, agenda: true })) === null)
  v('un livreur, « livraisons » seule : accepté', refusDroits(cases({ livraisons: true })) === null)
  v('« comptoir » seule : acceptée', refusDroits(cases({ comptoir: true })) === null)
}

// ═══ 2) LE FORFAIT ══════════════════════════════════════════════════════════
{
  v('🔴 la matrice : Vendre seulement', PLAN_FEATURES.vendre.equipe === true
    && PLAN_FEATURES.communiquer.equipe === false && PLAN_FEATURES.exister.equipe === false)
  v('Vendre a une équipe', commerceAUneEquipe(VENDRE, MAINTENANT) === true)
  v('🔴 Exister n’en a pas', commerceAUneEquipe(EXISTER, MAINTENANT) === false)
  v('🔴 un commerce non validé n’en a pas', commerceAUneEquipe({ ...VENDRE, statut: 'en_attente' }, MAINTENANT) === false)
  v('sans commerce, rien', commerceAUneEquipe(null, MAINTENANT) === false)
}

// ═══ 3) INVITER ═════════════════════════════════════════════════════════════
{
  const base = { commercant: VENDRE, membres: [], email: 'Julie@Exemple.be ', prenom: 'Julie', droits: cases({ agenda: true }), emailPatron: VENDRE.email, maintenant: MAINTENANT }
  v('une invitation normale passe', refusInvitation(base) === null, refusInvitation(base))
  v('🔴 hors Vendre : refusée', refusInvitation({ ...base, commercant: EXISTER }) !== null)
  v('une adresse invalide : refusée', refusInvitation({ ...base, email: 'julie@' }) !== null && !adresseValable('pas une adresse'))
  v('sans prénom : refusée', refusInvitation({ ...base, prenom: '  ' }) !== null)
  v('🔴 le patron ne s’invite pas lui-même (casse ignorée)', refusInvitation({ ...base, email: 'PATRON@exemple.be' }) !== null)
  v('🔴 les cases sont revérifiées', refusInvitation({ ...base, droits: cases({ argent: true }) }) !== null)
  v('🔴 une adresse déjà là (casse ignorée) : refusée', refusInvitation({ ...base, membres: [membre({ email: 'julie@exemple.be' })] }) !== null)
  v('une adresse retirée peut être réinvitée', refusInvitation({ ...base, membres: [membre({ statut: 'retire' })] }) === null)
  // ⚠️ LE PLAFOND EST CELUI D'ALEX (29/09 : « 10 actifs »), et les listes
  // se construisent DEPUIS lui : écrites « 4 » et « 5 » en dur, elles auraient
  // mesuré l'ancien plafond après chaque changement.
  v('le plafond est celui d’Alex : 10', EQUIPE_MAX === 10, String(EQUIPE_MAX))
  const presque = Array.from({ length: EQUIPE_MAX - 1 }, (_, i) => membre({ id: `m${i}`, email: `p${i}@exemple.be` }))
  const plein = [...presque, membre({ id: 'mz', email: 'pz@exemple.be', statut: 'invite' })]
  v(`à ${EQUIPE_MAX - 1}, on invite encore`, refusInvitation({ ...base, membres: presque }) === null)
  v(`🔴 à ${EQUIPE_MAX}, invitations en attente comprises, on n’invite plus`, refusInvitation({ ...base, membres: plein }) !== null)
  v('les retirés ne comptent pas dans le plafond', refusInvitation({ ...base, membres: [...presque, membre({ id: 'm99', email: 'x@exemple.be', statut: 'retire' })] }) === null)
  v('🔴 une date de fin passée : refusée', refusInvitation({ ...base, expireLe: HIER }) !== null)
  v('une date de fin à venir : acceptée', refusInvitation({ ...base, expireLe: DEMAIN }) === null)
  v('une date illisible : refusée', refusExpiration('demain soir', MAINTENANT) !== null)
  v('pas de date : pas de fin', refusExpiration(null, MAINTENANT) === null && refusExpiration('', MAINTENANT) === null)
}

// ═══ 4) AGIR ════════════════════════════════════════════════════════════════
{
  v('un membre actif agit', membreEnActivite(membre(), MAINTENANT) === true)
  v('🔴 la date de fin passée coupe l’accès, sans tâche de nuit', membreEnActivite(membre({ expire_le: HIER }), MAINTENANT) === false)
  v('avant la date de fin, il agit', membreEnActivite(membre({ expire_le: DEMAIN }), MAINTENANT) === true)
  v('🔴 un membre retiré n’agit plus', membreEnActivite(membre({ statut: 'retire' }), MAINTENANT) === false)
  v('🔴 une invitation n’agit pas', membreEnActivite(membre({ statut: 'invite' }), MAINTENANT) === false)
  v('sans compte, rien', membreEnActivite(membre({ auth_user_id: null }), MAINTENANT) === false)

  const m = membre()
  v('sa case ouvre son geste', peutAgir({ membre: m, commercant: VENDRE, droit: 'agenda', maintenant: MAINTENANT }) === true)
  v('🔴 une case non cochée ferme le geste', peutAgir({ membre: m, commercant: VENDRE, droit: 'argent', maintenant: MAINTENANT }) === false)
  v('🔴 un autre commerce : refusé', peutAgir({ membre: m, commercant: { ...VENDRE, id: 'c2' }, droit: 'agenda', maintenant: MAINTENANT }) === false)
  v('🔴 un commerce sorti de Vendre coupe toute l’équipe', peutAgir({ membre: m, commercant: EXISTER, droit: 'agenda', maintenant: MAINTENANT }) === false)
  v('🔴 un droit inconnu lève au lieu de répondre', leve(() => peutAgir({ membre: m, commercant: VENDRE, droit: 'admin', maintenant: MAINTENANT })))
  const livreur = membre({ ...cases({ livraisons: true }) })
  v('🔴 un livreur ne voit pas l’agenda', peutAgir({ membre: livreur, commercant: VENDRE, droit: 'agenda', maintenant: MAINTENANT }) === false)
  v('🔴 ni les commandes', peutAgir({ membre: livreur, commercant: VENDRE, droit: 'commandes', maintenant: MAINTENANT }) === false)
  v('mais ses livraisons, oui', peutAgir({ membre: livreur, commercant: VENDRE, droit: 'livraisons', maintenant: MAINTENANT }) === true)
}

// ═══ 5) ACCEPTER UNE INVITATION ═════════════════════════════════════════════
{
  const invite = membre({ statut: 'invite', auth_user_id: null, accepte_le: null, invitation_expire_le: DEMAIN })
  const julie = { id: 'u-julie', email: 'Julie@exemple.be' }
  v('l’invitation ouverte s’accepte (casse ignorée)', refusAcceptation({ membre: invite, commercant: VENDRE, user: julie, maintenant: MAINTENANT }) === null)
  v('🔴 un AUTRE compte ne l’accepte pas (lien transféré)', refusAcceptation({ membre: invite, commercant: VENDRE, user: { id: 'u-x', email: 'marc@exemple.be' }, maintenant: MAINTENANT }) !== null)
  v('🔴 une invitation expirée ne s’accepte pas', refusAcceptation({ membre: { ...invite, invitation_expire_le: HIER }, commercant: VENDRE, user: julie, maintenant: MAINTENANT }) !== null)
  v('🔴 une invitation déjà utilisée non plus', refusAcceptation({ membre: { ...invite, statut: 'actif' }, commercant: VENDRE, user: julie, maintenant: MAINTENANT }) !== null)
  v('🔴 le patron n’entre pas dans sa propre équipe', refusAcceptation({ membre: { ...invite, email: 'patron@exemple.be' }, commercant: VENDRE, user: { id: 'patron', email: 'patron@exemple.be' }, maintenant: MAINTENANT }) !== null)
  v('🔴 un commerce sorti de Vendre ne recrute plus', refusAcceptation({ membre: invite, commercant: EXISTER, user: julie, maintenant: MAINTENANT }) !== null)
  v('un accès déjà terminé ne s’ouvre pas', refusAcceptation({ membre: { ...invite, expire_le: HIER }, commercant: VENDRE, user: julie, maintenant: MAINTENANT }) !== null)
  v('sans invitation, un refus lisible', typeof refusAcceptation({ membre: null, commercant: null, user: julie, maintenant: MAINTENANT }) === 'string')
  v('invitationOuverte suit la date', invitationOuverte(invite, MAINTENANT) === true && invitationOuverte({ ...invite, invitation_expire_le: HIER }, MAINTENANT) === false)
}

// ═══ 6) CE QUI SORT DU SERVEUR ══════════════════════════════════════════════
{
  const vu = membrePourLePatron({ ...membre(), invitation_jeton_hash: 'secret' }, MAINTENANT)
  v('🔴 le patron ne reçoit jamais l’empreinte du jeton', !JSON.stringify(vu).includes('secret') && !('invitation_jeton_hash' in vu))
  v('🔴 et les routes ne la lisent pas', !COLONNES_MEMBRE.includes('invitation_jeton_hash'))
  v('les cases se lisent par leur nom', vu.droits.agenda === true && vu.droits.argent === false)
  v('un accès terminé se dit', membrePourLePatron(membre({ expire_le: HIER }), MAINTENANT).etat === 'termine')
  v('une invitation expirée se dit', membrePourLePatron(membre({ statut: 'invite', invitation_expire_le: HIER }), MAINTENANT).etat === 'invitation_expiree')

  const j1 = nouveauJeton(), j2 = nouveauJeton()
  v('🔴 deux jetons ne se ressemblent pas', j1 !== j2 && j1.length >= 43)
  v('🔴 l’empreinte n’est pas le jeton', empreinteJeton(j1) !== j1 && /^[0-9a-f]{64}$/.test(empreinteJeton(j1)))
  v('l’empreinte est stable', empreinteJeton('abc') === empreinteJeton('abc'))
  v('le lien porte le jeton encodé', lienInvitation('a/b+c') === 'https://www.yoppaa.app/equipe/rejoindre?invitation=a%2Fb%2Bc')
  v('l’adresse se masque', adresseMasquee('julie@exemple.be') === 'j***@exemple.be' && adresseMasquee('') === '')
  v('la date de fin se lit en heure belge', libelleFinAcces('2026-10-04T21:00:00Z') === 'dimanche 4 octobre à 23:00', libelleFinAcces('2026-10-04T21:00:00Z'))
}

// ═══ 7) L'EMAIL ═════════════════════════════════════════════════════════════
{
  const html = emailInvitationEquipe({ prenom: '<b>Ju</b>', commercantNom: 'Chez <i>Marc</i>', droits: DROITS.slice(0, 1), lien: 'https://www.yoppaa.app/equipe/rejoindre?invitation=x' })
  v('🔴 le prénom est échappé', !html.includes('<b>Ju</b>') && html.includes('&lt;b&gt;Ju'))
  v('🔴 le nom du commerce aussi, partout', !html.includes('<i>Marc</i>'))
  v('le bouton mène au lien', html.includes('https://www.yoppaa.app/equipe/rejoindre?invitation=x'))
  // 🔴 LE BAS DE PAGE : dix gabarits y passaient le nom brut.
  const pied = layout({ title: 't', intro: 'i', body: 'b', audience: 'yopper', commercantNom: '<script>x</script>' })
  v('🔴 la mention de bas de page échappe le nom du commerce', !pied.includes('<script>x</script>') && pied.includes('&lt;script&gt;'))
  const piedEquipe = layout({ title: 't', intro: 'i', body: 'b', audience: 'equipe', commercantNom: 'Chez Marc' })
  v('la mention dit pourquoi l’équipe reçoit l’email', piedEquipe.includes('Chez Marc t\'ouvre un accès à son équipe'))
}

// ═══ 8) LES ROUTES ══════════════════════════════════════════════════════════
{
  const dossier = 'app/api/equipe'
  // ⚠️ TOUS LES NIVEAUX : les gestes vivent un cran plus bas (`rdv/venu`,
  // `commande/statut`, étape 3). Lister le seul premier niveau supposait une
  // route dans chaque dossier, et ratait celles des sous-dossiers.
  const routes = readdirSync(new URL(`../${dossier}`, import.meta.url), { withFileTypes: true, recursive: true })
    .filter(e => e.isFile() && e.name === 'route.js')
    .map(e => join(e.parentPath ?? e.path, e.name).replace(/\\/g, '/').replace(/^.*?(app\/api\/equipe\/)/, '$1'))
  v('les routes de l’équipe sont trouvées', routes.length >= 8, String(routes.length))

  const PATRON = ['membres', 'inviter', 'modifier', 'retirer', 'renvoyer']
  for (const nom of PATRON) {
    const s = code(`${dossier}/${nom}/route.js`)
    v(`🔴 « ${nom} » passe par la garde du patron`,
      /const garde = await gardePatronEquipe\(request, admin, commercant_id\)/.test(s)
      && /if \(!garde\.ok\) return NextResponse\.json/.test(s))
  }
  // 🔴 LE MEMBRE SE CHERCHE DANS LE COMMERCE DU PATRON, jamais par son seul id.
  for (const nom of ['modifier', 'retirer', 'renvoyer']) {
    const s = code(`${dossier}/${nom}/route.js`)
    const ecritures = s.match(/\.from\('equipe_membres'\)\s*\.update\([\s\S]*?\.eq\('id', membre_id\)\.eq\('commercant_id', commercant_id\)/g) || []
    const toutes = s.match(/\.from\('equipe_membres'\)\s*\.update\(/g) || []
    v(`🔴 « ${nom} » : chaque écriture est bornée au commerce du patron`, toutes.length > 0 && ecritures.length === toutes.length, `${ecritures.length}/${toutes.length}`)
  }
  for (const r of routes) {
    const s = code(r)
    v(`🔴 ${r} ne lit jamais toute la ligne`, !/\.select\('\*'\)/.test(s))
    v(`🔴 ${r} ne renvoie jamais un jeton`, !/jeton[,\s}]/.test((s.match(/NextResponse\.json\(\{[^)]*\}/g) || []).join(' ')))
  }

  const inviter = code(`${dossier}/inviter/route.js`)
  v('🔴 l’invitation garde l’EMPREINTE, jamais le jeton', /invitation_jeton_hash: empreinteJeton\(jeton\)/.test(inviter) && !/invitation_jeton_hash: jeton/.test(inviter))
  v('🔴 le jeton ne part que dans l’email', /lien: lienInvitation\(jeton\)/.test(inviter))
  v('🔴 la règle d’invitation est appliquée, adresse du patron comprise',
    /const refus = refusInvitation\(\{[\s\S]{0,200}emailPatron: commercant\.email/.test(inviter) && /if \(refus\) return NextResponse\.json/.test(inviter))
  v('les invitations en place viennent de la base', /const membres = await membresEnPlace\(admin, commercant_id\)/.test(inviter))

  const rejoindre = code(`${dossier}/rejoindre/route.js`)
  v('🔴 rejoindre exige une session', /const user = await utilisateurAppelant\(request\)/.test(rejoindre) && /if \(!user\) return NextResponse\.json\([^)]*status: 401/.test(rejoindre))
  v('🔴 rejoindre applique la règle (adresse, expiration, forfait)', /const refus = refusAcceptation\(\{ membre, commercant, user, maintenant \}\)/.test(rejoindre) && /if \(refus\) return/.test(rejoindre))
  v('🔴 l’acceptation ne passe qu’une fois, avec CE jeton', /\.eq\('id', membre\.id\)\.eq\('statut', 'invite'\)\.eq\('invitation_jeton_hash', empreinte\)/.test(rejoindre))
  v('🔴 et le jeton meurt avec elle', /statut: 'actif', auth_user_id: user\.id[\s\S]{0,160}invitation_jeton_hash: null/.test(rejoindre))

  const invitation = code(`${dossier}/invitation/route.js`)
  const reponse = (invitation.match(/return NextResponse\.json\(\{\s*ok: true,[\s\S]*?\}\)/) || [''])[0]
  v('🔴 sans session, l’invitation ne dit que le strict nécessaire', /adresse: adresseMasquee\(membre\.email\)/.test(reponse)
    && !/email: membre\.email/.test(reponse) && !/droit/.test(reponse) && !/commercant_id/.test(reponse))

  const retirer = code(`${dossier}/retirer/route.js`)
  v('🔴 retirer tue aussi le lien d’invitation', /statut: 'retire'[\s\S]{0,120}invitation_jeton_hash: null/.test(retirer))
  v('retirer reste possible hors Vendre (faire le ménage)', !/commerceAUneEquipe/.test(retirer))
  const renvoyer = code(`${dossier}/renvoyer/route.js`)
  v('🔴 renvoyer ne touche qu’une invitation en attente', /\.eq\('statut', 'invite'\)/.test(renvoyer))

  const mes = code(`${dossier}/mes-equipes/route.js`)
  v('🔴 « mes équipes » applique la même règle que chaque geste',
    /membreEnActivite\(m, maintenant\) && commerceAUneEquipe\(c, maintenant\)/.test(mes))
  v('🔴 et ne rend jamais l’email ni le compte du patron', !/email: c\.email|auth_user_id: c\./.test(mes))

  const serveur = code('lib/equipe-server.js')
  v('🔴 la garde du membre le cherche dans CE commerce, pour CE compte, actif',
    /\.eq\('commercant_id', commercantId\)\.eq\('auth_user_id', user\.id\)\.eq\('statut', 'actif'\)/.test(serveur))
  // ⚠️ ANCRE REPOINTÉE À L'ÉTAPE 2 (29/09) : la garde accepte une LISTE de cases.
  v('🔴 puis applique peutAgir à chaque case, et refuse si aucune n’est ouverte',
    /permis\[d\] = peutAgir\(\{ membre, commercant, droit: d \}\)/.test(serveur) && /if \(!Object\.values\(permis\)\.some\(Boolean\)\) return \{ ok: false, status: 403/.test(serveur))
  v('🔴 un membre ne gère pas l’équipe (garde du patron : propriétaire ou admin vérifié)',
    /const patron = commercant\.auth_user_id === user\.id/.test(serveur) && /if \(!patron && !\(await adminVerifie\(request, user\)\)\) return \{ ok: false, status: 403/.test(serveur))
  // ⚠️ NOMMÉES, PLUS COMPTÉES (29/09) : la garde comptait « au moins trois »,
  // et la garde par ligne en a ajouté une quatrième. On pouvait alors en
  // retirer une sans qu'elle rougisse (mesuré par mutation).
  for (const quoi of ['lecture du commerce', 'lecture de l\'équipe', 'lecture du membre', 'lecture de la ligne']) {
    v(`🔴 « ${quoi} » ratée lève, elle ne répond pas « personne »`, serveur.includes(`if (error) throw new Error(\`${quoi} : `))
  }
  v('l’empreinte est un sha256', /createHash\('sha256'\)/.test(serveur))
}

// ═══ 9) LA BASE ET L'ÉCRAN ══════════════════════════════════════════════════
{
  const sql = lire('migrations/MIGRATION_EQUIPE_MEMBRES.sql')
  const ddl = sql.split('-- ─── CONTRÔLE')[0].replace(/^--.*$/gm, '')
  v('🔴 aucune règle d’accès créée pour l’équipe', !/CREATE POLICY/i.test(ddl))
  v('🔴 la RLS est active sur les deux tables', /ALTER TABLE public\.equipe_membres ENABLE ROW LEVEL SECURITY/.test(ddl) && /ALTER TABLE public\.equipe_journal ENABLE ROW LEVEL SECURITY/.test(ddl))
  v('🔴 tout est retiré à anon et authenticated', /REVOKE ALL ON public\.equipe_membres FROM PUBLIC, anon, authenticated/.test(ddl) && /REVOKE ALL ON public\.equipe_journal FROM PUBLIC, anon, authenticated/.test(ddl))
  v('la base refuse « argent » sans « agenda »', /CHECK \(NOT droit_argent OR droit_agenda\)/.test(ddl))

  const bord = code('app/dashboard/ConfigDashboard.js')
  v('🔴 l’onglet passe par la matrice des forfaits', /\{ id: 'equipe', label: 'Mon équipe', icon: 'user', feature: 'equipe' \}/.test(bord))
  v('l’onglet attend le Poste équipe pour entrer dans la barre', /EQUIPE_DANS_LA_BARRE && \{ id: 'equipe'/.test(bord) && EQUIPE_DANS_LA_BARRE === false)
  v('l’écran est rendu', /\{tab === 'equipe' && <TabEquipe commercantId=\{commercantId\} toast=\{showToast\} \/>\}/.test(bord))
  v('🔴 l’adresse ?config=equipe est acceptée', /'compte',\s*'equipe'\]/.test(code('app/dashboard/page.js')))

  const ecran = code('app/dashboard/TabEquipe.js')
  v('🔴 l’écran ne touche jamais la base', !/supabase\.from\(/.test(ecran) && !/from '@\/lib\/supabase'/.test(ecran))
  v('retirer demande confirmation', /const choix = await confirmer\(\{/.test(ecran) && /if \(choix !== 'retirer'\) return/.test(ecran))
  v('un bouton qui travaille le dit, et ne se reclique pas', /if \(enCours\) return/.test(ecran) && /disabled=\{!!enCours/.test(ecran))

  const rejoindre = code('app/equipe/rejoindre/page.js')
  v('🔴 la page de l’invité demande au serveur qui est connecté', /supabase\.auth\.getUser\(\)/.test(rejoindre))
  v('la connexion revient sur l’invitation', /\/login\?next=\$\{encodeURIComponent\(retour\)\}/.test(rejoindre))
}

// ═══ 10) LE RETOUR APRÈS CONNEXION ══════════════════════════════════════════
//
// 🔴 L'invitation passe par `/login?next=…` puis `/auth/session?next=…` : ces
// deux pages redirigeaient vers N'IMPORTE QUELLE adresse (trouvé le 29/09).
{
  const { cheminInterne } = await import('../lib/chemin-interne.js')
  v('un chemin interne passe, requête comprise', cheminInterne('/equipe/rejoindre?invitation=abc') === '/equipe/rejoindre?invitation=abc')
  for (const [nom, adresse] of [
    ['une adresse complète', 'https://pirate.example/x'],
    ['une adresse sans protocole', '//pirate.example'],
    ['la barre oblique inverse', '/\\pirate.example'],
    ['javascript:', 'javascript:alert(1)'],
    ['un caractère de contrôle', '/\tpirate'],
    ['rien', ''],
    ['autre chose qu’une chaîne', 42],
  ]) {
    v(`🔴 refusé : ${nom}`, cheminInterne(adresse, '/dashboard') === '/dashboard', String(cheminInterne(adresse, '/dashboard')))
  }
  v('🔴 la page de connexion trie son retour', /const nextPath = cheminInterne\(searchParams\?\.get\('next'\), '\/dashboard'\)/.test(code('app/login/page.js')))
  v('🔴 la page de session aussi', /const next = cheminInterne\(searchParams\.get\('next'\), '\/dashboard'\)/.test(code('app/auth/session/page.js')))
}

// ═══ 11) ÉTAPE 2 : CE QUE LE POSTE LIT ═══════════════════════════════════════
{
  const P = await import('../lib/equipe-poste.js')
  const S = await import('../lib/statuts-commande.js')
  // ⚠️ LES JOINTURES SE RETIRENT D'ABORD : `commande_articles(quantite, …)`
  // découpée à la virgule faisait passer `article_nom` pour une colonne de
  // `commandes` (le banc s'est trompé le 29/09, pas le code).
  // ⚠️ ET LES JOINTURES IMBRIQUÉES (étape 3 : la commande liée porte ses
  // lignes, `commandes!clé(…, commande_articles(…))`) : on retire de
  // l'intérieur vers l'extérieur, jusqu'à ce qu'il n'en reste plus.
  const colonnes = (liste) => {
    let s = liste
    while (/[\w:!]+\([^()]*\)/.test(s)) s = s.replace(/[\w:!]+\([^()]*\)/g, '')
    return s.split(',').map(x => x.trim()).filter(Boolean)
  }
  const schema = lire('scripts/schema-supabase.txt')
  const tableDuSchema = (t) => ((schema.match(new RegExp(`^${t}: (.+)$`, 'm')) || [])[1] || '').split(',')

  // 🔴 UNE COLONNE ABSENTE FAIT ÉCHOUER TOUTE LA LECTURE : chaque nom existe.
  const cmd = tableDuSchema('commandes')
  const absentesCmd = colonnes(P.COLONNES_COMMANDE_EQUIPE).filter(c => !cmd.includes(c))
  v('🔴 chaque colonne lue sur `commandes` existe', cmd.length > 30 && absentesCmd.length === 0, absentesCmd.join(', '))
  // Les colonnes arrivées APRÈS le relevé du 28/08 se prouvent par leur migration.
  const APRES_RELEVE = { couverts: 'MIGRATION_COUVERTS_TABLE.sql' }
  const rdv = tableDuSchema('rdv_reservations')
  const absentesRdv = colonnes(P.COLONNES_RDV_EQUIPE).filter(c => !rdv.includes(c) && !(APRES_RELEVE[c] && /ADD COLUMN IF NOT EXISTS couverts/.test(lire(`migrations/${APRES_RELEVE[c]}`))))
  v('🔴 chaque colonne lue sur `rdv_reservations` existe', rdv.length > 30 && absentesRdv.length === 0, absentesRdv.join(', '))
  for (const c of ['client_prenom', 'updated_at', 'note', 'date_retrait']) {
    v(`🔴 « ${c} » n'est pas demandée sur commandes (elle n'y existe pas)`, !colonnes(P.COLONNES_COMMANDE_EQUIPE).includes(c))
  }

  // 🔴 CE QUI NE SORT JAMAIS.
  // ⚠️ LE COMPTOIR (étape 5, 01/10) ENTRE DANS CE QUI EST VÉRIFIÉ : il lit sur
  // `commercants`, comme le reste du Poste.
  const toutes = `${P.COLONNES_RDV_EQUIPE}, ${P.COLONNES_COMMANDE_EQUIPE}, ${P.COLONNES_COMMERCE_POSTE}, ${P.COLONNES_COMPTOIR_POSTE}`
  for (const interdit of ['annulation_token', 'stripe_', 'client_email', 'notes_commercant', 'bons_utilises', 'empreinte_', 'rgpd_', 'email', 'auth_user_id', '*']) {
    v(`🔴 le Poste ne lit jamais « ${interdit} »`, !toutes.includes(interdit))
  }
  // Ce que lit le calcul du paiement : sans ces colonnes, « reste à payer » mentirait.
  for (const c of ['prix_estime', 'acompte_montant', 'acompte_paye', 'acompte_paye_en_ligne', 'fidelite_remise', 'bon_cadeau_montant', 'encaisse_mode', 'encaisse_montant', 'abonnement_id', 'statut']) {
    v(`le paiement d'un rendez-vous se calcule (« ${c} » lue)`, colonnes(P.COLONNES_RDV_EQUIPE).includes(c))
  }
  for (const c of ['total', 'paye_en_ligne', 'encaisse_mode', 'encaisse_montant', 'bon_cadeau_montant', 'fidelite_remise', 'mode_retrait']) {
    v(`le paiement d'une commande se calcule (« ${c} » lue)`, colonnes(P.COLONNES_COMMANDE_EQUIPE).includes(c))
  }
  v('l’agenda reçoit ce qu’il groupe (capacité, couverts, table)', /capacite_creneau/.test(P.COLONNES_RDV_EQUIPE) && /couverts/.test(P.COLONNES_RDV_EQUIPE) && /par_couverts/.test(P.COLONNES_RDV_EQUIPE))

  // Les fenêtres.
  const f = P.fenetres('2026-10-01', { horizonCommande: 1 })
  v('l’agenda : une semaine derrière, deux mois devant', f.agenda.debut === '2026-09-24' && f.agenda.fin === '2026-11-30', JSON.stringify(f.agenda))
  v('les commandes : deux jours derrière, une semaine devant au moins', f.commandes.debut === '2026-09-29' && f.commandes.fin === '2026-10-08', JSON.stringify(f.commandes))
  v('un horizon plus long est suivi', P.fenetres('2026-10-01', { horizonCommande: 14 }).commandes.fin === '2026-10-15')

  // 🔴 LE LIVREUR.
  const payeeEnLigne = { id: 'c1', numero_commande: 12, numero_prefixe: 'LI', mode_retrait: 'livraison', date_commande: '2026-10-01', statut: 'pret', client_nom: 'Marc Dupont', client_telephone: '0470', client_email: 'marc@x.be', adresse_livraison: 'Rue 1, Mettet', note_livraison: 'Sonner 2 fois', total: 30, paye_en_ligne: true, commande_articles: [{ quantite: 2, article_nom: 'Pizza', prix_unitaire: 12.5, options: [{ groupe_nom: 'Taille', valeur_nom: 'Grande' }] }], creneau_livraison: { heure_debut: '18:00:00', heure_fin: '18:30:00' } }
  const vue = P.livraisonPourLeLivreur(payeeEnLigne)
  // `mode_retrait` ajouté le 01/10 (étape 4) : la règle des gestes du livreur
  // le lit. Il ne dit rien du client, toutes ces commandes sont des livraisons.
  const permises = ['id', 'reference', 'client_nom', 'client_telephone', 'adresse', 'note', 'date', 'creneau', 'creneau_livraison_id', 'statut', 'statut_livraison', 'mode_retrait', 'a_encaisser', 'lignes']
  v('🔴 le livreur ne reçoit que sa vue', Object.keys(vue).every(k => permises.includes(k)), Object.keys(vue).join(','))
  // ⚠️ RÉORIENTÉE LE 29/09 (Alex : « il doit pouvoir voir le contenu de la
  // commande, pour savoir ce qu'il doit donner »). Le contenu, oui ; les prix,
  // le total et l'email, jamais.
  v('✅ le livreur voit ce qu’il doit donner, options comprises', vue.lignes?.[0]?.article_nom === 'Pizza' && vue.lignes[0].quantite === 2 && /Grande/.test(vue.lignes[0].options || ''))
  v('🔴 mais aucun prix, ni total, ni email', !('total' in vue) && !JSON.stringify(vue).includes('12.5') && !JSON.stringify(vue).includes('prix') && !JSON.stringify(vue).includes('marc@x.be'))
  v('🔴 une ligne ne porte que quantité, article, options', vue.lignes.every(l => Object.keys(l).join(',') === 'quantite,article_nom,options'))
  v('🔴 une commande payée en ligne : rien à encaisser', vue.a_encaisser === null)
  v('🔴 payée à la porte : le montant à encaisser', P.livraisonPourLeLivreur({ ...payeeEnLigne, paye_en_ligne: false }).a_encaisser === 30)
  v('le nom et la sonnette sont là', vue.client_nom === 'Marc Dupont' && vue.note === 'Sonner 2 fois' && vue.reference === 'LI12')
  v('une livraison du jour compte', P.livraisonDuJour(payeeEnLigne, '2026-10-01') === true)
  v('🔴 un retrait n’est pas une livraison', P.livraisonDuJour({ ...payeeEnLigne, mode_retrait: 'retrait' }, '2026-10-01') === false)
  v('🔴 une livraison d’un autre jour non plus', P.livraisonDuJour(payeeEnLigne, '2026-10-02') === false)
  v('une commande annulée ne se livre pas', P.livraisonDuJour({ ...payeeEnLigne, statut: 'annulee_client_refund' }, '2026-10-01') === false)
  const triees = P.trierLivraisons([{ reference: 'LI3', creneau: { heure_debut: '19:00' } }, { reference: 'LI10', creneau: { heure_debut: '18:00' } }, { reference: 'LI2', creneau: { heure_debut: '18:00' } }])
  v('la tournée suit le créneau, puis le numéro', triees.map(t => t.reference).join(',') === 'LI2,LI10,LI3')

  // Les jours et les statuts.
  v('« Aujourd’hui », « Demain », « Hier »', P.libelleJourPoste('2026-10-01', '2026-10-01') === 'Aujourd’hui' && P.libelleJourPoste('2026-10-02', '2026-10-01') === 'Demain' && P.libelleJourPoste('2026-09-30', '2026-10-01') === 'Hier')
  v('🔴 un jour ne glisse pas au fuseau', P.libelleJourPoste('2026-10-05') === 'lundi 5 octobre', P.libelleJourPoste('2026-10-05'))
  v('une livraison livrée se dit « Livrée »', S.libelleStatutCommande({ statut: 'recupere', mode_retrait: 'livraison' }) === 'Livrée')
  v('une expédition prête se dit « À expédier »', S.libelleStatutCommande({ statut: 'pret', mode_retrait: 'expedition' }) === 'À expédier')
  v('un retrait prêt se dit « Prête »', S.libelleStatutCommande({ statut: 'pret', mode_retrait: 'retrait' }) === 'Prête')

  // 🔴 LA ROUTE.
  const route = code('app/api/equipe/poste/route.js')
  v('🔴 le poste passe par la garde de l’équipe', /const garde = await gardeEquipe\(request, admin, commercant_id, \[/.test(route) && /if \(!garde\.ok\) return NextResponse\.json/.test(route))
  v('🔴 l’agenda n’est lu qu’avec sa case', /if \(permis\.agenda\) \{/.test(route))
  v('🔴 les commandes complètes n’arrivent qu’avec « Commandes »', /if \(permis\.commandes\) reponse\.commandes = lues/.test(route))
  v('🔴 le livreur ne reçoit que sa vue réduite', /if \(permis\.livraisons\) reponse\.livraisons = trierLivraisons\(lues\.filter\(c => livraisonDuJour\(c, aujourdhui\)\)\.map\(livraisonPourLeLivreur\)\)/.test(route))
  v('🔴 une commande pas encore payée n’existe pas pour le comptoir', /\.neq\('statut', 'paiement_en_attente'\)/.test(route))
  // ⚠️ CINQ depuis l'étape 3b (les prestations, pour la fenêtre de saisie).
  v('🔴 chaque lecture est bornée à CE commerce', (route.match(/\.eq\('commercant_id', commercant_id\)/g) || []).length === 5)
  v('🔴 chaque lecture nomme ses colonnes', !/\.select\('\*'\)/.test(route) && /select\(COLONNES_RDV_EQUIPE\)/.test(route) && /select\(COLONNES_COMMANDE_EQUIPE\)/.test(route))
  v('🔴 une lecture ratée lève (pas d’agenda vide sur une panne)', /if \(error\) throw new Error\(`\$\{quoi\} : \$\{error\.message\}`\)/.test(route))
  v('le jour est le jour belge', /const aujourdhui = jourBruxelles\(\)/.test(route))

  // 🔴 LA GARDE REND LES CASES OUVERTES, ET SEULEMENT ELLES.
  const serveur = code('lib/equipe-server.js')
  v('🔴 chaque case demandée est jugée par peutAgir', /for \(const d of demandes\) permis\[d\] = peutAgir\(\{ membre, commercant, droit: d \}\)/.test(serveur))
  v('🔴 aucune case ouverte : refusé', /if \(!Object\.values\(permis\)\.some\(Boolean\)\) return \{ ok: false, status: 403/.test(serveur))

  // L'écran.
  const poste = code('app/equipe/PosteEquipe.js')
  v('🔴 le Poste ne touche jamais la base', !/supabase\.from\(/.test(poste) && !/supabase\.from\(/.test(code('app/equipe/page.js')))
  // ⚠️ RÉORIENTÉE À L'ÉTAPE 3b (29/09) : créer une réservation est permis, avec la
  // case « Agenda » seulement. Clôturer une séance entière reste au patron.
  v('🔴 l’agenda ne propose de créer qu’avec la case Agenda, et jamais de clôturer',
    /<AgendaRdv /.test(poste) && /onNouveauRdv=\{etat\.droits\?\.agenda \? \(date, heure\) => setSaisie\(\{ date, heure \}\) : undefined\}/.test(poste) && !/onHonorerSeance=/.test(poste))
  v('le poste se rafraîchit seul, et au retour sur l’écran', /setInterval\(charger, RAFRAICHIR_MS\)/.test(poste) && /addEventListener\('pageshow', auRetour\)/.test(poste))
  v('un accès coupé se dit', /Ton accès à ce commerce est fermé/.test(lire('app/equipe/PosteEquipe.js')))
  v('🔴 se déconnecter est une déconnexion voulue', /marquerDeconnexionVoulue\(\)\s*const \{ error \} = await supabase\.auth\.signOut\(\)/.test(code('app/equipe/page.js')))

  // Une seule source pour les libellés.
  const bord = code('app/dashboard/page.js')
  v('🔴 le tableau de bord lit ses libellés de statut dans le module partagé',
    Object.keys(S.LIBELLES_STATUT_COMMANDE).every(k => new RegExp(`'${k}':\\s+\\{ label: LIBELLES_STATUT_COMMANDE\\.${k},`).test(bord)))
  v('et sa carte dit « Livrée » par la même fonction', (bord.match(/label: libelleStatutCommande\(commande\)/g) || []).length === 4)
}

// ═══ 12) ÉTAPE 3 : LES GESTES ═══════════════════════════════════════════════
{
  const E = await import('../lib/encaissement.js')
  const S = await import('../lib/statuts-commande.js')
  const T0 = new Date('2026-10-01T10:00:00Z')

  // L'encaissement, exécuté.
  v('rien à encaisser : aucune colonne écrite', JSON.stringify(E.champsEncaissement({ choix: 'terminal', reste: 0 })) === '{"champs":null,"refus":null}')
  v('🔴 un reste à payer exige de dire comment', E.champsEncaissement({ choix: null, reste: 12 }).refus !== null)
  v('🔴 « virement » n’est pas un choix du comptoir', E.champsEncaissement({ choix: 'virement', reste: 12 }).refus !== null)
  const term = E.champsEncaissement({ choix: 'terminal', reste: 12.345, maintenant: T0 }).champs
  v('terminal : le mode, le montant arrondi, l’heure', term?.encaisse_mode === 'terminal' && term.encaisse_montant === 12.35 && term.encaisse_le === T0.toISOString())
  const rien = E.champsEncaissement({ choix: 'sans_paiement', reste: 12, maintenant: T0 }).champs
  v('sans paiement : « rien », zéro euro', rien?.encaisse_mode === 'rien' && rien.encaisse_montant === 0)

  // Les transitions, exécutées.
  v('un pas en avant', S.transitionPermise({ statut: 'en_attente' }, 'en_preparation') && S.transitionPermise({ statut: 'en_preparation' }, 'pret'))
  v('🔴 jamais deux pas d’un coup', !S.transitionPermise({ statut: 'en_attente' }, 'pret'))
  v('🔴 jamais en arrière', !S.transitionPermise({ statut: 'pret' }, 'en_preparation'))
  v('un retrait prêt se remet', S.transitionPermise({ statut: 'pret', mode_retrait: 'retrait' }, 'recupere'))
  v('🔴 une livraison prête ne se « remet » pas au comptoir', !S.transitionPermise({ statut: 'pret', mode_retrait: 'livraison' }, 'recupere'))
  v('🔴 une expédition non plus', !S.transitionPermise({ statut: 'pret', mode_retrait: 'expedition' }, 'recupere'))
  v('une commande remise n’avance plus', !S.transitionPermise({ statut: 'recupere' }, 'recupere'))

  // 🔴 LA PARITÉ AVEC LE TABLEAU DE BORD : mêmes pas, mêmes mots.
  const bord = code('app/dashboard/page.js')
  for (const [de, vers] of Object.entries(S.STATUT_SUIVANT)) {
    const ligne = (bord.match(new RegExp(`'${de}':\\s+\\{[^}]*\\}`)) || [''])[0]
    v(`🔴 le pas après « ${de} » est le même que le tableau de bord`, ligne.includes(`next: '${vers}'`), ligne.slice(0, 120))
    v(`🔴 son bouton dit la même chose`, ligne.includes(`nextLabel: '${S.LIBELLE_GESTE_SUIVANT[de]}'`))
  }
  // L'email d'annulation reçoit les mêmes informations des deux écrans.
  const poste = code('app/equipe/PosteEquipe.js')
  const cles = (src, url) => {
    const i = src.indexOf(`'${url}', {`)
    if (i < 0) return ''
    const bloc = src.slice(i, src.indexOf('}', i))
    return [...bloc.matchAll(/(\w+):/g)].map(m => m[1]).sort().join(',')
  }
  for (const url of ['/api/emails/rdv-annule', '/api/emails/rdv-no-show']) {
    v(`🔴 ${url} : mêmes informations que le tableau de bord`, cles(poste, url) !== '' && cles(poste, url) === cles(bord, url), `${cles(poste, url)} / ${cles(bord, url)}`)
  }
  // ⚠️ ET LE TROISIÈME ÉCRAN (03/10) : les fermetures annulent aussi des
  // rendez-vous, et leur email doit porter les mêmes montants rendus.
  const config = code('app/dashboard/ConfigDashboard.js')
  v('🔴 /api/emails/rdv-annule : les fermetures disent la même chose que le tableau de bord',
    cles(config, '/api/emails/rdv-annule') !== '' && cles(config, '/api/emails/rdv-annule') === cles(bord, '/api/emails/rdv-annule'),
    `${cles(config, '/api/emails/rdv-annule')} / ${cles(bord, '/api/emails/rdv-annule')}`)

  // 🔴 LES ROUTES DES GESTES.
  const venu = code('app/api/equipe/rdv/venu/route.js')
  v('🔴 « venu » passe par la garde, case Agenda', /const verdict = await gardeLigneEquipe\(request, admin, 'rdv_reservations', rdv_id, 'agenda'\)\s*const nonAutorise = refus\(verdict, NextResponse\)\s*if \(nonAutorise\) return nonAutorise/.test(venu))
  v('🔴 le montant vient de la base, jamais de l’écran', /champsEncaissement\(\{ choix: encaissement, reste: resteAEncaisser\(rdv\) \}\)/.test(venu) && !/montant[,\s}]*=\s*await request/.test(venu) && /const \{ rdv_id, encaissement = null \} = await request\.json\(\)/.test(venu))
  v('🔴 une réservation ne s’honore qu’une fois', /\.eq\('id', rdv_id\)\.eq\('statut', 'confirme'\)/.test(venu) && /if \(rdv\.statut !== 'confirme'\)/.test(venu))
  v('le geste va au journal', /journaliserGeste\(admin, verdict, \{\s*action: 'rdv_venu'/.test(venu))

  const statut = code('app/api/equipe/commande/statut/route.js')
  v('🔴 une commande avance par la garde, case Commandes', /const verdict = await gardeLigneEquipe\(request, admin, 'commandes', commande_id, 'commandes'\)\s*const nonAutorise = refus\(verdict, NextResponse\)\s*if \(nonAutorise\) return nonAutorise/.test(statut))
  v('🔴 un seul pas en avant, revérifié au serveur', /if \(!transitionPermise\(c, statut\)\)/.test(statut))
  v('🔴 et seulement depuis le statut lu', /\.eq\('id', commande_id\)\.eq\('statut', c\.statut\)/.test(statut))
  v('🔴 la remise d’une commande impayée demande comment', /if \(statut === 'recupere' && !c\.encaisse_mode\) \{\s*const r = champsEncaissement\(\{ choix: encaissement, reste: resteAEncaisserCommande\(c\) \}\)/.test(statut))
  v('le geste va au journal', /journaliserGeste\(admin, verdict, \{\s*action: 'commande_statut'/.test(statut))

  // 🔴 LES ROUTES ÉLARGIES : la même garde, la bonne case, plus d'ancienne garde.
  for (const [f, table, id, droit] of [
    ['app/api/rdv/annuler-commercant/route.js', 'rdv_reservations', 'rdv_id', "'agenda'"],
    ['app/api/emails/rdv-annule/route.js', 'rdv_reservations', 'rdv_id', "'agenda'"],
    ['app/api/rdv/no-show/route.js', 'rdv_reservations', 'rdv_id', "'argent'"],
    ['app/api/emails/rdv-no-show/route.js', 'rdv_reservations', 'rdv_id', "'argent'"],
    ['app/api/fidelite/rdv-honore/route.js', 'rdv_reservations', 'rdvId', "'agenda'"],
    ['app/api/commande/push-statut/route.js', 'commandes', 'commande_id', "['commandes', 'livraisons']"],
    ['app/api/emails/commande-prete/route.js', 'commandes', 'commande_id', "'commandes'"],
    ['app/api/fidelite/crediter/route.js', 'commandes', 'commandeId', "['commandes', 'livraisons']"],
    ['app/api/commande/produits-remis/route.js', 'commandes', 'commandeId', "['agenda', 'commandes']"],
    ['app/api/commande/non-retire/route.js', 'commandes', 'commandeId', "'commandes'"],
  ]) {
    const s = code(f)
    const attendu = `gardeLigneEquipe(request, supabase, '${table}', ${id}, ${droit})`
    v(`🔴 ${f.replace('app/api/', '')} : garde commune, case ${droit}`, s.includes(attendu) && /refus\(verdict, NextResponse\)/.test(s) && !/gardeSurLigne\(/.test(s) && !/auth_user_id !== user\.id/.test(s))
  }
  for (const [f, action] of [['app/api/rdv/annuler-commercant/route.js', 'rdv_annule'], ['app/api/rdv/no-show/route.js', 'rdv_absent'], ['app/api/commande/produits-remis/route.js', 'produits_remis'], ['app/api/commande/non-retire/route.js', 'commande_non_retiree']]) {
    v(`le geste « ${action} » va au journal`, new RegExp(`journaliserGeste\\(supabase, verdict, \\{ action: '${action}'`).test(code(f)))
  }

  // 🔴 LA GARDE PAR LIGNE ET LE JOURNAL.
  const serveur = code('lib/equipe-server.js')
  v('🔴 le commerce se déduit de la ligne', /\.from\(table\)\.select\('commercant_id'\)\.eq\('id', id\)\.maybeSingle\(\)[\s\S]{0,260}return gardeEquipe\(request, admin, data\.commercant_id, droit\)/.test(serveur))
  v('🔴 une lecture ratée de la ligne lève', /if \(error\) throw new Error\(`lecture de la ligne/.test(serveur))
  v('le journal ne note que les gestes d’un membre', /if \(!garde\?\.ok \|\| garde\.role !== 'membre'\) return true/.test(serveur))

  // L'écran.
  // ⚠️ RÉORIENTÉE LE 30/09 : le déplacement existe au Poste. L'annulation pose
  // la question du patron ENTIÈRE, et « plutôt le déplacer » ouvre la fenêtre
  // au lieu de tomber dans le vide.
  v('🔴 l’annulation du Poste pose la question du patron, « déplacer » compris, et le déplacement s’ouvre',
    /const q = questionRdv\('annule_commercant', rdv, categorie\)\s*const choix = await confirmer\(q\)\s*if \(choix === 'deplacer'\) \{ setRdvOuvert\(null\); setADeplacer\(rdv\); return \}/.test(poste))
  v('🔴 « absent » seulement avec la case Argent, et après l’heure', /const absentPossible = enAttente && droits\.argent && noShowPossible\(rdv, new Date\(\)\)/.test(poste))
  v('🔴 les gestes de l’agenda seulement avec sa case', /gestes=\{etat\.droits\?\.agenda \? gestesRdv : null\}/.test(poste))
  v('🔴 ceux des commandes aussi', /gestes=\{etat\.droits\?\.commandes \? gestesCommande : null\}/.test(poste))
  v('un envoi raté au client se dit', /if \(!r\.ok\) dire\(/.test(poste))
  v('un geste ne se lance pas deux fois', /if \(enCours\) return\s*setEnCours\(id\)/.test(poste))
}

// ═══ 13) ÉTAPE 3b : CRÉER UNE RÉSERVATION ═══════════════════════════════════
{
  const P = await import('../lib/equipe-poste.js')
  const bord = code('app/dashboard/page.js')
  // 🔴 LA PARITÉ : les prestations de la fenêtre, lues comme chez le patron.
  v('🔴 les prestations sont lues avec les colonnes du tableau de bord', bord.includes(`.select('${P.COLONNES_PRESTATION_SAISIE}')`))
  const poste = code('app/api/equipe/poste/route.js')
  v('et avec le même filtre et le même ordre', /\.select\(COLONNES_PRESTATION_SAISIE\)\s*\.eq\('commercant_id', commercant_id\)\.eq\('actif', true\)\.is\('deleted_at', null\)\s*\.order\('ordre', \{ ascending: true \}\)\.order\('created_at', \{ ascending: true \}\)/.test(poste))

  const creer = code('app/api/equipe/rdv/creer/route.js')
  v('🔴 créer passe par la garde, case Agenda', /const garde = await gardeEquipe\(request, admin, commercant_id, 'agenda'\)\s*if \(!garde\.ok\) return NextResponse\.json/.test(creer))
  v('🔴 le créneau est revérifié au serveur, sur les réservations relues', /const verdict = creneauAcceptable\(\{/.test(creer) && /if \(!verdict\.ok\) return NextResponse\.json/.test(creer)
    && /\.from\('rdv_reservations'\)\.select\('id, date_rdv, statut, prestation_id, heure_debut, heure_fin'\)\s*\.eq\('commercant_id', commercant_id\)\.eq\('date_rdv', date\)/.test(creer))
  // 🔴 LE LIEU DE LA PLAGE QUI ACCUEILLE L'HEURE (03/10), pas celui que l'heure
  // seule désigne. La règle est exécutée dans verif-slots, le déplacement ici.
  v('🔴 créer grave le lieu de la plage qui accueille l’heure',
    /const plage = plageQuiAccueille\(creneauxDuJour\(creneaux\.data \|\| \[\], \{ dateStr: date, jour \}\), \{/.test(creer)
    && /lieuId: plage\?\.lieu_id \|\| null,/.test(creer))
  v('🔴 la prestation doit appartenir au commerce', /\.from\('rdv_prestations'\)\.select\(`\$\{COLONNES_PRESTATION_SANS_COUVERTS\}, \$\{COLONNES_COUVERTS\}`\)\s*\.eq\('commercant_id', commercant_id\)/.test(creer) && /const presta = formats\.find\(/.test(creer))
  // Les deux listes du module disent la même chose, l'une avec la règle au milieu.
  v('la liste de la route et celle du Poste portent les mêmes colonnes',
    [...P.COLONNES_PRESTATION_SANS_COUVERTS.split(', '), ...(await import('../lib/cours-collectifs.js')).COLONNES_COUVERTS.split(', ')].sort().join() === P.COLONNES_PRESTATION_SAISIE.split(', ').sort().join())
  v('🔴 le prix vient de la prestation, jamais de l’écran', /const prix = presta\.prix != null \? Number\(presta\.prix\) : null/.test(creer) && /prix_estime: prix,/.test(creer) && !/corps\.prix/.test(creer))
  v('🔴 les couverts sont bornés par la règle', /couvertsValides\(presta,/.test(creer) && /if \(couverts === null\)/.test(creer))
  v('🔴 la création passe par la fonction de TOUTES les créations', /const res = await creerReservationRdv\(admin, \{/.test(creer))
  v('elle se déclare « commerçant », comme la saisie du patron', /source: 'commercant',/.test(creer))
  v('🔴 ni abonnement ni série pour l’équipe', !/abonnement_id/.test(creer))
  v('le geste va au journal', /journaliserGeste\(admin, garde, \{\s*action: 'rdv_cree'/.test(creer))
  v('les refus se disent en clair', /REFUS\[res\.code\]/.test(creer))

  const salle = code('app/api/equipe/rdv/salle/route.js')
  v('🔴 la salle ne se lit qu’avec la case Agenda', /const garde = await gardeEquipe\(request, admin, commercant_id, 'agenda'\)/.test(salle))
  v('et par la fonction du patron', /lireSalleDuJour\(admin, \{ commercantId: commercant_id, dateStr: date \}\)/.test(salle))

  // 🔴 LA FENÊTRE DU PATRON : inchangée sans le réglage.
  const modal = code('app/dashboard/ModalNouveauRdv.js')
  v('🔴 sans « serveur », la fenêtre lit sa salle comme avant', /\(serveur \? serveur\.lireSalle\(date\) : lireSalle\(commercant\.id, date\)\)/.test(modal))
  v('🔴 sans « serveur », elle écrit comme avant', /const \{ error: errInsert \} = await supabase\.from\('rdv_reservations'\)\.insert\(lignes\)/.test(modal))
  v('🔴 avec « serveur », elle s’arrête AVANT d’écrire elle-même', (() => {
    const i = modal.indexOf('if (serveur) {\n        const r = await serveur.creer({')
    const j = modal.indexOf(".from('rdv_reservations').insert(lignes)")
    return i > 0 && j > i && /if \(onCreated\) onCreated\(\)\s*onClose\(\)\s*return\s*\}/.test(modal.slice(i, j))
  })())
  v('🔴 pas d’abonnement dans le Poste', /if \(serveur \|\| !prestationId \|\| prestationId === UNE_TABLE\) \{ setAbonnes\(\[\]\); return \}/.test(modal))

  // L'écran du Poste.
  const ecran = code('app/equipe/PosteEquipe.js')
  v('🔴 la fenêtre ne s’ouvre qu’avec la case Agenda', /\{saisie && etat\.agenda && etat\.droits\?\.agenda && \(/.test(ecran))
  v('elle reçoit l’accès serveur, stable', /serveur=\{serveurSaisie\}/.test(ecran) && /const serveurSaisie = useMemo\(/.test(ecran))
}

// ═══ 14) ÉTAPE 3b : DÉPLACER UNE RÉSERVATION (30/09) ═════════════════════════
//
// ⚠️ ON EXÉCUTE LA FONCTION DU SERVEUR sur une base en mémoire : un banc qui
// chercherait « creneauAcceptable » dans le fichier resterait vert sur une
// fonction qui écrit n'importe où.
{
  const D = await import('../lib/rdv-deplacement-server.js')
  const { penduleBelge } = await import('../lib/heure-belge.js')

  // Une base en mémoire : les filtres s'appliquent à la lecture et à l'écriture.
  // ⚠️ Une heure se compare à la minute, comme Postgres compare « 19:00 » et
  // « 19:00:00 » sur une colonne `time`.
  const norme = (x) => (/^\d{2}:\d{2}(:\d{2})?$/.test(String(x)) ? String(x).slice(0, 5) : String(x))
  const fauxDb = (tables, options = {}) => {
    const trace = { ecritures: 0 }
    const db = {
      trace,
      from(table) {
        const filtres = []
        let maj = null
        let unique = false
        const b = {
          select() { return b },
          order() { return b },
          eq(c, x) { filtres.push(l => norme(l[c]) === norme(x)); return b },
          // 04/10 (LA-02) : le déplacement prévient la file (`placePrise`), qui
          // lit la file sans les servis. Sans `neq`, ce chemin plantait en silence.
          neq(c, x) { filtres.push(l => norme(l[c]) !== norme(x)); return b },
          in(c, xs) { filtres.push(l => xs.includes(l[c])); return b },
          is(c, x) { filtres.push(l => (l[c] ?? null) === x); return b },
          update(m) { maj = m; return b },
          maybeSingle() { unique = true; return b },
          then(ok, ko) {
            const lignes = () => (tables[table] || []).filter(l => filtres.every(f => f(l)))
            let rep
            if (maj) {
              if (options.avantEcriture) options.avantEcriture(tables)
              if (options.refusEcriture) rep = { data: null, error: options.refusEcriture }
              else {
                const l = lignes()
                l.forEach(x => Object.assign(x, maj))
                trace.ecritures += l.length
                rep = { data: l.map(x => ({ id: x.id })), error: null }
              }
            } else {
              // ⚠️ DES COPIES, comme Supabase : sinon l'écriture modifierait aussi
              // ce qui a été lu, et « l'ancienne heure » serait la nouvelle.
              const l = lignes().map(x => ({ ...x }))
              rep = { data: unique ? (l[0] || null) : l, error: null }
            }
            return Promise.resolve(rep).then(ok, ko)
          },
        }
        return b
      },
    }
    return db
  }
  const OUVERT = { ouvert: true, debut: '09:00', fin: '22:00' }
  const HORAIRES = Object.fromEntries(['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'].map(j => [j, OUVERT]))
  // Jeudi 1er octobre 2026, 10 h à Bruxelles (8 h à Greenwich, heure d'été).
  const INSTANT = new Date('2026-10-01T08:00:00Z')
  const base = () => ({
    commercants: [{ id: 'c1', nom: 'Salon', horaires_detail: HORAIRES, rdv_cadence_couverts: null }],
    rdv_prestations: [
      { id: 'coupe', commercant_id: 'c1', nom: 'Coupe', duree_minutes: 60, capacite: 1, par_couverts: false, actif: true, deleted_at: null },
      { id: 'yoga', commercant_id: 'c1', nom: 'Yoga', duree_minutes: 60, capacite: 3, par_couverts: false, actif: true, deleted_at: null },
    ],
    rdv_creneaux: [],
    commercant_lieux: [],
    rdv_reservations: [
      { id: 'r1', commercant_id: 'c1', prestation_id: 'coupe', date_rdv: '2026-10-05', heure_debut: '10:00:00', heure_fin: '11:00:00', duree_minutes: 60, capacite_creneau: 1, couverts: 1, place_no: 1, statut: 'confirme', deleted_at: null, client_email: 'client@exemple.be' },
      { id: 'r2', commercant_id: 'c1', prestation_id: 'coupe', date_rdv: '2026-10-05', heure_debut: '14:00:00', heure_fin: '15:00:00', duree_minutes: 60, capacite_creneau: 1, couverts: 1, place_no: 1, statut: 'confirme', deleted_at: null, client_email: null },
      { id: 'y1', commercant_id: 'c1', prestation_id: 'yoga', date_rdv: '2026-10-05', heure_debut: '18:00:00', heure_fin: '19:00:00', duree_minutes: 60, capacite_creneau: 3, couverts: 1, place_no: 1, statut: 'confirme', deleted_at: null, client_email: null },
      { id: 'y3', commercant_id: 'c1', prestation_id: 'yoga', date_rdv: '2026-10-05', heure_debut: '18:00:00', heure_fin: '19:00:00', duree_minutes: 60, capacite_creneau: 3, couverts: 1, place_no: 3, statut: 'confirme', deleted_at: null, client_email: null },
      { id: 'y9', commercant_id: 'c1', prestation_id: 'yoga', date_rdv: '2026-10-06', heure_debut: '18:00:00', heure_fin: '19:00:00', duree_minutes: 60, capacite_creneau: 3, couverts: 1, place_no: 1, statut: 'confirme', deleted_at: null, client_email: null },
    ],
  })
  const deplacer = async (tables, args, options) => {
    const db = fauxDb(tables, options)
    try {
      const res = await D.deplacerReservationRdv(db, { commercantId: 'c1', instant: INSTANT, ...args })
      return { res, db, tables }
    } catch (e) {
      return { res: { ok: false, code: 'exception', message: e.message }, db, tables }
    }
  }
  const ligne = (tables, id) => tables.rdv_reservations.find(r => r.id === id)

  {
    const { res, db, tables } = await deplacer(base(), { rdvId: 'r1', date: '2026-10-05', heure: '12:00' })
    const r1 = ligne(tables, 'r1')
    v('🔴 un créneau libre : la réservation est déplacée', res.ok === true && r1.date_rdv === '2026-10-05' && norme(r1.heure_debut) === '12:00', JSON.stringify(res))
    v('🔴 la fin suit la durée FIGÉE de la réservation', norme(r1.heure_fin) === '13:00', r1.heure_fin)
    v('une seule ligne écrite', db.trace.ecritures === 1, String(db.trace.ecritures))
    v('🔴 l’ancienne heure revient, pour l’email « déplacé »', res.ancienne_date === '2026-10-05' && norme(res.ancienne_heure) === '10:00')
    v('🔴 l’adresse du client ne sort pas : seulement « elle existe »', res.client_a_email === true && !JSON.stringify(res).includes('client@exemple.be'))
  }
  {
    // 🔴 LE LIEU SE REGRAVAIT À L'HEURE, PLAGE IGNORÉE (03/10). Le cours du
    // mardi se donne dans l'autre salle, et c'est la PLAGE qui le dit. Déplacé
    // du lundi au mardi, il gardait l'adresse que l'heure désigne, donc la
    // salle principale : la cliente partait au mauvais endroit.
    const t = base()
    t.commercant_lieux = [
      { id: 'L1', commercant_id: 'c1', type: 'permanent', principal: true, libelle: 'Salle du Centre', adresse: 'Place 3', actif: true },
      { id: 'L2', commercant_id: 'c1', type: 'permanent', principal: false, libelle: 'Salle des Fêtes', adresse: 'Rue Haute 9', actif: true },
    ]
    t.rdv_creneaux = [
      { id: 'cr-mar', commercant_id: 'c1', jour_semaine: 'mardi', date_specifique: null, heure_debut: '18:00:00', heure_fin: '19:00:00',
        pause_debut: null, pause_fin: null, actif: true, deleted_at: null, praticien_id: null, lieu_id: 'L2' },
    ]
    const { res, tables } = await deplacer(t, { rdvId: 'y1', date: '2026-10-06', heure: '18:00' })
    const y1 = ligne(tables, 'y1')
    v('🔴 déplacé sur la plage du mardi, le cours prend la salle de CETTE plage',
      res.ok === true && y1.lieu_id === 'L2' && y1.lieu_libelle === 'Salle des Fêtes', JSON.stringify({ res, lieu: y1.lieu_id }))
    const sansPlage = await deplacer(base(), { rdvId: 'r1', date: '2026-10-05', heure: '12:00' })
    v('et sans plage, rien ne change : le lieu se résout à l’heure, comme avant',
      sansPlage.res.ok === true && (ligne(sansPlage.tables, 'r1').lieu_id ?? null) === null)
  }
  {
    const { res, db } = await deplacer(base(), { rdvId: 'r2', date: '2026-10-05', heure: '16:00' })
    v('sans adresse, le serveur le dit', res.ok === true && res.client_a_email === false && db.trace.ecritures === 1)
  }
  {
    const { res, db } = await deplacer(base(), { rdvId: 'r1', date: '2026-10-05', heure: '14:30' })
    v('🔴 un créneau pris est refusé, rien n’est écrit', res.ok === false && res.code === 'conflit' && db.trace.ecritures === 0, JSON.stringify(res))
  }
  {
    const { res, db } = await deplacer(base(), { rdvId: 'r1', date: '2026-10-05', heure: '10:00' })
    v('déplacer vers le même créneau ne réécrit rien', res.ok === false && res.code === 'inutile' && db.trace.ecritures === 0)
  }
  {
    // ⚠️ L'AUTRE COMMERCE EXISTE : sans lui, le refus viendrait de la lecture
    // du commerce, et la garde de la ligne ne serait pas mesurée.
    const t = base()
    t.commercants.push({ id: 'c2', nom: 'Autre', horaires_detail: HORAIRES, rdv_cadence_couverts: null })
    const { res, db } = await deplacer(t, { rdvId: 'r1', date: '2026-10-05', heure: '12:00', commercantId: 'c2' })
    v('🔴 la réservation d’un autre commerce est introuvable', res.ok === false && res.code === 'introuvable' && db.trace.ecritures === 0, JSON.stringify(res))
  }
  {
    // 🔴 LA CUISINE DEVENUE PLEINE PENDANT LA SAISIE. Une table de deux passe à
    // 19 h, où quatre personnes arrivent déjà, dans une cuisine réglée à quatre.
    const t = base()
    t.commercants[0].rdv_cadence_couverts = 4
    t.rdv_prestations.push({ id: 'table', commercant_id: 'c1', nom: 'Table', duree_minutes: 90, capacite: 20, par_couverts: true, couverts_min: 1, couverts_max: 6, quantite: null, actif: true, deleted_at: null })
    t.rdv_reservations.push(
      { id: 't1', commercant_id: 'c1', prestation_id: 'table', date_rdv: '2026-10-05', heure_debut: '12:00:00', heure_fin: '13:30:00', duree_minutes: 90, capacite_creneau: 20, couverts: 2, place_no: 1, statut: 'confirme', deleted_at: null, client_email: null },
      { id: 't2', commercant_id: 'c1', prestation_id: 'table', date_rdv: '2026-10-05', heure_debut: '19:00:00', heure_fin: '20:30:00', duree_minutes: 90, capacite_creneau: 20, couverts: 4, place_no: 1, statut: 'confirme', deleted_at: null, client_email: null },
    )
    const copie = () => JSON.parse(JSON.stringify(t))
    const pasVu = await deplacer(copie(), { rdvId: 't1', date: '2026-10-05', heure: '19:00', vu: { table: null, cadence_depassee: false } })
    v('🔴 une cuisine pleine que la fenêtre n’a pas montrée : rien n’est écrit',
      pasVu.res.ok === false && pasVu.res.code === 'salle_changee' && pasVu.db.trace.ecritures === 0, JSON.stringify(pasVu.res))
    const vu = await deplacer(copie(), { rdvId: 't1', date: '2026-10-05', heure: '19:00', vu: { table: null, cadence_depassee: true } })
    v('montrée et confirmée (« Déplacer quand même ») : elle passe, et prend le rang 2',
      vu.res.ok === true && ligne(vu.tables, 't1').place_no === 2, JSON.stringify(vu.res))
  }
  {
    const t = base()
    ligne(t, 'r1').statut = 'honore'
    const { res, db } = await deplacer(t, { rdvId: 'r1', date: '2026-10-05', heure: '12:00' })
    v('🔴 une réservation honorée ne se rouvre pas', res.ok === false && res.code === 'pas_a_venir' && db.trace.ecritures === 0)
  }
  {
    const { res, db } = await deplacer(base(), { rdvId: 'r1', date: '2026-10-01', heure: '09:30' })
    v('🔴 le passé est refusé', res.ok === false && res.code === 'passe' && db.trace.ecritures === 0, JSON.stringify(res))
  }
  {
    // 🔴 LE FUSEAU DU SERVEUR. On se met à Greenwich, comme Vercel : à 10 h
    // chez nous, la machine dit 8 h. Si le changement de fuseau n'a pas pris,
    // on le DIT, au lieu d'être vert sans avoir rien prouvé.
    const avant = process.env.TZ
    process.env.TZ = 'UTC'
    const machineAGreenwich = INSTANT.getHours() === 8
    v('le banc a pu se mettre à l’heure de Greenwich (sinon la garde du fuseau ne prouve rien)', machineAGreenwich, String(INSTANT.getHours()))
    const p = penduleBelge(INSTANT)
    v('🔴 la pendule belge dit 10 h, même sur une machine à Greenwich', !!p && p.getHours() === 10 && p.getMinutes() === 0, p ? `${p.getHours()}:${p.getMinutes()}` : 'null')
    const { res } = await deplacer(base(), { rdvId: 'r1', date: '2026-10-01', heure: '09:30' })
    v('🔴 et 9 h 30 est déjà passé, même là', res.ok === false && res.code === 'passe', JSON.stringify(res))
    const { res: r2 } = await deplacer(base(), { rdvId: 'r1', date: '2026-10-01', heure: '10:00' })
    v('le quart d’heure en cours reste ouvert', r2.ok === true, JSON.stringify(r2))
    if (avant === undefined) delete process.env.TZ
    else process.env.TZ = avant
  }
  {
    // Deux personnes déplacent la même réservation : la seconde n'écrase rien.
    const { res } = await deplacer(base(), { rdvId: 'r1', date: '2026-10-05', heure: '12:00' }, {
      avantEcriture: (t) => { ligne(t, 'r1').heure_debut = '16:00:00' },
    })
    v('🔴 une réservation modifiée entre-temps n’est pas écrasée', res.ok === false && res.code === 'deja_modifiee', JSON.stringify(res))
  }
  {
    const { res } = await deplacer(base(), { rdvId: 'r1', date: '2026-10-05', heure: '12:00' }, { refusEcriture: { message: 'RDV_DEPLACE_DANS_LE_PASSE' } })
    v('la base qui refuse le passé se dit en clair', res.ok === false && res.code === 'passe')
    const { res: r2 } = await deplacer(base(), { rdvId: 'r1', date: '2026-10-05', heure: '12:00' }, { refusEcriture: { code: '23505', message: 'duplicate' } })
    v('la place prise pendant la saisie se dit en clair', r2.ok === false && r2.code === 'place_prise')
  }
  {
    // 🔴 LA PLACE D'UN COURS : la première libre, pas « inscrits + 1 ».
    const { res, tables } = await deplacer(base(), { rdvId: 'y9', date: '2026-10-05', heure: '18:00' })
    v('🔴 un cours où 1 et 3 sont prises donne la 2', res.ok === true && ligne(tables, 'y9').place_no === 2, JSON.stringify(res))
    const t = base()
    t.rdv_reservations.push({ ...ligne(t, 'y1'), id: 'y2', place_no: 2 })
    const { res: plein, db } = await deplacer(t, { rdvId: 'y9', date: '2026-10-05', heure: '18:00' })
    v('🔴 un cours complet refuse, rien n’est écrit', plein.ok === false && plein.code === 'cours_complet' && db.trace.ecritures === 0, JSON.stringify(plein))
  }

  // 🔴 LA SALLE DOIT RÉPONDRE CE QUE LA FENÊTRE A MONTRÉ.
  const choix = { format: { id: 't4' }, forcer: false, raison: null }
  v('même table, même cuisine : on écrit', D.salleCommeVue({ salleEnTables: true, choix, cadenceDepassee: false, vu: { table: { format_id: 't4', forcer: false, raison: null }, cadence_depassee: false } }))
  v('🔴 une autre table que celle montrée : on n’écrit pas', !D.salleCommeVue({ salleEnTables: true, choix, cadenceDepassee: false, vu: { table: { format_id: 't2', forcer: false, raison: null }, cadence_depassee: false } }))
  v('🔴 une salle devenue pleine (« forcer ») : on n’écrit pas', !D.salleCommeVue({ salleEnTables: true, choix: { ...choix, forcer: true }, cadenceDepassee: false, vu: { table: { format_id: 't4', forcer: false, raison: null }, cadence_depassee: false } }))
  v('🔴 une cuisine devenue pleine : on n’écrit pas', !D.salleCommeVue({ salleEnTables: false, choix: null, cadenceDepassee: true, vu: { table: null, cadence_depassee: false } }))
  v('🔴 aucune table vue par la fenêtre, en inventaire : on n’écrit pas', !D.salleCommeVue({ salleEnTables: true, choix, cadenceDepassee: false, vu: null }))
  v('une valeur absente en JSON vaut « non »', D.salleCommeVue({ salleEnTables: true, choix: { format: { id: 't4' } }, cadenceDepassee: false, vu: { table: { format_id: 't4' } } }))

  // Le serveur, lu : l'écriture filtrée, le fuseau, l'adresse gardée.
  const lib = code('lib/rdv-deplacement-server.js')
  v('🔴 l’écriture est filtrée sur le commerce, le statut et l’ANCIEN créneau',
    /\.update\(maj\)\s*\.eq\('id', rdv\.id\)\.eq\('commercant_id', commercantId\)\s*\.eq\('statut', 'confirme'\)\.is\('deleted_at', null\)\s*\.eq\('date_rdv', rdv\.date_rdv\)\.eq\('heure_debut', rdv\.heure_debut\)/.test(lib))
  v('🔴 aucune adresse du client dans ce que rend la fonction', /client_a_email: !!rdv\.client_email,/.test(lib) && !/client_email: rdv/.test(lib))
  // ⚠️ UNE PARITÉ, PAS UN COMPORTEMENT : deux cours différents ne peuvent pas
  // se chevaucher (la règle du créneau le refuse avant), donc le filtre par
  // prestation ne change aucun résultat observable. Il reste celui de la
  // fenêtre du patron, et c'est ce qu'on vérifie : les deux cherchent la place
  // d'un cours parmi SES inscrits, et celle d'une table parmi toutes.
  v('la place d’un cours se cherche comme chez le patron, parmi SES inscrits',
    /if \(estCours\) requete = requete\.eq\('prestation_id', rdv\.prestation_id\)/.test(lib)
    && /\.eq\('prestation_id', rdv\.prestation_id\)\s*\.eq\('date_rdv', date\)\s*\.eq\('heure_debut', heure\)/.test(code('app/dashboard/ModalDeplacerRdv.js')))

  // La route.
  const route = code('app/api/equipe/rdv/deplacer/route.js')
  v('🔴 déplacer passe par la garde, case Agenda, le commerce déduit de la LIGNE',
    /const garde = await gardeLigneEquipe\(request, admin, 'rdv_reservations', rdv_id, 'agenda'\)\s*if \(!garde\.ok\) return NextResponse\.json/.test(route)
    && /commercantId: garde\.commercant\.id/.test(route) && !/commercant_id/.test(route))
  v('le geste va au journal', /journaliserGeste\(admin, garde, \{\s*action: 'rdv_deplace'/.test(route))
  v('🔴 la route ne rend pas l’adresse du client', !/client_email/.test(route) && /client_a_email: res\.client_a_email/.test(route))

  // Les deux routes de la suite, élargies à l'équipe.
  const rappel = code('app/api/rdv/replanifier-rappel/route.js')
  v('🔴 le rappel se replanifie pour le membre avec la case Agenda', /gardeLigneEquipe\(request, supabase, 'rdv_reservations', rdv_id, 'agenda'\)/.test(rappel))
  const confirme = code('app/api/emails/rdv-confirme/route.js')
  v('🔴 l’email « déplacé » accepte la preuve de l’équipe, case Agenda',
    /const verdictEquipe = deplaceDemande === true && !verdictPro\.ok\s*\? await gardeLigneEquipe\(request, supabase, 'rdv_reservations', rdv_id, 'agenda'\)\.catch\(\(\) => \(\{ ok: false \}\)\)\s*: \{ ok: false \}/.test(confirme)
    && /const deplace = deplaceDemande === true && \(verdictPro\.ok \|\| verdictEquipe\.ok\)/.test(confirme))

  // 🔴 LA FENÊTRE DU PATRON : inchangée sans le réglage.
  const modal = code('app/dashboard/ModalDeplacerRdv.js')
  v('🔴 sans « serveur », la fenêtre lit sa salle comme avant', /\(serveur \? serveur\.lireSalle\(date\) : lireSalleDuJour\(supabase, \{ commercantId: commercant\.id, dateStr: date \}\)\)/.test(modal))
  v('🔴 avec « serveur », elle s’arrête AVANT d’écrire elle-même', (() => {
    const i = modal.indexOf('if (serveur) return await deplacerParLeServeur()')
    const j = modal.indexOf('.update(maj)')
    return i > 0 && j > i
  })())
  v('🔴 la fenêtre envoie ce qu’elle a MONTRÉ de la salle', /table: choixTable \? \{ format_id: choixTable\.format\?\.id \?\? null, forcer: !!choixTable\.forcer, raison: choixTable\.raison \?\? null \} : null,\s*cadence_depassee: cadenceDepassee,/.test(modal))
  v('🔴 au Poste aussi, le rappel suit le rendez-vous, email ou pas', /const rappel = prevenirClient\('\/api\/rdv\/replanifier-rappel', \{ rdv_id: rdv\.id \}, 'le rappel du client'\)/.test(modal))
  v('🔴 l’email ne part que si l’adresse existe ET que la case est cochée', /const emailParti = prevenir && r\.client_a_email === true\s*if \(emailParti\) \{\s*postPro\('\/api\/emails\/rdv-confirme', \{\s*rdv_id: rdv\.id,\s*deplace: true,/.test(modal))
  v('une salle qui a changé se relit', /if \(r\?\.code === 'salle_changee'\) setRelire\(n => n \+ 1\)/.test(modal))

  // L'écran du Poste.
  const ecran = code('app/equipe/PosteEquipe.js')
  v('🔴 la fenêtre de déplacement ne s’ouvre qu’avec la case Agenda', /\{aDeplacer && etat\.agenda && etat\.droits\?\.agenda && \(\s*<ModalDeplacerRdv/.test(ecran))
  v('elle reçoit l’accès serveur', /<ModalDeplacerRdv[\s\S]*?serveur=\{serveurSaisie\}[\s\S]*?\/>/.test(ecran))
  v('🔴 « plutôt le déplacer » ouvre la fenêtre au lieu d’annuler', /if \(choix === 'deplacer'\) \{ setRdvOuvert\(null\); setADeplacer\(rdv\); return \}\s*const d = statutDepuisChoix\('annule_commercant', choix\)/.test(ecran))
  v('🔴 un client sans adresse se dit, avec son téléphone', /Pas d’email pour ce client : préviens-le/.test(lire('app/equipe/PosteEquipe.js')))
}

// ═══ LE POSTE AU QUOTIDIEN (Alex, 01/10, en testant chez MOMO) ═════════════
// « il faut mettre les couleurs comme dans le DB », « le poste se met à jour
// uniquement lors d'un refresh manuel », « je dois choisir à nouveau le
// commerçant […] Très énervant ».
{
  const C = await import('../lib/couleurs-statut-commande.js')
  const P = C.PALETTE_STATUT
  const c = (x) => C.couleurStatutCommande(x)
  v('🔴 en attente rouge, en préparation orange, prête verte, remise bleue',
    c({ statut: 'en_attente' }) === P.rouge && c({ statut: 'en_preparation' }) === P.orange && c({ statut: 'pret' }) === P.vert && c({ statut: 'recupere' }) === P.bleu)
  v('🔴 tout ce qui est fini sans vente est gris : non retirée, ANNULÉE (plus rouge, Alex l’a confondue avec « en attente »), paiement refusé',
    c({ statut: 'non_retire' }) === P.gris && c({ statut: 'annulee_client_refund' }) === P.gris && c({ statut: 'annulee_paiement_ko' }) === P.gris)
  v('🔴 le rouge ne dit plus qu’une chose : à lancer',
    Object.entries(C.COULEUR_PAR_STATUT).filter(([, k]) => k === P.rouge).map(([s]) => s).join(',') === 'en_attente')
  v('🔴 une livraison en route est bleue, comme au tableau de bord',
    c({ statut: 'pret', mode_retrait: 'livraison', statut_livraison: 'en_livraison' }) === P.bleu && c({ statut: 'pret', mode_retrait: 'livraison' }) === P.vert)
  v('un statut inconnu prend la couleur d’« en attente »', c({ statut: 'bizarre' }) === P.rouge && c(null) === P.rouge)

  const bord = code('app/dashboard/page.js')
  v('🔴 le tableau de bord lit la MÊME palette (une seule source)',
    ['gris', 'rouge', 'orange', 'vert', 'bleu'].every(k => new RegExp(`\\b${k}: +PALETTE_STATUT\\.${k},`).test(bord)))
  const attendu = { en_attente: 'rouge', en_preparation: 'orange', pret: 'vert', recupere: 'bleu', non_retire: 'gris', annulee_client_refund: 'gris', annulee_paiement_ko: 'gris' }
  const ecarts = Object.entries(attendu).filter(([s, k]) => C.COULEUR_PAR_STATUT[s] !== P[k]
    || !new RegExp(`'${s}':\\s+\\{[^}]*couleur: T\\.${k},`).test(bord))
  v('🔴 chaque statut a la même couleur au tableau de bord et au Poste', ecarts.length === 0, ecarts.map(e => e[0]).join(','))

  const poste = code('app/equipe/PosteEquipe.js')
  v('🔴 la carte commande du Poste prend la couleur de son statut',
    /const couleur = couleurStatutCommande\(c\)\s*return \(\s*<div style=\{\{ \.\.\.carte, borderTop: `4px solid \$\{couleur\.border\}` \}\}>/.test(poste)
    && /background: couleur\.badge, padding: '4px 10px'/.test(poste))
  v('🔴 la carte livraison aussi, avec son statut écrit', /borderTop: `4px solid \$\{couleurStatutCommande\(l\)\.border\}`/.test(poste) && /background: couleurStatutCommande\(l\)\.badge[\s\S]{0,120}\{libelleStatutCommande\(l\)\}/.test(poste))

  v('🔴 le Poste se rafraîchit toutes les 10 secondes (30, c’était figé)', /const RAFRAICHIR_MS = 10000/.test(poste) && /setInterval\(charger, RAFRAICHIR_MS\)/.test(poste))
  v('🔴 il dit de quand il date, et se rafraîchit à la demande',
    /setEtat\(\{ charge: true, \.\.\.j, majA: new Date\(\) \}\)/.test(poste) && /À jour à \{etat\.majA\.toLocaleTimeString\(/.test(poste) && /<button type="button" onClick=\{charger\}/.test(poste))

  // Le commerce, l'onglet et le filtre survivent au rafraîchissement.
  const A = await import('../lib/poste-adresse.js')
  const deux = [{ commercant_id: 'momo' }, { commercant_id: 'mathilde' }]
  v('lire l’adresse', JSON.stringify(A.lirePoste('?commerce=momo&onglet=livraisons&filtre=pret')) === JSON.stringify({ commerce: 'momo', onglet: 'livraisons', filtre: 'pret' }))
  v('🔴 une seule équipe : elle s’ouvre directement', A.commerceARouvrir([deux[0]])?.commercant_id === 'momo')
  v('🔴 deux équipes : l’adresse rouvre la bonne', A.commerceARouvrir(deux, { adresse: 'mathilde', appareil: 'momo' })?.commercant_id === 'mathilde')
  v('🔴 sans adresse : le dernier commerce de l’appareil', A.commerceARouvrir(deux, { appareil: 'momo' })?.commercant_id === 'momo')
  v('🔴 un commerce dont on n’est pas membre ne s’ouvre pas', A.commerceARouvrir(deux, { adresse: 'autre', appareil: 'inconnu' }) === null && A.commerceARouvrir([], { adresse: 'momo' }) === null)
  {
    const avant = globalThis.window
    const appels = []
    globalThis.window = {
      location: { href: 'https://www.yoppaa.app/equipe?commerce=momo&x=1' },
      history: { state: { s: 1 }, replaceState: (st, t, url) => appels.push(['replace', String(url)]), pushState: (st, t, url) => appels.push(['push', String(url)]) },
    }
    try { A.ecrirePoste({ onglet: 'commandes', commerce: null, pirate: 'oui' }) } finally { globalThis.window = avant }
    const url = appels[0]?.[1] || ''
    v('🔴 l’adresse se réécrit SANS empiler l’historique (« Précédent » reste utile)', appels.length === 1 && appels[0][0] === 'replace', JSON.stringify(appels))
    v('elle pose, retire, et ignore ce qui n’est pas à elle', /onglet=commandes/.test(url) && !/commerce=/.test(url) && !/pirate/.test(url) && /x=1/.test(url), url)
  }
  const page = code('app/equipe/page.js')
  v('🔴 l’écran rouvre le commerce de l’adresse, sinon celui de l’appareil',
    /const rouvrir = commerceARouvrir\(equipes, \{ adresse: lirePoste\(window\.location\.search\)\.commerce, appareil: lireDernierCommerce\(\) \}\)\s*if \(rouvrir\) choisir\(rouvrir\)/.test(page))
  v('🔴 choisir retient les deux, changer oublie les deux',
    /function choisir\(e\) \{\s*setChoisie\(e\)\s*retenirDernierCommerce\(e\.commercant_id\)\s*ecrirePoste\(\{ commerce: e\.commercant_id \}\)/.test(page)
    && /function changer\(\) \{\s*setChoisie\(null\)\s*retenirDernierCommerce\(null\)\s*ecrirePoste\(\{ commerce: null, onglet: null, filtre: null \}\)/.test(page)
    && /onClick=\{\(\) => choisir\(e\)\}/.test(page) && /onChanger=\{etat\.equipes\.length > 1 \? changer : null\}/.test(page))
  // ⚠️ REDIRIGÉE LE 01/10 (onglets Retraits / Livraisons) : changer d'onglet
  // efface aussi le filtre, chaque onglet ayant les siens.
  v('🔴 l’onglet reprend celui de l’adresse, et s’y écrit',
    /useState\(\(\) => \(typeof window === 'undefined' \? null : lirePoste\(window\.location\.search\)\.onglet\)\)/.test(poste)
    && /const choisirOnglet = \(cle\) => \{ setOnglet\(cle\); ecrirePoste\(\{ onglet: cle, filtre: null \}\) \}/.test(poste) && /onClick=\{\(\) => choisirOnglet\(o\.cle\)\}/.test(poste))
  // ⚠️ REDIRIGÉE LE 01/10 : le filtre passe par `useFiltre` et `filtreValide`,
  // propres à chaque onglet. La règle est EXÉCUTÉE plus bas.
  v('🔴 le filtre aussi, et un filtre inconnu retombe sur « À traiter »',
    /return filtreValide\(filtres, voulu\)/.test(poste) && /const setFiltre = \(cle\) => \{ setFiltreEtat\(cle\); ecrirePoste\(\{ filtre: cle \}\) \}/.test(poste))
}

// ═══ RETRAITS ET LIVRAISONS, CHACUN SON ONGLET (Alex, 01/10) ═══════════════
// « les commandes de livraison apparaissent dans commande et dans livraison.
// Le bouton commande devrait être retrait », « il n'y a pas les pastilles de
// statut pour les livraisons ».
{
  const V = await import('../lib/poste-vues.js')
  const cc = { id: 'a', mode_retrait: 'retrait', statut: 'en_attente' }
  const li = (statut, statut_livraison = null) => ({ id: `${statut}-${statut_livraison}`, mode_retrait: 'livraison', statut, statut_livraison })
  const liste = [cc, li('en_attente'), li('en_preparation'), li('pret'), li('pret', 'en_livraison'), li('recupere', 'livree'), { id: 'x', mode_retrait: 'expedition', statut: 'pret' }]
  // ⚠️ RÉÉCRITE LE 01/10 au soir (« elles sont aussi séparées dans le DB
  // patron, il faut reprendre la même structure ») : les filtres sont ceux du
  // tableau de bord, et les deux écrans lisent la même fonction.
  const ret = V.commandesDeLaVue(liste, 'retrait').map(c => c.id).join(',')
  const liv = V.commandesDeLaVue(liste, 'livraison').map(c => c.mode_retrait)
  v('🔴 une livraison n’est plus dans « Retrait »', ret === 'a,x', ret)
  v('🔴 et « Livraison » n’a que des livraisons', liv.length === 5 && liv.every(m => m === 'livraison'))
  const R = V.filtresCommandes('retrait')
  const L = V.filtresCommandes('livraison')
  v('🔴 les filtres du tableau de bord, dans son ordre',
    R.map(f => f.label).join(',') === 'Actives,Nouvelles,En prépa,Prêtes,Récupérées,Non retirés,Annulées,Tout', R.map(f => f.label).join(','))
  v('🔴 en livraison : « Livrées », et jamais « Non retirés »',
    L.map(f => f.label).join(',') === 'Actives,Nouvelles,En prépa,Prêtes,Livrées,Annulées,Tout', L.map(f => f.label).join(','))
  const compte = (cle) => liste.filter(V.estLivraison).filter(L.find(f => f.cle === cle).garde).length
  v('🔴 « Prêtes » comprend une livraison en route, comme au tableau de bord', compte('pret') === 2)
  v('les compteurs suivent les statuts', compte('actives') === 4 && compte('en_attente') === 1 && compte('en_preparation') === 1 && compte('recupere') === 1 && compte('tout') === 5)
  const P = (await import('../lib/couleurs-statut-commande.js')).PALETTE_STATUT
  const teinte = (cle) => R.find(f => f.cle === cle).couleur
  v('🔴 chaque pastille a la couleur de son statut, Annulées en GRIS (plus rouge)',
    teinte('en_attente') === P.rouge.badge && teinte('en_preparation') === P.orange.badge && teinte('pret') === P.vert.badge
    && teinte('recupere') === P.bleu.badge && teinte('non_retire') === P.gris.badge && teinte('annulees') === P.gris.badge
    && teinte('actives') === null && teinte('tout') === null)
  v('🔴 un filtre inconnu, ou d’une autre vue, retombe sur « Actives »',
    V.filtreValide(L, 'non_retire') === 'actives' && V.filtreValide(L, 'pret') === 'pret' && V.filtreValide(R, null) === 'actives' && V.FILTRE_PAR_DEFAUT === 'actives')
  const noms = (etat) => V.ongletsDuPoste(etat).map(o => o.label).join(',')
  v('🔴 les onglets s’appellent comme au tableau de bord : « Retrait », « Livraison »', noms({ commandes: [cc], commerce: { livraison_actif: true } }) === 'Retrait,Livraison')
  v('sans livraison au commerce : « Retrait » seul', noms({ commandes: [cc] }) === 'Retrait')
  v('… mais une livraison présente fait paraître l’onglet', noms({ commandes: [li('pret')] }) === 'Retrait,Livraison')
  v('le livreur seul : « Livraison » seulement', noms({ livraisons: [] }) === 'Livraison')

  // Les deux écrans lisent LA MÊME fonction.
  const bord = code('app/dashboard/page.js')
  v('🔴 le tableau de bord lit les filtres partagés',
    /const filtresDeLaVue = filtresCommandes\(vueMode\)/.test(bord) && /const commandesFiltrees = commandesDuJour\.filter\(gardeFiltre\)/.test(bord)
    && /count: commandesDuJour\.filter\(f\.garde\)\.length/.test(bord) && !/label: 'Nouvelles',\s+count:/.test(bord))
  const poste = code('app/equipe/PosteEquipe.js')
  v('🔴 le Poste aussi', /const FILTRES_RETRAIT = filtresCommandes\('retrait'\)/.test(poste) && /const FILTRES_LIVRAISON = filtresCommandes\('livraison'\)/.test(poste))
  v('🔴 le Poste sert chaque onglet par la règle partagée',
    /<Commandes key="retraits" commandes=\{commandesDeLaVue\(etat\.commandes, 'retrait'\)\} filtres=\{FILTRES_RETRAIT\}/.test(poste)
    && /<Commandes key="livraisons" commandes=\{commandesDeLaVue\(etat\.commandes, 'livraison'\)\} filtres=\{FILTRES_LIVRAISON\}/.test(poste)
    && /const onglets = ongletsDuPoste\(etat\)/.test(poste))
  v('🔴 la pastille choisie prend la couleur du statut, et 0 ne s’écrit pas',
    /const teinte = f\.couleur \|\| T\.panel/.test(poste) && /\{f\.label\}\{n > 0 \? ` · \$\{n\}` : ''\}/.test(poste))
  v('🔴 dans l’onglet Livraison, les boutons du livreur suivent SA case',
    /gestesLivraison=\{etat\.droits\?\.livraisons \? gestesLivraison : null\} enCours=\{enCours\}\/>/.test(poste)
    && /\{gestesLivraison && estLivraison\(c\) && c\.statut === 'pret' && \(\s*<BoutonsLivraison l=\{pourLeLivreur\(c\)\} gestes=\{gestesLivraison\} enCours=\{enCours\}\/>/.test(poste))
  v('🔴 le livreur seul a les mêmes filtres', /const \[filtre, setFiltre\] = useFiltre\(FILTRES_LIVRAISON\)/.test(poste) && /<PastillesFiltres filtres=\{FILTRES_LIVRAISON\} liste=\{livraisons\}/.test(poste))
  v('🔴 plus de « En préparation » écrit sur une commande nouvelle', !/En préparation : pas encore prête/.test(poste) && /Pas encore prête à partir\./.test(poste))
}

// ═══ LE COMPTOIR (étape 5, 01/10) ══════════════════════════════════════════
// « cases comptoir (bon cadeau, tampon fidélité) : OUI » (Alex, 29/09).
{
  // Une base en mémoire où `maybeSingle` rend la ligne OU null, écriture comprise.
  const baseBons = (options = {}) => {
    const tables = {
      bons_cadeaux: [
        { id: 'b1', commercant_id: 'c1', code: 'BC-ABCD-1234', montant_initial: 50, solde: 50, statut: 'actif', expires_at: '2027-12-31T00:00:00Z', beneficiaire_prenom: 'Léa', acheteur_prenom: 'Marc' },
        { id: 'b2', commercant_id: 'c1', code: 'BC-VIEU-X000', montant_initial: 20, solde: 20, statut: 'actif', expires_at: '2026-01-01T00:00:00Z' },
        { id: 'b3', commercant_id: 'c2', code: 'BC-AUTR-E000', montant_initial: 30, solde: 30, statut: 'actif', expires_at: null },
        { id: 'b4', commercant_id: 'c1', code: 'BC-VIDE-0000', montant_initial: 10, solde: 0, statut: 'actif', expires_at: null },
      ],
      bons_cadeaux_mouvements: [],
    }
    const trace = { ecritures: 0 }
    const db = {
      trace, tables,
      from(table) {
        const filtres = []
        let maj = null
        let ajout = null
        let unique = false
        const b = {
          select() { return b },
          eq(c, x) { filtres.push(l => String(l[c]) === String(x)); return b },
          update(m) { maj = m; return b },
          insert(m) { ajout = m; return b },
          maybeSingle() { unique = true; return b },
          then(res, rej) {
            if (ajout) {
              if (options.mouvementKO) return Promise.resolve({ data: null, error: { message: 'insert refusé' } }).then(res, rej)
              tables[table].push({ ...ajout }); trace.ecritures++
              return Promise.resolve({ data: null, error: null }).then(res, rej)
            }
            if (maj && options.avantEcriture && !options._fait) { options._fait = true; options.avantEcriture(tables) }
            const lignes = (tables[table] || []).filter(l => filtres.every(f => f(l)))
            let data
            if (maj) { lignes.forEach(l => Object.assign(l, maj)); trace.ecritures += lignes.length; data = lignes.map(l => ({ id: l.id })) }
            else data = lignes.map(l => ({ ...l }))
            return Promise.resolve({ data: unique ? (data[0] || null) : data, error: null }).then(res, rej)
          },
        }
        return b
      },
    }
    return db
  }
  const B = await import('../lib/bons-comptoir-serveur.js')
  const QUAND = new Date('2026-10-01T12:00:00Z')
  const ch = (db, code, commercantId = 'c1') => B.chercherBonComptoir(db, { commercantId, code, maintenant: QUAND })
  v('🔴 un code mal formé est refusé', (await ch(baseBons(), 'pas un code')).code === 'format')
  v('un code tapé en minuscules sans tirets est retrouvé', (await ch(baseBons(), 'bcabcd1234')).bon?.id === 'b1')
  v('🔴 le bon d’un AUTRE commerce est introuvable', (await ch(baseBons(), 'BC-AUTR-E000')).code === 'introuvable')
  v('🔴 un bon expiré est refusé', (await ch(baseBons(), 'BC-VIEU-X000')).code === 'expire')
  v('un bon vide est dit utilisé', (await ch(baseBons(), 'BC-VIDE-0000')).code === 'epuise')

  const deb = (db, montant, bonId = 'b1') => B.debiterBonComptoir(db, { commercantId: 'c1', bonId, montant, maintenant: QUAND })
  {
    const db = baseBons()
    const r = await deb(db, '12,50')
    const b1 = db.tables.bons_cadeaux.find(b => b.id === 'b1')
    v('🔴 débit : le solde baisse, une seule fois', r.ok && b1.solde === 37.5 && r.bon.solde === 37.5 && r.debite === 12.5, JSON.stringify(r))
    v('🔴 et le mouvement est écrit, en négatif, « comptoir »', db.tables.bons_cadeaux_mouvements.length === 1
      && db.tables.bons_cadeaux_mouvements[0].montant === -12.5 && db.tables.bons_cadeaux_mouvements[0].source === 'comptoir')
  }
  {
    const db = baseBons()
    v('🔴 plus que le solde : refusé, rien n’est écrit', (await deb(db, 60)).code === 'depasse' && db.trace.ecritures === 0)
    v('un montant nul ou illisible est refusé', (await deb(db, 0)).code === 'montant' && (await deb(db, 'abc')).code === 'montant')
    v('🔴 le bon d’un autre commerce ne se débite pas', (await deb(db, 5, 'b3')).code === 'introuvable' && db.trace.ecritures === 0)
  }
  {
    // 🔴 DEUX COMPTOIRS EN MÊME TEMPS : le solde bouge entre la lecture et l'écriture.
    const db = baseBons({ avantEcriture: (t) => { t.bons_cadeaux[0].solde = 30 } })
    const r = await deb(db, 20)
    v('🔴 deux débits simultanés : le second est refusé, aucun mouvement',
      !r.ok && r.code === 'deja_fait' && db.tables.bons_cadeaux_mouvements.length === 0 && db.tables.bons_cadeaux[0].solde === 30, JSON.stringify(r))
  }
  {
    const db = baseBons({ mouvementKO: true })
    let leve = false
    try { await deb(db, 10) } catch { leve = true }
    v('🔴 un mouvement qui échoue remet le solde (jamais un débit sans trace)', leve && db.tables.bons_cadeaux[0].solde === 50)
  }

  const route = code('app/api/bons-cadeaux/comptoir/route.js')
  v('🔴 la route des bons exige la case « Comptoir » (le patron passe toujours)',
    /gardeEquipe\(request, admin, commercant_id, 'comptoir'\)/.test(route) && /const commercantId = garde\.commercant\.id/.test(route))
  v('le débit d’un membre va au journal', /action: 'bon_debite'/.test(route))
  const cfg = code('app/dashboard/ConfigDashboard.js')
  v('🔴 le patron ne débite plus un bon depuis son navigateur',
    !/from\('bons_cadeaux_mouvements'\)\s*\.insert/.test(cfg) && /appelBonComptoir\(\{ action: 'debiter', bon_id: bon\.id, montant: m \}\)/.test(cfg))

  for (const f of ['app/api/fidelite/comptoir/route.js', 'app/api/fidelite/mouvement/route.js']) {
    const r = code(f)
    v(`🔴 ${f.split('/')[3]} : ouverte à la case « Comptoir », plus réservée au patron`,
      /gardeEquipe\(request, (?:admin|db), commercant_id, 'comptoir'\)/.test(r) && !/com\.auth_user_id !== user\.id/.test(r))
  }
  const mouv = code('app/api/fidelite/mouvement/route.js')
  v('🔴 supprimer une carte reste au patron', /if \(action === 'supprimer'\) \{\s*if \(garde\.role === 'membre'\) \{\s*return NextResponse\.json\(\{ ok: false, error: 'Seul le responsable peut supprimer une carte\.' \}, \{ status: 403 \}\)/.test(mouv))
  v('les tampons d’un membre vont au journal', /action: 'fidelite_credit'/.test(mouv) && /action: 'fidelite_recompense_utilisee'/.test(mouv))

  const posteRoute = code('app/api/equipe/poste/route.js')
  v('🔴 la règle du comptoir n’arrive qu’à la case « Comptoir »',
    /if \(permis\.comptoir\) \{\s*const \{ data: cfg, error: errCfg \} = await admin\.from\('commercants'\)\.select\(COLONNES_COMPTOIR_POSTE\)/.test(posteRoute))
  const V = await import('../lib/poste-vues.js')
  v('l’onglet « Comptoir » paraît avec la case', V.ongletsDuPoste({ comptoir: {} }).map(o => o.label).join(',') === 'Comptoir')
  const poste = code('app/equipe/PosteEquipe.js')
  v('🔴 le Poste n’ouvre le comptoir qu’avec la case', /\{actif === 'comptoir' && etat\.comptoir && etat\.droits\?\.comptoir && \(/.test(poste))
  const comptoir = code('app/equipe/PosteComptoir.js')
  v('🔴 l’écran du comptoir passe par les routes du patron, et ne supprime rien',
    /'\/api\/fidelite\/comptoir'/.test(comptoir) && /'\/api\/fidelite\/mouvement'/.test(comptoir) && /'\/api\/bons-cadeaux\/comptoir'/.test(comptoir)
    && !/supprimer/.test(comptoir) && !/from\('/.test(comptoir))
  v('🔴 chaque tampon porte sa clé d’anti-doublon', (comptoir.match(/cle: cleRequete\(\)/g) || []).length === 2)
}

// ═══ APRÈS LA REMISE, ET « NON RETIRÉE » AU SERVEUR (01/10) ════════════════
{
  const fauxBase = (tables, { avantEcriture = null } = {}) => {
    const trace = { ecritures: 0 }
    return {
      trace,
      from(table) {
        const filtres = []
        let maj = null
        let unique = false
        const b = {
          select() { return b },
          eq(c, x) { filtres.push(l => l[c] === x); return b },
          // 04/10 (LA-02) : le déplacement prévient la file (`placePrise`), qui
          // lit la file sans les servis. Sans `neq`, ce chemin plantait en silence.
          neq(c, x) { filtres.push(l => l[c] !== x); return b },
          is(c, x) { filtres.push(l => (l[c] ?? null) === x); return b },
          update(m) { maj = m; return b },
          maybeSingle() { unique = true; return b },
          then(res, rej) {
            if (maj && avantEcriture) avantEcriture(tables)
            const lignes = (tables[table] || []).filter(l => filtres.every(f => f(l)))
            let data
            if (maj) { lignes.forEach(l => Object.assign(l, maj)); trace.ecritures += lignes.length; data = lignes.map(l => ({ id: l.id })) }
            else data = lignes.map(l => ({ ...l }))
            return Promise.resolve({ data: unique ? (data[0] || null) : data, error: null }).then(res, rej)
          },
        }
        return b
      },
    }
  }
  const G = await import('../lib/commande-gestes-serveur.js')
  const QUAND = new Date('2026-10-01T12:00:00Z')
  const cmd = (x = {}) => ({ id: 'k1', commercant_id: 'c1', statut: 'recupere', statut_livraison: null, mode_retrait: 'retrait', total: 36, paye_en_ligne: false, bon_cadeau_montant: null, fidelite_remise: 10, encaisse_mode: null, ...x })
  const tables = (x) => ({ commandes: [cmd(x), cmd({ id: 'k2', commercant_id: 'c2' })] })
  const enc = async (t, choix, opts, commandeId = 'k1') => {
    const db = fauxBase(t, opts)
    return { r: await G.encaisserApresCoup(db, { commandeId, commercantId: 'c1', choix, maintenant: QUAND }), db, k1: t.commandes[0] }
  }
  {
    const { r, db, k1 } = await enc(tables(), 'especes')
    v('🔴 encaissement après coup : le montant RÉEL (récompense déduite), une écriture',
      r.ok && db.trace.ecritures === 1 && k1.encaisse_mode === 'especes' && k1.encaisse_montant === 26 && k1.statut === 'recupere', JSON.stringify(k1))
  }
  v('sans dire comment : refusé', (await enc(tables(), null)).r.code === 'encaissement')
  v('🔴 déjà noté : refusé, on ne réécrit jamais l’argent', (await enc(tables({ encaisse_mode: 'terminal' }), 'especes')).r.code === 'refuse')
  v('🔴 une commande pas encore remise passe par la remise, pas ici', (await enc(tables({ statut: 'pret' }), 'especes')).r.code === 'refuse')
  v('payée en ligne : rien à encaisser', (await enc(tables({ paye_en_ligne: true }), 'especes')).r.code === 'refuse')
  v('🔴 la commande d’un autre commerce est introuvable', (await enc(tables(), 'especes', {}, 'k2')).r.code === 'introuvable')
  {
    const { r, db } = await enc(tables(), 'especes', { avantEcriture: (t) => { t.commandes[0].encaisse_mode = 'terminal' } })
    v('🔴 noté ailleurs entre-temps : refusé, l’argent n’est pas écrit deux fois', !r.ok && r.code === 'deja_fait' && db.trace.ecritures === 0)
  }

  const ret = async (t, opts) => {
    const db = fauxBase(t, opts)
    return { r: await G.retourArriere(db, { commandeId: 'k1', commercantId: 'c1' }), db, k1: t.commandes[0] }
  }
  {
    const { r, k1 } = await ret(tables({ encaisse_mode: 'especes', encaisse_montant: 26, encaisse_le: 'x' }))
    v('🔴 retour arrière : la commande redevient prête, le relevé s’efface en entier',
      r.ok && k1.statut === 'pret' && k1.encaisse_mode === null && k1.encaisse_montant === null && k1.encaisse_le === null, JSON.stringify(k1))
    v('🔴 et `paye_en_ligne` n’est jamais touché', !('paye_en_ligne' in r.champs))
  }
  {
    const { r, k1 } = await ret(tables({ mode_retrait: 'livraison', statut_livraison: 'livree' }))
    v('une livraison redevient « pas encore partie »', r.ok && k1.statut === 'pret' && k1.statut_livraison === null)
  }
  v('🔴 une expédition ne revient pas en arrière (la règle du tableau de bord)', (await ret(tables({ mode_retrait: 'expedition' }))).r.code === 'refuse')
  v('une commande pas remise ne revient pas en arrière', (await ret(tables({ statut: 'pret' }))).r.code === 'refuse')
  {
    const { r, db } = await ret(tables(), { avantEcriture: (t) => { t.commandes[0].statut = 'pret' } })
    v('🔴 défaite ailleurs entre-temps : refusée, rien n’est réécrit', !r.ok && r.code === 'deja_fait' && db.trace.ecritures === 0)
  }

  for (const f of ['app/api/commande/encaisser/route.js', 'app/api/commande/retour-arriere/route.js']) {
    const r = code(f)
    v(`🔴 ${f.split('/')[3]} : la case « Commandes », le commerce déduit de la commande`,
      /gardeLigneEquipe\(request, admin, 'commandes', commande_id, 'commandes'\)/.test(r) && /commercantId: verdict\.commercant\.id/.test(r))
  }
  const nonRetire = code('app/api/commande/non-retire/route.js')
  v('🔴 « non retirée » : le serveur applique la règle d’heure AVANT d’écrire',
    /if \(lue\?\.statut === 'pret' && !peutMarquerNonRetire\(lue, new Date\(\)\)\) \{/.test(nonRetire)
    && nonRetire.indexOf('peutMarquerNonRetire(lue') < nonRetire.indexOf(".update({ statut: 'non_retire' })")
    && /\.select\('id, statut, date_commande, creneau:creneaux\(heure_fin\)'\)/.test(nonRetire))
  const regle = code('lib/rappels-retrait.js')
  v('🔴 la règle se lit à l’heure de Bruxelles, plus à celle de la machine',
    /const fin = brusselsInstant\(/.test(regle) && /const finDuJour = brusselsInstant\(/.test(regle) && !/new Date\(`\$\{commande\.date_commande\}T/.test(regle))

  const bord = code('app/dashboard/page.js')
  const i = bord.indexOf('async function annulerRemise(commande) {')
  const annuler = i >= 0 ? bord.slice(i, bord.indexOf('async function encaisserApresCoup(', i)) : ''
  v('🔴 le patron défait par le serveur, plus depuis son navigateur',
    annuler.length > 100 && /postPro\('\/api\/commande\/retour-arriere'/.test(annuler) && !/supabase\s*\.from\('commandes'\)/.test(annuler))
  v('🔴 l’encaissement après coup du patron passe par le serveur, sans rejouer la remise',
    /\} else if \(commandeAEncaisser\.statut === 'recupere'\) \{[\s\S]{0,400}const ok = await encaisserApresCoup\(commandeAEncaisser\.id, choix\)/.test(bord)
    && /postPro\('\/api\/commande\/encaisser', \{ commande_id: commandeId, encaissement: choix \}\)/.test(bord))

  const poste = code('app/equipe/PosteEquipe.js')
  v('🔴 Poste : « Noter l’encaissement » seulement sur une commande remise qui attend son argent',
    /\{gestes && c\.statut === 'recupere' && !c\.encaisse_mode && resteAEncaisserCommande\(c\) > 0 && \(/.test(poste))
  v('🔴 Poste : le retour arrière seulement dans le filtre « Récupérées », comme au tableau de bord',
    /\{gestes && retourPossible && retourArriereAutorise\(c\) && \(/.test(poste) && /retourPossible=\{filtre === 'recupere'\}/.test(poste))
  v('Poste : les deux gestes passent par les routes du patron',
    /postPro\('\/api\/commande\/encaisser', \{ commande_id: c\.id, encaissement: choix \}\)/.test(poste) && /postPro\('\/api\/commande\/retour-arriere', \{ commande_id: c\.id \}\)/.test(poste))
}

console.log(`\nÉquipe : ${ok} vérifications`)
if (echecs.length > 0) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
