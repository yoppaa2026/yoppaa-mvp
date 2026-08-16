'use client'
// ─────────────────────────────────────────────────────────────────────────────
// L'ÉCRAN DE CONFIRMATION D'UN ABONNEMENT ACHETÉ EN LIGNE
//
// ⚠️ POURQUOI UN ÉCRAN, ET PAS UN ENCADRÉ. Alex, 16/08 : « c'est une fenêtre
// qui s'ouvre sur la fiche et pas un écran de confirmation comme pour toutes
// les autres transactions, le client doit garder ses repères ». Une commande
// ouvre un écran, un rendez-vous ouvre un écran, et l'abonnement — le montant
// le plus élevé du catalogue — se contentait d'un cadre vert posé au milieu de
// la fiche, entre les deals et les horaires.
//
// La grammaire visuelle est donc CELLE DE L'ÉTAPE 4 du tunnel rendez-vous, au
// détail près : pastille qui flotte, médaillon vert en incrustation, wordmark
// tricolore, chiffre en pilule, titre, « Et après ? » numéroté, récapitulatif,
// puis les deux boutons. Se ressembler n'est pas ici une coquetterie : c'est
// exactement ce qui dit au client qu'il vient de faire la même chose.
//
// ⚠️ LE CHIFFRE EN PILULE N'EST PAS UN NUMÉRO. Un rendez-vous affiche sa
// référence, un abonnement n'en a aucune. Ce que l'acheteur veut lire à cette
// seconde-là, c'est COMBIEN DE SÉANCES il vient d'acheter.
//
// ⚠️ ET TOUT CE QUI EST AFFICHÉ VIENT DU CONTRAT RELU EN BASE. Rien n'est
// reconstitué depuis ce que l'écran croyait vendre avant la redirection : c'est
// le webhook qui crée le contrat, et tant qu'il n'a pas répondu, cet écran dit
// qu'il attend plutôt que d'annoncer des séances que personne n'a encore
// écrites.
// ─────────────────────────────────────────────────────────────────────────────

import { messageRetourAbonnement, resumeContratAchete, etapesApresAbonnement } from '@/lib/abonnements'

const T = {
  main: '#6B35C4', mid: '#9660E0', light: '#C4A0F4', pale: '#EDE0FF',
  ink: '#1A0840', deep: '#2D0F6B', muted: '#6B7280', bgPanel: '#160636',
}

// Rend en gras ce que les textes encadrent de `**`, comme l'écran du RDV. La
// formulation vit dans lib/abonnements.js, testable ; seule la mise en forme
// est ici.
function enGras(texte) {
  return String(texte).split(/(\*\*[^*]+\*\*)/g).map((bout, i) =>
    bout.startsWith('**') && bout.endsWith('**')
      ? <strong key={i}>{bout.slice(2, -2)}</strong>
      : <span key={i}>{bout}</span>
  )
}

