'use client'

// LA FRÉQUENCE D'UNE PLAGE DE RENDEZ-VOUS (18/10, demande d'Emily, Centre
// Respire). Chaque semaine, une semaine sur deux, une fois par mois, ou des
// dates cochées. La règle vit dans `lib/frequence-creneau.js` ; cet écran ne
// fait que la régler et montrer, AVANT d'enregistrer, les prochaines dates
// qu'elle donne. Un réglage qu'on ne voit pas tomber, on le croit faux.

import { useMemo } from 'react'
import { prochainesDates, datesDuJourAVenir, RANGS_MOIS } from '@/lib/frequence-creneau'
import { jourBruxelles } from '@/lib/timezone'

const CHOIX = [
  { cle: 'hebdo', libelle: 'Chaque semaine' },
  { cle: 'deux_semaines', libelle: 'Une semaine sur deux' },
  { cle: 'mensuel', libelle: 'Une fois par mois' },
  { cle: 'dates', libelle: 'Dates choisies' },
]

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const JOURS_COURTS = { lundi: 'lun.', mardi: 'mar.', mercredi: 'mer.', jeudi: 'jeu.', vendredi: 'ven.', samedi: 'sam.', dimanche: 'dim.' }

function dateCourte(iso, jour) {
  const [, m, j] = String(iso).split('-').map(Number)
  return `${JOURS_COURTS[jour] || ''} ${j === 1 ? '1er' : j} ${MOIS[m - 1]}`.trim()
}

function libelleRang(r) {
  if (r === -1) return 'Dernier'
  return r === 1 ? '1er' : `${r}e`
}

export default function ChoixFrequence({ form, onChange, T }) {
  const jour = form.jour_semaine
  const aujourdhui = jourBruxelles()
  const frequence = form.frequence || 'hebdo'

  const apercu = useMemo(() => prochainesDates({
    jour_semaine: jour,
    frequence,
    date_depart: form.date_depart || null,
    rang_mois: form.rang_mois ?? null,
    dates_choisies: form.dates_choisies || [],
  }, aujourdhui, { nombre: 4 }), [jour, frequence, form.date_depart, form.rang_mois, form.dates_choisies, aujourdhui])

  const aCocher = useMemo(() => datesDuJourAVenir(jour, aujourdhui, { semaines: 26 }), [jour, aujourdhui])
  const cochees = new Set(form.dates_choisies || [])

  const pastille = (actif) => ({
    padding: '7px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 800,
    border: `1.5px solid ${actif ? T.main : T.hairline}`, background: actif ? T.pale : '#fff',
    color: actif ? T.main : T.muted, fontFamily: '"DM Sans", sans-serif',
  })

  function choisir(cle) {
    const patch = { frequence: cle }
    // Un point de départ raisonnable, que le commerçant corrige s'il veut :
    // la prochaine fois que ce jour revient.
    if (cle === 'deux_semaines' && !form.date_depart) patch.date_depart = aCocher[0] || aujourdhui
    if (cle === 'mensuel' && !RANGS_MOIS.includes(Number(form.rang_mois))) patch.rang_mois = 1
    onChange(patch)
  }

  function basculerDate(d) {
    const s = new Set(form.dates_choisies || [])
    if (s.has(d)) s.delete(d); else s.add(d)
    onChange({ dates_choisies: [...s].sort() })
  }

  return (
    <div style={{ marginBottom: 10, padding: 10, background: T.bg, borderRadius: 10 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 6 }}>Fréquence</label>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: frequence === 'hebdo' ? 0 : 10 }}>
        {CHOIX.map(c => (
          <button key={c.cle} type="button" onClick={() => choisir(c.cle)} style={pastille(frequence === c.cle)}>
            {c.libelle}
          </button>
        ))}
      </div>

      {frequence === 'deux_semaines' && (
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 4 }}>
            À partir de la semaine du
          </label>
          <input type="date" value={form.date_depart || ''} min={aujourdhui}
            onChange={e => onChange({ date_depart: e.target.value })}
            style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${T.hairline}`, fontSize: 13, fontFamily: '"DM Sans", sans-serif' }}/>
        </div>
      )}

      {frequence === 'mensuel' && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
          {RANGS_MOIS.map(r => (
            <button key={r} type="button" onClick={() => onChange({ rang_mois: r })} style={pastille(Number(form.rang_mois) === r)}>
              {libelleRang(r)}
            </button>
          ))}
          <span style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>{jour} du mois</span>
        </div>
      )}

      {frequence === 'dates' && (
        <div>
          <p style={{ fontSize: 11, color: T.muted, margin: '0 0 6px' }}>
            Coche les {jour}s où ce créneau a lieu ({cochees.size} {cochees.size > 1 ? 'dates' : 'date'}).
          </p>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {aCocher.map(d => (
              <button key={d} type="button" onClick={() => basculerDate(d)} aria-pressed={cochees.has(d)}
                style={{ ...pastille(cochees.has(d)), padding: '6px 8px', fontSize: 11 }}>
                {dateCourte(d, jour)}
              </button>
            ))}
          </div>
          {/* Une date déjà cochée au-delà des 26 semaines affichées reste
              enregistrée : on la nomme pour qu'elle ne disparaisse pas de vue. */}
          {(form.dates_choisies || []).some(d => !aCocher.includes(d)) && (
            <p style={{ fontSize: 11, color: T.muted, margin: '6px 0 0' }}>
              Aussi : {(form.dates_choisies || []).filter(d => !aCocher.includes(d)).map(d => dateCourte(d, jour)).join(', ')}
            </p>
          )}
        </div>
      )}

      {frequence !== 'hebdo' && (
        <p style={{ fontSize: 12, color: apercu.length ? T.ink : '#B91C1C', fontWeight: 600, margin: '10px 0 0' }}>
          {apercu.length
            // ⚠️ Pas de point final : la dernière date finit déjà par « déc. »
            // (« 1er déc.. », vu par Alex le 19/10).
            ? <>Prochaines fois : {apercu.map(d => dateCourte(d, jour)).join(', ')}</>
            : 'Aucune date à venir avec ce réglage.'}
        </p>
      )}
    </div>
  )
}
