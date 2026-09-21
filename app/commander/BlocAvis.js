'use client'
// ─── LES AVIS D'UN COMMERCE, PARTOUT PAREIL ─────────────────────────────────
//
// 🔴 POURQUOI CE FICHIER EXISTE. Le bloc vivait à l'intérieur de la fiche
// commerce (`app/commander/[slug]/page.js`), et la fiche RDV, celle des salons
// et des services, n'affichait AUCUN avis. Trouvé par Alex le 21/09 chez Salon
// Nathalie : « les avis ne figurent pas en bas de page comme chez Momo ».
//
// ⚠️ ET CE N'ÉTAIT PAS QU'UN DÉFAUT D'AFFICHAGE. `/api/yopper/avis` accepte un
// avis après une commande récupérée OU un rendez-vous honoré : les clients d'un
// salon POUVAIENT donc en écrire, et personne ne les voyait jamais. Le salon
// recevait des avis invisibles.
//
// ⚠️ UN SEUL EXEMPLAIRE, ET C'EST TOUT L'INTÉRÊT. Deux copies du même bloc, ce
// sont deux endroits à corriger le jour où un défaut sort, et un seul qui le
// sera. C'est exactement ce qui venait de se produire sur les textes de la
// modale de signalement, corrigés d'un côté et pas de l'autre.

import { useState } from 'react'
import { Star } from 'lucide-react'
import ModalSignalement from './ModalSignalement'
import { libelleBascule } from '@/lib/avis-affichage'

const T = {
  bgCard: '#FFFFFF',
  main:   '#6B35C4',
  pale:   '#EDE0FF',
  ink:    '#1A0840',
  deep:   '#2D0F6B',
  muted:  '#6B7280',
}

export function Etoiles({ note, taille = 14 }) {
  const n = note ? Math.round(note) : 0
  return <span style={{ display: 'inline-flex', gap: 1 }}>{[1,2,3,4,5].map(i => <Star key={i} size={taille} strokeWidth={1.6} color={i<=n ? '#F59E0B' : '#D1D5DB'} fill={i<=n ? '#F59E0B' : 'none'}/>)}</span>
}

