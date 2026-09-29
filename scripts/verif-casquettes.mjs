// BANC : UNE CONNEXION, PLUSIEURS CASQUETTES (29/09, proposition A d'Alex).
//
// Supprimer une casquette (le profil Yopper, un commerce) n'efface que SES
// données. La connexion n'est effacée que s'il ne reste rien d'autre, et
// jamais celle de l'admin. Ce banc exécute la règle, puis vise les deux
// routes qui effacent des connexions.
//
//   npm run verif:casquettes

import { readFileSync } from 'node:fs'
import { sansProse } from './lire-code.mjs'
import { casquettesDe, casquettesRestantes, connexionEffacable, raisonDeGarder, preinscriptionsAEffacer } from '../lib/casquettes.js'
import { ADMIN_EMAIL } from '../lib/admin-identite.js'

let ok = 0
const echecs = []
const v = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  echecs.push(`${nom}${detail ? ` — ${detail}` : ''}`)
}
const code = (f) => sansProse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'))

const quelquun = { id: 'u1', email: 'marc@exemple.be' }
const un = [{ id: 'x' }]

// ═══ 1) LES CASQUETTES ══════════════════════════════════════════════════════
{
  v('un Yopper seul', casquettesDe({ user: quelquun, profilsYopper: un }).join() === 'yopper')
  v('patron et Yopper', casquettesDe({ user: quelquun, profilsYopper: un, commerces: un }).join() === 'yopper,commerce')
  v('membre d’une équipe', casquettesDe({ user: quelquun, equipes: un }).join() === 'equipe')
  v('🔴 l’admin se reconnaît à son adresse, casse comprise', casquettesDe({ user: { id: 'a', email: ADMIN_EMAIL.toUpperCase() } }).includes('admin'))
  v('rien du tout', casquettesDe({ user: quelquun }).length === 0)
  v('les casquettes restantes', casquettesRestantes(['yopper', 'commerce'], 'yopper').join() === 'commerce')
}

// ═══ 2) QUAND LA CONNEXION S'EFFACE ═════════════════════════════════════════
{
  v('un Yopper seul : sa connexion part avec son profil', connexionEffacable(['yopper'], 'yopper') === true)
  v('🔴 un patron qui supprime son profil Yopper garde sa connexion', connexionEffacable(['yopper', 'commerce'], 'yopper') === false)
  v('🔴 un membre d’équipe aussi', connexionEffacable(['yopper', 'equipe'], 'yopper') === false)
  v('🔴 l’admin ne perd JAMAIS sa connexion', connexionEffacable(['yopper', 'admin'], 'yopper') === false && connexionEffacable(['admin'], null) === false)
  // ⚠️ MÊME SI L'ON RETIRAIT LA CASQUETTE « ADMIN » ELLE-MÊME. Sans ce cas, la
  // ligne qui protège l'admin pouvait disparaître sans qu'aucune garde rougisse
  // (mesuré par mutation le 29/09) : la règle générale couvrait les autres.
  v('🔴 même en retirant la casquette « admin », sa connexion reste', connexionEffacable(['admin'], 'admin') === false)
  // Côté admin, le commerce est déjà effacé : rien ne se retire du calcul.
  v('un patron sans rien d’autre : sa connexion part avec son commerce', connexionEffacable([], null) === true)
  v('🔴 un patron qui a un AUTRE commerce garde sa connexion', connexionEffacable(['commerce'], null) === false)
  v('🔴 un patron aussi Yopper garde sa connexion', connexionEffacable(['yopper'], null) === false)
}

// ═══ 3) CE QU'ON LUI DIT ════════════════════════════════════════════════════
{
  v('au Yopper, on dit « ton »', raisonDeGarder(['yopper', 'commerce'], 'yopper') === 'Ton compte de connexion reste actif : il sert aussi à ton commerce.')
  v('à l’admin, on dit « son »', raisonDeGarder(['yopper', 'commerce'], null, 'admin') === 'Son compte de connexion est conservé : il sert aussi à son profil Yopper et à un autre de ses commerces.', raisonDeGarder(['yopper', 'commerce'], null, 'admin'))
  v('rien à garder, rien à dire', raisonDeGarder(['yopper'], 'yopper') === null)
}

