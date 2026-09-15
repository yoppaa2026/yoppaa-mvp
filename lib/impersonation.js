// « VOIR DASHBOARD » : L'ADMIN DANS LE TABLEAU DE BORD D'UN COMMERÇANT.
// OÙ ÇA VIT, COMBIEN DE TEMPS, ET CE QUI Y MET FIN.
//
// 🔴 LE DÉFAUT QUE CE FICHIER CORRIGE (15/09 tard, trouvé par Alex sur son PC).
// Revenu sur l'onglet où il testait La Table d'Essai avec le compte du
// restaurant, il est tombé sur Ciseaux et Soins, en MODE ADMIN. Ce n'était pas
// une fuite : le mode admin exige que le serveur confirme l'adresse de l'admin.
// Deux choses s'étaient additionnées :
//   • LA SESSION EST COMMUNE À TOUT LE NAVIGATEUR : en se connectant côté
//     Yopper dans un autre onglet, avec son adresse, qui est aussi celle de
//     l'admin, Alex avait changé le compte de l'onglet du tableau de bord ;
//   • le commerce choisi par « Voir Dashboard » vivait dans le localStorage,
//     COMMUN À TOUS LES ONGLETS et ÉTERNEL : ni la déconnexion du tableau de
//     bord ni celle de l'admin ne l'effaçaient, seul « Quitter ». Un « Voir
//     Dashboard » vieux de plusieurs jours reprenait donc en silence, et sa
//     ligne du journal restait ouverte.
// Or l'admin passe TOUTES les gardes, débit d'une empreinte compris. Un onglet
// qui change de commerce sans prévenir, c'est le client d'un autre commerce
// qu'on peut débiter.
//
// ⚠️ LA RÈGLE, DEPUIS : ça vit dans l'ONGLET (sessionStorage), le SERVEUR
// confirme à chaque chargement que la ligne du journal est ouverte, au nom de
// l'admin, pour ce commerce, et depuis moins de deux heures ; toute sortie la
// ferme ; et un tableau de bord dont le compte change ailleurs s'arrête.

// ✅ DÉCISION D'ALEX, 15/09 : deux heures. Assez pour une séance de support ; au
// delà, un clic sur « Voir Dashboard » la rouvre, et le journal reste exact.
export const DUREE_IMPERSONATION_MS = 2 * 60 * 60 * 1000

// ⚠️ LES NOMS N'ONT PAS CHANGÉ : ce sont aussi ceux des anciennes clés du
// localStorage, qu'il faut reconnaître pour les purger.
const CLE_COMMERCE = 'yoppaa_admin_impersonating'
const CLE_JOURNAL = 'yoppaa_admin_impersonation_session_id'

// Une horloge de base peut avancer d'un rien sur celle du serveur : une ligne
// « commencée dans trente secondes » n'est pas suspecte, une ligne commencée
// demain l'est.
const TOLERANCE_HORLOGE_MS = 60 * 1000

/**
 * Pourquoi cette ligne du journal n'autorise PAS, ou plus, l'admin à agir en
 * tant que ce commerce. `null` : elle autorise.
 * ⚠️ FONCTION PURE : la route l'exécute, le banc aussi.
 */
export function raisonImpersonationRefusee(ligne, { adminEmail, commercantId, maintenant = new Date() } = {}) {
  if (!ligne) return 'introuvable'
  if (ligne.ended_at) return 'terminee'
  const admin = String(adminEmail || '').trim().toLowerCase()
  if (!admin || String(ligne.admin_email || '').trim().toLowerCase() !== admin) return 'autre_admin'
  if (!commercantId || String(ligne.commercant_id) !== String(commercantId)) return 'autre_commerce'
  const debut = ligne.started_at ? new Date(ligne.started_at) : null
  if (!debut || Number.isNaN(debut.getTime())) return 'date_illisible'
  const ecoule = maintenant.getTime() - debut.getTime()
  if (ecoule < -TOLERANCE_HORLOGE_MS) return 'date_illisible'
  // ⚠️ `>=` : à deux heures pile, c'est fini.
  if (ecoule >= DUREE_IMPERSONATION_MS) return 'expiree'
  return null
}

/** Le moment où la ligne cesse d'autoriser. `null` sur une date illisible. */
export function finImpersonation(ligne) {
  const debut = ligne?.started_at ? new Date(ligne.started_at) : null
  if (!debut || Number.isNaN(debut.getTime())) return null
  return new Date(debut.getTime() + DUREE_IMPERSONATION_MS)
}

/** Une ligne restée ouverte a-t-elle dépassé sa durée ? Une date illisible : oui. */
export function ligneExpiree(ligne, maintenant = new Date()) {
  const fin = finImpersonation(ligne)
  return !fin || fin <= maintenant
}

/**
 * La fin à INSCRIRE au journal pour une ligne restée ouverte : le moment réel
 * si elle est encore dans sa durée, sinon la fin de sa durée.
 * 🔴 Écrire « maintenant » sur une ligne de trois jours ferait croire à trois
 * jours d'accès.
 */
export function finAInscrire(ligne, maintenant = new Date()) {
  const fin = finImpersonation(ligne)
  if (!fin) return maintenant
  return fin < maintenant ? fin : maintenant
}

