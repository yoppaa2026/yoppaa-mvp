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
  const toutes = `${P.COLONNES_RDV_EQUIPE}, ${P.COLONNES_COMMANDE_EQUIPE}, ${P.COLONNES_COMMERCE_POSTE}`
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
  const permises = ['id', 'reference', 'client_nom', 'client_telephone', 'adresse', 'note', 'date', 'creneau', 'creneau_livraison_id', 'statut', 'statut_livraison', 'a_encaisser', 'lignes']
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
  v('🔴 l’annulation du Poste ne propose pas « déplacer » (pas encore)', /actions: \(q\.actions \|\| \[\]\)\.filter\(a => a\.valeur !== 'deplacer'\)/.test(poste))
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

console.log(`\nÉquipe : ${ok} vérifications`)
if (echecs.length > 0) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
