'use client'
// ─── LE RETOUR DES DEUX LIENS DE CHANGEMENT D'EMAIL ─────────────────────────
//
// 🔴 POURQUOI UNE PAGE À PART, ET PAS `/auth/session`. Alex a essayé le 23/09 :
// les deux liens menaient à un 404. Le gabarit Supabase construisait
// `yoppaa.app/&token_hash=…`, avec un `&` là où il fallait `/auth/…?`. Mais en
// réparant le gabarit on serait tombé sur un second défaut, plus sournois :
// `/auth/session` est faite pour une CONNEXION. Elle exige `data.session`,
// annonce « Connexion réussie ! », propose d'ouvrir l'app, et renvoie vers
// `/login?error=lien-invalide` quand elle n'obtient pas de session.
//
// Or une confirmation de changement d'email n'ouvre pas forcément de session,
// et surtout IL EN FAUT DEUX : `Secure email change` envoie un lien à
// l'ancienne adresse et un à la nouvelle, et la bascule n'a lieu qu'au second.
// Le commerçant qui clique le premier aurait donc lu « lien invalide » alors
// que tout s'était bien passé, et il aurait abandonné là.
//
// ⚠️ ON NE TOUCHE À AUCUN PARCOURS EXISTANT. Le gabarit « Change Email
// Address » est le seul à pointer ici ; la connexion par lien magique et la
// réinitialisation de mot de passe gardent leur chemin, qui marche.
//
// 🔴 ET ON NE MENT JAMAIS SUR L'ÉTAT. `user.new_email` dit tout : rempli, il
// reste un lien à cliquer ; vide, la bascule est faite. Annoncer « c'est
// changé » au premier clic ferait se connecter avec une adresse qui n'est pas
// encore la sienne, c'est-à-dire l'enfermer dehors.

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { messageAuth } from '@/lib/messages-auth'

const T = {
  main: '#6B35C4', mid: '#9660E0', light: '#C4A0F4', vert: '#10B981',
}