const MESSAGES = {
  expiree: 'Ta connexion en tant que commerçant a pris fin après deux heures. Clique « Voir Dashboard » pour la rouvrir.',
  terminee: 'Cette connexion en tant que commerçant était déjà fermée. Clique « Voir Dashboard » pour en ouvrir une nouvelle.',
  introuvable: 'Ce commerce n’a pas pu être ouvert. Clique « Voir Dashboard » pour réessayer.',
  reseau: 'La connexion en tant que commerçant n’a pas pu être confirmée, faute de réseau. Clique « Voir Dashboard » pour réessayer.',
}

/** Ce que /admin dit quand le tableau de bord y renvoie. */
export function messageImpersonation(raison) {
  return MESSAGES[raison] || 'La connexion en tant que commerçant n’a pas pu être confirmée. Clique « Voir Dashboard » pour la rouvrir.'
}

/**
 * Le compte de cet onglet a-t-il changé depuis son chargement ? La session est
 * commune à tous les onglets de yoppaa.app : se connecter ailleurs la change ici.
 * Une déconnexion ailleurs (`idActuel` absent) compte comme un changement.
 */
export function compteAChange(idAuChargement, idActuel) {
  if (!idAuChargement) return false
  return String(idAuChargement) !== String(idActuel || '')
}

// ─── LE STOCKAGE : L'ONGLET, JAMAIS LE NAVIGATEUR ────────────────────────────
//
// ⚠️ LES STOCKAGES SE PASSENT EN PARAMÈTRE, avec ceux du navigateur par défaut :
// le banc exécute les vraies fonctions sur de faux stockages, sans toucher aux
// variables globales de Node.

function stockagesParDefaut() {
  let onglet = null
  let navigateur = null
  try { onglet = typeof sessionStorage !== 'undefined' ? sessionStorage : null } catch { onglet = null }
  try { navigateur = typeof localStorage !== 'undefined' ? localStorage : null } catch { navigateur = null }
  return { onglet, navigateur }
}

// 🔴 LES ANCIENNES CLÉS DU NAVIGATEUR SE PURGENT À CHAQUE PASSAGE : un
// « Voir Dashboard » posé avant ce correctif ne doit plus rien rouvrir. Le
// navigateur n'est plus qu'une source à vider, jamais un endroit où écrire.
function purgerAncienStockage(navigateur) {
  if (!navigateur) return
  try {
    navigateur.removeItem(CLE_COMMERCE)
    navigateur.removeItem(CLE_JOURNAL)
  } catch { /* stockage inaccessible : il n'y a rien à purger */ }
}

/** Range « Voir Dashboard » dans l'onglet. `false` si rien n'a pu être rangé. */
export function poserImpersonation(commercantId, impersonationId, { onglet, navigateur } = stockagesParDefaut()) {
  purgerAncienStockage(navigateur)
  if (!onglet || !commercantId || !impersonationId) return false
  try {
    onglet.setItem(CLE_COMMERCE, String(commercantId))
    onglet.setItem(CLE_JOURNAL, String(impersonationId))
    return true
  } catch {
    return false
  }
}

/** Le « Voir Dashboard » de CET onglet, ou `null`. */
export function lireImpersonation({ onglet, navigateur } = stockagesParDefaut()) {
  purgerAncienStockage(navigateur)
  if (!onglet) return null
  try {
    const commercantId = onglet.getItem(CLE_COMMERCE)
    const impersonationId = onglet.getItem(CLE_JOURNAL)
    return commercantId && impersonationId ? { commercantId, impersonationId } : null
  } catch {
    return null
  }
}

export function effacerImpersonation({ onglet, navigateur } = stockagesParDefaut()) {
  purgerAncienStockage(navigateur)
  if (!onglet) return
  try {
    onglet.removeItem(CLE_COMMERCE)
    onglet.removeItem(CLE_JOURNAL)
  } catch { /* rien à effacer */ }
}

// ─── LE SERVEUR ──────────────────────────────────────────────────────────────

/**
 * Demande au serveur si l'onglet peut encore agir en tant que ce commerce.
 * ⚠️ AU MOINDRE DOUTE, NON : un réseau coupé ne rouvre pas un accès à tout.
 */
export async function verifierImpersonation(supabase, imp) {
  if (!imp?.commercantId || !imp?.impersonationId) return { ok: false, raison: 'introuvable' }
  try {
    const { data: { session } = {} } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/impersonate-verifier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
      body: JSON.stringify({ impersonation_id: imp.impersonationId, commercant_id: imp.commercantId }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok || !j.ok || !j.expire_at) return { ok: false, raison: j.raison || `http_${res.status}` }
    return { ok: true, expireAt: j.expire_at }
  } catch {
    return { ok: false, raison: 'reseau' }
  }
}

/**
 * Ferme au journal la ligne de cet onglet, ou TOUTES celles de l'admin
 * (`toutes`, à la déconnexion : on ne sait pas quel onglet en portait une).
 * Rend `true` seulement si le serveur a confirmé.
 */
export async function fermerImpersonationServeur(supabase, { impersonationId = null, toutes = false } = {}) {
  try {
    const { data: { session } = {} } = await supabase.auth.getSession()
    if (!session?.access_token) return false
    const res = await fetch('/api/admin/impersonate-end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(toutes ? { toutes: true } : { impersonation_id: impersonationId }),
    })
    const j = await res.json().catch(() => ({}))
    return res.ok && j.ok === true
  } catch {
    return false
  }
}
