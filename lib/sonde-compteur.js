// Le compteur de requêtes compte-t-il encore ?
//
// 🔴 LE PROBLÈME EST LE SILENCE, PAS LA PANNE. `lib/ratelimit.js` est fail-open
// par choix : si Upstash n'est pas configuré ou ne répond pas, on laisse passer
// plutôt que de bloquer l'application pour un souci d'infrastructure. C'est le
// bon arbitrage. Mais il a une conséquence que personne ne voit venir : le jour
// où la base tombe (jeton régénéré, base supprimée, quota dépassé), TOUT
// CONTINUE DE MARCHER, simplement plus personne n'est limité. Aucune erreur,
// aucun écran cassé, aucune alerte. On l'apprendrait en lisant une facture ou
// en constatant qu'un code de bon cadeau a été trouvé par force brute.
//
// D'où cette sonde : une fois par jour, on tire onze fois d'affilée sur une clé
// qui n'appartient à personne. Un humain ne peut pas le faire à la main dans la
// fenêtre d'une minute ; si le onzième passe encore, le compteur ne compte pas.
//
// ⚠️ ELLE N'ÉCRIT QUE QUAND ÇA VA MAL. Une alarme qui sonne tous les jours
// finit par ne plus être lue, et c'est exactement ce qu'on veut éviter : voir
// [[reference-tests-faussement-verts]], « une alarme qui sonne tout le temps ne
// protège plus rien ». Tant que le compteur compte, personne ne reçoit rien.
//
// ⚠️ LA RÈGLE VIT ICI, PAS DANS LE CRON. `verdictCompteur` est pure : elle
// décide à partir d'un constat, sans réseau, donc le banc l'exécute pour de
// vrai. `sonderCompteur` ne fait que produire ce constat.
//
// La même mécanique sert déjà à `/api/admin/diagnostic-ratelimit`, qui répond à
// la demande. Ici, c'est la question posée d'office, tous les matins.

import { checkLimit } from './ratelimit'

// Le limiteur des bons cadeaux autorise 10 essais par minute : on tire une fois
// de plus. Ces deux nombres DOIVENT rester cohérents avec `bonsLimiter`.
export const SONDE_PLAFOND = 10
export const SONDE_TIRAGES = SONDE_PLAFOND + 1

// Exécute les tirages et rend un CONSTAT brut, sans jugement.
//
// La clé est horodatée, tirée au hasard et préfixée : elle ne touche jamais le
// compteur d'un vrai visiteur, et deux sondes ne se gênent pas entre elles.
export async function sonderCompteur(limiteur, { maintenant = Date.now() } = {}) {
  const cle = `sonde-${maintenant}-${Math.random().toString(36).slice(2, 8)}`
  const essais = []
  const depart = Date.now()

  for (let i = 0; i < SONDE_TIRAGES; i++) {
    let r
    try {
      r = await checkLimit(limiteur, cle, { cle: 'sonde', max: SONDE_PLAFOND, fenetreMs: 60_000 })
    } catch (e) {
      // Une sonde qui jette ne doit pas empêcher le reste de la tâche de
      // tourner. On note l'incident et on le traite comme un essai autorisé,
      // c'est-à-dire du côté prudent : on préfère alerter pour rien qu'ignorer.
      r = { success: true, erreur: e?.message || String(e) }
    }
    essais.push({
      n: i + 1,
      autorise: !!r?.success,
      repliLocal: !!r?.local,
      ignore: !!r?.skipped,
      erreur: r?.erreur || null,
    })
  }

  const dernier = essais[essais.length - 1]
  return {
    compte: !dernier?.autorise,
    viaRepliLocal: essais.some(e => e.repliLocal),
    tirages: essais.length,
    dureeMs: Date.now() - depart,
    erreur: essais.find(e => e.erreur)?.erreur || null,
    // Le détail sert à l'écran d'administration, qui montre les onze essais.
    // ⚠️ Il vient d'ICI et pas d'une seconde boucle écrite là-bas : deux copies
    // de la même règle finissent toujours par ne plus dire la même chose.
    essais,
  }
}

