// La référence d'une commande : ce que le client annonce au comptoir, et ce que
// le commerçant cherche des yeux.
//
// ⚠️ C'EST LE SEUL LANGAGE COMMUN ENTRE EUX. Il doit donc dire exactement la
// même chose des deux côtés, et ne jamais désigner deux commandes différentes.
//
// Le numéro lui-même est attribué EN BASE, par un compteur verrouillé
// (MIGRATION_NUMERO_COMMANDE). Ce fichier ne fait que le METTRE EN FORME. Il
// n'en invente jamais : l'application a longtemps eu un repli qui recalculait
// « la position du jour » quand le numéro manquait, alors que la base numérotait
// par SEMAINE. Les deux ne disaient pas la même chose, et le commerçant pouvait
// lire « 12 » là où son client lisait « 3 ».

// Ce que porte chaque mode. Décision Alex du 10/08 : DEUX LETTRES partout.
// C'est symétrique, ça se dit à voix haute au comptoir (« cé-cé douze »), et ça
// ne peut pas se confondre avec le numéro lui-même.
export const PREFIXES = {
  CC: 'Click & Collect',
  LI: 'Livraison',
  EX: 'Expédition',
  RE: 'Retrait en magasin',
  RV: 'Rendez-vous',
}

// Le même calcul que le déclencheur, pour pouvoir l'annoncer AVANT la commande
// (écran de confirmation) sans attendre le retour de la base.
//
// ⚠️ Le Click & Collect se reconnaît à son CRÉNEAU : un retrait en magasin porte
// le même `mode_retrait` mais n'a pas d'heure convenue. C'est la seule
// différence entre les deux, et elle est facile à manquer.
export function prefixePourCommande({ mode_retrait, creneau_id } = {}) {
  if (mode_retrait === 'livraison') return 'LI'
  if (mode_retrait === 'expedition') return 'EX'
  if (creneau_id) return 'CC'
  return 'RE'
}

// Les rendez-vous n'étaient PAS numérotés : la colonne `numero_rdv` existe
// depuis le début et aucune ligne ne l'écrivait, l'écran client allant jusqu'à
// interroger le serveur en boucle pour l'obtenir, en vain.
export const PREFIXE_RDV = 'RV'
// ⚠️ TROIS LETTRES, seule exception aux deux lettres des autres. `AB` se lit
// mal à voix haute et se confond avec des initiales ; `ABT` s'entend.
export const PREFIXE_ABONNEMENT = 'ABT'

// La référence courte : celle du comptoir, celle qu'on crie dans une file.
// Rend null si la commande n'a pas encore de numéro : mieux vaut n'afficher
// RIEN qu'un numéro inventé qui ne correspondrait à rien chez le commerçant.
export function referenceCommande({ numero_commande, numero_prefixe } = {}) {
  if (numero_commande === null || numero_commande === undefined || numero_commande === '') return null
  const n = Number(numero_commande)
  if (!Number.isFinite(n)) return null
  return `${numero_prefixe || ''}${n}`
}

// La semaine, telle qu'on la dit à un humain. '2026-33' → 'sem. 33'.
export function libelleSemaine(numero_semaine) {
  const m = /^(\d{4})-(\d{1,2})$/.exec(String(numero_semaine || '').trim())
  return m ? `sem. ${Number(m[2])}` : null
}

// La référence complète, pour ce qui se relit plus tard : emails, historique,
// comptabilité. C'est la semaine qui lève la confusion entre le C12 de la
// semaine 33 et celui de la semaine 34.
export function referenceComplete(commande = {}) {
  const ref = referenceCommande(commande)
  if (!ref) return null
  const sem = libelleSemaine(commande.numero_semaine)
  return sem ? `${ref} · ${sem}` : ref
}

// Au comptoir, le numéro va avec le nom : c'est comme ça qu'on appelle
// quelqu'un dans une file, et ça lève l'ambiguïté mieux qu'un numéro de semaine
// que personne ne lit.
export function referenceAvecNom(commande = {}) {
  const ref = referenceCommande(commande)
  if (!ref) return null
  const prenom = String(commande.client_prenom || commande.client_nom || '').trim().split(/\s+/)[0]
  return prenom ? `${ref} · ${prenom}` : ref
}

// Le mode en toutes lettres, pour les écrans qui ont la place.
export function libellePrefixe(numero_prefixe) {
  return PREFIXES[numero_prefixe] || null
}

// La référence d'un RENDEZ-VOUS. La colonne s'appelle `numero_rdv` et non
// `numero_commande` : c'est la seule différence, le mécanisme est le même.
export function referenceRdv(rdv = {}) {
  return referenceCommande({
    numero_commande: rdv.numero_rdv,
    numero_prefixe: rdv.numero_prefixe || PREFIXE_RDV,
  })
}

export function referenceRdvComplete(rdv = {}) {
  const ref = referenceRdv(rdv)
  if (!ref) return null
  const sem = libelleSemaine(rdv.numero_semaine)
  return sem ? `${ref} · ${sem}` : ref
}

// La référence d'un ABONNEMENT. Même mécanisme, autre colonne, et surtout
// AUCUNE semaine : la série est CONTINUE (décision d'Alex du 19/08).
//
// ⚠️ POURQUOI PAS DE SEMAINE ICI. Un abonnement n'est pas une transaction de la
// semaine, c'est un CONTRAT : il vit douze mois, on le cite des mois après sa
// souscription, on le résilie, on y rattache des séances. Un numéro qui repart
// à 1 chaque semaine serait inutilisable, et c'est pour ça que `ABT7` se suffit
// à lui-même là où `RV7` a besoin de sa semaine pour être unique.
export function referenceAbonnement(abonnement = {}) {
  return referenceCommande({
    numero_commande: abonnement.numero_abonnement,
    numero_prefixe: abonnement.numero_prefixe || PREFIXE_ABONNEMENT,
  })
}

// ─── LA RÉFÉRENCE QUALIFIÉE, POUR LES DOCUMENTS COMPTABLES ──────────────────
//
// ⚠️ `RV23` N'EST PAS UNIQUE (remarque d'Alex, 19/08). Les compteurs des
// commandes et des rendez-vous repartent à 1 CHAQUE SEMAINE : deux `RV23`
// peuvent donc apparaître dans un export d'un mois. En base, l'unicité est
// portée par le couple (semaine, numéro) ; à l'écran, seule la moitié était
// montrée.
//
// Ce n'est pas ambigu pour qui lit la ligne entière, puisqu'elle porte sa date.
// Ça le devient dès qu'on trie par référence, ce que fait n'importe quel
// comptable. On qualifie donc la référence LÀ OÙ ELLE SORT DE SON CONTEXTE,
// sans toucher au numéro court que le client connaît et qui est déjà parti dans
// ses emails.
//
// `RV23` + `2026-34` → `RV23-2026-S34`. Sans semaine, la référence est déjà
// unique par construction (c'est le cas des abonnements) : on la rend telle
// quelle plutôt que d'inventer une qualification qui n'a pas de sens.
export function referenceQualifiee(reference, numero_semaine) {
  if (!reference) return ''
  const m = /^(\d{4})-(\d{1,2})$/.exec(String(numero_semaine || '').trim())
  if (!m) return reference
  return `${reference}-${m[1]}-S${String(Number(m[2])).padStart(2, '0')}`
}
