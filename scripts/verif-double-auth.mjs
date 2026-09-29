// BANC : L'ADMIN SE RECONNAÎT EN UN SEUL ENDROIT, ET SA PORTE DEMANDE UN CODE.
//
// 🔐 CE QU'ON PROTÈGE (Alex, 29/09) : « il va falloir sécuriser mon accès au
// DB admin, 2FA ». Être admin, c'était détenir une adresse et un mot de passe,
// et l'adresse était recopiée dans vingt-deux fichiers. Un seul endroit oublié
// suffit à contourner le code à six chiffres : ce banc compte les endroits.
//
//   npm run verif:double-auth

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { sansProse } from './lire-code.mjs'
import { reglesAdmin, estAdminYoppaa, EXIGER_DOUBLE_AUTH_ADMIN } from '../lib/api-auth.js'
import { ADMIN_EMAIL, estAdresseAdmin } from '../lib/admin-identite.js'

let ok = 0
const echecs = []
const v = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  echecs.push(`${nom}${detail ? ` — ${detail}` : ''}`)
}
const lire = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
const code = (f) => sansProse(lire(f))

function fichiers(dossier, acc = []) {
  for (const e of readdirSync(dossier, { withFileTypes: true })) {
    const p = join(dossier, e.name).replace(/\\/g, '/')
    if (e.isDirectory()) fichiers(p, acc)
    else if (e.name.endsWith('.js')) acc.push(p)
  }
  return acc
}

// ═══ 1) LA RÈGLE ════════════════════════════════════════════════════════════
{
  const admin = { email: ADMIN_EMAIL }
  const autre = { email: 'commercant@exemple.be' }
  v('un autre compte n est jamais admin', reglesAdmin({ user: autre, aal: 'aal2', exiger: true }) === false
    && reglesAdmin({ user: autre, aal: 'aal2', exiger: false }) === false)
  v('sans compte, personne', reglesAdmin({ user: null, aal: 'aal2', exiger: false }) === false)
  // 🔐 LE CŒUR : exigé, le mot de passe seul ne suffit plus.
  v('exigé : le mot de passe seul ne suffit pas', reglesAdmin({ user: admin, aal: 'aal1', exiger: true }) === false)
  v('exigé : sans niveau lisible, refusé', reglesAdmin({ user: admin, aal: null, exiger: true }) === false)
  v('exigé : avec le code, l admin passe', reglesAdmin({ user: admin, aal: 'aal2', exiger: true }) === true)
  v('pas encore exigé : l admin passe (le temps de s enrôler)', reglesAdmin({ user: admin, aal: 'aal1', exiger: false }) === true)
  v('le drapeau est un booléen', typeof EXIGER_DOUBLE_AUTH_ADMIN === 'boolean')
  v('l adresse se reconnaît quelle que soit la casse', estAdresseAdmin(ADMIN_EMAIL.toUpperCase()) === true)
  v('une adresse voisine ne passe pas', estAdresseAdmin(`x${ADMIN_EMAIL}`) === false && estAdresseAdmin('') === false)
  v('reconnaître reste distinct d autoriser', estAdminYoppaa(admin) === true)
}

// ═══ 2) L'ADRESSE N'EXISTE QU'EN UN ENDROIT ═════════════════════════════════
{
  const partout = [...fichiers('app'), ...fichiers('lib')]
  const porteurs = partout.filter(f => lire(f).includes(ADMIN_EMAIL))
  v('l adresse admin n est écrite que dans lib/admin-identite.js',
    porteurs.length === 1 && porteurs[0] === 'lib/admin-identite.js', porteurs.join(', '))

  // ⚠️ ET PERSONNE NE COMPARE L'ADRESSE À LA MAIN, même en l'important.
  const comparent = fichiers('app/api').filter(f => /user\??\.email\s*[!=]==\s*ADMIN_EMAIL|ADMIN_EMAIL\s*[!=]==\s*user/.test(code(f)))
  v('aucune route ne compare l adresse à la main', comparent.length === 0, comparent.join(', '))
}

