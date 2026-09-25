'use client'
// Widget Cloudflare Turnstile réutilisable (invisible) pour les formulaires d'auth.
//
// Usage :
//   const turnstileRef = useRef(null)
//   ...
//   const captchaToken = await turnstileRef.current?.getToken()
//   await supabase.auth.signInWithPassword({ email, password, options: { captchaToken } })
//   ...
//   <TurnstileWidget ref={turnstileRef} />
//
// - getToken() renvoie un token FRAIS à chaque appel (le token Turnstile est
//   single-use : Supabase le consomme à la vérification). En interne on consomme
//   le token courant puis on reset() le widget pour régénérer le suivant. Pour un
//   double appel (signUp + auto-login), appeler getToken() deux fois suffit.
// - Si NEXT_PUBLIC_TURNSTILE_SITE_KEY est absente, getToken() renvoie null.
//   ⚠️ CE FICHIER A LONGTEMPS DIT QUE « RIEN NE CASSE EN DEV », PARCE QUE LE
//   CAPTCHA SUPABASE ÉTAIT DÉSACTIVÉ. CE N'EST PLUS VRAI. Sondé le 12/09 :
//   Supabase EXIGE le captcha et refuse une connexion en 400 avant même de
//   comparer le mot de passe. Un jeton absent n'est donc plus ignoré, il est
//   refusé : sans la clé de site dans `.env.local`, on ne se connecte pas en
//   local. C'est une bonne nouvelle pour la production, et un piège pour qui
//   lirait l'ancienne phrase.
// - Le mode (invisible / managed) est déterminé par la config de la site key côté
//   Cloudflare (la même que la landing = invisible). On ne force pas la taille ici.

import Script from 'next/script'
import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react'

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

// ═══════════════════════════════════════════════════════════════════════════
// 🔴 LE DÉFAUT DU 25/09 : UNE ERREUR TURNSTILE MURAIT LE FORMULAIRE
//
// Alex : « j'ai occasionnellement des problèmes de login avec le message
// anti-bot. Ça arrive de temps en temps, aujourd'hui jamais, hier en démo
// plusieurs fois, c'est aléatoire. »
//
// `error-callback` effaçait le jeton et ne relançait RIEN. Or Cloudflare est
// explicite : c'est à l'intégrateur d'appeler `turnstile.reset()` pour
// permettre un nouvel essai. Sans ça, après la moindre erreur — réseau
// instable, challenge expiré, évaluation durcie — le widget restait mort
// JUSQU'AU RECHARGEMENT DE LA PAGE, et tous les essais suivants échouaient.
//
// ⚠️ CE QUI EXPLIQUE LES DEUX MOITIÉS DU SYMPTÔME. L'aléatoire vient de
// l'erreur initiale, qui dépend du réseau et de ce que Cloudflare pense du
// visiteur — une salle de démo, un partage de connexion, des rechargements
// répétés du même formulaire durcissent son évaluation. Le « plusieurs fois »
// vient de l'impasse : une fois dedans, on n'en sort plus sans recharger.
//
// ⚠️ ET LE MESSAGE DISAIT VRAI SANS AIDER : « recharge la page et recommence »
// décrivait une impasse que nous avions fabriquée.
//
// ❌ CE QUI A ÉTÉ ÉCARTÉ : l'expiration au bout de 5 minutes. C'était ma
// première hypothèse, et elle est fausse : `refresh-expired` vaut `auto` par
// défaut, donc Turnstile régénère tout seul DANS CE CAS-LÀ. Il ne le fait pas
// après une erreur.
//
// 🔴 ET CE CORRECTIF EST ADDITIF, EXPRÈS (décision d'Alex, revue Play en
// cours). Quand un jeton existe, le code passe exactement par où il passait.
// On n'a AJOUTÉ qu'une chance de récupération là où il n'y en avait aucune :
// aucune connexion qui fonctionne aujourd'hui ne peut cesser de fonctionner.
// Le blocage côté client — refuser d'appeler Supabase sans jeton — a été
// écarté pour cette raison : il aurait supposé qu'un jeton absent est toujours
// une erreur, et aurait pu refuser une connexion valide.
// ═══════════════════════════════════════════════════════════════════════════

// Au-delà, on cesse de relancer : un widget qui échoue en boucle appellerait
// Cloudflare sans fin, et c'est le genre de boucle qui se remarque de leur côté.
const RELANCES_MAX = 3

