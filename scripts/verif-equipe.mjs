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
  const quatre = [1, 2, 3, 4].map(i => membre({ id: `m${i}`, email: `p${i}@exemple.be` }))
  const cinq = [...quatre, membre({ id: 'm5', email: 'p5@exemple.be', statut: 'invite' })]
  v('à quatre, on invite encore', refusInvitation({ ...base, membres: quatre }) === null)
  v(`🔴 à ${EQUIPE_MAX}, invitations en attente comprises, on n’invite plus`, refusInvitation({ ...base, membres: cinq }) !== null)
  v('les retirés ne comptent pas dans le plafond', refusInvitation({ ...base, membres: [...quatre, membre({ id: 'm9', email: 'x@exemple.be', statut: 'retire' })] }) === null)
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
  const routes = readdirSync(new URL(`../${dossier}`, import.meta.url), { withFileTypes: true })
    .filter(e => e.isDirectory()).map(e => join(dossier, e.name, 'route.js').replace(/\\/g, '/'))
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
  v('🔴 puis applique peutAgir', /if \(!peutAgir\(\{ membre, commercant, droit \}\)\) return \{ ok: false, status: 403/.test(serveur))
  v('🔴 un membre ne gère pas l’équipe (garde du patron : propriétaire ou admin vérifié)',
    /const patron = commercant\.auth_user_id === user\.id/.test(serveur) && /if \(!patron && !\(await adminVerifie\(request, user\)\)\) return \{ ok: false, status: 403/.test(serveur))
  v('🔴 une lecture ratée lève, elle ne répond pas « personne »', (serveur.match(/if \(error\) throw new Error/g) || []).length >= 3)
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

console.log(`\nÉquipe : ${ok} vérifications`)
if (echecs.length > 0) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
