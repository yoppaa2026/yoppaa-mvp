// BANC — LE SOLDE DE SMS SE PAIE (audit du 15/11)
//
// 🔴 Le défaut : le solde `fidelite_sms_credits` s'écrivait depuis le
// navigateur (l'écran posait lui-même les 25 SMS offerts), donc
//   • un commerçant pouvait s'offrir des milliers de SMS depuis la console,
//     facturés à Yoppaa par Brevo ;
//   • une réactivation de la fidélité à solde nul redonnait 25 SMS, sans fin.
//
// La règle : le solde ne s'écrit QUE par le serveur. Les 25 SMS de bienvenue
// sont donnés une seule fois par `/api/fidelite/sms-offerts`, via la fonction
// SQL `offrir_sms_bienvenue`, et le verrou SQL refuse toute écriture du solde
// depuis le navigateur.
//
// ⚠️ LE BANC EXÉCUTE LA RÈGLE DU CADEAU, LIT LA ROUTE, L'ÉCRAN ET LA MIGRATION
// SANS LEUR PROSE, et BALAIE TOUT app/ et lib/ : une écriture du solde qui
// réapparaîtrait ailleurs que dans le serveur le fait rougir.
//
//   npm run verif:sms-credits

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { sansProse } from './lire-code.mjs'
import { SMS_BIENVENUE, etatCadeauSms } from '../lib/packs-sms.js'

const RACINE = new URL('../', import.meta.url)
const lire = (f) => readFileSync(new URL(f, RACINE), 'utf8')
const code = (f) => sansProse(lire(f))

let ok = 0
const echecs = []
function v(nom, condition, detail = '') {
  if (condition) ok++
  else echecs.push(detail ? `${nom} — ${detail}` : nom)
}

// ═══ 1. LA RÈGLE DU CADEAU, EXÉCUTÉE ═════════════════════════════════════════
const OUI = { ok: true }
const NON = { ok: false }
v('25 SMS offerts, comme le disent les CGU', SMS_BIENVENUE === 25, String(SMS_BIENVENUE))
{
  const cgu = lire('app/legal/page.js')
  const m = cgu.match(/(\d+) SMS sont offerts/)
  v('le nombre des CGU est celui du code', m && Number(m[1]) === SMS_BIENVENUE, m ? m[1] : 'phrase introuvable')
}
v('formule sans fidélité : rien n’est offert',
  etatCadeauSms({ fidelite_actif: true, fidelite_sms_offerts_at: null }, NON) === 'refus_forfait')
v('programme éteint : le cadeau attend l’activation',
  etatCadeauSms({ fidelite_actif: false, fidelite_sms_offerts_at: null }, OUI) === 'inactif')
v('commerce absent : rien n’est offert',
  etatCadeauSms(null, OUI) === 'inactif')
v('🔴 déjà offerts une fois : jamais une deuxième',
  etatCadeauSms({ fidelite_actif: true, fidelite_sms_offerts_at: '2026-11-15T10:00:00Z' }, OUI) === 'deja')
v('première activation : les SMS partent',
  etatCadeauSms({ fidelite_actif: true, fidelite_sms_offerts_at: null }, OUI) === 'offrir')
v('🔴 un solde à zéro ne redonne PAS le cadeau (le défaut d’origine)',
  etatCadeauSms({ fidelite_actif: true, fidelite_sms_offerts_at: '2026-11-01T00:00:00Z', fidelite_sms_credits: 0 }, OUI) === 'deja')