export function CarteAvis({ a }) {
  const [ouvert, setOuvert] = useState(false)

  // 🔴 SIGNALER UN AVIS (20/09, demandé par Apple). Les avis sont du contenu
  // écrit par des habitants et publié sur une fiche : il faut pouvoir en
  // signaler un. Les huit motifs du signalement de fiche ne servaient à rien
  // ici, ils visent des données (horaires, adresse) ; la modale en propose
  // d'autres dès qu'on lui passe `kind: 'avis'`.
  //
  // ⚠️ LE BOUTON N'APPARAÎT QUE SUR UNE CARTE OUVERTE, et c'est le bon moment :
  // on signale ce qu'on vient de lire. Sur une carte repliée, le commentaire
  // est tronqué à une ligne, et proposer de signaler un texte qu'on n'a pas lu
  // n'appelle que des signalements à l'aveugle.
  const [signaler, setSignaler] = useState(false)

  // 🔴 LA PASTILLE « VÉRIFIÉ » NE S'EST JAMAIS AFFICHÉE, et c'est la colonne
  // absente d'une vue pour la septième fois. Cet écran lit `avis_public`, qui
  // fait le calcul à notre place et n'expose QUE son résultat :
  //
  //     commande_id IS NOT NULL AS verifie
  //
  // `a.commande_id` valait donc toujours `undefined`, et `!!undefined` est
  // faux. Aucune erreur, aucun avertissement : la pastille manquait, voilà
  // tout. Trouvé le 20/09 en regardant une capture d'Alex, où cinq avis à cinq
  // étoiles s'affichaient sans la moindre marque de vérification — exactement
  // ce qui fait suspecter des avis fabriqués.
  //
  // ⚠️ ET LA VUE NE VÉRIFIE QUE LES COMMANDES. Un avis laissé après un
  // rendez-vous honoré est tout aussi prouvé (`/api/yopper/avis` exige l'un ou
  // l'autre), et il restera pourtant non vérifié tant que la vue ne regarde pas
  // `rdv_reservation_id`. Ça se corrige dans la vue, pas ici.
  const verifie = a.verifie === true

  return (
    <div onClick={() => setOuvert(o => !o)}
      style={{ background: T.bgCard, borderRadius: 14, padding: '0.875rem 1rem', marginBottom: '0.5rem', border: `1.5px solid ${T.pale}`, cursor: 'pointer', transition: 'all 0.15s' }}
      onMouseOver={e => e.currentTarget.style.borderColor = T.main}
      onMouseOut={e => e.currentTarget.style.borderColor = T.pale}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Etoiles note={a.note} taille={14}/>
          {verifie && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 800, color: '#10B981', background: '#F0FDF4', padding: '2.5px 8px', borderRadius: 100, letterSpacing: '0.5px', textTransform: 'uppercase', border: '1px solid #BBF7D0' }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
              Vérifié
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.75rem', color: T.deep, fontWeight: 600 }}>{a.client?.nom || 'Client'}</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'transform 0.2s', transform: ouvert ? 'rotate(180deg)' : 'rotate(0deg)' }}>
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </div>
      </div>
      {a.commentaire && !ouvert && (
        <p style={{ fontSize: '0.8rem', color: T.muted, marginTop: 6, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>{a.commentaire}</p>
      )}
      {ouvert && (
        <div style={{ marginTop: 8 }}>
          {a.commentaire && <p style={{ fontSize: '0.875rem', color: T.ink, fontWeight: 500, lineHeight: 1.5, marginBottom: a.reponse_commercant ? 10 : 0 }}>{a.commentaire}</p>}
          {a.reponse_commercant && (
            <div style={{ background: T.pale, borderRadius: 10, padding: '0.5rem 0.75rem' }}>
              <p style={{ fontSize: '0.72rem', fontWeight: 700, color: T.main, marginBottom: 2 }}>Réponse du commerçant :</p>
              <p style={{ fontSize: '0.82rem', color: T.deep, fontWeight: 500 }}>{a.reponse_commercant}</p>
            </div>
          )}

          {/* ⚠️ `stopPropagation` OU LA CARTE SE REFERME SOUS LE DOIGT. Tout le
              bloc porte un `onClick` qui bascule l'ouverture : sans ça, ouvrir
              la modale replierait l'avis en même temps, et le clic aurait l'air
              d'avoir raté. */}
          <button type="button"
            onClick={(e) => { e.stopPropagation(); setSignaler(true) }}
            style={{
              marginTop: 10, background: 'none', border: 'none', padding: 0,
              color: T.muted, fontSize: '0.72rem', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline',
              textUnderlineOffset: 2,
            }}>
            Signaler cet avis
          </button>
        </div>
      )}

      {signaler && (
        <div onClick={(e) => e.stopPropagation()}>
          <ModalSignalement
            target={{
              kind: 'avis',
              id: a.id,
              // Ce qu'on signale, montré tel qu'on vient de le lire. On ne
              // reprend PAS le nom de l'auteur : on signale un contenu, pas
              // quelqu'un, et la décision se prend sur le texte.
              nom: a.commentaire
                ? `« ${a.commentaire.slice(0, 70)}${a.commentaire.length > 70 ? '…' : ''} »`
                : 'Une note sans commentaire',
            }}
            onClose={() => setSignaler(false)}
          />
        </div>
      )}
    </div>
  )
}

// Le bloc complet : l'en-tête repliable, la note, et les avis.
//
// ⚠️ REPLIÉ PAR DÉFAUT (demande d'Alex) : la note globale tient sur une ligne,
// et le Yopper décide s'il veut lire. Le bouton dit le GESTE (« Lire les 12
// avis », « Masquer »), jamais l'état.
//
// ⚠️ IL NE REND RIEN QUAND IL N'Y A PAS D'AVIS, et c'est volontaire : un bloc
// « Avis clients » vide sur la fiche d'un commerce qui démarre lui fait du tort
// plutôt que de l'informer.
export default function BlocAvis({ avis = [], notesInfo = { moyenne: 0, count: 0 }, resumeNotes, style }) {
  const [deplies, setDeplies] = useState(false)
  if (!avis.length) return null

  return (
    <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: `1px solid ${T.pale}`, ...style }}>
      <button onClick={() => setDeplies(d => !d)}
        aria-expanded={deplies}
        style={{
          width: '100%', background: 'none', border: 'none', padding: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 10, cursor: 'pointer', textAlign: 'left',
        }}>
        <span style={{ fontWeight: 800, fontSize: '1rem', color: T.deep, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.deep} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/>
          </svg>
          Avis clients
          {resumeNotes?.montreMoyenne && (
            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: T.main }}>{resumeNotes.moyenne}</span>
          )}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', fontWeight: 700, color: T.main, flexShrink: 0 }}>
          {libelleBascule(resumeNotes, deplies)}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
            style={{ transition: 'transform 0.2s', transform: deplies ? 'rotate(180deg)' : 'rotate(0deg)' }}>
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </span>
      </button>
      {deplies && (
        <div style={{ marginTop: '0.75rem' }}>
          {avis.map(a => <CarteAvis key={a.id} a={a}/>)}
          {/* Un élément écarté se montre AVEC SA RAISON : la fiche ne charge que
              les 10 derniers avis, il faut le dire plutôt que de laisser croire
              qu'il n'y a que ça. */}
          {notesInfo.count > avis.length && (
            <p style={{ fontSize: '0.72rem', color: T.muted, margin: '4px 2px 0' }}>
              Les {avis.length} avis les plus récents, sur {notesInfo.count} au total.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