export default function ConfirmationAbonnement({
  commercant,
  contrat = null,       // le contrat relu en base, null tant que le webhook n'a pas fini
  enAttente = false,    // on interroge encore
  onReserver,           // « Réserver ma première séance » → retour à la fiche
  onAccueil,            // « Retour à l'accueil »
}) {
  const m = messageRetourAbonnement('ok', { nomCommerce: commercant?.nom || '' })
  const resume = contrat
    ? resumeContratAchete(
        { ...contrat, prix_paye: contrat.prix, seances_total: contrat.total, date_debut: contrat.debut, date_fin: contrat.fin },
        { nomCommerce: commercant?.nom || '', nomFormule: contrat.formule?.libelle || '' },
      )
    : null
  const etapes = etapesApresAbonnement({ mode: contrat?.mode || 'credit', nomCommerce: commercant?.nom || '' })
  const seances = Number.isFinite(Number(contrat?.total)) && Number(contrat?.total) > 0
    ? Number(contrat.total) : null

  return (
    <div style={{ padding: '1.5rem 1rem 2rem', animation: 'fadeUp 0.4s ease' }}>
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <style>{`
          @keyframes ca-flotte { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
          @keyframes ca-numero { 0%{opacity:0;transform:scale(0.7)} 60%{opacity:1;transform:scale(1.06)} 100%{opacity:1;transform:scale(1)} }
          @keyframes ca-halo { 0%,100%{transform:scale(1);opacity:0.28} 50%{transform:scale(1.14);opacity:0.5} }
          @keyframes ca-check { 0%{transform:scale(0.4);opacity:0} 60%{transform:scale(1.12);opacity:1} 100%{transform:scale(1);opacity:1} }
        `}</style>
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 76, height: 76, borderRadius: '50%', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, marginBottom: '0.875rem', boxShadow: `0 8px 28px ${T.main}55, 0 0 0 6px ${T.main}18`, animation: 'ca-flotte 3.2s ease-in-out infinite' }}>
          {/* Le carnet de séances : douze cases, dont on vient de payer le tout. */}
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="17" rx="2.5"/>
            <path d="M8 2v4M16 2v4M3 10h18"/>
            <path d="M8 14h2M14 14h2M8 18h2"/>
          </svg>
          <span style={{ position: 'absolute', right: -2, bottom: -2, width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #10B981, #6EE7B7)', border: '2.5px solid #fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', animation: 'ca-check 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.2s both' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12l5 5L20 7"/>
            </svg>
          </span>
        </div>

        {/* Wordmark tricolore canonique fond clair, comme l'écran du RDV */}
        <p style={{ fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif', fontWeight: 800, fontSize: '1rem', marginBottom: 4, letterSpacing: '-0.05em', lineHeight: 1 }}>
          <span style={{ color: T.ink }}>yo</span>
          <span style={{ color: T.main }}>pp</span>
          <span style={{ color: T.mid }}>aa</span>
        </p>

        {/* ⚠️ LA PILULE NE S'AFFICHE QUE SI LE CONTRAT EST LÀ. Un « 0 séances »
            le temps que le webhook réponde serait un mensonge de trois
            secondes sur un achat à trois chiffres. */}
        {seances !== null && (
          <div style={{ position: 'relative', display: 'inline-block', marginBottom: 12 }}>
            <span aria-hidden="true" style={{ position: 'absolute', inset: '-30% -18%', borderRadius: '50%', background: `radial-gradient(circle, ${T.mid} 0%, transparent 68%)`, animation: 'ca-halo 2.8s ease-in-out infinite', pointerEvents: 'none' }}/>
            <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'baseline', gap: 6, background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, borderRadius: 100, padding: '7px 24px', boxShadow: `0 4px 16px ${T.main}44`, animation: 'ca-numero 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.1s both' }}>
              <span style={{ fontWeight: 900, fontSize: '1.5rem', color: '#fff', letterSpacing: '-0.5px' }}>{seances}</span>
              <span style={{ fontWeight: 800, fontSize: '0.85rem', color: '#fff', opacity: 0.92 }}>séance{seances > 1 ? 's' : ''}</span>
            </span>
          </div>
        )}

        <h2 style={{ fontWeight: 900, fontSize: '1.7rem', color: T.ink, marginBottom: '0.5rem', letterSpacing: '-0.75px' }}>
          {m.titre}
        </h2>
        <p style={{ color: T.deep, fontWeight: 700, marginBottom: '0.25rem' }}>Chez {commercant?.nom}</p>
        {resume?.formule && (
          <p style={{ color: T.muted, fontSize: '0.875rem' }}>{resume.formule}</p>
        )}
      </div>

      {/* ⚠️ L'ATTENTE SE DIT. Le contrat naît dans le webhook Stripe, quelques
          secondes après le retour du client : afficher un écran vide pendant ce
          temps-là ferait croire que le paiement s'est perdu. */}
      {!contrat && (
        <div style={{ background: enAttente ? '#F5F3FF' : '#FFFBEB', border: `1.5px solid ${enAttente ? T.light : '#FCD34D'}`, borderRadius: 14, padding: '0.875rem 1rem', marginBottom: '1rem' }}>
          <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: enAttente ? T.deep : '#78350F', lineHeight: 1.5 }}>
            {enAttente
              ? 'Ton paiement est passé. On enregistre ton abonnement, ça prend quelques secondes.'
              : 'Ton paiement est bien passé. Le détail de ton abonnement met un peu plus de temps que prévu à s’afficher, mais il t’arrive par email et tu le retrouveras dans Commandes et rendez-vous.'}
          </p>
        </div>
      )}

      {/* Card « Et après ? », strictement la même que sur l'écran du RDV */}
      <div style={{ background: `linear-gradient(135deg, ${T.pale}, #fff)`, borderRadius: 20, overflow: 'hidden', marginBottom: '1rem', border: `1.5px solid ${T.main}22` }}>
        <div style={{ height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)` }}/>
        <div style={{ padding: '1.25rem' }}>
          <p style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 800, color: T.ink, marginBottom: 12, fontSize: '1rem' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 8v4l3 3"/>
            </svg>
            Et après&nbsp;?
          </p>
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {etapes.map((texte, i) => (
              <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: '0.85rem', color: T.deep, lineHeight: 1.5 }}>
                <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 900, fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginTop: 1, boxShadow: `0 2px 6px ${T.main}33` }}>{i + 1}</span>
                <span style={{ paddingTop: 2 }}>{enGras(texte)}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Récapitulatif du contrat, même forme que le récapitulatif du RDV */}
      {resume && (
        <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${T.pale}`, padding: '1rem 1.125rem', marginBottom: '1rem' }}>
          {[
            ['Séances', resume.seances],
            ['Validité', resume.validite],
            ['Payé', resume.prix],
          ].filter(([, v]) => !!v).map(([libelle, valeur], i, liste) => (
            <div key={libelle} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: i < liste.length - 1 ? 8 : 0, paddingBottom: i < liste.length - 1 ? 8 : 0, borderBottom: i < liste.length - 1 ? `1px solid ${T.pale}` : 'none' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{libelle}</span>
              <span style={{ fontSize: libelle === 'Payé' ? '0.95rem' : '0.85rem', fontWeight: libelle === 'Payé' ? 900 : 800, color: libelle === 'Payé' ? T.main : T.ink, textAlign: 'right', maxWidth: '60%' }}>{valeur}</span>
            </div>
          ))}
        </div>
      )}

      {/* ⚠️ LE GESTE QUI SUIT EST DE RÉSERVER, PAS DE RENTRER CHEZ SOI. En mode
          crédit, aucune séance n'est posée : le bouton principal le dit et
          ramène au choix du cours. Le retour à l'accueil, qui ne fait rien
          avancer, passe en second. */}
      {contrat?.mode !== 'place_fixe' && (
        <button onClick={onReserver}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '0.875rem', border: 'none', borderRadius: 100, background: `linear-gradient(135deg, ${T.bgPanel}, ${T.main})`, color: '#fff', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', boxShadow: `0 6px 24px ${T.main}55`, marginBottom: 10 }}>
          Réserver ma première séance
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>
          </svg>
        </button>
      )}
      <button onClick={onAccueil}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '0.875rem', background: contrat?.mode === 'place_fixe' ? `linear-gradient(135deg, ${T.bgPanel}, ${T.main})` : 'transparent', color: contrat?.mode === 'place_fixe' ? '#fff' : T.main, border: contrat?.mode === 'place_fixe' ? 'none' : `1.5px solid ${T.main}`, borderRadius: 100, fontWeight: contrat?.mode === 'place_fixe' ? 800 : 700, cursor: 'pointer', fontSize: '0.9rem', fontFamily: '"DM Sans", sans-serif', boxShadow: contrat?.mode === 'place_fixe' ? `0 6px 24px ${T.main}55` : 'none' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
        </svg>
        Retour à l&apos;accueil
      </button>
    </div>
  )
}
