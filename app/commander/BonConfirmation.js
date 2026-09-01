'use client'
// Écran de confirmation après l'achat d'un bon (31/08, mis en plein écran le 01/09).
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
// 🔴 PUIS ALEX A DEMANDÉ UN VRAI ÉCRAN, « comme pour les autres commandes » :
// il s'affiche, PUIS le Yopper choisit. Une carte glissée au milieu d'une fiche
// se rate ; on la fait défiler sans la lire, et rien ne dit ce qu'on fait
// ensuite. Un achat de bon mérite le même accusé de réception qu'une commande.
//
// ⚠️ SEUL LE SUCCÈS PREND L'ÉCRAN. Un paiement annulé garde son bandeau
// discret : rien n'a été débité, il n'y a rien à acquitter, et barrer l'écran
// de quelqu'un qui vient de renoncer serait le punir de son choix.
//
// ⚠️ CE COMPOSANT EST PARTAGÉ PAR LES DEUX TUNNELS, comme `BonCadeauFiche` :
// un bon s'achète depuis la fiche commerce ET depuis la fiche rendez-vous, et
// une confirmation écrite deux fois divergerait à la première correction.

import Link from 'next/link'
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

// `etat`       : 'ok' | 'annule', lu dans l'URL de retour Stripe.
// `bon`        : ce que rend /api/bons-cadeaux/confirmation, ou null.
// `categorie`  : celle du commerce affiché, pour que le mot suive le métier.
//                ⚠️ Elle vient de l'appelant : ce composant ne la devine pas, et
//                son absence dirait « bon cadeau » chez un boulanger.
// `onContinuer`: ferme l'écran et rend la fiche. Sans lui, le plein écran
//                n'aurait pas de sortie, ce qui serait pire que le bandeau.
export default function BonConfirmation({ etat = null, bon = null, categorie = null, onContinuer = null }) {
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

  const chezQui = bon?.commercant?.nom || null
  const echeance = bon?.expires_at ? dateFr(bon.expires_at) : null

  // Le plein écran, avec ses marges de sécurité : sur un iPhone, l'encoche et
  // la barre du bas mangent le contenu sans elles.
  const ecran = {
    position: 'fixed', inset: 0, zIndex: 10000,
    background: `linear-gradient(170deg, ${T.ink} 0%, ${T.deep} 45%, ${T.main} 130%)`,
    overflowY: 'auto', WebkitOverflowScrolling: 'touch',
    padding: 'calc(24px + env(safe-area-inset-top, 0px)) 16px calc(24px + env(safe-area-inset-bottom, 0px))',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    fontFamily: '"DM Sans", system-ui, sans-serif',
  }
  const carte = { background: '#fff', borderRadius: 20, width: '100%', maxWidth: 420, overflow: 'hidden', boxShadow: '0 18px 44px rgba(0,0,0,0.32)' }
  const btnPlein = { display: 'block', width: '100%', textAlign: 'center', padding: '13px 16px', borderRadius: 100, border: 'none', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 800, fontSize: '0.92rem', textDecoration: 'none', cursor: 'pointer', fontFamily: 'inherit' }
  const btnBord = { display: 'block', width: '100%', textAlign: 'center', padding: '13px 16px', borderRadius: 100, background: 'transparent', border: `1.5px solid ${T.main}44`, color: T.deep, fontWeight: 700, fontSize: '0.88rem', textDecoration: 'none', cursor: 'pointer', fontFamily: 'inherit' }

  // ─── PAIEMENT OK, MAIS LE DÉTAIL N'A PAS PU ÊTRE LU ───────────────────────
  //
  // 🔴 UNE LECTURE RATÉE NE DOIT PAS EFFACER LA CONFIRMATION. Le paiement a
  // réussi, Stripe ne renvoie ici que dans ce cas : si l'appel au serveur
  // échoue, on retombe sur ce qu'on sait avec certitude plutôt que d'afficher
  // un écran vide à quelqu'un qui vient de payer.
  if (!bon) {
    return (
      <div style={ecran}>
        <div style={carte}>
          <div style={{ height: 4, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)` }}/>
          <div style={{ padding: '20px 18px 18px', textAlign: 'center' }}>
            <p style={{ margin: '0 0 8px', fontSize: '1.05rem', fontWeight: 900, color: T.ink, lineHeight: 1.35 }}>
              Ton {nomBon} est payé 🟣
            </p>
            <p style={{ margin: '0 0 16px', fontSize: '0.84rem', color: T.deep, lineHeight: 1.55 }}>
              Il arrive par email dans quelques instants. Pense à regarder tes indésirables.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {onContinuer && <button type="button" onClick={onContinuer} style={btnPlein}>Continuer</button>}
              <Link href="/commander" style={btnBord}>Retour à l&rsquo;accueil</Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={ecran} role="dialog" aria-modal="true" aria-label="Confirmation de paiement">
      <div style={carte}>
        <div style={{ height: 4, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)` }}/>

        <div style={{ padding: '18px 18px 20px' }}>
          <p style={{ margin: '0 0 2px', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.62rem', fontWeight: 800, color: T.vert, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.vert} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
            Paiement confirmé
          </p>

          {/* ⚠️ ON ANNONCE L'ÉTAT, PAS NOTRE GESTE. « C'est parti chez Marie »
              dit ce qui s'est passé ; « nous avons envoyé un email » parle de
              nous. Et le prénom vient de l'acheteur, qui l'a tapé lui-même. */}
          <p style={{ margin: '0 0 12px', fontSize: '1.15rem', fontWeight: 900, color: T.ink, lineHeight: 1.3, letterSpacing: '-0.3px' }}>
            {bon.pour_moi
              ? `Ton ${nomBon} est prêt 🟣`
              : `C'est parti chez ${bon.beneficiaire_prenom || 'la personne à qui tu l\'offres'} 🟣`}
          </p>

          {/* Le montant et le commerce, ensemble : un montant seul laisse
              deviner où il se dépense. */}
          <div style={{ background: `linear-gradient(135deg, ${T.ink}, ${T.deep})`, borderRadius: 14, padding: '16px 14px', marginBottom: 12, textAlign: 'center' }}>
            <p style={{ margin: '0 0 2px', fontSize: '0.6rem', fontWeight: 700, color: T.light, textTransform: 'uppercase', letterSpacing: '1px' }}>
              {libelleBon(categorie, { majuscule: true })}{chezQui ? ` · ${chezQui}` : ''}
            </p>
            <p style={{ margin: 0, fontSize: '2.1rem', fontWeight: 900, color: '#fff', letterSpacing: '-1.2px', lineHeight: 1.15 }}>
              {euros(bon.montant)}
            </p>

            {/* ⚠️ LE CODE N'EST LÀ QUE SI L'ACHETEUR EST LE PORTEUR. Sur un
                cadeau, le porteur est quelqu'un d'autre : le serveur ne renvoie
                même pas le code, et cet écran ne peut donc pas le laisser
                échapper par distraction. */}
            {bon.code && (
              <>
                <p style={{ margin: '12px 0 3px', fontSize: '0.6rem', fontWeight: 700, color: T.light, textTransform: 'uppercase', letterSpacing: '1px' }}>Ton code</p>
                <p style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: '#fff', letterSpacing: '2px', fontFamily: 'monospace', background: 'rgba(255,255,255,0.12)', borderRadius: 9, padding: '7px 12px', display: 'inline-block' }}>
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

          {/* 🔴 CE TEXTE AFFIRMAIT L'INVERSE DE LA VÉRITÉ (Alex, 01/09) : il
              disait « ton code est dans ton email de confirmation », alors que
              l'email envoyé à l'acheteur d'un cadeau dit lui-même « le code est
              dans SON email » (`lib/resend.js`). Le code ne part QUE chez le
              destinataire. J'avais écrit une phrase utile sans vérifier ce que
              l'email contenait.
              ⚠️ ET ON DIT CE QUI EST ARRIVÉ À L'AUTRE, pas ce qui manque à
              l'acheteur : ce qu'il veut savoir, c'est que son cadeau est bien
              parti et que la personne saura s'en servir.
              ⚠️ AUCUN PRONOM DE GENRE : on ne connaît pas celui du destinataire,
              et un prénom ne le dit pas. */}
          <p style={{ margin: '0 0 4px', fontSize: '0.84rem', color: T.deep, lineHeight: 1.55 }}>
            {bon.pour_moi
              ? <>Tu le retrouves dans <strong>ton profil</strong>, et il t&rsquo;attend aussi par email.</>
              : <><strong>{bon.beneficiaire_prenom || 'La personne à qui tu l\'offres'}</strong> reçoit tout par email : ton message, le montant et le code. Au comptoir, il suffit de montrer ce code{chezQui ? ` chez ${chezQui}` : ''} ; en ligne, il s&rsquo;applique au moment de payer, en une ou plusieurs fois.</>}
          </p>
          {!bon.pour_moi && (
            <p style={{ margin: '0 0 4px', fontSize: '0.78rem', color: T.muted, lineHeight: 1.55 }}>
              Ton reçu part sur ton adresse.
            </p>
          )}

          {echeance && (
            <p style={{ margin: '0 0 14px', fontSize: '0.76rem', color: T.muted, lineHeight: 1.5 }}>
              Valable jusqu&rsquo;au <strong style={{ color: T.ink }}>{echeance}</strong>.
            </p>
          )}

          {/* ─── LES SORTIES ────────────────────────────────────────────────
              🔴 UN PLEIN ÉCRAN SANS SORTIE SERAIT PIRE QUE LE BANDEAU. Demande
              d'Alex : l'écran s'affiche, PUIS le Yopper choisit — continuer ici,
              ou rentrer à l'accueil.
              ⚠️ « Continuer » est en premier et en plein : c'est l'action utile
              pour le commerce, et celle qu'on vient de nommer juste au-dessus. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {onContinuer && (
              <button type="button" onClick={onContinuer} style={btnPlein}>
                {chezQui ? `Continuer chez ${chezQui}` : 'Continuer'}
              </button>
            )}
            <Link href="/commander" style={btnBord}>Retour à l&rsquo;accueil</Link>

            {/* ⚠️ LE LIEN NE PART QUE SI LE JETON EXISTE, et il ne s'affiche que
                pour le porteur : la page `/cadeau/<token>` montre le code et le
                solde, elle n'a rien à faire entre les mains de quelqu'un qui
                offre le bon à un autre. */}
            {bon.pour_moi && bon.token && (
              <a href={`/cadeau/${bon.token}`} style={{ display: 'block', textAlign: 'center', marginTop: 2, fontSize: '0.82rem', fontWeight: 700, color: T.main, textDecoration: 'underline' }}>
                Voir mon {nomBon}
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
