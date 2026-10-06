'use client'
// ─── Le poste de confirmation du tableau de bord ─────────────────────────────
//
// UN SEUL exemplaire monté par page, et une fonction `confirmer()` que
// n'importe quel écran appelle sans rien brancher. C'est ce qui rend le
// remplacement des vingt-cinq `window.confirm()` tenable : les appels restent
// d'une ligne, là où un contexte React aurait demandé de câbler une quinzaine
// de sous-composants un par un.
//
// ⚠️ ET SI LE POSTE N'EST PAS MONTÉ, ON NE FAIT RIEN. `confirmer()` rend alors
// `null`, ce que tous les appelants lisent comme un refus. Le repli d'un
// garde-fou doit toujours pencher du côté qui ne détruit pas : au pire un
// commerçant clique sans effet et recommence, jamais un article ne disparaît
// parce qu'une fenêtre n'a pas pu s'afficher.

import { useState, useCallback, useEffect } from 'react'
import ModaleConfirmation from './ModaleConfirmation'

let ouvrirLaFenetre = null

// À appeler depuis n'importe où : rend une promesse sur le choix du commerçant,
// ou `null` s'il s'en va sans rien décider.
export function confirmer(config) {
  if (typeof ouvrirLaFenetre !== 'function') return Promise.resolve(null)
  return ouvrirLaFenetre(config)
}

// Raccourci pour le cas le plus fréquent : « a-t-il dit oui ? »
export async function confirme(config) {
  return (await confirmer(config)) === 'oui'
}

// Avec un champ texte facultatif (`champ: { label, placeholder, max }`) :
// rend `{ oui: boolean, texte: string }`. Un refus ou une fermeture rend
// `{ oui: false }`, comme `confirme`.
export async function confirmeAvecTexte(config) {
  const r = await confirmer(config)
  if (!r || typeof r !== 'object') return { oui: false, texte: '' }
  return { oui: r.valeur === 'oui', texte: String(r.texte || '').trim() }
}

export default function PosteConfirmation() {
  const [demande, setDemande] = useState(null)   // { config, resoudre }
  const [texte, setTexte] = useState('')

  const ouvrir = useCallback((config) => new Promise(resoudre => {
    setTexte('')
    setDemande({ config: config || {}, resoudre })
  }), [])

  useEffect(() => {
    ouvrirLaFenetre = ouvrir
    return () => { ouvrirLaFenetre = null }
  }, [ouvrir])

  function repondre(valeur) {
    // ⚠️ ON RÉSOUT AVANT DE FERMER, et on résout TOUJOURS. Une promesse laissée
    // en suspens gèle l'appelant sur un `await` qui ne revient jamais : le
    // commerçant croirait que son clic n'a rien fait.
    // Avec un champ, on rend aussi ce qui a été tapé ; sans, la valeur seule,
    // comme avant (aucun appelant existant ne change).
    const avecChamp = !!demande?.config?.champ
    demande?.resoudre?.(avecChamp && valeur != null ? { valeur, texte } : (valeur ?? null))
    setDemande(null)
  }

  return (
    <ModaleConfirmation
      ouverte={!!demande}
      {...(demande?.config || {})}
      texte={texte}
      onTexte={setTexte}
      onChoix={repondre}
      onFermer={() => repondre(null)}
    />
  )
}
