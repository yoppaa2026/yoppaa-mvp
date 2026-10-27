'use client'

// LE PONT ENTRE CE QUE LE SERVEUR A ÉCRIT ET LA FICHE (27/10).
//
// Les deux fiches (`/commander/<slug>`, `/commander/rdv/<slug>`) sont des pages
// client : elles chargent tout dans le navigateur, et le HTML qu'elles rendent
// au serveur est leur état de chargement. Leur layout (serveur) écrit donc la
// fiche en version simple et les liens de la commune, et les leur passe ici :
//   • `resume` : affiché À LA PLACE des blocs gris du chargement ;
//   • `liens`  : « Autres commerces à … », en bas de la fiche.
//
// ⚠️ Une page qui n'a pas de fournisseur au-dessus d'elle reçoit des `null` et
// se comporte exactement comme avant.

import { createContext, useContext } from 'react'

const FicheServeur = createContext({ resume: null, liens: null })

export function FournisseurFicheServeur({ resume = null, liens = null, children }) {
  return <FicheServeur.Provider value={{ resume, liens }}>{children}</FicheServeur.Provider>
}

export function useFicheServeur() {
  return useContext(FicheServeur)
}
