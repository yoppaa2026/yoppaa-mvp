// ─── OÙ EN EST UN RENDEZ-VOUS, EN UN COUP D'ŒIL ──────────────────────────────
//
// ⚠️ LA LISTE D'UN COURS NE DISAIT QUE DES NOMS (Alex, 17/08 : « on ne voit pas
// dans la liste, qui est honoré ou pas, qui doit payer ou pas, le statut, abo ou
// à l'unité »). Douze lignes identiques, un numéro de place et un téléphone : la
// professeure devait ouvrir douze fiches pour savoir qui était déjà passé et qui
// devait encore payer, puis les refermer une à une. C'est exactement la règle
// obligatoire posée le même jour : PERSONNE NE CHERCHE UNE INFORMATION.
//
// Les libellés vivent ici, purs, pour que le banc les EXÉCUTE et les relise au
// lieu de chercher des mots dans du JSX. `page.js` garde sa propre table
// `STATUTS_RDV` : elle y attache les ACTIONS possibles, qui n'ont rien à faire
// dans une liste en lecture.

export const STATUTS_LISTE = {
  confirme:          { label: 'À venir',   icone: '●', texte: '#6B35C4', fond: '#EDE0FF', bord: '#6B35C433' },
  honore:            { label: 'Honoré',    icone: '✓', texte: '#065F46', fond: '#D1FAE5', bord: '#10B98144' },
  no_show:           { label: 'Pas venu',  icone: '⊘', texte: '#6B7280', fond: '#F3F4F6', bord: '#9CA3AF44' },
  annule_client:     { label: 'Annulé',    icone: '✕', texte: '#B91C1C', fond: '#FEE2E2', bord: '#DC262644' },
  annule_commercant: { label: 'Annulé',    icone: '✕', texte: '#B91C1C', fond: '#FEE2E2', bord: '#DC262644' },
}

// ⚠️ UN STATUT INCONNU NE DOIT PAS FAIRE DISPARAÎTRE LA PASTILLE. Ne rien
// afficher est la pire des sorties : le commerçant lit une ligne sans état et
// croit à un rendez-vous ordinaire. On rend le statut brut plutôt que rien.
export function statutRdv(rdv = {}) {
  const cle = String(rdv?.statut || 'confirme')
  const connu = STATUTS_LISTE[cle]
  if (connu) return { cle, ...connu }
  return { cle, label: cle, icone: '●', texte: '#6B7280', fond: '#F3F4F6', bord: '#9CA3AF44' }
}

// Ce qu'on écrit au-dessus de la liste d'un cours : où en est la séance, sans
// compter les têtes soi-même. Les annulés ne sont plus des inscrits, ils ne
// pèsent donc ni au dénominateur ni sur le reste à faire.
export function resumeSeance(inscrits = []) {
  const vivants = (inscrits || []).filter(i => i && !String(i.statut || '').startsWith('annule'))
  const aVenir  = vivants.filter(i => String(i.statut || 'confirme') === 'confirme')
  const honores = vivants.filter(i => i.statut === 'honore')
  const absents = vivants.filter(i => i.statut === 'no_show')
  const annules = (inscrits || []).filter(i => i && String(i.statut || '').startsWith('annule'))
  return {
    presents: vivants.length,
    aVenir: aVenir.length,
    honores: honores.length,
    absents: absents.length,
    annules: annules.length,
    // Les identifiants de ceux qu'un « tout le monde était là » ferait basculer.
    aCloturer: aVenir.map(i => i.id),
  }
}

// La phrase du dessus. Elle nomme CHAQUE catégorie présente, y compris les
// absents et les annulés : un inscrit écarté du compte sans sa raison est un
// appel téléphonique qui se prépare.
export function texteResumeSeance(inscrits = [], capacite = null) {
  const r = resumeSeance(inscrits)
  const bouts = []
  const n = Number(capacite)
  bouts.push(Number.isFinite(n) && n > 0
    ? `${r.presents} inscrit${r.presents > 1 ? 's' : ''} sur ${n}`
    : `${r.presents} inscrit${r.presents > 1 ? 's' : ''}`)
  if (Number.isFinite(n) && n > 0 && r.presents >= n) bouts.push('complet')
  if (r.honores > 0) bouts.push(`${r.honores} honoré${r.honores > 1 ? 's' : ''}`)
  if (r.absents > 0) bouts.push(`${r.absents} pas venu${r.absents > 1 ? 's' : ''}`)
  if (r.annules > 0) bouts.push(`${r.annules} annulé${r.annules > 1 ? 's' : ''}`)
  if (r.aVenir > 0 && r.honores + r.absents > 0) bouts.push(`${r.aVenir} à clôturer`)
  return bouts.join(' · ')
}
