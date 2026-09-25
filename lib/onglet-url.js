'use client'
// RESTER OÙ L'ON ÉTAIT QUAND ON RECHARGE.
//
// 🔴 POURQUOI (Alex, 25/09). « Quand on fait un refresh d'une page dans le
// tableau de bord, il faut rester sur cette même page, ce n'est pas le cas
// actuellement. » L'adresse portait déjà l'onglet et le réglage
// (`?onglet=config&config=menu`), mais pas le SOUS-onglet : un commerçant qui
// rechargeait depuis « Personnalisation » retombait sur « Articles ».
//
// ⚠️ ET ÇA ARRIVE TOUT LE TEMPS. On recharge pour voir si une écriture a pris,
// après une coupure de réseau, ou parce qu'on a rouvert l'onglet du navigateur.
// À chaque fois, quatre clics pour revenir là où on travaillait.
//
// ⚠️ UN SEUL MÉCANISME POUR LES QUATRE SOUS-ONGLETS du tableau de bord (Menu,
// Rendez-vous, Profil, Catalogue). Quatre corrections séparées auraient
// divergé, et la cinquième page créée un jour serait repartie sans.
//
// 🔴 LA LECTURE SE FAIT DANS UN EFFET, PAS DANS L'ÉTAT INITIAL. Lire `window`
// au premier rendu ferait diverger le rendu serveur du rendu client, et
// l'hydratation casserait. C'est la règle déjà appliquée dans `dashboard/page`
// pour l'onglet principal, et elle vaut ici pour la même raison.

import { useEffect, useRef, useState } from 'react'

// 🔴 DEUX NIVEAUX DE SOUS-ONGLETS COEXISTENT, et les confondre les ferait
// s'effacer l'un l'autre. L'onglet « Carte » (`TabCatalogue`) choisit entre
// Produits et Abonnements ; DANS Produits, `TabMenu` choisit entre Articles,
// Catégories et Personnalisation. Une seule clé d'adresse pour les deux, et le
// second écrirait par-dessus le premier à chaque rendu.
export const CLE_SOUS_ONGLET = 'sous'
export const CLE_SOUS_ONGLET_2 = 'sous2'

/**
 * Le sous-onglet demandé par l'adresse, ou `defaut`.
 *
 * ⚠️ ON VALIDE CONTRE LA LISTE DE L'ÉCRAN. Changer d'onglet principal laisse
 * un `?sous=` qui ne veut plus rien dire là où on arrive : sans ce contrôle,
 * l'onglet Rendez-vous chercherait à ouvrir « personnalisation », qui n'existe
 * pas chez lui, et n'afficherait rien du tout.
 */
// ⚠️ LA VALIDATION VIT À PART POUR ÊTRE MESURABLE. Elle était dans
// `lireSousOnglet`, qui commence par rendre le défaut quand il n'y a pas de
// navigateur : au banc, sous Node, la règle n'était donc JAMAIS exercée, et
// une mutation qui acceptait n'importe quel sous-onglet restait verte. Trouvé
// par le harnais le 25/09.
export function sousOngletValide(valeur, valides = [], defaut = null) {
  if (!valeur || !Array.isArray(valides)) return defaut
  return valides.includes(valeur) ? valeur : defaut
}

export function lireSousOnglet(valides = [], defaut = null, cle = CLE_SOUS_ONGLET) {
  if (typeof window === 'undefined') return defaut
  return sousOngletValide(new URLSearchParams(window.location.search).get(cle), valides, defaut)
}

/**
 * Écrit le sous-onglet dans l'adresse, sans toucher au reste.
 *
 * ⚠️ `replaceState`, PAS `pushState`, et c'est un choix. L'onglet principal
 * empile une entrée d'historique parce que passer de « Commandes » à
 * « Réglages » est une navigation. Parcourir trois sous-onglets d'un même
 * réglage n'en est pas une : les empiler obligerait à appuyer trois fois sur
 * « Précédent » pour sortir d'un écran qu'on n'a jamais quitté.
 */
export function ecrireSousOnglet(valeur, cle = CLE_SOUS_ONGLET) {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (valeur) url.searchParams.set(cle, valeur)
  else url.searchParams.delete(cle)
  // ⚠️ RIEN À ÉCRIRE, ON N'ÉCRIT PAS : une écriture identique reste sans effet
  // visible mais réveille les écouteurs d'historique pour rien.
  if (url.toString() === window.location.href) return
  window.history.replaceState(null, '', url.toString())
}

/**
 * Le sous-onglet d'un écran, tenu par l'adresse.
 *
 * S'utilise comme `useState` : `const [onglet, setOnglet] = useSousOnglet(...)`.
 *
 * ⚠️ LE BOUTON « PRÉCÉDENT » EST ÉCOUTÉ AUSSI. Il change l'adresse sans que
 * React le sache ; sans cet écouteur, l'écran afficherait un sous-onglet que
 * l'adresse ne dit plus.
 */
export function useSousOnglet(valides = [], defaut = null, cle = CLE_SOUS_ONGLET) {
  const [valeur, setValeur] = useState(defaut)
  const pret = useRef(false)

  useEffect(() => {
    const demande = lireSousOnglet(valides, null, cle)
    if (demande) setValeur(demande)
    pret.current = true
    const auRetour = () => setValeur(lireSousOnglet(valides, defaut, cle))
    window.addEventListener('popstate', auRetour)
    return () => window.removeEventListener('popstate', auRetour)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- une seule fois au montage : `valides` est un littéral recréé à chaque rendu
  }, [])

  useEffect(() => {
    // ⚠️ ON N'ÉCRIT PAS AVANT D'AVOIR LU. Sinon le premier rendu écraserait le
    // sous-onglet demandé par l'adresse avec la valeur par défaut, et le
    // rechargement ne servirait toujours à rien.
    if (!pret.current) return
    ecrireSousOnglet(valeur, cle)
  }, [valeur, cle])

  return [valeur, setValeur]
}
