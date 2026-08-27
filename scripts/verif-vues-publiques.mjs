// BANC : UNE VUE CRÉÉE DANS `public` NAÎT ÉCRIVABLE (27/08).
//
// 🔴 CE BANC EXISTE POUR UN TROU RÉEL, PROUVÉ EN PRODUCTION LE 27/08.
// `commercants_public` portait INSERT, UPDATE, DELETE pour `anon`. La vue est
// automatiquement modifiable, elle n'a pas `security_invoker`, donc l'écriture
// atteignait `commercants` AVEC LES DROITS DU PROPRIÉTAIRE, en contournant la
// RLS. Et elle expose `plan`. Le balayage du schéma en a trouvé trois autres :
//   • `avis_public`     → un Yopper connecté pouvait réécrire ou SUPPRIMER
//                         l'avis d'un autre. Prouvé.
//   • `commandes_stats` → les écritures atteignaient `commandes`. Prouvé.
//   • `commune_stats`   → a refusé (GROUP BY), seule des quatre.
//
// ⚠️ ET CE N'ÉTAIT PAS NOUS. Toutes nos migrations n'accordent que SELECT. Les
// droits viennent des PRIVILÈGES PAR DÉFAUT de Supabase :
//   postgres / public / r → authenticated = arwdm
// Un `GRANT SELECT` explicite s'AJOUTE à ces droits, il ne les restreint pas.
// Donc **toute vue créée depuis l'éditeur SQL naît modifiable par n'importe
// quel compte connecté**, qu'on lui accorde quelque chose ou non.
//
// ⚠️ C'EST POURQUOI LA RÈGLE NE REGARDE PAS LES `GRANT`. Une vue réservée au
// serveur, sans aucun GRANT public, est tout aussi ouverte que les autres. La
// seule règle qui tient : QUI CRÉE UNE VUE LA REFERME, dans le même fichier.
//
// ⚠️ Et le REVOKE doit venir APRÈS le CREATE : posé avant, il porte sur
// l'ancienne vue et la nouvelle naît ouverte. C'est exactement ce qui s'est
// passé le 27/08 quand `commercants_public` a été recréée.
//
//   npm run verif:vues

import { readFileSync, readdirSync } from 'node:fs'

const DIR = new URL('../migrations/', import.meta.url)

let ok = 0
const echecs = []
const verifie = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  echecs.push(`${nom}${detail ? ` — ${detail}` : ''}`)
}

let vuesVues = 0

for (const f of readdirSync(DIR).filter(n => n.endsWith('.sql')).sort()) {
  const src = readFileSync(new URL(f, DIR), 'utf8')
  // Sans la prose : un commentaire qui EXPLIQUE le piège contient forcément les
  // mots du piège. C'est le défaut le plus fréquent de ces bancs.
  const sql = src.replace(/^\s*--.*$/gm, ' ')

  const reCreate = /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi
  let m
  while ((m = reCreate.exec(sql)) !== null) {
    const vue = m[1]
    const posCreate = m.index
    vuesVues++

    // `REVOKE ALL` et `REVOKE INSERT, UPDATE, DELETE` sont tous deux valables.
    // ⚠️ ON EXIGE LES DEUX RÔLES : fermer à `anon` en laissant `authenticated`
    // ouvert, c'est ce qui restait sur commercants_public après sa recréation.
    const reRevoke = new RegExp(
      `REVOKE\\s+(?:ALL|INSERT,\\s*UPDATE,\\s*DELETE)[^;]*?\\bON\\s+(?:public\\.)?${vue}\\b[^;]*?FROM[^;]*;`,
      'gi'
    )
    reRevoke.lastIndex = 0
    let revokeApres = false
    let r
    while ((r = reRevoke.exec(sql)) !== null) {
      const roles = r[0].slice(r[0].toUpperCase().lastIndexOf('FROM'))
      if (!/anon/i.test(roles) || !/authenticated/i.test(roles)) continue
      if (r.index > posCreate) { revokeApres = true; break }
    }

    verifie(
      `🔴 ${f} referme « ${vue} » après l'avoir créée`,
      revokeApres,
      'aucun REVOKE d’écriture pour anon ET authenticated après le CREATE'
    )
  }
}

// ⚠️ UNE GARDE QUI NE TROUVE RIEN À GARDER EST VERTE POUR RIEN. Si le motif de
// détection des vues casse un jour, ce banc passerait sans rien contrôler.
verifie('le banc a bien trouvé des vues à contrôler', vuesVues >= 8, `${vuesVues} vue(s)`)

console.log(`\nVues publiques : ${ok} vérifications, ${vuesVues} créations de vue examinées`)
if (echecs.length > 0) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Toute vue créée est refermée.')
