'use client'
// « SUIS-JE DANS L'APP NATIVE ? », POUR UN ÉCRAN (02/10).
//
// ⚠️ LU APRÈS LE MONTAGE, JAMAIS PENDANT LE RENDU. Le serveur ne connaît pas
// `window` : il rend toujours la version web. Si le premier rendu du
// téléphone lisait `window.Capacitor` directement, le balisage différerait de
// celui du serveur (un lien avec `target="_blank"` d'un côté, sans de l'autre)
// et React signalerait une hydratation ratée. On part donc du web, puis on
// corrige.
//
// Pour une DÉCISION au moment d'un clic, appeler `estAppNative(window)`
// directement : là, `window` existe toujours.

import { useEffect, useState } from 'react'
import { estAppNative } from './push-natif'

export function useAppNative() {
  const [natif, setNatif] = useState(false)
  useEffect(() => { setNatif(estAppNative(window)) }, [])
  return natif
}
