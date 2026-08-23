// BANC : LA FIDÉLITÉ N'EST PLUS ÉCRITE PAR LE NAVIGATEUR (bloc 1, 24/08).
//
// ⚠️ CE BANC EXISTE POUR TROIS DÉFAUTS TROUVÉS EN AUDIT, dont deux totalement
// silencieux :
//   • le SMS « récompense débloquée » ne partait JAMAIS du comptoir, donc
//     jamais là où la fidélité vit vraiment ;
//   • la carte se calculait dans le navigateur et s'écrivait en valeur brute,
//     le journal partant dans un second appel non transactionnel ;
//   • rien n'empêchait de créditer deux fois d'un double clic.
//
// ⚠️ ET LE PIÈGE DU 23/08 EST ICI AUSSI : une garde qui vérifie que la ROUTE
// existe ne prouve pas que l'écran l'APPELLE. Chaque règle est donc contrôlée
// des deux côtés.
//
//   npm run verif:fid

import { readFileSync } from 'node:fs'
import { appliquerCredit, libelleRecompense, normaliserTelephone } from '../lib/fidelite.js'

const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')

// Le code sans sa prose : un commentaire qui explique pourquoi une écriture a
// été retirée contient forcément cette écriture (8 occurrences depuis le 19/08).
const lireCode = (chemin) => lire(chemin)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^[ \t]*\/\/.*$/gm, ' ')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')

const lireSql = (chemin) => lire(chemin).replace(/^\s*--.*$/gm, ' ')

let ok = 0
const echecs = []
const verifie = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  echecs.push(`${nom}${detail ? ` — ${detail}` : ''}`)
}
const egal = (nom, obtenu, attendu) =>
  verifie(nom, obtenu === attendu, `« ${obtenu} » au lieu de « ${attendu} »`)

// ═══ 1) LA RÈGLE DE CRÉDIT, EXÉCUTÉE ══════════════════════════════════════
{
  const passages = { fidelite_mecanique: 'passages', fidelite_seuil_passages: 10 }

  const a = appliquerCredit(passages, { passages: 3, recompenses_disponibles: 0 }, { passages: 1 })
  egal('un passage de plus se compte', a.patch.passages, 4)
  egal('et ne débloque rien', a.debloquees, 0)

  // ⚠️ LE COMPTEUR REPART, IL NE S'ARRÊTE PAS. C'est ce qui fait qu'une fiche
  // peut afficher « 2 sur 11 » à côté de « récompense débloquée » : les deux
  // sont vrais. L'écran doit les séparer, la règle est juste.
  const b = appliquerCredit(passages, { passages: 9, recompenses_disponibles: 0 }, { passages: 1 })
  egal('🔴 au seuil, une récompense tombe', b.debloquees, 1)
  egal('et le compteur repart à zéro', b.patch.passages, 0)
  egal('la récompense est en réserve', b.patch.recompenses_disponibles, 1)

  const cagnotte = { fidelite_mecanique: 'cagnotte', fidelite_taux_cagnotte: 5, fidelite_seuil_cagnotte: 10 }
  const c = appliquerCredit(cagnotte, { cagnotte: 0, recompenses_disponibles: 0 }, { montant: 20 })
  egal('5 % de 20 € font 1 €', c.patch.cagnotte, 1)

  // ⚠️ ZÉRO EST UN RÉGLAGE, PAS UNE ABSENCE. Un `|| 5` transformait un taux
  // coupé à zéro en 5 %, et le commerçant distribuait sans comprendre.
  const zero = { fidelite_mecanique: 'cagnotte', fidelite_taux_cagnotte: 0, fidelite_seuil_cagnotte: 10 }
  const d = appliquerCredit(zero, { cagnotte: 0, recompenses_disponibles: 0 }, { montant: 100 })
  egal('🔴 un taux à zéro ne donne rien', d.patch.cagnotte, 0)

  // Le numéro est la clé de la carte : sa normalisation ne se négocie pas.
  egal('un 04 belge devient +32', normaliserTelephone('0470 12 34 56'), '+32470123456')
  egal('les points et barres sautent', normaliserTelephone('0470/12.34.56'), '+32470123456')
  verifie('un numéro absurde est refusé', normaliserTelephone('12') === null)

  verifie('le libellé de récompense a un repli', !!libelleRecompense({}))
}