function Verificateur({ setEtat, setDetail }) {
  const params = useSearchParams()

  useEffect(() => {
    const token_hash = params.get('token_hash')
    // ⚠️ LE TYPE VIENT DU LIEN, MAIS ON N'ACCEPTE QUE LE NÔTRE. Cette page ne
    // sert qu'au changement d'email : laisser passer `recovery` ou `magiclink`
    // ouvrirait ici une session de connexion, sur un écran qui n'est pas fait
    // pour ça et qui ne le dirait pas.
    const type = params.get('type')

    async function verifier() {
      if (!token_hash || type !== 'email_change') {
        setEtat('invalide')
        setDetail('Ce lien n’est pas un lien de changement d’adresse.')
        return
      }

      const { data, error } = await supabase.auth.verifyOtp({ token_hash, type: 'email_change' })

      if (error) {
        setEtat('invalide')
        // ⚠️ LE CAS LE PLUS FRÉQUENT N'EST PAS UNE PANNE : c'est un lien déjà
        // cliqué, ou vieux de plus d'une demi-heure. On le dit avant de parler
        // d'erreur, sinon on inquiète pour rien.
        setDetail(messageAuth(error))
        return
      }

      // 🔴 ON N'AFFICHE PLUS UN ÉTAT QU'ON NE PEUT PAS CONNAÎTRE, ET C'EST LA
      // TROISIÈME VERSION DE CE BLOC.
      //
      // Première : `!!data?.user?.new_email`. Ce booléen vaut `false` quand la
      // bascule est finie ET quand Supabase ne renvoie rien. Les deux liens
      // annonçaient « ton adresse est changée ».
      // Deuxième : trois états, avec un secours par `getUser()`. Alex a
      // réessayé le 24/09 : LES DEUX LIENS DISAIENT ENCORE LA MÊME CHOSE.
      // `verifyOtp` rend bien un utilisateur au PREMIER clic, mais sans
      // remplir `new_email`. L'information n'existe pas de ce côté.
      //
      // ⚠️ DEUX TENTATIVES DE DEVINER, DEUX MESSAGES FAUX. On arrête. Un écran
      // qui affirme ce qu'il ignore se trompe tôt ou tard, et ici l'erreur
      // coûte cher : celui qui lit « c'est changé » au premier clic n'ouvre
      // jamais le second message, et son adresse ne bascule pas.
      //
      // Le message est désormais LE MÊME dans les deux cas, et il est VRAI
      // dans les deux : ce qui est confirmé l'est, ce qui reste à faire est
      // rappelé, et l'endroit qui dit la vérité est nommé. « Mon compte »
      // affiche `commercants.email`, donc l'adresse réellement en cours.
      if (data?.user?.new_email) {
        // Le seul cas où l'on SAIT : Supabase nomme l'adresse en attente.
        setDetail(data.user.new_email)
      }
      setEtat('confirme')
    }

    verifier()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}

export default function PageChangementEmail() {
  const [etat, setEtat] = useState('verification')
  const [detail, setDetail] = useState('')

  const carte = {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 16, padding: '1.25rem', marginBottom: 20, textAlign: 'left',
  }
  const titre = { fontWeight: 800, color: '#fff', fontSize: '0.95rem', marginBottom: 8, letterSpacing: '-0.3px' }
  const corps = { fontSize: '0.82rem', color: T.light, opacity: 0.85, lineHeight: 1.6, margin: 0 }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #160636 0%, #2D0F6B 50%, #1A0840 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '"DM Sans", sans-serif', padding: '1rem',
      position: 'relative', overflow: 'hidden',
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;700;800;900&display=swap" rel="stylesheet"/>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 80% 20%, #9660E033 0%, transparent 50%), radial-gradient(circle at 20% 80%, #C4A0F418 0%, transparent 50%)', pointerEvents: 'none' }}/>

      <div style={{ textAlign: 'center', position: 'relative', width: '100%', maxWidth: 360 }}>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 20 }}>
          {[{ c: '#fff', o: 0.45, s: 10 }, { c: T.light, o: 1, s: 13 }, { c: T.mid, o: 1, s: 10 }].map((d, i) => (
            <div key={i} style={{ width: d.s, height: d.s, borderRadius: '50%', background: d.c, opacity: d.o, boxShadow: `0 0 12px ${d.c}88`, animation: `dotPulse ${0.8 + i * 0.2}s ease-in-out ${i * 0.15}s infinite alternate` }}/>
          ))}
        </div>

        <p style={{ fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif', fontWeight: 800, fontSize: '2rem', letterSpacing: '-0.05em', color: '#fff', marginBottom: 4, lineHeight: 1 }}>yoppaa</p>
        <p style={{ fontSize: '0.65rem', fontWeight: 700, color: T.light, letterSpacing: '3px', textTransform: 'uppercase', opacity: 0.7, marginBottom: 28 }}>Pro</p>

        {etat === 'verification' && (
          <p style={{ color: T.light, fontSize: '0.875rem', fontWeight: 600, opacity: 0.8 }}>Vérification du lien…</p>
        )}

        {/* 🔴 LE PREMIER DES DEUX. On dit ce qui est fait, ce qui reste, et
            surtout AVEC QUELLE ADRESSE il continue à se connecter en attendant.
            Sans cette dernière phrase, il essaiera la nouvelle et croira que
            son compte est cassé. */}
        {etat === 'partiel' && (
          <div style={carte}>
            <p style={titre}>C’est confirmé de ce côté</p>
            <p style={corps}>
              Il reste <strong style={{ color: '#fff' }}>le second lien</strong> à cliquer, dans
              l’autre message. Tant que les deux ne sont pas confirmés, ton adresse ne change
              pas : continue à te connecter avec l’ancienne.
            </p>
          </div>
        )}

        {/* 🔴 L'ÉTAT « JE NE SAIS PAS », et il est le plus fréquent des trois.
            Supabase ne renvoie pas d'utilisateur au premier des deux clics :
            plutôt que de deviner, on écrit une phrase qui reste vraie dans les
            deux cas. Annoncer « c'est changé » sans preuve, c'est envoyer se
            connecter avec une adresse qui n'est pas encore la sienne. */}
        {/* 🔴 UN SEUL MESSAGE DE SUCCÈS, VRAI DANS LES DEUX CAS. Il y en avait
            deux, et l'écran devait deviner lequel afficher : il s'est trompé
            deux fois de suite, en annonçant « c'est changé » au premier des
            deux clics. Celui qui lit ça n'ouvre jamais le second message.
            Ici rien n'est affirmé sur ce qui reste à faire : on dit ce qui est
            acquis, on rappelle la règle, et on nomme l'endroit qui, lui,
            connaît la réponse. */}
        {etat === 'confirme' && (
          <div style={carte}>
            <p style={{ ...titre, color: T.vert }}>C’est confirmé de ce côté</p>
            <p style={corps}>
              Le changement n’a lieu qu’une fois les <strong style={{ color: '#fff' }}>deux
              liens</strong> cliqués{detail ? <>, vers <strong style={{ color: '#fff' }}>{detail}</strong></> : null}.
              Si le second message t’attend encore dans l’autre boîte, ouvre-le aussi.
            </p>
            <p style={{ ...corps, marginTop: 10 }}>
              Pour savoir où tu en es, ouvre « Mon compte » : la ligne
              <strong style={{ color: '#fff' }}> Email de connexion</strong> affiche
              l’adresse réellement en cours, et c’est elle qui fait foi.
            </p>
          </div>
        )}

        {etat === 'invalide' && (
          <div style={carte}>
            <p style={titre}>Ce lien n’a pas fonctionné</p>
            <p style={corps}>
              Le plus souvent, c’est qu’il a <strong style={{ color: '#fff' }}>déjà servi</strong> ou
              qu’il a expiré. {detail}
            </p>
            <p style={{ ...corps, marginTop: 10 }}>
              Ouvre « Mon compte » et redemande le changement : deux nouveaux liens partiront.
            </p>
          </div>
        )}

        {etat !== 'verification' && (
          <a href="/dashboard?onglet=config&config=compte"
            style={{ display: 'block', width: '100%', padding: '1rem', borderRadius: 100, fontWeight: 800, fontSize: '1rem', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', boxShadow: `0 6px 24px ${T.main}55`, textDecoration: 'none', letterSpacing: '-0.3px', boxSizing: 'border-box', textAlign: 'center' }}>
            Revenir à Mon compte →
          </a>
        )}

        <style>{`
          @keyframes dotPulse { from { transform:scale(0.8); opacity:0.5; } to { transform:scale(1.3); opacity:1; } }
        `}</style>

        <Suspense fallback={null}>
          <Verificateur setEtat={setEtat} setDetail={setDetail} />
        </Suspense>
      </div>
    </div>
  )
}