// ═══ 3) CHAQUE ROUTE D'ADMINISTRATION PASSE PAR LA VÉRIFICATION ═════════════
{
  const routes = fichiers('app/api/admin').filter(f => f.endsWith('/route.js'))
  v('les routes d administration sont trouvées', routes.length >= 16, `${routes.length}`)
  const sans = routes.filter(f => {
    const s = code(f)
    return !/await adminVerifie\(request, user\)/.test(s) && !/gardeCommercant\(/.test(s)
  })
  v('chaque route d administration appelle adminVerifie', sans.length === 0, sans.join(', '))
  const aveugles = routes.filter(f => /estAdminYoppaa\(/.test(code(f)))
  v('aucune route n autorise avec la simple reconnaissance', aveugles.length === 0, aveugles.join(', '))

  const auth = code('lib/api-auth.js')
  v('le niveau vient d un jeton VÉRIFIÉ', /client\.auth\.getClaims\(token\)/.test(auth) && !/atob\(|Buffer\.from\(token/.test(auth))
  v('adminVerifie applique la règle', /return reglesAdmin\(\{ user, aal \}\)/.test(auth))
  v('la garde du commerçant laisse passer l admin par la même vérification',
    /if \(await adminVerifie\(request, user\)\) return \{ ok: true, user \}/.test(auth))
}

// ═══ 4) LA PORTE DE L'ADMIN ═════════════════════════════════════════════════
{
  const page = code('app/admin/page.js')
  const porte = code('app/admin/DoubleAuth.js')
  const iPorte = page.indexOf("if (session.user.email === ADMIN_EMAIL && niveau === 'code') {")
  const iContenu = page.indexOf('// ─── Page admin principale')
  const iContenuCode = page.indexOf('<main style=')
  v('la porte passe AVANT le contenu', iPorte > 0 && iContenuCode > iPorte, `${iPorte} / ${iContenuCode} / ${iContenu}`)
  v('la porte montre l écran du code', /return <EcranCodeAdmin onValide=\{relireNiveau\} onDeconnexion=\{seDeconnecter\}\/>/.test(page))
  v('rien ne se charge derrière la porte', /if \(niveau === 'code' \|\| niveau === null\) return/.test(page))
  v('le niveau est lu avant d ouvrir la page', /etatDoubleAuth\(\)\.then\(n => \{[\s\S]{0,80}setNiveau\(n\)[\s\S]{0,40}setChecking\(false\)/.test(page))
  v('code validé = niveau aal2, et seulement lui', /if \(data\?\.currentLevel === 'aal2'\) return 'ok'/.test(porte)
    && /if \(data\?\.nextLevel === 'aal2'\) return 'code'/.test(porte))
  v('le code est vérifié par Supabase, jamais comparé dans le navigateur', /supabase\.auth\.mfa\.challengeAndVerify\(\{ factorId: f\.id, code \}\)/.test(porte))
  v('la section sécurité se voit en tête tant qu aucun appareil n est enrôlé',
    /\{niveau !== 'ok' && niveau !== 'code' && \(\s*<SectionSecuriteAdmin/.test(page))
  v('retirer le dernier appareil se dit', /C'est ton dernier appareil/.test(lire('app/admin/DoubleAuth.js')))
}

// ═══ 5) EN BASE ═════════════════════════════════════════════════════════════
{
  const sql = lire('migrations/MIGRATION_ADMIN_CENTRALISE.sql')
  for (const nom of ['Admin only impersonations', 'Admin Yoppaa modifie tout', 'Admin Yoppaa voit tout', 'Admin only stripe events', 'kyb_select_own_or_admin']) {
    v(`la policy « ${nom} » passe par la fonction`, new RegExp(`CREATE POLICY "?${nom}"?[\\s\\S]{0,260}is_yoppaa_admin\\(\\)`).test(sql))
  }
  const ddl = sql.split('-- ─── CONTRÔLE')[0].replace(/^--.*$/gm, '')
  v('la migration n écrit plus l adresse nulle part', !ddl.includes(ADMIN_EMAIL))
}

// ═══ 6) ÉTAPE 4 : LE CODE EST EXIGÉ (29/09, après le « TEST OK » d'Alex) ════
{
  v('le serveur exige le code', EXIGER_DOUBLE_AUTH_ADMIN === true)
  const sql = lire('migrations/MIGRATION_ADMIN_DOUBLE_AUTH.sql')
  const ddl = sql.split('-- ─── CONTRÔLE')[0].replace(/^--.*$/gm, '')
  v('la base exige le code', /auth\.email\(\) = '[^']+'\s*AND coalesce\(auth\.jwt\(\) ->> 'aal', ''\) = 'aal2'/.test(ddl))
  v('le contrôle essaie l admin sans code, et attend false',
    /'admin, mot de passe seul',\s*pg_temp\.essai_admin\('\{"email":"[^"]+","aal":"aal1"\}'\), 'false'/.test(sql))
  v('le contrôle essaie l admin avec code, et attend true',
    /'admin, avec le code',\s*pg_temp\.essai_admin\('\{"email":"[^"]+","aal":"aal2"\}'\), 'true'/.test(sql))
  v('le retour en arrière est écrit', /POUR REVENIR EN ARRIÈRE/.test(sql))
}

// ═══ 7) LE MOT DE PASSE DE L'ADMIN SE CHANGE DEPUIS L'ADMIN (29/09) ════════
//
// Alex n'a pas de commerce : « Mon compte » lui était inaccessible.
{
  const porte = code('app/admin/DoubleAuth.js')
  v('un code par email est demandé avant tout changement', /await supabase\.auth\.reauthenticate\(\)/.test(porte))
  v('le changement porte ce code', /supabase\.auth\.updateUser\(\{ password: mdp, nonce \}\)/.test(porte))
  v('les deux saisies se comparent brutes, espaces compris', /if \(mdp !== mdpBis\)/.test(porte) && !/mdp\.trim\(\)/.test(porte))
  v('la longueur minimale est celle de « Mon compte »', /if \(!mdpAssezLong\(mdp\)\)/.test(porte))
  v('la section le propose', /<ChangerMotDePasseAdmin toast=\{toast\}\/>/.test(porte))
}

console.log(`\nDouble authentification de l'admin : ${ok} vérifications`)

if (echecs.length > 0) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
