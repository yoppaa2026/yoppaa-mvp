import { redirect } from 'next/navigation'

// /pro → l'inscription commerçant.
//
// ⚠️ POURQUOI UNE ROUTE POUR TROIS LIGNES. C'est l'adresse qu'Alex colle dans
// ses publications Facebook et Instagram et dans sa bio : elle se retient, se
// dicte au téléphone, et dit à qui elle s'adresse. « yoppaa.app/signup » dans
// un post belge fait technique et se tape de travers.
//
// ⚠️ ET ELLE SE MESURE À PART. Les visites de /pro ne se confondent pas avec
// celles de /signup : c'est ce qui permettra de savoir si les publications
// amènent vraiment des commerçants, au lieu de le supposer.
//
// `redirect` remplace l'entrée dans l'historique par défaut hors Server
// Action : le bouton retour du navigateur ramène donc à la publication, pas
// dans une boucle /pro → /signup → /pro.

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Yoppaa Pro — Inscris ton commerce',
  description: 'Ouvre ta page Yoppaa : Click and Collect, rendez-vous en ligne, fidélité. Yoppaa ne prend aucune commission sur tes ventes.',
  robots: { index: true, follow: true },
}

export default function Pro() {
  redirect('/signup?via=pro')
}
