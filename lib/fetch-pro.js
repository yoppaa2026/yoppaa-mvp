'use client'
// Appel d'une route API AU NOM DU COMMERÇANT, avec son jeton.
//
// ⚠️ POURQUOI. Jusqu'au 21/08, le tableau de bord appelait ces routes sans la
// moindre preuve d'identité, et les routes ne la demandaient pas. N'importe qui
// pouvait donc les appeler à la place du commerçant : faire partir un email à
// ses clients, ou pousser une notification à tous ses abonnés.
//
// Le pendant Yopper existe déjà (`lib/fetch-yopper.js`). Celui-ci est son
// équivalent côté professionnel, et il existe pour la même raison : une règle
// qui vit à un seul endroit ne peut pas être oubliée à onze endroits.
//
// ⚠️ ON N'AVALE PAS L'ABSENCE DE SESSION EN SILENCE. Sans jeton, la requête
// partirait en anonyme et la route répondrait 401 : l'appelant croirait que
// l'email est parti. On préfère le dire.

import { supabase } from './supabase'
import { reponseRefuse, motifDuRefus } from './verdict-reponse'

export async function postPro(url, corps) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    console.error('[postPro] aucune session, requête non envoyée', url)
    return { ok: false, status: 401, sansSession: true }
  }
  try {
    return await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(corps),
    })
  } catch (e) {
    console.error('[postPro] échec réseau', url, e?.message)
    return { ok: false, status: 0, erreurReseau: true }
  }
}

// ─── PRÉVENIR LE CLIENT, ET SAVOIR SI ÇA A MARCHÉ ───────────────────────────
//
// 🔴 « LE MAIL COLIS PRÊT N'ARRIVE PAS » (Alex, 27/08). Le vrai défaut n'est
// pas là : c'est que PERSONNE NE POUVAIT LE SAVOIR.
//
// ⚠️ `postPro` REND LA `Response`, IL NE LÈVE JAMAIS SUR UN CODE HTTP. C'est
// le comportement de `fetch`, et il est parfaitement normal. Mais les onze
// appels du tableau de bord s'écrivaient :
//
//     postPro('/api/emails/commande-prete', {...})
//       .catch(e => console.warn('email KO', e))
//
// Un `403` de la garde d'autorisation, un `404` sur une commande introuvable,
// un `500` chez Resend : AUCUN ne déclenche ce `.catch()`. La promesse est
// tenue, avec une réponse en erreur que personne ne lit. Le client n'est pas
// prévenu, le commerçant croit qu'il l'est, et il n'y a pas une ligne dans la
// console pour le contredire.
//
// ⚠️ CE N'EST PAS PROPRE À L'EXPÉDITION : « prête », « expédiée », « annulée »,
// les pushs, le crédit de fidélité passent tous par ce motif. C'est la famille
// entière qui était muette, et c'est pour ça qu'on ne l'avait jamais vue.
//
// Cette fonction lit la réponse. Elle ne lève pas : prévenir un client ne doit
// jamais empêcher le commerçant de travailler, sa commande est déjà à jour.
export async function prevenirClient(url, corps, quoi = 'ton client') {
  const res = await postPro(url, corps)

  // Le repli de `postPro` quand il n'a pas pu partir (pas de session, réseau) :
  // ce n'est pas une `Response`, il porte déjà son verdict.
  if (typeof res?.json !== 'function') {
    const erreur = res?.sansSession ? 'session expirée' : 'connexion perdue'
    console.error('[prevenirClient] non parti', url, erreur)
    return { ok: false, statut: res?.status || 0, erreur, quoi }
  }

  // 🔴 LE 200 QUI DIT NON (trouvé le 17/09, sur la fidélité). Ce `if (res.ok)`
  // suffisait, et il laissait passer le cas le plus courant de nos routes :
  //
  //     return NextResponse.json(res)   // res = { ok: false, reason: '…' }
  //
  // `/api/fidelite/crediter` répond ainsi. Le code HTTP vaut 200, `res.ok` est
  // vrai, et cette fonction — écrite EXPRÈS pour ne plus rien laisser passer —
  // annonçait un succès sur un refus. Lire le code sans lire le corps, c'est
  // croire quelqu'un sur son ton de voix.
  //
  // ⚠️ ON LIT TOUJOURS LE CORPS, y compris sur un 200. C'est lui qui porte le
  // verdict de nos routes et la raison d'un refus, et une raison vaut dix codes :
  // « forfait insuffisant » et « commande introuvable » sont tous les deux des
  // 4xx et n'appellent pas le même geste.
  // ⚠️ IL S'APPELLE `corpsRecu`, ET SÛREMENT PAS `corps` : le paramètre de cette
  // fonction porte déjà ce nom-là, et c'est le corps ENVOYÉ. Deux choses
  // opposées sous le même mot, c'est une erreur de syntaxe le jour où elles se
  // croisent, et une confusion de lecture tous les autres jours.
  let corpsRecu = null
  try { corpsRecu = await res.json() } catch (e) { /* vide ou non JSON : le code suffira */ }

  // ⚠️ LA RÈGLE VIT DANS `lib/verdict-reponse.js`, PAS ICI. Ce fichier porte
  // `'use client'` et importe Supabase : aucun banc ne peut l'exécuter, et une
  // règle qu'on ne peut pas exécuter finit testée en double, par une copie qui
  // ne rougit jamais. C'est arrivé le 17/09, une mutation l'a démasqué.
  if (!reponseRefuse(res.ok, corpsRecu)) return { ok: true, statut: res.status, quoi }

  const raison = motifDuRefus(corpsRecu)
  console.error('[prevenirClient] refusé', url, res.status, raison)
  return { ok: false, statut: res.status, erreur: raison || `erreur ${res.status}`, quoi }
}