// ═══ 2. LA ROUTE ═════════════════════════════════════════════════════════════
{
  const r = code('app/api/fidelite/sms-offerts/route.js')
  const iGarde = r.indexOf('gardeCommercant(request, admin, commercant_id)')
  const iRpc = r.indexOf("rpc('offrir_sms_bienvenue'")
  v('la route vérifie que l’appelant possède le commerce', iGarde > 0)
  v('…AVANT de donner quoi que ce soit', iGarde > 0 && iRpc > iGarde, `garde ${iGarde}, rpc ${iRpc}`)
  v('le refus de la garde est rendu tel quel', /if \(!garde\.ok\) return NextResponse\.json\(\{ ok: false, error: garde\.error \}, \{ status: garde\.status \}\)/.test(r))
  v('garde de forfait de la création d’une carte', /verdictForfait\(com, 'fidelite'\)/.test(r))
  v('la règle du cadeau vient de lib/packs-sms', /etatCadeauSms\(com, verdict\)/.test(r))
  {
    const sel = (r.match(/\.select\('([^']*)'\)/) || [])[1] || ''
    const manque = ['plan', 'essai_plan', 'created_at', 'fidelite_actif', 'fidelite_sms_offerts_at']
      .filter((c) => !sel.split(',').map((s) => s.trim()).includes(c))
    v('le select porte tout ce que la règle lit', manque.length === 0, `manque : ${manque.join(', ')}`)
  }
  v('le cadeau passe par la fonction atomique, avec le nombre du code',
    /rpc\('offrir_sms_bienvenue', \{\s*p_commercant_id: commercant_id,\s*p_nb: SMS_BIENVENUE,\s*\}\)/.test(r))
  v('un second appel simultané ne compte pas comme un cadeau (-1)', /if \(solde === -1\) return NextResponse\.json\(\{ ok: true, offerts: 0 \}\)/.test(r))
  v('🔴 la route n’écrit jamais le solde à la main', !/\.update\(/.test(r))
  v('la route lit sa base avec la clé de service', /process\.env\.SUPABASE_SERVICE_ROLE_KEY/.test(r))
}

// ═══ 3. L'ÉCRAN ══════════════════════════════════════════════════════════════
{
  const c = code('app/dashboard/ConfigDashboard.js')
  const debut = c.indexOf('async function sauverConfig(activer = false)')
  const fin = c.indexOf('const nbModifsFidelite = ', debut)
  const s = debut > 0 && fin > debut ? c.slice(debut, fin) : ''
  v('la fonction d’activation est trouvée', s.length > 0)
  v('🔴 l’activation n’écrit plus le solde de SMS', !/fidelite_sms_credits/.test(s))
  v('l’activation demande les SMS offerts au serveur', /fetch\('\/api\/fidelite\/sms-offerts'/.test(s))
  v('…seulement quand on active', /if \(activer\) \{\s*try \{/.test(s))
  v('…avec le jeton du commerçant', /Authorization: `Bearer \$\{session\.access_token\}`/.test(s))
  v('le message ne promet les SMS que s’ils ont été donnés', /offerts > 0 \? `Fidélité activée, \$\{offerts\} SMS offerts/.test(s))
  v('une erreur d’enregistrement libère le bouton', /if \(error\) \{ setSaving\(false\);/.test(s))
}

// ═══ 4. LA PRATIQUE : PERSONNE N'ÉCRIT LE SOLDE HORS DU SERVEUR ═════════════
{
  const fichiers = []
  const parcourir = (dossier) => {
    for (const nom of readdirSync(dossier)) {
      const p = join(dossier, nom)
      if (statSync(p).isDirectory()) parcourir(p)
      else if (/\.(js|jsx|ts|tsx|mjs)$/.test(nom)) fichiers.push(p)
    }
  }
  const base = new URL('.', RACINE).pathname.replace(/^\/([A-Za-z]:)/, '$1')
  parcourir(join(base, 'app'))
  parcourir(join(base, 'lib'))
  // Une écriture : clé d'objet `fidelite_sms_credits:`, affectation `= `,
  // ou incrément. Les lectures (`commercant?.fidelite_sms_credits`, select)
  // ne sont pas visées.
  const ECRITURE = /fidelite_sms_credits\s*(:|=(?!=)|\+\+|--|\+=|-=)/
  const fautifs = fichiers.filter((f) => ECRITURE.test(sansProse(readFileSync(f, 'utf8'))))
    .map((f) => f.slice(base.length))
  v('🔴 aucun écran ni aucune route n’écrit le solde de SMS', fautifs.length === 0, fautifs.join(', '))
  v('le balayage a bien lu le code (plus de 100 fichiers)', fichiers.length > 100, String(fichiers.length))
}

// ═══ 5. LA MIGRATION ═════════════════════════════════════════════════════════
{
  const m = lire('migrations/MIGRATION_VERROU_CREDITS_SMS_15_11.sql')
  const corps = m.split('-- ─── RETOUR ARRIÈRE')[0]
  v('la date du cadeau existe', /ADD COLUMN IF NOT EXISTS fidelite_sms_offerts_at timestamptz/.test(corps))
  v('le verrou part de la version EN BASE', /pg_get_functiondef\('public\.commercants_colonnes_reservees\(\)'::regprocedure\) INTO def/.test(corps))
  v('le verrou ferme le solde ET la date',
    /IF NEW\.fidelite_sms_credits IS DISTINCT FROM OLD\.fidelite_sms_credits\s+OR NEW\.fidelite_sms_offerts_at IS DISTINCT FROM OLD\.fidelite_sms_offerts_at THEN/.test(corps))
  v('le verrou refuse en 42501', /'Le solde de SMS se recharge par un pack, depuis le tableau de bord'\s+USING ERRCODE = '42501'/.test(corps))
  v('ancre absente = rien modifié', /RAISE EXCEPTION 'commercants_colonnes_reservees : ancre/.test(corps))
  v('🔴 la fonction ne donne qu’une fois', /WHERE id = p_commercant_id\s+AND fidelite_sms_offerts_at IS NULL/.test(corps))
  v('la fonction date le cadeau', /fidelite_sms_offerts_at = now\(\)/.test(corps))
  v('🔴 ni anon ni un commerçant ne peuvent l’appeler',
    /REVOKE ALL ON FUNCTION public\.offrir_sms_bienvenue\(uuid, int\) FROM PUBLIC, anon, authenticated;/.test(corps))
  v('seul le serveur peut l’appeler', /GRANT EXECUTE ON FUNCTION public\.offrir_sms_bienvenue\(uuid, int\) TO service_role;/.test(corps))
  v('ceux qui ont déjà activé sont marqués servis', /c\.fidelite_actif = true\s+OR coalesce\(c\.fidelite_sms_credits, 0\) > 0/.test(corps))
  v('une seule transaction', /BEGIN;[\s\S]*COMMIT;/.test(corps))
  v('contrôles avec valeur ET attendu', /AS valeur,\s+'1' AS attendu/.test(corps) && (corps.match(/UNION ALL SELECT/g) || []).length >= 10)
}

console.log(`Solde de SMS : ${ok} vérifications`)
if (echecs.length) {
  console.log(`🔴 ${echecs.length} ÉCHEC(S) :`)
  echecs.forEach((e) => console.log('   • ' + e))
  process.exit(1)
}
console.log('Tout passe.')
