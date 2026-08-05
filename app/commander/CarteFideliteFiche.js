'use client'
// Encart fidélité de la fiche commerçant (B.6, 31/07). Deux états :
//   • le Yopper a une carte → jauge (tampons ou cagnotte) + récompense débloquée
//   • pas de carte / pas connecté → teaser du programme (libellé de la récompense)
// Les infos du PROGRAMME viennent de la vue commercants_public (fidelite_*),
// MA carte vient de /api/fidelite/mes-cartes (cookie Yopper), fetchée par la fiche.

const T = {
  main:  '#6B35C4',
  mid:   '#9660E0',
  pale:  '#EDE0FF',
  ink:   '#1A0840',
  deep:  '#2D0F6B',
  muted: '#6B7280',
}

function libelleRecompense(com) {
  if (com?.fidelite_recompense_libelle?.trim()) return com.fidelite_recompense_libelle.trim()
  if (com?.fidelite_recompense_type === 'remise_pct' && com?.fidelite_recompense_valeur) return `-${Number(com.fidelite_recompense_valeur)}% offerts`
  if (com?.fidelite_recompense_valeur) return `${Number(com.fidelite_recompense_valeur).toFixed(2).replace('.', ',')}€ offerts`
  return 'Récompense fidélité'
}

export default function CarteFideliteFiche({ commercant, carte, connecte = true }) {
  if (!commercant?.fidelite_actif) return null
  const estCagnotte = commercant.fidelite_mecanique === 'cagnotte'
  const seuilP = commercant.fidelite_seuil_passages || 10
  const seuilC = Number(commercant.fidelite_seuil_cagnotte || 10)
  const libelle = libelleRecompense(commercant)
  const recompense = (carte?.recompenses_disponibles || 0) > 0

  return (
    <div style={{ marginTop: 12, background: recompense ? '#F0FDF4' : T.pale, border: `1.5px solid ${recompense ? '#10B98155' : `${T.main}22`}`, borderRadius: 12, padding: '10px 12px' }}>
      <p style={{ margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.62rem', fontWeight: 800, color: recompense ? '#059669' : T.main, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill={recompense ? '#059669' : T.main} stroke="none" aria-hidden="true">
          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z"/>
        </svg>
        Carte de fidélité
      </p>
      {carte ? (
        <>
          {!estCagnotte && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', margin: '6px 0' }}>
              {Array.from({ length: Math.min(seuilP, 20) }, (_, i) => (
                <span key={i} style={{ width: 13, height: 13, borderRadius: '50%', background: i < carte.passages ? `linear-gradient(135deg, ${T.main}, ${T.mid})` : '#fff', border: `1.5px solid ${i < carte.passages ? T.main : `${T.main}44`}` }}/>
              ))}
            </div>
          )}
          {estCagnotte && (
            <div style={{ height: 7, borderRadius: 100, background: '#fff', overflow: 'hidden', margin: '6px 0' }}>
              <div style={{ height: '100%', width: `${Math.min(100, Math.round((Number(carte.cagnotte) / seuilC) * 100))}%`, borderRadius: 100, background: recompense ? '#10B981' : `linear-gradient(90deg, ${T.main}, ${T.mid})` }}/>
            </div>
          )}
          <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 700, color: recompense ? '#059669' : T.deep, lineHeight: 1.5 }}>
            {recompense
              ? `Bravo, ta récompense est débloquée : ${libelle} 🟣`
              : estCagnotte
                ? `Ta cagnotte : ${Number(carte.cagnotte).toFixed(2).replace('.', ',')}€. Encore ${Math.max(0, seuilC - Number(carte.cagnotte)).toFixed(2).replace('.', ',')}€ de cagnotte et tu débloques : ${libelle}`
                : `${carte.passages} passage${carte.passages > 1 ? 's' : ''} sur ${seuilP}. Encore ${Math.max(0, seuilP - carte.passages)} et tu débloques : ${libelle}`}
          </p>
        </>
      ) : (
        <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 700, color: T.deep, lineHeight: 1.5 }}>
          {estCagnotte
            ? `Gagne ${Number(commercant.fidelite_taux_cagnotte || 5)}% de chaque achat dans ta cagnotte. Dès qu'elle atteint ${seuilC.toFixed(2).replace('.', ',')}€, tu reçois : ${libelle}.`
            : `Après ${seuilP} passages, tu reçois : ${libelle}.`}
          {' '}
          {/* Sans cette phrase, un Yopper qui a déjà des passages voit le même
              texte que quelqu'un qui n'a jamais rien acheté, et en conclut que
              rien n'est compté. Le programme se raconte quand même : c'est ce
              qui donne envie de se connecter. */}
          {connecte
            ? 'Ta carte se remplit toute seule à chaque commande 🟣'
            : 'Connecte-toi pour voir où en est ta carte 🟣'}
        </p>
      )}
    </div>
  )
}
