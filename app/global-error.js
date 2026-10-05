'use client' // Error boundaries must be Client Components
// Le dernier filet, quand c'est la mise en page racine elle-même qui plante.
// Il remplace TOUT le document : d'où ses propres <html> et <body>.

import EcranErreur from './EcranErreur'

export default function ErreurGlobale({ error, retry }) {
  return (
    <html lang="fr">
      <body style={{ margin: 0 }}>
        <EcranErreur error={error} retry={retry} ou="racine" />
      </body>
    </html>
  )
}
