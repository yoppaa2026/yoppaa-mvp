// ─── IMPORTER LES ADRESSES WALLONNES (BeSt Address) DANS LA BASE ───────────
//
// Remplit `best_rues` et `best_adresses` (MIGRATION_BEST_ADRESSES.sql, à passer
// AVANT). Règles partagées : lib/best-adresse.js.
//
// UTILISATION (à lancer par Alex, jamais par l'assistant : clé de service) :
//
//   1. Télécharger https://opendata.bosa.be/download/best/openaddress-bewal.zip
//      et extraire `openaddress-bewal.csv` (clic droit > Extraire tout).
//   2. Regarder, sans rien écrire :
//        node --env-file=<fichier env> --experimental-loader ./scripts/alias-loader.mjs \
//             scripts/import-best-adresses.mjs <chemin du csv> --projet=essai
//   3. Écrire : la même commande, avec `--ecrire` en plus.
//
// 🔴 `--projet` EST OBLIGATOIRE ET DOIT CORRESPONDRE À L'ADRESSE DE LA BASE.
// Le fichier env désigne une base ; on ne le lit pas à l'œil. Le script compare
// l'adresse Supabase au projet annoncé et refuse s'ils diffèrent : on n'écrit
// jamais en production en croyant écrire sur l'essai.
//
// ⚠️ RIEN N'EST EFFACÉ AVANT LA FIN. Chaque ligne écrite porte l'instant de
// l'import ; les lignes plus anciennes (rues disparues, maisons démolies) ne
// sont supprimées qu'une fois TOUT écrit sans erreur. Un import coupé laisse
// l'ancien référentiel intact, et se relance sans danger.
//
// ⚠️ UN FICHIER TROP PETIT N'ÉCRIT RIEN. Moins d'un million de maisons, c'est
// un téléchargement coupé ou un autre fichier : l'importer effacerait ensuite
// les trois quarts de la Wallonie.

import { createReadStream, existsSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { createClient } from '@supabase/supabase-js'
import { decouperLigneCsv, indexColonnes, adresseDeLigne, normaliserRecherche, estimerPositions } from '@/lib/best-adresse'

const PROJETS = { essai: 'nmkvizwxoebevjxkfhkx', prod: 'iahdkkzqtdarullvvvaq' }
const MINIMUM_MAISONS = 1_000_000
const LOT = 1000
const EN_PARALLELE = 4

const args = process.argv.slice(2)
const ECRIRE = args.includes('--ecrire')
const projet = (args.find(a => a.startsWith('--projet=')) || '').slice('--projet='.length)
const chemin = args.find(a => !a.startsWith('--'))

function stop(message) {
  console.error(`🔴 ${message}`)
  console.error('   Rien n\'a été écrit.')
  process.exit(1)
}

if (!chemin || !existsSync(chemin)) stop(`Fichier CSV introuvable : ${chemin || '(aucun chemin donné)'}`)
if (!PROJETS[projet]) stop('Indique la base visée : --projet=essai ou --projet=prod')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const cle = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !cle) stop('Variables Supabase absentes. Lance le script avec --env-file=<fichier env>.')
const hote = (() => { try { return new URL(url).hostname } catch { return '' } })()
if (!hote.startsWith(`${PROJETS[projet]}.`)) {
  stop(`Le fichier env vise ${hote || 'une adresse illisible'}, pas le projet « ${projet} » (${PROJETS[projet]}).`)
}
console.log(`Base visée : ${projet} (${hote})${ECRIRE ? '' : ' · LECTURE SEULE, ajoute --ecrire pour écrire'}`)

// ─── 1. LIRE ET REGROUPER PAR RUE ───────────────────────────────────────────
// `${rue}|${cp}` → { rue_id, code_postal, nom, localite, commune, maisons: Map(numero → {numero, lat, lng}) }
const rues = new Map()
let lues = 0, ecartees = 0, idx = null

const lecteur = createInterface({ input: createReadStream(chemin, { encoding: 'utf8' }), crlfDelay: Infinity })
for await (const ligne of lecteur) {
  if (idx === null) {
    try { idx = indexColonnes(ligne) } catch (e) { stop(e.message) }
    continue
  }
  if (!ligne) continue
  lues++
  const a = adresseDeLigne(decouperLigneCsv(ligne), idx)
  if (!a) { ecartees++; continue }
  const cleRue = `${a.rue_id}|${a.code_postal}`
  let r = rues.get(cleRue)
  if (!r) {
    r = { rue_id: a.rue_id, code_postal: a.code_postal, nom: a.nom, localite: a.localite, commune: a.commune, maisons: new Map() }
    rues.set(cleRue, r)
  }
  // Les boîtes d'un même immeuble partagent un numéro : une seule maison. Si
  // une boîte est située et pas l'autre, on garde celle qui l'est.
  const deja = r.maisons.get(a.numero)
  if (!deja || (deja.lat === null && a.lat !== null)) r.maisons.set(a.numero, { numero: a.numero, lat: a.lat, lng: a.lng })
}

