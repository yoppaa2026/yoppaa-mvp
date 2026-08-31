'use client'
// Écran de confirmation après l'achat d'un bon (31/08).
//
// 🔴 IL N'EXISTAIT PAS. Alex l'a vu en production : le parcours d'achat marche,
// les emails partent, le bon apparaît bien dans le profil, mais la personne qui
// revient de sa banque ne trouvait qu'un BANDEAU VERT D'UNE LIGNE sur la fiche
// du commerçant. Une commande, elle, a son écran de confirmation depuis
// toujours. Le geste le plus engageant de l'application était le moins bien
// accusé.
//
// ⚠️ ET L'APP NE POUVAIT RIEN DIRE DE PLUS : l'URL de retour ne portait aucun
// identifiant. Ni montant, ni code, ni destinataire. Le bandeau ne mentait pas,
// il ne savait rien. C'est la `session_id` ajoutée au `success_url` qui rend cet
// écran possible.
//
// ⚠️ CE COMPOSANT EST PARTAGÉ PAR LES DEUX TUNNELS, comme `BonCadeauFiche` :
// un bon s'achète depuis la fiche commerce ET depuis la fiche rendez-vous, et
// une confirmation écrite deux fois divergerait à la première correction.

import { euros } from '@/lib/montants'
import { libelleBon } from '@/lib/bons-cadeaux'

const T = {
  vert:   '#059669',
  vertPale: '#F0FDF4',
  vertBord: '#86EFAC',
  ambre:  '#78350F',
  ambrePale: '#FFFBEB',
  ambreBord: '#FCD34D',
  ink:    '#1A0840',
  deep:   '#2D0F6B',
  main:   '#6B35C4',
  mid:    '#9660E0',
  light:  '#C4A0F4',
  muted:  '#6B7280',
}

