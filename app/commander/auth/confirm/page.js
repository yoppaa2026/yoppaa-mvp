'use client'
import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { poserIdentiteLocale, effacerIdentiteLocale } from '@/lib/identite-locale'

const T = { main: '#6B35C4', light: '#C4A0F4', mid: '#9660E0', deep: '#2D0F6B' }

function ConfirmHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const token_hash = searchParams.get('token_hash')
    const type = searchParams.get('type')
    const next = searchParams.get('next') || '/commander'

    async function confirmer() {
      if (token_hash && type) {
        const { data, error } = await supabase.auth.verifyOtp({ token_hash, type })
        if (!error && data.session) {
          // Créer ou récupérer le profil client côté serveur (RLS clients verrouillé).
          // On lit prénom/nom/téléphone depuis user_metadata (saisis au signup) : avec la
          // confirmation email active, il n'y a pas de session au signup, donc l'upsert
          // client direct échoue et les infos seraient perdues sans ça.
          const u = data.session.user
          const md = u.user_metadata || {}
          const email = u.email
          const resClient = await fetch('/api/yopper/client', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'get-or-create', email, prenom: md.prenom || null, nom: md.nom_famille || null, telephone: md.telephone || null }) })
          const client = (await resClient.json().catch(() => ({})))?.client
          // 🔴 ON ÉCRIVAIT L'IDENTITÉ À MOITIÉ, ET ÇA MÉLANGEAIT DEUX PERSONNES.
          // L'adresse et l'identifiant partaient sans condition ; le prénom, le
          // nom et le téléphone seulement `if (client.X)`. Un champ vide chez le
          // nouveau compte laissait donc en place celui de l'ANCIEN. On arrivait
          // dans la bonne session avec le téléphone de quelqu'un d'autre.
          //
          // ⚠️ ET C'EST UN CHANGEMENT DE PERSONNE : on efface d'abord, on pose
          // ensuite. Voir lib/identite-locale.js.
          effacerIdentiteLocale()
          if (client) {
            poserIdentiteLocale({
              client_id: client.id,
              email,
              prenom: client.prenom,
              nom: client.nom,
              telephone: client.telephone,
            })
          }
          localStorage.setItem('yoppaa_onboarding_done', '1'); router.replace(next)
        } else {
          router.replace('/commander/auth?error=lien-invalide')
        }
      } else {
        // Pas de token - vérifier session existante
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          localStorage.setItem('yoppaa_onboarding_done', '1'); router.replace(next)
        } else {
          router.replace('/commander/auth?error=lien-invalide')
        }
      }
    }

    confirmer()
  }, [router, searchParams])

  return null
}

export default function CommanderAuthConfirmPage() {
  return (
    <>
      <style>{`
        @keyframes pulse { from { transform:scale(1); opacity:0.6; } to { transform:scale(1.3); opacity:1; } }
      `}</style>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;800&display=swap" rel="stylesheet"/>
      <div style={{ minHeight: '100dvh', background: `linear-gradient(160deg, #160636 0%, ${T.deep} 50%, #1A0840 100%)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: '"DM Sans", sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 20 }}>
            {[{c:'#fff',o:0.45},{c:T.light,o:1},{c:T.mid,o:1}].map((d,i) => (
              <div key={i} style={{ width: 12, height: 12, borderRadius: '50%', background: d.c, opacity: d.o, animation: `pulse ${0.8+i*0.2}s ease-in-out infinite alternate` }}/>
            ))}
          </div>
          <p style={{ fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif', fontWeight: 800, fontSize: '2rem', color: '#fff', letterSpacing: '-0.05em', marginBottom: 8, lineHeight: 1 }}>yoppaa</p>
          <p style={{ color: T.light, fontSize: '0.9rem', fontWeight: 600 }}>Connexion en cours...</p>
        </div>
        <Suspense fallback={null}>
          <ConfirmHandler/>
        </Suspense>
      </div>
    </>
  )
}