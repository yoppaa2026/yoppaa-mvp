// Layout de /legal : sert uniquement à porter la metadata, la page elle-même
// étant un composant client (sommaire interactif) qui ne peut pas en exporter.
//
// Pourquoi un robots explicite : le layout racine met TOUT le site en
// noindex tant que NEXT_PUBLIC_SEO_INDEX n'est pas 'true' (les fiches
// contiennent encore des commerçants de test). Or les conditions générales
// sont atteignables depuis la landing publique : elles doivent être
// indexables dès maintenant, comme la page d'accueil. Cette metadata écrase
// celle du layout racine.

export const metadata = {
  title: 'Conditions générales et confidentialité · Yoppaa',
  description:
    'Mentions légales, conditions générales pour les clients et les commerçants, politique de confidentialité et sous-traitance des données de Yoppaa (AVCOTECH SRL).',
  robots: { index: true, follow: true },
  alternates: { canonical: 'https://www.yoppaa.app/legal' },
}

export default function LegalLayout({ children }) {
  return children
}
