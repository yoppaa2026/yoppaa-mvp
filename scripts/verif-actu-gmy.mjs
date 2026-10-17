// Banc de L'ACTU D'EXISTER DANS LE GOOD MORNING (17/10).
//
// ✅ ALEX, 17/10 : « l'onglet Actu est grisé alors qu'il doit pouvoir publier
// dans le GMY 1× par semaine ». Le relevé avant la correction :
//   1. l'onglet exigeait `actus_illimitees` (Communiquer), pas `actu_gmy` ;
//   2. la limite d'une par semaine n'était tenue QUE par l'écran ;
//   3. une actu Exister non cochée GMY ne paraissait nulle part ;
//   4. une actu GMY sans date de fin n'entrait jamais dans l'édition.
//
// ⚠️ LA RÈGLE S'EXÉCUTE, puis on vérifie que l'écran, l'envoi aux favoris et
// le cron l'APPELLENT.

import { readFileSync } from 'node:fs'
import { sansProse } from './lire-code.mjs'
import { lundiDeLaSemaine, memeSemaine, conflitSemaineGmy, actusGmyRetenues, erreurActuGmy } from '../lib/actu-gmy.js'
import { PLAN_FEATURES } from '../lib/plans.js'

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}
const egal = (nom, a, b) => verifier(nom, JSON.stringify(a) === JSON.stringify(b), `obtenu ${JSON.stringify(a)}, attendu ${JSON.stringify(b)}`)
const lu = (f) => sansProse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'))

// Repères : le 13/10/2026 est un mardi, le 12 un lundi, le 18 un dimanche.
// ═══ 1. LA SEMAINE ════════════════════════════════════════════════════════
{
  egal('le lundi d’un mardi', lundiDeLaSemaine('2026-10-13'), '2026-10-12')
  egal('🔴 le lundi d’un dimanche (la semaine belge finit le dimanche)', lundiDeLaSemaine('2026-10-18'), '2026-10-12')
  egal('le lundi d’un lundi', lundiDeLaSemaine('2026-10-12'), '2026-10-12')
  egal('une date illisible', lundiDeLaSemaine('demain'), null)
  verifier('dimanche et lundi précédent : même semaine', memeSemaine('2026-10-18', '2026-10-12'))
  verifier('🔴 dimanche et lundi suivant : pas la même semaine', !memeSemaine('2026-10-18', '2026-10-19'))
}

// ═══ 2. UNE PAR SEMAINE ═══════════════════════════════════════════════════
{
  const A = { id: 'a', commercant_id: 'c1', date_debut: '2026-10-13', created_at: '2026-10-10T08:00:00Z', titre: 'Soupe' }
  const B = { id: 'b', commercant_id: 'c1', date_debut: '2026-10-16', created_at: '2026-10-11T08:00:00Z', titre: 'Frites' }
  const C = { id: 'c', commercant_id: 'c1', date_debut: '2026-10-20', created_at: '2026-10-12T08:00:00Z', titre: 'Pain' }
  egal('🔴 une nouvelle actu cède devant celle de la semaine', conflitSemaineGmy({ date_debut: '2026-10-15' }, [A])?.id, 'a')
  egal('une nouvelle actu la semaine suivante passe', conflitSemaineGmy({ date_debut: '2026-10-19' }, [A]), null)
  egal('🔴 la première créée passe', conflitSemaineGmy(A, [A, B]), null)
  egal('🔴 la seconde de la semaine est arrêtée', conflitSemaineGmy(B, [A, B])?.id, 'a')
  egal('modifier sa propre actu ne la bloque pas', conflitSemaineGmy({ id: 'a', date_debut: '2026-10-14', created_at: A.created_at }, [A]), null)
  const D = { ...B, id: 'd', commercant_id: 'c2' }
  egal('🔴 le cron : Exister, une par semaine ; les autres, tout',
    actusGmyRetenues([A, B, C, D], [A, B, C, D], id => id === 'c1').map(a => a.id), ['a', 'c', 'd'])
  egal('sans limite, tout passe', actusGmyRetenues([A, B], [A, B], () => false).map(a => a.id), ['a', 'b'])
  egal('🔴 le cron voit la semaine entière (une déjà envoyée arrête la nouvelle)',
    actusGmyRetenues([B], [A, B], () => true).map(a => a.id), [])
}

