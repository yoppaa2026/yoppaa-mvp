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

// ─── CE QUI ATTEND UN GESTE, ET QUAND ────────────────────────────────────────
//
// ⚠️ « AUCUNE INDICATION NE DIT S'IL Y A DES CHOSES À TRAITER DANS L'AGENDA si
// le commerçant ne clique pas sur son créneau » (Alex, 17/08). La pastille
// existait pourtant depuis le 12/08, sur la bande Historique. Mais elle ne
// comptait que les rendez-vous des jours PRÉCÉDENTS, strictement.
//
// Conséquence : une professeure qui termine ses six cours à 19h lit
// « Historique » sans le moindre chiffre. Ses six séances ne deviendront « à
// clôturer » que DEMAIN MATIN. Le moment exact où elle devrait agir est le seul
// où l'écran se tait.
//
// ⚠️ C'EST UN SEUIL, PAS UNE EXCEPTION : est à clôturer tout rendez-vous
// confirmé dont l'HEURE DE FIN est passée, aujourd'hui compris. La même leçon
// que le `etape < 4` de la veille : une comparaison sur une date entière ne
// couvre que les cas connus le jour où on l'écrit.
export function estAClore(rdv, maintenant = new Date()) {
  if (!rdv || String(rdv.statut || '') !== 'confirme') return false
  const jour = String(rdv.date_rdv || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) return false
  // ⚠️ L'heure de fin peut manquer sur un rendez-vous ancien : on retombe alors
  // sur la fin de la journée, ce qui ne le déclare jamais à clôturer trop tôt.
  const fin = /^\d{2}:\d{2}/.test(String(rdv.heure_fin || ''))
    ? String(rdv.heure_fin).slice(0, 5)
    : '23:59'
  const d = new Date(`${jour}T${fin}:00`)
  if (Number.isNaN(d.getTime())) return false
  return d.getTime() <= maintenant.getTime()
}

export function compterAClore(rdvs = [], maintenant = new Date()) {
  return (rdvs || []).filter(r => estAClore(r, maintenant)).length
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
