'use client'
// ═══════════════════════════════════════════════════════════════════════════
// /dashboard/abonnement
//
// Onglet "Abonnement" du dashboard commerçant.
// Affiche le plan actuel + permet de souscrire à Communiquer / Vendre via
// Stripe Checkout (essai gratuit inclus, cf. lib/lancement.js).
//
// État subscription :
//   - exister + pas de stripe_subscription_id  → boutons Upgrade visibles
//   - billing_exempt = true (partenaires test)  → message "Partenariat test"
//   - subscription_status = trialing/active     → renvoie vers Customer Portal (Phase 3b)
//   - subscription_status = past_due/canceled   → message + bouton réactiver
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { lireImpersonation, verifierImpersonation, effacerImpersonation, messageImpersonation } from '@/lib/impersonation'
import { useRouter, useSearchParams } from 'next/navigation'
import { PLAN_LABEL, prixTTC, TVA_ABONNEMENT_POURCENT } from '@/lib/plans'
import { euros } from '@/lib/montants'
import { estRegimeLancement, libelleDernierJourGratuit, ESSAI_JOURS_MINIMUM } from '@/lib/lancement'

const T = {
  ink:    '#1A0840',
  deep:   '#2D0F6B',
  main:   '#6B35C4',
  mid:    '#9660E0',
  light:  '#C4A0F4',
  pale:   '#EDE0FF',
  bg:     '#F8F6FF',
  muted:  '#6B7280',
}

const TARIF_COMMUNIQUER = parseFloat(process.env.NEXT_PUBLIC_TARIF_COMMUNIQUER || '19.90')
const TARIF_VENDRE      = parseFloat(process.env.NEXT_PUBLIC_TARIF_VENDRE      || '49.90')

// Offre de lancement : l'essai se termine au plus tard entre le 8 janvier 2027
// et 30 jours après l'inscription (voir lib/lancement.js). Le bandeau ci-dessous
// n'annonce donc AUCUNE date de son cru : il lit `subscription_trial_end`, le
// miroir de ce que Stripe prélèvera. Un texte qui devine sa date finit toujours
// par contredire la facture.
const DATE_LONGUE = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Brussels',
})

function libelleFinEssaiReelle(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return DATE_LONGUE.format(d).replace(/^1 /, '1er ')
}

// Ce que touche un commerçant qui souscrit MAINTENANT, sous la carte de
// formule. Pendant le régime de lancement on annonce la DATE, qui vaut mieux
// qu'une durée : elle se vérifie d'un coup d'œil sur un calendrier.
function phraseEssaiTarif(tarif) {
  const suite = `puis ${euros(tarif)}/mois sans engagement`
  return estRegimeLancement()
    ? `Offert jusqu'au ${libelleDernierJourGratuit()} inclus, ${suite}`
    : `${ESSAI_JOURS_MINIMUM} jours gratuits, ${suite}`
}