// LA RÈGLE. Pure, donc éprouvée au banc.
//
// Deux pannes distinctes, et il faut les distinguer : « plus aucune limite »
// n'appelle pas le même geste que « le compteur partagé est muet, le filet
// local prend le relais ». Le second protège encore un peu (chaque instance
// compte pour elle), le premier ne protège plus du tout.
export function verdictCompteur(constat) {
  if (!constat) {
    return {
      alerte: true,
      cause: 'sonde_impossible',
      titre: 'La sonde du compteur de requêtes n’a rien pu mesurer.',
      detail: 'Aucun constat n’est remonté. Le compteur est peut-être hors service, et personne ne le saurait.',
    }
  }
  if (!constat.compte) {
    return {
      alerte: true,
      cause: 'aucune_limite',
      titre: 'Plus aucune limite de requêtes n’est appliquée.',
      detail:
        `Le ${SONDE_TIRAGES}e essai d’affilée est passé, alors que la limite est de ${SONDE_PLAFOND} par minute. ` +
        'Ni Upstash ni le filet local ne bloquent : les codes de bons cadeaux sont ouverts à la force brute, ' +
        'et l’API n’a plus de borne. Vérifie la base Upstash et les variables sur Vercel.',
    }
  }
  if (constat.viaRepliLocal) {
    return {
      alerte: true,
      cause: 'partage_muet',
      titre: 'Le compteur partagé ne répond plus.',
      detail:
        'C’est le filet local qui bloque, et il ne vaut que pour une instance à la fois : chaque serveur compte ' +
        'dans son coin, donc la limite réelle est bien plus haute qu’annoncée. Cause habituelle : jeton régénéré, ' +
        'base supprimée, ou quota dépassé chez Upstash.',
    }
  }
  return {
    alerte: false,
    cause: 'ok',
    titre: `Le compteur partagé bloque bien au ${SONDE_TIRAGES}e essai.`,
    detail: 'Rien à faire.',
  }
}

// Le geste complet : sonder, juger, et n'écrire QUE s'il y a lieu.
//
// ⚠️ L'ENVOI EST INJECTÉ, et ce n'est pas de la coquetterie : c'est ce qui
// permet au banc d'exécuter cette fonction pour de vrai, de vérifier qu'aucun
// email ne part quand tout va bien, et qu'un email part quand le compteur se
// tait. Une garde qu'on ne peut pas exécuter ne se mesure pas.
//
// ⚠️ ELLE N'ÉCHOUE JAMAIS VERS L'APPELANT. Une sonde qui ferait tomber la tâche
// qui l'héberge coûterait plus cher que ce qu'elle surveille : le récapitulatif
// du matin ne doit pas dépendre de la santé d'un compteur.
export async function surveillerCompteur({ limiteur, envoyerAuAdmin }) {
  try {
    const constat = await sonderCompteur(limiteur)
    const verdict = verdictCompteur(constat)

    if (!verdict.alerte) return { alerte: false, cause: verdict.cause, email: false }

    console.error('[sonde-compteur]', verdict.cause, verdict.titre)
    const envoi = await envoyerAuAdmin({
      subject: sujetCompteurMuet(verdict),
      html: emailCompteurMuet(verdict, constat),
    })
    return { alerte: true, cause: verdict.cause, email: envoi?.ok !== false }
  } catch (e) {
    console.error('[sonde-compteur] exception', e?.message || String(e))
    return { alerte: null, cause: 'exception', email: false, erreur: e?.message || String(e) }
  }
}

export function sujetCompteurMuet(verdict) {
  return `⚠️ Yoppaa : ${verdict?.cause === 'aucune_limite' ? 'plus aucune limite de requêtes' : 'le compteur de requêtes est muet'}`
}

// Gabarit sobre et volontairement court : c'est une alerte technique, elle doit
// se lire en trois secondes sur un téléphone. ⚠️ Fond en couleur PLEINE, jamais
// un dégradé : Gmail Android les jette (voir reference_email_fond_degrade).
export function emailCompteurMuet(verdict, constat) {
  const C = { fond: '#F8F6FF', encre: '#1A0840', alerte: '#B91C1C', gris: '#6B7280' }
  return `<div style="background-color:${C.fond};padding:24px;font-family:'DM Sans',Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background-color:#FFFFFF;border-radius:16px;padding:24px;border:1px solid #EDE0FF;">
    <p style="margin:0 0 4px;color:${C.alerte};font-size:12px;font-weight:800;letter-spacing:1px;text-transform:uppercase;">Alerte technique</p>
    <h1 style="margin:0 0 12px;color:${C.encre};font-size:18px;font-weight:800;line-height:1.3;">${verdict.titre}</h1>
    <p style="margin:0 0 16px;color:${C.encre};font-size:14px;line-height:1.6;">${verdict.detail}</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 16px;">
      <tr><td style="padding:6px 0;color:${C.gris};font-size:13px;">Essais effectués</td><td style="padding:6px 0;color:${C.encre};font-size:13px;font-weight:700;text-align:right;">${constat?.tirages ?? '?'}</td></tr>
      <tr><td style="padding:6px 0;color:${C.gris};font-size:13px;">Durée</td><td style="padding:6px 0;color:${C.encre};font-size:13px;font-weight:700;text-align:right;">${constat?.dureeMs ?? '?'} ms</td></tr>
      <tr><td style="padding:6px 0;color:${C.gris};font-size:13px;">Filet local sollicité</td><td style="padding:6px 0;color:${C.encre};font-size:13px;font-weight:700;text-align:right;">${constat?.viaRepliLocal ? 'oui' : 'non'}</td></tr>
    </table>
    <p style="margin:0;color:${C.gris};font-size:12px;line-height:1.5;">
      Ce message ne part QUE lorsque le compteur ne compte plus. Tant que tout va bien, tu ne reçois rien.
      Pour un diagnostic complet, ouvre la console d’administration, section « Diagnostic rate limit ».
    </p>
  </div>
</div>`
}