function dateFr(d) {
  try {
    return new Date(d).toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch { return null }
}

// `etat`     : 'ok' | 'annule', lu dans l'URL de retour Stripe.
// `bon`      : ce que rend /api/bons-cadeaux/confirmation, ou null.
// `categorie`: celle du commerce affiché, pour que le mot suive le métier.
//              ⚠️ Elle vient de l'appelant : ce composant ne la devine pas, et
//              son absence dirait « bon cadeau » chez un boulanger.
export default function BonConfirmation({ etat = null, bon = null, categorie = null }) {
  if (etat !== 'ok' && etat !== 'annule') return null

  const nomBon = libelleBon(categorie)

  // ─── PAIEMENT ANNULÉ ──────────────────────────────────────────────────────
  // Rien n'a été débité, et c'est la seule chose qui compte à dire.
  if (etat === 'annule') {
    return (
      <div style={{ marginTop: 12, background: T.ambrePale, border: `1.5px solid ${T.ambreBord}`, borderRadius: 12, padding: '10px 14px' }}>
        <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700, color: T.ambre, lineHeight: 1.5 }}>
          Paiement annulé : aucun {nomBon} n&rsquo;a été débité.
        </p>
      </div>
    )
  }

  // ─── PAIEMENT OK, MAIS LE DÉTAIL N'A PAS PU ÊTRE LU ───────────────────────
  //
  // 🔴 UNE LECTURE RATÉE NE DOIT PAS EFFACER LA CONFIRMATION. Le paiement a
  // réussi, Stripe ne renvoie ici que dans ce cas : si l'appel au serveur
  // échoue, on retombe sur ce qu'on sait avec certitude plutôt que d'afficher
  // un écran vide à quelqu'un qui vient de payer.
  if (!bon) {
    return (
      <div style={{ marginTop: 12, background: T.vertPale, border: `1.5px solid ${T.vertBord}`, borderRadius: 12, padding: '10px 14px' }}>
        <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700, color: '#065F46', lineHeight: 1.5 }}>
          Ton {nomBon} est payé 🟣 Il arrive par email dans quelques instants (pense à vérifier les indésirables).
        </p>
      </div>
    )
  }

  const echeance = bon.expires_at ? dateFr(bon.expires_at) : null
  const chezQui = bon.commercant?.nom || null

  return (
    <div style={{ marginTop: 12, background: '#fff', border: `1.5px solid ${T.vertBord}`, borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ height: 4, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)` }}/>

      <div style={{ padding: '14px 16px 16px' }}>
        <p style={{ margin: '0 0 2px', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.62rem', fontWeight: 800, color: T.vert, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.vert} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
          Paiement confirmé
        </p>

        {/* ⚠️ ON ANNONCE L'ÉTAT, PAS NOTRE GESTE. « C'est parti chez Marie »
            dit ce qui s'est passé ; « nous avons envoyé un email » parle de
            nous. Et le prénom vient de l'acheteur, qui l'a tapé lui-même. */}
        <p style={{ margin: '0 0 10px', fontSize: '1.02rem', fontWeight: 900, color: T.ink, lineHeight: 1.35, letterSpacing: '-0.3px' }}>
          {bon.pour_moi
            ? `Ton ${nomBon} est prêt 🟣`
            : `C'est parti chez ${bon.beneficiaire_prenom || 'la personne à qui tu l\'offres'} 🟣`}
        </p>

        {/* Le montant et le commerce, ensemble : un montant seul laisse
            deviner où il se dépense. */}
        <div style={{ background: `linear-gradient(135deg, ${T.ink}, ${T.deep})`, borderRadius: 12, padding: '14px 14px', marginBottom: 10, textAlign: 'center' }}>
          <p style={{ margin: '0 0 2px', fontSize: '0.6rem', fontWeight: 700, color: T.light, textTransform: 'uppercase', letterSpacing: '1px' }}>
            {libelleBon(categorie, { majuscule: true })}{chezQui ? ` · ${chezQui}` : ''}
          </p>
          <p style={{ margin: 0, fontSize: '2rem', fontWeight: 900, color: '#fff', letterSpacing: '-1.2px', lineHeight: 1.15 }}>
            {euros(bon.montant)}
          </p>

          {/* ⚠️ LE CODE N'EST LÀ QUE SI L'ACHETEUR EST LE PORTEUR. Sur un
              cadeau, le porteur est quelqu'un d'autre : le serveur ne renvoie
              même pas le code, et cet écran ne peut donc pas le laisser
              échapper par distraction. */}
          {bon.code && (
            <>
              <p style={{ margin: '12px 0 3px', fontSize: '0.6rem', fontWeight: 700, color: T.light, textTransform: 'uppercase', letterSpacing: '1px' }}>Ton code</p>
              <p style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: '#fff', letterSpacing: '2px', fontFamily: 'monospace', background: 'rgba(255,255,255,0.12)', borderRadius: 9, padding: '7px 12px', display: 'inline-block' }}>
                {bon.code}
              </p>
            </>
          )}
        </div>

        {/* 🔴 LE WEBHOOK N'EST PEUT-ÊTRE PAS ENCORE PASSÉ, et le bon n'est donc
            pas encore utilisable pendant quelques secondes. Afficher le code en
            disant « montre-le au comptoir » serait faux pendant ce temps-là. On
            dit l'état réel plutôt que de laisser croire. */}
        {!bon.actif && (
          <p style={{ margin: '0 0 10px', fontSize: '0.78rem', fontWeight: 700, color: T.ambre, background: T.ambrePale, border: `1px solid ${T.ambreBord}`, borderRadius: 9, padding: '8px 10px', lineHeight: 1.5 }}>
            Ton paiement est confirmé. Le {nomBon} s&rsquo;active dans quelques secondes, le temps que ta banque nous réponde.
          </p>
        )}

        <p style={{ margin: '0 0 4px', fontSize: '0.82rem', color: T.deep, lineHeight: 1.55 }}>
          {bon.pour_moi
            ? <>Tu le retrouves dans <strong>ton profil</strong>, et il t&rsquo;attend aussi par email.</>
            : <>{bon.beneficiaire_prenom || 'La personne'} reçoit son {nomBon} par email{chezQui ? '' : ''}, avec ton message. <strong>Ton code est dans ton email de confirmation</strong> si tu veux l&rsquo;écrire sur une carte.</>}
        </p>

        {echeance && (
          <p style={{ margin: '0 0 12px', fontSize: '0.75rem', color: T.muted, lineHeight: 1.5 }}>
            Valable jusqu&rsquo;au <strong style={{ color: T.ink }}>{echeance}</strong>.
          </p>
        )}

        {/* ⚠️ LE LIEN NE PART QUE SI LE JETON EXISTE, et il ne s'affiche que
            pour le porteur : la page `/cadeau/<token>` montre le code et le
            solde, elle n'a rien à faire entre les mains de quelqu'un qui offre
            le bon à un autre. */}
        {bon.pour_moi && bon.token && (
          <a
            href={`/cadeau/${bon.token}`}
            style={{ display: 'block', textAlign: 'center', padding: '11px 16px', borderRadius: 100, background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 800, fontSize: '0.88rem', textDecoration: 'none' }}
          >
            Voir mon {nomBon}
          </a>
        )}
      </div>
    </div>
  )
}