// ─── 2. SITUER CE QUI PEUT L'ÊTRE (décision d'Alex, 05/10) ──────────────────
const lignesRues = []
const lignesMaisons = []
let officielles = 0, estimees = 0, sansPosition = 0, exemple = null, exempleEstime = null
for (const r of rues.values()) {
  const situees = estimerPositions([...r.maisons.values()])
  sansPosition += r.maisons.size - situees.length
  if (situees.length === 0) continue   // rue sans aucune maison située : pas rangée
  let sLat = 0, sLng = 0, nOff = 0
  for (const m of situees) {
    if (m.origine_position === 'officielle') { officielles++; sLat += m.lat; sLng += m.lng; nOff++ }
    else estimees++
    lignesMaisons.push({ rue_id: r.rue_id, code_postal: r.code_postal, ...m })
    if (r.code_postal === '5640' && /biesme/i.test(r.localite || '')) {
      if (!exemple && m.origine_position === 'officielle') exemple = `${r.nom} ${m.numero}, ${r.code_postal} ${r.localite} → ${m.lat}, ${m.lng}`
    }
    if (!exempleEstime && m.origine_position === 'voisins' && r.code_postal === '6200') {
      exempleEstime = `${r.nom} ${m.numero}, ${r.code_postal} ${r.localite} → ${m.lat}, ${m.lng} (estimée)`
    }
  }
  lignesRues.push({
    rue_id: r.rue_id,
    code_postal: r.code_postal,
    nom: r.nom,
    nom_recherche: normaliserRecherche(r.nom),
    localite: r.localite,
    commune: r.commune,
    // Le centre ne se calcule que sur les positions OFFICIELLES.
    lat: nOff > 0 ? Math.round((sLat / nOff) * 1e6) / 1e6 : null,
    lng: nOff > 0 ? Math.round((sLng / nOff) * 1e6) / 1e6 : null,
    nb_maisons: situees.length,
  })
}

console.log(`Lignes lues : ${lues} · écartées : ${ecartees} · rues rangées : ${lignesRues.length}`)
console.log(`Maisons : ${officielles} position officielle · ${estimees} estimées par les voisins · ${sansPosition} impossibles à situer (non rangées)`)
if (exemple) console.log(`Exemple : ${exemple}`)
if (exempleEstime) console.log(`Exemple estimé : ${exempleEstime}`)
if (lignesMaisons.length < MINIMUM_MAISONS) stop(`Seulement ${lignesMaisons.length} maisons (minimum ${MINIMUM_MAISONS}) : fichier incomplet ?`)

if (!ECRIRE) {
  console.log('Lecture seule terminée. Relance avec --ecrire pour remplir la base.')
  process.exit(0)
}

// ─── 2. ÉCRIRE PAR LOTS ─────────────────────────────────────────────────────
const db = createClient(url, cle, { auth: { persistSession: false } })
const importLe = new Date().toISOString()

async function ecrireLot(table, conflit, lignes) {
  for (let essai = 1; essai <= 3; essai++) {
    const { error } = await db.from(table).upsert(lignes, { onConflict: conflit })
    if (!error) return
    if (essai === 3) throw new Error(`${table} : ${error.message}`)
    await new Promise(r => setTimeout(r, 2000 * essai))
  }
}

async function ecrireTout(table, conflit, toutes) {
  const lots = []
  for (let i = 0; i < toutes.length; i += LOT) lots.push(toutes.slice(i, i + LOT))
  let faits = 0, suivant = 0
  async function ouvrier() {
    while (suivant < lots.length) {
      const lot = lots[suivant++]
      await ecrireLot(table, conflit, lot)
      faits++
      if (faits % 100 === 0 || faits === lots.length) console.log(`  ${table} : ${faits}/${lots.length} lots`)
    }
  }
  await Promise.all(Array.from({ length: EN_PARALLELE }, ouvrier))
}

try {
  await ecrireTout('best_rues', 'rue_id,code_postal', lignesRues.map(r => ({ ...r, import_le: importLe })))
  await ecrireTout('best_adresses', 'rue_id,code_postal,numero', lignesMaisons.map(m => ({ ...m, import_le: importLe })))
} catch (e) {
  console.error(`🔴 Écriture interrompue : ${e.message}`)
  console.error('   Rien n\'a été effacé : l\'ancien référentiel reste en place. Relance la même commande.')
  process.exit(1)
}

// ─── 3. EFFACER CE QUI N'EXISTE PLUS, SEULEMENT MAINTENANT ──────────────────
for (const table of ['best_adresses', 'best_rues']) {
  const { error } = await db.from(table).delete().lt('import_le', importLe)
  if (error) {
    console.error(`🔴 ${table} : nettoyage des anciennes lignes impossible (${error.message}).`)
    console.error('   Les nouvelles lignes sont écrites ; relance pour nettoyer.')
    process.exit(1)
  }
}

const compte = async (table) => {
  const { count, error } = await db.from(table).select('*', { count: 'exact', head: true })
  return error ? `illisible (${error.message})` : count
}
console.log(`✅ Import terminé : ${await compte('best_rues')} rues, ${await compte('best_adresses')} maisons.`)
