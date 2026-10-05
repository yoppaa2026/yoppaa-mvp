'use client' // Error boundaries must be Client Components
// Tout écran de l'application qui plante tombe ici, et plus sur la page
// anglaise de Next. Voir app/EcranErreur.js.

import EcranErreur from './EcranErreur'

export default function Erreur({ error, retry }) {
  return <EcranErreur error={error} retry={retry} ou="page" />
}