// ═══ 2) PLUS AUCUNE ÉCRITURE DEPUIS LE NAVIGATEUR ═════════════════════════
//
// ⚠️ LE CŒUR DU BLOC 1. Le tableau de bord est un fichier de 9000 lignes : une
// écriture qui y revient un jour ne se verrait pas en relecture.
{
  const bord = lireCode('app/dashboard/ConfigDashboard.js')

  const ecritures = [
    ...(bord.match(/from\('fidelite_cartes'\)\s*\.\s*(insert|update|delete|upsert)/g) || []),
    ...(bord.match(/from\('fidelite_mouvements'\)\s*\.\s*(insert|update|delete|upsert)/g) || []),
  ]
  verifie('🔴 le tableau de bord n\'écrit PLUS les tables de fidélité',
    ecritures.length === 0, ecritures.join(' · '))

  // La lecture, elle, reste : le comptoir doit afficher les dernières cartes.
  verifie('mais il les lit toujours', /from\('fidelite_cartes'\)\s*\.\s*select/.test(bord))

  // ⚠️ ET IL NE CALCULE PLUS. Tant que `appliquerCredit` est importé ici, le
  // calcul peut y revenir sans que personne ne le remarque.
  verifie('🔴 `appliquerCredit` a quitté le tableau de bord',
    !/appliquerCredit/.test(bord))

  // Les trois gestes passent par la route
  verifie('🔴 créditer passe par l\'API', /action: 'crediter'/.test(bord))
  verifie('🔴 utiliser une récompense aussi', /action: 'utiliser_recompense'/.test(bord))
  verifie('🔴 supprimer une carte aussi', /action: 'supprimer'/.test(bord))
  verifie('et tous par le même appel', /await appelMouvement\(\{/.test(bord))
  verifie('qui vise bien la route', /fetch\('\/api\/fidelite\/mouvement'/.test(bord))

  // ⚠️ LA CLÉ NAÎT AU CLIC. Fabriquée à l'envoi, elle changerait à chaque
  // rejeu et ne dédoublonnerait rien du tout.
  verifie('🔴 le crédit porte une clé d\'anti-doublon', /action: 'crediter'[\s\S]{0,120}cle: cleRequete\(\)/.test(bord))
  verifie('🔴 l\'usage d\'une récompense aussi', /action: 'utiliser_recompense'[\s\S]{0,80}cle: cleRequete\(\)/.test(bord))
}

// ═══ 3) LA ROUTE SERVEUR ══════════════════════════════════════════════════
{
  const route = lireCode('app/api/fidelite/mouvement/route.js')

  // ⚠️ LA CLÉ DE SERVICE IGNORE RLS : les deux contrôles ci-dessous sont le
  // SEUL rempart de cette route.
  verifie('🔴 la route vérifie que le commerce lui appartient',
    /com\.auth_user_id !== user\.id/.test(route))
  verifie('🔴 ET que la carte est bien de CE commerce',
    /\.eq\('id', carte_id\)[\s\S]{0,80}\.eq\('commercant_id', commercant_id\)/.test(route))
  verifie('sans session, elle refuse', /non authentifié/.test(route))
  verifie('les identifiants sont validés en UUID', /RE_UUID\.test\(String\(commercant_id/.test(route))
  verifie('la clé d\'idempotence est bornée', /RE_CLE = \/\^\[A-Za-z0-9_-\]\{8,64\}\$\//.test(route))

  // ⚠️ LE CALCUL SE FAIT ICI, À PARTIR DE LA CONFIG RELUE EN BASE.
  verifie('🔴 la route calcule elle-même', /appliquerCredit\(com, carte, credit\)/.test(route))
  verifie('🔴 et elle relit la configuration du commerçant',
    /fidelite_seuil_passages, fidelite_taux_cagnotte, fidelite_seuil_cagnotte/.test(route))
  verifie('le montant est le seul chiffre reçu du comptoir', /Number\(body\?\.montant\)/.test(route))
  verifie('un montant absurde est refusé', /montant <= 0 \|\| montant > 100000/.test(route))

  // ⚠️ LE MOUVEMENT AVANT LA CARTE : dans l'autre ordre, une récompense
  // consommée pourrait n'avoir aucune trace.
  const iMvt = route.indexOf("type: 'recompense_utilisee'")
  const iCarte = route.indexOf('recompenses_disponibles: dispo - 1')
  verifie('🔴 le mouvement s\'écrit AVANT la carte', iMvt !== -1 && iCarte !== -1 && iMvt < iCarte,
    `mouvement ${iMvt}, carte ${iCarte}`)

  // ⚠️ LES DEUX BRANCHES, COMPTÉES. Le mot `23505` apparaît dans l'usage d'une
  // récompense ET dans le crédit : chercher le mot laissait la garde verte
  // grâce à l'AUTRE branche, celle qu'on n'avait pas cassée. Mesuré à la
  // mutation le 24/08. On compte, et on ancre le rejeu du crédit sur ce qu'il
  // est seul à rendre.
  verifie('🔴 les DEUX branches savent absorber un rejeu',
    (route.match(/errMvt\.code === '23505'/g) || []).length === 2,
    `${(route.match(/errMvt\.code === '23505'/g) || []).length} branche(s) au lieu de 2`)
  verifie('🔴 et un crédit rejoué ne débloque rien de plus',
    /carte: relue, deja: true, debloquees: 0/.test(route))
  verifie('une récompense inexistante est refusée', /dispo < 1/.test(route))

  // ⚠️ LE SMS QUI NE PARTAIT JAMAIS DU COMPTOIR.
  verifie('🔴 le SMS de récompense part enfin du comptoir',
    /smsRecompenseDebloquee\(db, com, maj\)/.test(route))
  verifie('et il ne peut pas faire échouer le crédit',
    /try \{ sms = await smsRecompenseDebloquee[\s\S]{0,60}catch/.test(route))
}

// ═══ 4) LA MIGRATION ══════════════════════════════════════════════════════
{
  const sql = lireSql('migrations/MIGRATION_FIDELITE_SERVEUR.sql')

  verifie('la clé d\'idempotence est ajoutée', /ADD COLUMN IF NOT EXISTS cle_idempotence text/.test(sql))
  verifie('🔴 et elle est UNIQUE', /CREATE UNIQUE INDEX[\s\S]{0,140}cle_idempotence/.test(sql))
  verifie('l\'index ignore les lignes sans clé', /WHERE cle_idempotence IS NOT NULL/.test(sql))

  // ⚠️ LE VERROU FINAL : sans ce REVOKE, tout le reste n'est qu'une politesse.
  // Le navigateur pourrait continuer à écrire en direct, en ignorant la route.
  verifie('🔴 le navigateur perd l\'écriture sur les cartes',
    /REVOKE INSERT, UPDATE, DELETE ON public\.fidelite_cartes\s+FROM authenticated, anon/.test(sql))
  verifie('🔴 et sur les mouvements',
    /REVOKE INSERT, UPDATE, DELETE ON public\.fidelite_mouvements FROM authenticated, anon/.test(sql))
  verifie('il garde la lecture', /GRANT SELECT ON public\.fidelite_cartes\s+TO authenticated/.test(sql))
  verifie('la migration porte ses requêtes de contrôle', /role_table_grants/.test(sql))
}

// ═══ 5) LES CHEMINS AUTOMATIQUES N'ONT PAS BOUGÉ ══════════════════════════
//
// ⚠️ On vient de déplacer le comptoir : le banc doit prouver que la commande
// et le RDV créditent toujours, sinon on aurait réparé un côté en cassant
// l'autre sans s'en apercevoir.
{
  const serveur = lireCode('lib/fidelite-server.js')
  // ⚠️ LA PARENTHÈSE FAIT TOUT LE TRAVAIL. Sans elle, la garde restait verte
  // après un renommage en `crediterFideliteCommandeX` : le mot cherché est un
  // PRÉFIXE de son propre remplaçant. Mesuré à la mutation le 24/08.
  verifie('la commande récupérée crédite toujours',
    /export async function crediterFideliteCommande\(/.test(serveur))
  verifie('le mouvement y précède aussi la carte',
    serveur.indexOf("from('fidelite_mouvements').insert({") < serveur.indexOf("from('fidelite_cartes').update(patch)"))
  verifie('le SMS automatique est intact', /smsRecompenseDebloquee\(supabase, commercant, carte\)/.test(serveur))
  // ⚠️ ANCRÉ SUR L'APPEL, PAS SUR LE NOM. La garde était verte grâce à la
  // LIGNE D'IMPORT : on pouvait remplacer l'appel par `cmd.total` — donc
  // recompter la part payée par un bon cadeau, déjà créditée à l'achat du bon
  // — sans que rien ne rougisse. Mesuré à la mutation le 24/08.
  verifie('🔴 la part payée par bon cadeau ne compte pas deux fois',
    /\{ montant: montantFidelisable\(cmd\) \}/.test(serveur))
}

// ═══ 6) DEUX SMS, PAS UN DE PLUS, ET CHACUN SON PUBLIC ════════════════════
//
// ⚠️ CADRAGE D'ALEX (24/08) : « un SMS à la création du compte fidélité,
// UNIQUEMENT pour un non-utilisateur de l'app · un second quand la fidélité
// est pleine · le reste se passe intra-app ». Chaque SMS est payé par le
// commerçant : un envoi de trop, c'est son argent.
{
  const sms = lireCode('lib/fidelite-sms.js')
  const comptoir = lireCode('app/api/fidelite/comptoir/route.js')

  const envois = (sms.match(/export async function sms[A-Za-z]+/g) || [])
  verifie('🔴 il existe EXACTEMENT deux SMS de fidélité',
    envois.length === 2, envois.join(' · '))

  // ── SMS 1 : la carte vient d'être créée ────────────────────────────────
  verifie('le SMS de création ne part qu\'une fois', /carte\.sms_creation_envoye/.test(sms))
  verifie('🔴 et jamais à qui a déjà l\'application', /if \(await aUnCompte\(supabase, clientEmail, clientId\)\)/.test(sms))

  // ⚠️ LE TROU DU COMPTOIR. L'email n'existe que sur le chemin des commandes :
  // au comptoir il n'y a qu'un numéro, donc la garde ne vérifiait personne.
  verifie('🔴 la garde sait travailler SANS email', /async function aUnCompte\(supabase, email, clientId = null\)/.test(sms))
  verifie('🔴 et le comptoir lui passe le client qu\'il vient d\'identifier',
    /smsCarteCreee\(admin, com, nouvelle, null, client\?\.id \|\| null\)/.test(comptoir))
  verifie('une carte déjà rattachée à un compte suffit aussi',
    /carte\.client_id && await aUnCompte\(supabase, null, carte\.client_id\)/.test(sms))

  // ── SMS 2 : la récompense ──────────────────────────────────────────────
  // ⚠️ Celui-là part MÊME à qui a un compte, et c'est délibéré : la
  // notification web n'arrive pas partout (Chrome sur iPhone ne la supporte
  // pas), et rater l'annonce d'une récompense, c'est rater une visite.
  verifie('le SMS de récompense ne filtre PAS sur le compte',
    !/smsRecompenseDebloquee[\s\S]{0,400}aUnCompte/.test(sms))

  // ── Les gardes communes, qui protègent l'argent du commerçant ──────────
  verifie('🔴 aucun SMS sans crédit décompté', /rpc\('consommer_sms_credit'/.test(sms))
  verifie('🔴 et le crédit est RENDU si l\'envoi échoue', /rpc\('rendre_sms_credit'/.test(sms))
  verifie('rien ne part la nuit', /return h >= 8 && h < 21/.test(sms))
  verifie('ni si le commerçant a coupé les SMS', /commercant\?\.fidelite_sms_actif/.test(sms))

  // ⚠️ PAS D'EMOJI DANS UN SMS : le 🟣 arrivait en « ? » chez l'opérateur, sur
  // le canal où l'on se méfie le plus des liens.
  const textes = sms.match(/const contenu = `[^`]*`/g) || []
  verifie('deux textes de SMS, pas plus', textes.length === 2, String(textes.length))
  for (const t of textes) {
    verifie('🔴 aucun emoji dans un SMS',
      !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(t), t.slice(0, 60))
  }
}

console.log(`\nFidélité serveur : ${ok} vérifications`)
if (echecs.length > 0) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