// ═══ 4) LES PRÉINSCRIPTIONS ═════════════════════════════════════════════════
{
  v('🔴 un patron garde sa préinscription de commerçant', preinscriptionsAEffacer(['yopper', 'commerce'])?.join() === 'yopper')
  v('sans commerce, toutes ses préinscriptions partent', preinscriptionsAEffacer(['yopper']) === null)
}

// ═══ 5) LA ROUTE « SUPPRIMER MON COMPTE » (YOPPER) ══════════════════════════
{
  const s = code('app/api/yopper/supprimer-compte/route.js')
  const iCasq = s.indexOf('const casquettes = await casquettesDuCompte(admin, user)')
  const iEfface = s.indexOf(".from('favoris').delete()")
  v('🔴 les casquettes se lisent AVANT tout effacement', iCasq > 0 && iEfface > iCasq, `${iCasq} / ${iEfface}`)
  const iGarde = s.indexOf("if (!connexionEffacable(casquettes, 'yopper')) {")
  const iDelete = s.indexOf('await admin.auth.admin.deleteUser(user.id)')
  v('🔴 la connexion ne s’efface qu’après la règle', iGarde > 0 && iDelete > iGarde)
  v('🔴 et la règle renvoie AVANT l’effacement', /if \(!connexionEffacable\(casquettes, 'yopper'\)\) \{[\s\S]{0,400}return NextResponse\.json\(\{\s*ok: true,\s*connexion_conservee: true/.test(s))
  v('la personne sait pourquoi sa connexion reste', /message: `Ton profil Yopper est supprimé\. \$\{raisonDeGarder\(casquettes, 'yopper'\)\}`/.test(s))
  v('🔴 un patron garde sa préinscription de commerçant', /const types = preinscriptionsAEffacer\(casquettes\)/.test(s) && /\.in\('type_utilisateur', types\)/.test(s))
  v('le profil Yopper est détaché de la connexion', /auth_user_id: null,/.test(s))
}

// ═══ 6) LA SUPPRESSION D'UN COMMERCE (ADMIN) ════════════════════════════════
{
  const s = code('app/api/admin/commercants/route.js')
  v('🔴 l’admin lit les casquettes avant d’effacer la connexion',
    /const casquettes = await casquettesDuCompte\(admin, lu\.user\)\s*if \(!connexionEffacable\(casquettes, null\)\) \{/.test(s))
  v('🔴 le commerce déjà effacé ne se retire pas une seconde fois (null)', !/connexionEffacable\(casquettes, 'commerce'\)/.test(s))
  v('🔴 la connexion ne s’efface que dans la branche « plus rien »',
    /\} else \{\s*const \{ error: errAuth \} = await admin\.auth\.admin\.deleteUser\(c\.auth_user_id\)/.test(s))
  v('un compte illisible n’est pas effacé', /compte illisible, NON supprimé/.test(s))
  v('l’admin est informé de ce qui est gardé', /information: `Le commerce est supprimé\. \$\{compteConserve\}`/.test(s))
  const ecran = code('app/admin/ModalEditCommercant.js')
  v('🔴 l’écran affiche l’avertissement de la route', /if \(j\.avertissement\) toast\(j\.avertissement, 'error'\)/.test(ecran))
  v('et l’information', /toast\(j\.information \|\| `\$\{commercant\.nom\} supprimé définitivement`, 'success'\)/.test(ecran))
}

// ═══ 7) LA LECTURE ══════════════════════════════════════════════════════════
{
  const s = code('lib/casquettes-server.js')
  v('🔴 une lecture ratée lève (une panne ne vaut pas « aucun commerce »)', /if \(r\.error\) throw new Error/.test(s))
  v('les trois casquettes en base sont lues', /from\('commercants'\)/.test(s) && /from\('clients'\)/.test(s) && /from\('equipe_membres'\)[\s\S]{0,80}\.eq\('statut', 'actif'\)/.test(s))
  v('plus de service public (module retiré)', !/services_publics/.test(s))
}

console.log(`\nCasquettes : ${ok} vérifications`)
if (echecs.length > 0) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