const TurnstileWidget = forwardRef(function TurnstileWidget(_props, ref) {
  const containerRef = useRef(null)
  const widgetIdRef = useRef(null)
  const tokenRef = useRef(null)
  const waitersRef = useRef([])
  const relancesRef = useRef(0)

  // Relance un challenge, sans jamais lever : un widget qu'on ne peut pas
  // réveiller ne doit pas, en plus, casser la page autour de lui.
  const relancerChallenge = useCallback(() => {
    if (widgetIdRef.current == null) return false
    if (relancesRef.current >= RELANCES_MAX) return false
    relancesRef.current += 1
    try { window.turnstile.reset(widgetIdRef.current); return true } catch { return false }
  }, [])

  // Rend le widget une seule fois, quand le script Turnstile est chargé.
  const ensureRendered = useCallback(() => {
    if (widgetIdRef.current != null) return
    if (typeof window === 'undefined' || !window.turnstile || !containerRef.current || !SITE_KEY) return
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: SITE_KEY,
      callback: (token) => {
        tokenRef.current = token
        // ⚠️ LE COMPTEUR MESURE DES ÉCHECS CONSÉCUTIFS, pas un total. Sans
        // cette remise à zéro, trois erreurs éparpillées sur une longue session
        // condamneraient le formulaire pour le reste de la visite, alors que
        // le challenge venait justement de réussir.
        relancesRef.current = 0
        waitersRef.current.forEach((resolve) => resolve(token))
        waitersRef.current = []
      },
      // 🔴 ON RELANCE, ET ON DIT POURQUOI ÇA A RATÉ. Sans le `reset`, le
      // formulaire restait muré ; sans la trace, on en était réduit à déduire
      // la cause, faute du moindre code d'erreur nulle part.
      'error-callback': (code) => {
        console.error('[Turnstile] challenge en échec', code)
        tokenRef.current = null
        // ⚠️ LES ATTENTES EN COURS SONT LIBÉRÉES TOUT DE SUITE : les faire
        // patienter jusqu'au garde-fou de 8 s ferait croire à une lenteur là
        // où il y a un refus.
        waitersRef.current.forEach((resolve) => resolve(null))
        waitersRef.current = []
        relancerChallenge()
      },
      // ⚠️ L'EXPIRATION, ELLE, EST DÉJÀ COUVERTE : `refresh-expired` vaut
      // `auto` par défaut chez Cloudflare, et le widget régénère seul. On
      // efface le jeton périmé, sans relancer par-dessus lui.
      'expired-callback': () => { tokenRef.current = null },
    })
  }, [relancerChallenge])

  useImperativeHandle(ref, () => ({
    async getToken() {
      if (!SITE_KEY) return null
      ensureRendered()
      if (widgetIdRef.current == null) return null

      // Token déjà prêt : on le consomme et on relance un challenge pour le suivant.
      if (tokenRef.current) {
        const token = tokenRef.current
        tokenRef.current = null
        try { window.turnstile.reset(widgetIdRef.current) } catch { /* noop */ }
        return token
      }

      // Pas encore de token (challenge en cours) : on attend le prochain callback,
      // avec un garde-fou de 8s pour ne jamais bloquer la soumission indéfiniment.
      const attendre = (ms) => new Promise((resolve) => {
        let done = false
        const settle = (v) => { if (!done) { done = true; resolve(v) } }
        waitersRef.current.push(settle)
        setTimeout(() => settle(tokenRef.current || null), ms)
      })

      const premier = await attendre(8000)
      if (premier) {
        tokenRef.current = null
        try { window.turnstile.reset(widgetIdRef.current) } catch { /* noop */ }
        return premier
      }

      // 🔴 LA SECONDE CHANCE, ET C'EST TOUT LE CORRECTIF DU 25/09. Sans elle,
      // on rendait `null` et le formulaire restait muré : aucun challenge
      // n'était relancé, donc l'essai suivant échouait exactement pareil, et
      // celui d'après aussi. Un commerçant en démo enchaînait les refus sans
      // rien pouvoir faire d'autre que recharger la page.
      //
      // ⚠️ ELLE N'ENLÈVE RIEN AU CAS NOMINAL : on n'arrive ici qu'après avoir
      // déjà échoué. Au pire elle rend `null` comme avant, avec huit secondes
      // de plus ; au mieux elle sauve la connexion.
      if (!relancerChallenge()) return null
      const second = await attendre(8000)
      if (!second) return null
      tokenRef.current = null
      try { window.turnstile.reset(widgetIdRef.current) } catch { /* noop */ }
      return second
    },

    // ⚠️ POUR QUE L'ÉCRAN PUISSE LE DIRE. Un formulaire qui ne sait pas si le
    // jeton manque parce qu'il n'y a pas de clé ou parce que le challenge a
    // échoué ne peut écrire qu'un message vague.
    aEchoue() { return relancesRef.current > 0 },
  }), [ensureRendered, relancerChallenge])

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
        onLoad={ensureRendered}
      />
      <div ref={containerRef} />
    </>
  )
})

export default TurnstileWidget