// ═══ 3. LA DATE DE FIN ════════════════════════════════════════════════════
{
  // ⚠️ LE MESSAGE EXACT, pas un mot : « la date de fin doit être après… »
  // contient aussi « date de fin », et la garde passait pour la mauvaise raison.
  egal('🔴 GMY sans date de fin : refusé (sinon elle n’entre jamais)', erreurActuGmy({ inclus_gmy: true, date_debut: '2026-10-13', date_fin: '' }),
    'Indique jusqu’à quand ton actu reste en ligne : sans date de fin, elle n’entre pas dans le Good Morning.')
  egal('GMY sans aucune date : le même refus', erreurActuGmy({ inclus_gmy: true }),
    'Indique jusqu’à quand ton actu reste en ligne : sans date de fin, elle n’entre pas dans le Good Morning.')
  verifier('GMY, fin avant le début : refusé', /après la date de début/.test(erreurActuGmy({ inclus_gmy: true, date_debut: '2026-10-13', date_fin: '2026-10-12' }) || ''))
  egal('GMY bien daté : rien à dire', erreurActuGmy({ inclus_gmy: true, date_debut: '2026-10-13', date_fin: '2026-10-19' }), null)
  egal('hors GMY : la date de fin reste libre', erreurActuGmy({ inclus_gmy: false, date_fin: '' }), null)
}

// ═══ 4. LE FORFAIT ════════════════════════════════════════════════════════
{
  verifier('Exister publie dans le Good Morning', PLAN_FEATURES.exister?.actu_gmy === true)
  verifier('mais pas d’actus illimitées', PLAN_FEATURES.exister?.actus_illimitees === false)
}

// ═══ 5. C'EST BRANCHÉ ? ══════════════════════════════════════════════════
{
  const conf = lu('app/dashboard/ConfigDashboard.js')
  verifier('🔴 l’onglet s’ouvre avec `actu_gmy` (Alex)', /\{ id: 'actus', label: 'Actus', icon: 'sliders', feature: 'actu_gmy' \}/.test(conf))
  verifier('🔴 et l’écran se rend avec le même droit', /tab === 'actus'\s*&& peut\(commercant, 'actu_gmy'\) && <TabActus/.test(conf))
  verifier('🔴 Exister : l’actu paraît d’office dans le Good Morning', /const inclusGmy = estExister \? true : !!form\.inclus_gmy/.test(conf) && /inclus_gmy: inclusGmy,/.test(conf))
  verifier('🔴 l’écran exige la date de fin d’une actu GMY', /const erreurGmy = erreurActuGmy\(\{ inclus_gmy: inclusGmy, date_debut: form\.date_debut, date_fin: form\.date_fin \}\)/.test(conf) && /if \(erreurGmy\) return toast\(erreurGmy, 'error'\)/.test(conf))
  verifier('l’écran dit la règle par la règle partagée', /const conflit = conflitSemaineGmy\(/.test(conf) && /if \(errGmy\) return toast\(/.test(conf))
  verifier('la case GMY est figée pour Exister', /checked=\{estExister \|\| form\.inclus_gmy\} disabled=\{estExister\}/.test(conf))

  const route = lu('app/api/actus/notify-favoris/route.js')
  verifier('🔴 l’envoi aux favoris tient la règle (Exister)', /if \(!peutActusIllimitees\) \{[\s\S]{0,400}if \(conflitSemaineGmy\(actu, gmy \|\| \[\]\)\) \{\s*return NextResponse\.json\(\{ status: 'skipped', reason: 'une_actu_par_semaine' \}\)/.test(route))
  verifier('🔴 une lecture ratée n’envoie rien', /if \(errGmy\) return NextResponse\.json\(\{ status: 'skipped', reason: 'lecture_ko' \}, \{ status: 500 \}\)/.test(route))
  verifier('la route lit la date et la création de l’actu', /id, titre, contenu, type, actif, inclus_gmy, date_debut, created_at,/.test(route))

  const cron = lu('app/api/cron/morning-yoppers/route.js')
  verifier('🔴 le cron tient la règle', /const retenues = new Set\(actusGmyRetenues\(actusGmy \|\| \[\], gmySemaine, id => limites\.has\(id\)\)\.map\(a => a\.id\)\)/.test(cron) && /if \(!retenues\.has\(a\.id\)\) continue/.test(cron))
  verifier('🔴 le cron voit la semaine entière, et une lecture ratée s’arrête', /\.in\('commercant_id', \[\.\.\.limites\]\)\.eq\('inclus_gmy', true\)/.test(cron) && /if \(errLues\) \{/.test(cron))
  verifier('le cron lit la date et la création des actus', /id, titre, commercant_id, date_debut, created_at,/.test(cron))

  const fiche = lu('app/commander/[slug]/page.js')
  verifier('la fiche n’affiche toujours les actus qu’à partir de Communiquer', /canDo\(planEffectif\(commercant\), 'actus_illimitees'\) && actualites\.length > 0/.test(fiche))
}

console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('L’actu d’Exister dans le Good Morning : verte.')