export default function AbonnementPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [commercant, setCommercant] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionPlan, setActionPlan] = useState(null)  // 'communiquer' | 'vendre' pendant l'appel API
  const [portalLoading, setPortalLoading] = useState(false)
  const [error, setError] = useState(null)
  const [checkoutResult, setCheckoutResult] = useState(null)

  // Chargement du commerçant lié au user connecté.
  // Réplique le pattern du dashboard principal (impersonation admin + multi-commerce + localStorage).
  useEffect(() => {
    let mounted = true
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const adminEmail = 'verstappenalexandre@gmail.com'
      const isAdmin = user.email === adminEmail

      // 1. « Voir Dashboard » depuis /admin, DANS CET ONGLET et confirmé par le
      // serveur (15/09) : la même règle que le tableau de bord, par les mêmes
      // fonctions.
      const imp = lireImpersonation()
      if (isAdmin && imp) {
        const verdict = await verifierImpersonation(supabase, imp)
        if (!verdict.ok) {
          effacerImpersonation()
          if (mounted) { setError(messageImpersonation(verdict.raison)); setLoading(false) }
          return
        }
        const { data: c } = await supabase.from('commercants').select('*').eq('id', imp.commercantId).maybeSingle()
        if (mounted && c) { setCommercant(c); setLoading(false); return }
      }

      // 2. Commerçant déjà sélectionné via le dashboard.
      // 🔴 PARMI LES SIENS SEULEMENT (15/09). « Voir Dashboard » écrivait aussi
      // cet identifiant, et « Quitter » ne l'effaçait pas : l'admin, que la base
      // laisse tout lire, rouvrait ici le dernier commerce visité, SANS BANDEAU.
      const savedId = typeof window !== 'undefined' ? localStorage.getItem('yoppaa_dashboard_commercant_id') : null
      if (savedId) {
        const { data: c } = await supabase.from('commercants').select('*').eq('id', savedId).eq('auth_user_id', user.id).maybeSingle()
        if (mounted && c) { setCommercant(c); setLoading(false); return }
      }

      // 3. Flow normal : lookup par auth_user_id
      const { data } = await supabase.from('commercants').select('*').eq('auth_user_id', user.id).order('nom')
      if (!mounted) return
      if (!data || data.length === 0) {
        if (isAdmin) {
          setError('Aucun commerçant sélectionné. Allez sur /admin et cliquez "Voir Dashboard" depuis un commerçant.')
        } else {
          setError('On n’a pas pu charger ta fiche commerçant.')
        }
        setLoading(false)
        return
      }

      setCommercant(data[0])
      if (data.length === 1) {
        localStorage.setItem('yoppaa_dashboard_commercant_id', data[0].id)
      }
      setLoading(false)
    }
    load()
    return () => { mounted = false }
  }, [router])

  // Détection retour Stripe Checkout (success ou canceled)
  useEffect(() => {
    const status = searchParams.get('stripe_checkout')
    if (status === 'success') {
      setCheckoutResult({ ok: true, message: 'Merci ! Ton abonnement est en cours d\'activation. Tu recevras un email de confirmation dans quelques instants.' })
    } else if (status === 'canceled') {
      setCheckoutResult({ ok: false, message: 'Souscription annulée. Tu peux la reprendre quand tu veux.' })
    }
  }, [searchParams])

  async function handleUpgrade(targetPlan) {
    if (!commercant?.id) return
    setActionPlan(targetPlan)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Session expirée, reconnecte-toi')

      const res = await fetch('/api/stripe/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ commercantId: commercant.id, targetPlan }),
      })
      const json = await res.json()
      if (!res.ok || !json?.url) {
        throw new Error(json?.error || 'Erreur lors de la création de la session de paiement')
      }
      window.location.href = json.url
    } catch (e) {
      setError(e?.message || 'Erreur inconnue')
      setActionPlan(null)
    }
  }

  async function handleOpenPortal() {
    if (!commercant?.id) return
    setPortalLoading(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Session expirée, reconnecte-toi')

      const res = await fetch('/api/stripe/billing/portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ commercantId: commercant.id, retour: 'abonnement' }),
      })
      const json = await res.json()
      if (!res.ok || !json?.url) {
        throw new Error(json?.error || 'Impossible d\'ouvrir le portail client')
      }
      window.location.href = json.url
    } catch (e) {
      setError(e?.message || 'Erreur inconnue')
      setPortalLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: T.bg, padding: '60px 20px', fontFamily: '"DM Sans", system-ui, sans-serif', textAlign: 'center' }}>
        <p style={{ color: T.muted }}>On charge ton abonnement…</p>
      </div>
    )
  }

  if (error || !commercant) {
    return (
      <div style={{ minHeight: '100vh', background: T.bg, padding: '60px 20px', fontFamily: '"DM Sans", system-ui, sans-serif', textAlign: 'center' }}>
        <p style={{ color: '#DC2626', fontWeight: 700 }}>{error || 'Fiche commerçant introuvable.'}</p>
      </div>
    )
  }

  const plan = commercant.plan || 'exister'
  const isExempt = commercant.billing_exempt === true
  const hasActiveSub = commercant.subscription_status && ['active', 'trialing', 'past_due'].includes(commercant.subscription_status)
  // ⚠️ « A ENCORE SES FONCTIONS » ET « EST À JOUR » SONT DEUX QUESTIONS. Un
  // commerçant en `past_due` garde son accès le temps des relances, et c'est
  // voulu : on ne coupe pas un commerce pour une carte expirée. Mais il n'est
  // pas à jour, et c'est ça qu'il vient lire ici.
  const enRetard = commercant.subscription_status === 'past_due'
  const resilie = commercant.subscription_status === 'canceled'
  const planLabel = PLAN_LABEL[plan] || plan

  return (
    <div style={{ minHeight: '100vh', background: T.bg, padding: '32px 20px 80px', fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif' }}>
      <div style={{ maxWidth: 880, margin: '0 auto' }}>

        {/* 🔴 LE RETOUR REPOSAIT LE COMMERÇANT À L'ENTRÉE DU TABLEAU DE BORD,
            pas sur l'onglet d'où il venait. On arrive ici par « Mon compte »,
            par un email de facturation ou par un retour de Stripe : dans les
            trois cas, c'est « Mon compte » qu'on veut retrouver. */}
        {/* Lien retour dashboard */}
        <a href="/dashboard?onglet=config&config=compte" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: T.main, textDecoration: 'none', fontWeight: 700, marginBottom: 18 }}>
          ← Retour au dashboard
        </a>

        {/* Titre */}
        <h1 style={{ fontSize: 32, fontWeight: 900, color: T.ink, letterSpacing: '-1px', margin: '0 0 6px' }}>
          Abonnement Yoppaa
        </h1>
        <p style={{ fontSize: 15, color: T.muted, margin: '0 0 28px' }}>
          Ta formule, tes paiements et tes factures.
        </p>

        {/* Bandeau résultat checkout (success ou canceled) */}
        {checkoutResult && (
          <div style={{
            background: checkoutResult.ok ? '#ECFDF5' : '#FEF3C7',
            border: `1px solid ${checkoutResult.ok ? '#10B98144' : '#F59E0B44'}`,
            borderRadius: 12, padding: '14px 18px', marginBottom: 24,
            color: checkoutResult.ok ? '#065F46' : '#92400E', fontSize: 14, fontWeight: 600,
          }}>
            {checkoutResult.message}
          </div>
        )}

        {/* Carte plan actuel */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '24px 28px', border: `1px solid ${T.pale}`, marginBottom: 24 }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: T.muted, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 6px' }}>Ta formule actuelle</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 28, fontWeight: 900, color: T.ink, letterSpacing: '-0.5px', margin: 0 }}>{planLabel}</h2>
            {isExempt && (
              <span style={{ fontSize: 11, fontWeight: 800, color: T.deep, background: T.pale, padding: '4px 10px', borderRadius: 100, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                Partenariat test
              </span>
            )}
            {/* 🔴 CE BADGE DISAIT « ABONNEMENT ACTIF », EN VERT, À UN COMMERÇANT
                EN RETARD DE PAIEMENT (corrigé le 22/09). `hasActiveSub` range
                `past_due` parmi les statuts actifs, ce qui est juste pour
                décider de l'accès, et faux pour décider d'un message. Son
                ternaire ne distinguait que `trialing`.

                🔴 ET C'EST L'ÉCRAN OÙ NOS PROPRES EMAILS L'ENVOIENT. Les deux
                relances d'échec de paiement pointent vers cette page : le
                commerçant lisait « ton paiement a échoué », cliquait, et
                trouvait un badge vert. Pendant ce temps l'onglet « Mon compte »
                affichait un bandeau rouge sur le même statut. */}
            {enRetard && (
              <span style={{ fontSize: 11, fontWeight: 800, color: '#B91C1C', background: '#FEF2F2', padding: '4px 10px', borderRadius: 100, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                Paiement en attente
              </span>
            )}
            {hasActiveSub && !enRetard && (
              <span style={{ fontSize: 11, fontWeight: 800, color: '#065F46', background: '#ECFDF5', padding: '4px 10px', borderRadius: 100, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                {commercant.subscription_status === 'trialing' ? 'Essai en cours' : 'Abonnement actif'}
              </span>
            )}
          </div>
          {isExempt && (
            <p style={{ fontSize: 13, color: T.muted, margin: '12px 0 0', lineHeight: 1.55 }}>
              Tu as un accès gratuit à Yoppaa au titre du partenariat de lancement. Aucune facturation en cours. Quand tu seras prêt à activer ta formule payante, écris-nous à <a href="mailto:hello@yoppaa.app" style={{ color: T.main, fontWeight: 700, textDecoration: 'none' }}>hello@yoppaa.app</a>.
            </p>
          )}
          {hasActiveSub && (
            <>
              {/* Essai en cours : dire LA date, pas une durée. Le commerçant se
                  demande « jusqu'à quand c'est gratuit, et combien après » :
                  les deux réponses sont ici, et la date vient de Stripe. */}
              {commercant.subscription_status === 'trialing' && libelleFinEssaiReelle(commercant.subscription_trial_end) && (
                <div style={{ background: T.pale, borderRadius: 10, padding: '14px 16px', marginTop: 14, marginBottom: 14, borderLeft: `3px solid ${T.main}` }}>
                  <p style={{ fontSize: 13, color: T.deep, margin: 0, lineHeight: 1.55, fontWeight: 600 }}>
                    C&rsquo;est offert jusqu&rsquo;au <strong>{libelleFinEssaiReelle(commercant.subscription_trial_end)}</strong>.
                    Ta première facture sera émise ce jour-là, et pas avant. 🟣
                  </p>
                  <p style={{ fontSize: 12.5, color: T.muted, margin: '6px 0 0', lineHeight: 1.5 }}>
                    Aucune carte n&rsquo;est demandée d&rsquo;ici là, et tu peux partir quand tu veux.
                  </p>
                </div>
              )}
              {/* 🔴 LE GESTE, PAS SEULEMENT LE CONSTAT. Un badge rouge qui ne dit
                  pas quoi faire laisse le commerçant chercher. Le bouton qui
                  suit ouvre exactement l'endroit où sa carte se met à jour. */}
              {enRetard && (
                <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 10, padding: '14px 16px', margin: '14px 0' }}>
                  <p style={{ fontSize: 13.5, fontWeight: 800, color: '#B91C1C', margin: '0 0 6px' }}>Ton dernier paiement n’est pas passé</p>
                  <p style={{ fontSize: 13, color: '#7F1D1D', margin: 0, lineHeight: 1.55 }}>
                    Ta fiche et tes clients ne bougent pas. Mets ton moyen de paiement à jour
                    ci-dessous pour garder les fonctions de ta formule.
                  </p>
                </div>
              )}
              <p style={{ fontSize: 13, color: T.muted, margin: '12px 0 16px', lineHeight: 1.55 }}>
                Ta carte, tes factures, ton changement de formule et ta résiliation se gèrent
                dans l&rsquo;espace sécurisé de Stripe, notre prestataire de paiement.
              </p>
              <button
                onClick={handleOpenPortal}
                disabled={portalLoading}
                style={{
                  padding: '11px 22px',
                  background: T.main,
                  color: '#fff',
                  border: 'none', borderRadius: 100,
                  cursor: portalLoading ? 'wait' : 'pointer',
                  fontWeight: 800, fontSize: 14, letterSpacing: '-0.2px',
                  opacity: portalLoading ? 0.6 : 1,
                }}
              >
                {portalLoading ? 'Redirection…' : 'Gérer mon abonnement'}
              </button>
            </>
          )}
        </div>

        {/* 🔴 CES CARTES DISPARAISSAIENT DÈS QU'ON ÉTAIT ABONNÉ (corrigé le
            22/09), et c'était le seul endroit du produit qui dit ce que
            CONTIENT chaque formule. Un commerçant en Communiquer ne pouvait
            donc plus lire ce que Vendre lui apporterait : pour monter en
            gamme, il fallait déjà savoir ce qu'on montait chercher.

            ⚠️ MAIS LE GESTE N'EST PAS LE MÊME DES DEUX CÔTÉS. Sans abonnement,
            on souscrit, donc Checkout. Avec un abonnement en cours, souscrire
            une seconde fois en créerait un DEUXIÈME : un changement de formule
            passe par le portail, qui sait faire le prorata. La carte de sa
            propre formule, elle, ne propose rien du tout. */}
        {!isExempt && (
          <>
            <h3 style={{ fontSize: 18, fontWeight: 900, color: T.deep, letterSpacing: '-0.3px', margin: '8px 0 14px' }}>
              {hasActiveSub ? 'Ce que contient chaque formule' : plan === 'exister' ? 'Passe au niveau supérieur' : 'Choisis ta formule'}
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>

              {/* 🔴 EXISTER MANQUAIT, ET C'EST LA FORMULE DE DÉPART DE TOUT LE
                  MONDE (Alex, 22/09 : « la formule exister est absente des
                  formules »). L'écran s'intitulait « Choisis ta formule » et
                  n'en montrait que deux, toutes les deux payantes. Celui qui
                  hésite ne lisait donc nulle part ce qu'il GARDE s'il ne prend
                  rien, et celui qui paie ne voyait pas ce qui lui reste s'il
                  arrête : deux peurs, le même trou.

                  ⚠️ LA LISTE EST CELLE DU SIGNUP, AU MOT PRÈS. Quatre listes de
                  forfaits divergeaient dans le dépôt le 22/09 ; celle-ci
                  descend de la matrice (`lib/plans.js`) par le même chemin que
                  celle de l'inscription, et `verif:plans` tient les deux
                  ensemble. Un commerçant ne doit pas lire deux promesses
                  différentes selon qu'il s'inscrit ou qu'il est déjà là. */}
              <PlanCard
                actuelle={plan === 'exister'}
                abonne={hasActiveSub}
                onPortail={handleOpenPortal}
                portailEnCours={portalLoading}
                gratuite={true}
                title="Exister"
                price={0}
                features={[
                  'Ta fiche : photos illimitées, horaires détaillés, tes prix',
                  'Référencée sur Google et retrouvée dans l’app',
                  // 🔴 UNE PAR SEMAINE, PAS UNE PAR JOUR. Le plafond vit dans le
                  // code depuis le 01/07 (décision d'Alex contre la
                  // cannibalisation de Communiquer) et deux écrans du produit
                  // l'annonçaient encore faux. Communiquer, lui, dit « chaque
                  // matin, en priorité » : c'est là qu'est la différence.
                  'Une actu par semaine, publiée dans le Good Morning de ta commune',
                  'Favoris et signaux : le quartier te dit ce qu’il cherche',
                  'Tes statistiques : vues, favoris, signaux',
                ]}
                trial="Aucune information de paiement demandée"
                accent={false}
              />

              {/* Carte Communiquer */}
              <PlanCard
                actuelle={plan === 'communiquer'}
                abonne={hasActiveSub}
                onPortail={handleOpenPortal}
                portailEnCours={portalLoading}
                title="Communiquer"
                price={TARIF_COMMUNIQUER}
                // 🔴 CETTE LISTE VENDAIT TROIS CHOSES QUI N'EXISTENT PAS (22/09,
                // audit des quatre listes de forfaits du dépôt).
                // `segmentation_favoris`, `newsletter_ciblee` et `ia_bridee`
                // valent `true` dans la matrice et ne sont lues par AUCUNE ligne
                // de code. Le glossaire du signup marque d'ailleurs la
                // newsletter « En construction » : deux écrans du même produit
                // se contredisaient.
                //
                // ⚠️ ET « AUX YOPPERS » ÉTAIT TROP LARGE : le code ne connaît que
                // `push_cibles_favoris` (lib/plans.js:170), donc ceux qui ont
                // mis le commerce en favori, pas toute la commune.
                features={[
                  'Actus illimitées, deals, Bonnes affaires',
                  'Alertes urgentes sur ta fiche : fermeture, rupture',
                  'Ta place chaque matin dans le Good Morning, en priorité',
                  'Push à tes favoris, autant que tu veux',
                  // 🔴 LA LIGNE QUI MANQUAIT ICI AUSSI : la carte au comptoir
                  // est acquise dès Communiquer (lib/plans.js:179).
                  'Carte de fidélité au comptoir : le GSM de ton client suffit',
                  'Tes statistiques détaillées : audience et engagement',
                  'Un assistant qui rédige tes textes',
                ]}
                cta="Démarrer mon essai gratuit"
                trial={phraseEssaiTarif(TARIF_COMMUNIQUER)}
                loading={actionPlan === 'communiquer'}
                onClick={() => handleUpgrade('communiquer')}
                accent={false}
              />

              {/* Carte Vendre */}
              <PlanCard
                actuelle={plan === 'vendre'}
                abonne={hasActiveSub}
                onPortail={handleOpenPortal}
                portailEnCours={portalLoading}
                title="Vendre"
                price={TARIF_VENDRE}
                // ⚠️ ICI LA CATÉGORIE N'EST PAS DEVINÉE, ELLE EST CONNUE : ce
                // commerçant est déjà inscrit. Les fonctions verrouillées par le
                // métier portent donc leur condition entre parenthèses, comme
                // « Avant la fermeture » le faisait déjà.
                features={[
                  'Tout Communiquer +',
                  'Commande à l’avance et livraison (alimentaire)',
                  'Rendez-vous en ligne et cartes de séances (services)',
                  'Vente en ligne : retrait en magasin ou envoi',
                  'Réservation de table (alimentaire)',
                  'Paiement en ligne ou au comptoir, sans commission Yoppaa',
                  // ⚠️ LE MOT DU COMMERÇANT, pas celui du Yopper. Il lira
                  // « Avant la fermeture » sur son onglet Deals ; « Rien ne se
                  // perd » est ce que ses clients verront. Les deux noms vivent
                  // dans `lib/anti-gaspi.js`.
                  'Avant la fermeture : tes invendus du soir à prix réduit (alimentaire)',
                  // 🔴 « Fidélité configurable » laissait croire que la carte
                  // arrivait avec Vendre. Elle arrive avec Communiquer ; ce que
                  // Vendre ajoute, c'est `fidelite_auto` (lib/plans.js:239).
                  'La fidélité se crédite toute seule à chaque vente',
                  'Bons cadeaux à offrir',
                  'Export comptable',
                ]}
                cta="Démarrer mon essai gratuit"
                trial={phraseEssaiTarif(TARIF_VENDRE)}
                loading={actionPlan === 'vendre'}
                onClick={() => handleUpgrade('vendre')}
                accent={true}
              />

            </div>

            {error && (
              <p style={{ color: '#DC2626', fontSize: 13, fontWeight: 700, marginTop: 16 }}>
                {error}
              </p>
            )}

            {/* 🔴 CETTE PHRASE PROMETTAIT UNE TVA QUE PERSONNE N'AJOUTAIT. Elle
                annonçait « la TVA applicable sera ajoutée selon votre pays et
                votre statut TVA », ce qui décrit Stripe Tax : or rien ne la
                calculait, et Stripe prélevait le montant nu. Elle dit
                maintenant le taux réellement appliqué, et ce taux vient de la
                même constante que les montants affichés au-dessus. */}
            <p style={{ fontSize: 12, color: T.muted, lineHeight: 1.5, margin: '24px 0 0' }}>
              Sans engagement, tu résilies quand tu veux. Les prix sont HTVA : la TVA belge de {TVA_ABONNEMENT_POURCENT} % s&rsquo;ajoute au moment du paiement. Ton numéro de TVA se saisit à la commande et figure sur chaque facture.
            </p>
          </>
        )}

      </div>
    </div>
  )
}

// ────────── Composant carte de plan ──────────
function PlanCard({ title, price, features, cta, trial, loading, onClick, accent, actuelle = false, abonne = false, onPortail = null, portailEnCours = false, gratuite = false }) {
  // 🔴 LE PIÈGE DU ZÉRO, NEUVIÈME FOIS, ET IL SE SERAIT VU À L'ÉCRAN.
  // `prixTTC` accepte le vrai 0 d'Exister, comme il le doit : la carte gratuite
  // aurait donc affiché « 0,00 € HTVA / mois » puis « soit 0,00 € TVA
  // comprise ». Ce n'est pas faux, c'est illisible : personne n'annonce une
  // TVA sur rien. Une formule gratuite ne se dit pas avec un montant.
  const ttc = gratuite ? null : prixTTC(price)
  return (
    <div style={{
      background: accent ? `linear-gradient(160deg, ${T.deep} 0%, ${T.main} 100%)` : '#fff',
      color: accent ? '#fff' : T.ink,
      borderRadius: 16, padding: '24px 26px',
      // ⚠️ La carte de sa propre formule se distingue sans changer de taille :
      // un liseré, pas une mise en avant, sinon elle volerait l'attention de
      // celle qu'il est venu comparer.
      outline: actuelle ? `2px solid ${accent ? '#fff' : T.main}` : 'none',
      outlineOffset: actuelle ? 2 : 0,
      border: accent ? 'none' : `1px solid ${T.pale}`,
      boxShadow: accent ? '0 12px 32px rgba(107,53,196,0.25)' : '0 2px 8px rgba(26,8,64,0.05)',
      display: 'flex', flexDirection: 'column', minHeight: 380,
    }}>
      <p style={{ fontSize: 11, fontWeight: 800, color: accent ? T.light : T.muted, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 6px' }}>Formule</p>
      <h3 style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.5px', margin: 0 }}>{title}</h3>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '14px 0 4px' }}>
        <p style={{ fontSize: 36, fontWeight: 900, letterSpacing: '-1px', margin: 0 }}>
          {gratuite ? 'Gratuit' : euros(price)}
        </p>
        <p style={{ fontSize: 13, color: accent ? T.light : T.muted, margin: 0 }}>{gratuite ? 'pour toujours' : 'HTVA / mois'}</p>
      </div>
      {/* ⚠️ LE MONTANT QUI SERA RÉELLEMENT DÉBITÉ, sous celui qui est annoncé.
          « HTVA » est du vocabulaire de comptable ; le chiffre est du
          vocabulaire de tout le monde. Un commerçant qui lit 19,90 € et qui
          voit 24,08 € sur son relevé se sent forcé, même quand la mention
          était écrite juste à côté. */}
      {ttc != null && (
        <p style={{ fontSize: 12.5, fontWeight: 600, color: accent ? T.light : T.muted, margin: '0 0 6px' }}>
          soit {euros(ttc)} TVA comprise
        </p>
      )}
      <p style={{ fontSize: 12, color: accent ? T.light : T.muted, margin: '0 0 18px' }}>{trial}</p>

      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 22px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        {features.map((f, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, lineHeight: 1.5 }}>
            <span style={{ color: accent ? '#fff' : T.main, flexShrink: 0, marginTop: 1 }}>✓</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>

      {/* ⚠️ TROIS ÉTATS, TROIS GESTES, ET AUCUN NE SE DEVINE DEPUIS LES DEUX
          AUTRES : c'est déjà ta formule (rien à proposer), tu es abonné à une
          autre (le portail, qui sait faire le prorata), tu n'as pas
          d'abonnement (Checkout). Proposer « souscrire » à un abonné lui
          créerait un SECOND abonnement. */}
      {actuelle ? (
        <div style={{
          padding: '12px 22px', textAlign: 'center', borderRadius: 100,
          border: `1px solid ${accent ? 'rgba(255,255,255,0.4)' : T.pale}`,
          color: accent ? '#fff' : T.muted, fontWeight: 800, fontSize: 14,
        }}>
          C&rsquo;est ta formule
        </div>
      ) : gratuite ? (
        // 🔴 SUR LA FORMULE GRATUITE, « CHANGER POUR CETTE FORMULE » AURAIT ÉTÉ
        // UN MENSONGE POLI : descendre à Exister, ce n'est pas changer de
        // formule, c'est RÉSILIER. Le bouton dit donc le geste, et rien
        // d'autre. Il ne crée aucun chemin nouveau : le portail est déjà
        // atteignable par « Gérer mon abonnement », et c'est lui qui annule.
        //
        // ⚠️ ET IL EST EN CONTOUR, PAS EN PLEIN. Dire la sortie est honnête,
        // la mettre en avant serait de l'inviter.
        abonne ? (
          <button
            onClick={onPortail}
            disabled={portailEnCours}
            style={{
              padding: '12px 22px',
              background: 'transparent',
              color: accent ? '#fff' : T.muted,
              border: `1px solid ${accent ? 'rgba(255,255,255,0.4)' : T.pale}`,
              borderRadius: 100, cursor: portailEnCours ? 'wait' : 'pointer',
              fontWeight: 800, fontSize: 14, letterSpacing: '-0.2px',
              opacity: portailEnCours ? 0.6 : 1,
            }}
          >
            {portailEnCours ? 'Redirection…' : 'Résilier mon abonnement'}
          </button>
        ) : (
          // ⚠️ SANS ABONNEMENT EN COURS, IL N'Y A AUCUN GESTE À PROPOSER : ni
          // souscrire à du gratuit, ni résilier ce qui n'existe pas. Ce qu'il
          // faut dire, c'est ce qu'il advient de sa fiche, et c'est aussi la
          // réponse à la peur qui fait choisir Exister par défaut.
          <div style={{
            padding: '12px 22px', textAlign: 'center', borderRadius: 100,
            border: `1px solid ${accent ? 'rgba(255,255,255,0.4)' : T.pale}`,
            color: accent ? '#fff' : T.muted, fontWeight: 700, fontSize: 13, lineHeight: 1.4,
          }}>
            Ta fiche reste en ligne, sans rien payer
          </div>
        )
      ) : (
        <button
          onClick={abonne ? onPortail : onClick}
          disabled={loading}
          style={{
            padding: '12px 22px',
            background: accent ? '#fff' : T.main,
            color: accent ? T.main : '#fff',
            border: 'none', borderRadius: 100, cursor: loading ? 'wait' : 'pointer',
            fontWeight: 800, fontSize: 14, letterSpacing: '-0.2px',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Redirection…' : abonne ? 'Changer pour cette formule' : cta}
        </button>
      )}
    </div>
  )
}
