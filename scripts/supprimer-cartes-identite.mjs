// ─── LA SUPPRESSION DES CARTES D'IDENTITÉ (09/10) ──────────────────────────
//
// 🔴 POURQUOI. Décision d'Alex, 09/10 : Yoppaa ne demande plus de carte
// d'identité. Le relevé de la prod comptait 43 fichiers (43 Mo, du 21/06 au
// 06/10) pour 21 comptes, dont 6 comptes qui n'existent plus : des pièces
// d'identité orphelines, que plus rien ne justifiait de garder.
//
// ⚠️ PAS EN SQL : Supabase interdit de supprimer des fichiers en écrivant dans
// `storage.objects` (la ligne partirait, le fichier resterait). On passe par
// l'API de stockage, qui supprime les deux.
//
// ⚠️ AUCUN CONTENU N'EST LU. Le script liste des NOMS de fichiers (des
// identifiants techniques, sans nom de personne), les supprime, puis supprime
// l'espace lui-même. Il n'affiche que des nombres.
//
// ⚠️ À BLANC PAR DÉFAUT. Sans `--supprimer`, il compte et s'arrête. Pour
// supprimer, il faut aussi recopier l'identifiant du projet visé
// (`--projet <ref>`) : on ne vide pas la prod en croyant vider l'essai.
//
// UTILISATION (à lancer par Alex, jamais par l'assistant) :
//
//   npm run cartes:supprimer                       (prod, à blanc)
//   npm run cartes:supprimer -- --supprimer --projet <ref affiché>
//   npm run cartes:supprimer:essai                 (essai, à blanc)
//   npm run cartes:supprimer:essai -- --supprimer --projet <ref affiché>
//
// À lancer APRÈS MIGRATION_VERIFICATION_2 (qui marque les commerçants
// concernés à partir des chemins, puis supprime les chemins).

import { createClient } from '@supabase/supabase-js'

const ESPACE = 'kyb_documents'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const cle = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !cle) {
  console.error('Variables Supabase absentes du fichier d environnement. Rien n a ete fait.')
  process.exit(1)
}
const ref = new URL(url).hostname.split('.')[0]
const args = process.argv.slice(2)
const supprimer = args.includes('--supprimer')
const iProjet = args.indexOf('--projet')
const projetConfirme = iProjet >= 0 ? args[iProjet + 1] : null

const db = createClient(url, cle, { auth: { persistSession: false } })

// Tous les fichiers de l'espace, dossiers compris (un dossier par compte).
// ⚠️ `list` rend un dossier sans `id` : on y descend.
async function lister(prefixe = '') {
  const chemins = []
  for (let page = 0; ; page++) {
    const { data, error } = await db.storage.from(ESPACE).list(prefixe, { limit: 1000, offset: page * 1000 })
    if (error) throw new Error(`lecture de la liste impossible : ${error.message}`)
    if (!data || data.length === 0) break
    for (const e of data) {
      const chemin = prefixe ? `${prefixe}/${e.name}` : e.name
      if (e.id) chemins.push(chemin)
      else chemins.push(...await lister(chemin))
    }
    if (data.length < 1000) break
  }
  return chemins
}

console.log(`Projet visé : ${ref}`)
const { data: espace, error: errEspace } = await db.storage.getBucket(ESPACE)
if (errEspace || !espace) {
  console.log(`L espace « ${ESPACE} » n existe pas (ou plus) sur ce projet. Rien à faire.`)
  process.exit(0)
}

const fichiers = await lister()
const comptes = new Set(fichiers.map(f => f.split('/')[0])).size
console.log(`${fichiers.length} fichier(s), ${comptes} dossier(s) de compte.`)

if (!supprimer) {
  console.log('\nÀ BLANC : rien n a été supprimé.')
  console.log(`Pour supprimer : ajoute  -- --supprimer --projet ${ref}`)
  process.exit(0)
}
if (projetConfirme !== ref) {
  console.error(`\nL identifiant recopié (${projetConfirme || 'aucun'}) n est pas celui du projet visé (${ref}). Rien n a été supprimé.`)
  process.exit(1)
}

let supprimes = 0
for (let i = 0; i < fichiers.length; i += 100) {
  const lot = fichiers.slice(i, i + 100)
  const { data, error } = await db.storage.from(ESPACE).remove(lot)
  if (error) {
    console.error(`Suppression interrompue après ${supprimes} fichier(s) : ${error.message}`)
    process.exit(1)
  }
  supprimes += (data || []).length
}
console.log(`${supprimes} fichier(s) supprimé(s).`)

// ⚠️ ON RELIT AVANT DE SUPPRIMER L'ESPACE : un espace non vide refuse de
// partir, et un compte faux ne doit pas passer pour un succès.
const restants = await lister()
if (restants.length > 0) {
  console.error(`🔴 ${restants.length} fichier(s) encore présent(s). L espace est gardé. Relance le script.`)
  process.exit(1)
}

const { error: errSuppr } = await db.storage.deleteBucket(ESPACE)
if (errSuppr) {
  console.error(`Les fichiers sont supprimés, mais l espace n a pas pu l être : ${errSuppr.message}`)
  process.exit(1)
}
console.log(`L espace « ${ESPACE} » est supprimé. Plus aucune carte d identité n est stockée sur ${ref}.`)
