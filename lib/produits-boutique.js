// Catalogue de la « Boutique Yoppaa » : le service humain d'accompagnement et
// le matériel optionnel. Source unique, partagée par l'inscription (étape 5)
// et par l'onglet Accompagnement du tableau de bord, pour que les libellés et
// les prix ne divergent jamais entre les deux surfaces.
//
// Fichier PUR (aucun import serveur) : importable côté client comme serveur.
//
// categories = catégories pour lesquelles le produit est « principal ». Les
// autres le voient en option secondaire, avec `mention`, pour éviter qu'un
// opticien commande une imprimante thermique par erreur.
//
// envKey = suffixe de la variable d'environnement qui porte le Price Stripe
// (STRIPE_PRICE_<envKey>_TEST / _LIVE). Comme les packs SMS et les
// abonnements, la vente se fait sur le compte PLATEFORME et la TVA est portée
// par le Price Stripe : les prix ci-dessous sont donc HTVA et servent à
// l'affichage, jamais au calcul du montant débité.
//
// ⚠️ LA DOCTRINE DE LA GAMME, POSÉE PAR ALEX LE 24/08 : « le maximum en
// autonomie et à distance ». Elle explique des choix qui paraîtraient
// incohérents sans elle :
//   • le MATÉRIEL est vendu à faible marge (10 % et 7 %). Un prix public se
//     compare en deux clics : viser 25 % dessus rendrait le kit plus cher que
//     ses pièces détachées. Le kit ne rapporte pas, il ÉQUIPE, et c'est
//     l'abonnement qui vit ensuite.
//   • le CONSOMMABLE et le SERVICE portent la marge (33 % et 56 %), parce que
//     personne n'en connaît le prix de référence.
//   • le SUR-PLACE reste cher et rare : une prestation qui demande un
//     déplacement ne grandit pas. Trois heures chez cent commerçants font deux
//     mois de travail ; à cinq cents, c'est impossible.
//   • l'ENCODAGE D'ARTICLES n'a PAS sa carte ici, volontairement. Un produit
//     mis en vitrine attire ceux qui le veulent, et ce métier-là n'est pas le
//     nôtre. Il vit en mention du Success Pack, sur demande.

// Encodage d'articles au-delà des exemples du Success Pack. Hors catalogue
// (voir la doctrine ci-dessus) : ces tarifs servent à l'affichage de la
// mention et au devis, pas à une vente en ligne.
// Le temps réel commande l'écart : 1 min 30 pour un article sans photo,
// 5 min avec la prise de vue, l'import et le recadrage.
export const ENCODAGE_ARTICLE = { sansPhoto: 2, avecPhoto: 6 }

// ⚠️ DEUX PHRASES QUI DISENT DES CHOSES OPPOSÉES, ET LES DEUX SONT VRAIES.
// Yoppaa Pro est une PWA : elle tourne sur iPhone, Android et PC sans rien
// installer, et c'est un argument de vente. L'IMPRESSION, elle, dépend d'un
// appareil physique dont on ne maîtrise ni le firmware ni le réseau.
//
// La limite est une limite de GARANTIE, pas une limite technique : une
// imprimante identique achetée ailleurs fonctionnerait probablement. Écrire
// « incompatible » serait donc faux, et le premier commerçant qui essaie le
// verrait. On écrit ce qu'on s'engage à faire marcher, pas ce qui marche.
//
// Elle vit ici en constante parce qu'elle s'affiche sur plusieurs produits :
// recopiée, elle aurait divergé, et c'est exactement le genre de phrase dont
// deux versions différentes se retrouvent un jour devant un client mécontent.
export const COMPAT_IMPRESSION =
  'Yoppaa Pro fonctionne sur iPhone, Android et PC, sans rien installer. L\'impression d\'étiquettes, elle, n\'est garantie qu\'avec le modèle Brother fourni par Yoppaa.'

export const SHOP_PRODUCTS = [
  {
    type: 'success_pack',
    envKey: 'SUCCESS_PACK',
    label: 'Success Pack on-site',
    prix: 199,
    // ⚠️ « SETUP COMPLET DE TON MENU » A DISPARU, ET C'ÉTAIT LE TROU. Encoder
    // la carte entière d'un commerçant, c'est un travail d'opérateur de
    // saisie : ça ne finit jamais, ça ne se répète pas, et à 199 € ça se
    // faisait à PERTE dès le premier restaurant un peu fourni. On encode
    // désormais dix articles AVEC lui, dont quelques-uns qu'il saisit
    // lui-même : c'est de la formation, et il n'a plus besoin de nous après.
    desc: 'On vient chez toi une demi-journée pour que tu repartes autonome.',
    contenu: [
      'Environ 2 heures sur place, dans un rayon de 30 km autour de Mettet',
      '10 photos de ton commerce, retouchées et mises en ligne',
      '10 articles encodés ensemble, dont plusieurs que tu saisis toi-même',
      'Réglage de ton compte : horaires, créneaux, moyens de paiement',
      'Formation à ton usage de tous les jours',
    ],
    badge: 'Service humain',
    badgeColor: '#10B981',
    categories: ['alimentaire', 'vitrine', 'detail'],
    // ⚠️ Les deux tarifs se LISENT dans ENCODAGE_ARTICLE. Recopiés ici, ils
    // auraient divergé au premier ajustement, et c'est le devis qui aurait eu
    // tort face à l'écran.
    mention: `Dans un rayon de 30 km autour de Mettet, au-delà sur devis. Encodage d'articles supplémentaires sur demande : ${ENCODAGE_ARTICLE.sansPhoto}€ l'article, ${ENCODAGE_ARTICLE.avecPhoto}€ avec photo du produit.`,
  },
  {
    type: 'success_pack_kit',
    envKey: 'SUCCESS_PACK_KIT',
    label: 'Success Pack on-site + installation du kit',
    prix: 259,
    desc: 'Le Success Pack on-site, plus la mise en route de ton matériel pendant qu\'on est chez toi.',
    contenu: [
      'Tout ce que contient le Success Pack on-site',
      'Ta tablette et ton imprimante connectées à ton Wi-Fi',
      'Une première étiquette imprimée devant toi',
      'Le geste refait une fois par toi, pour que tu saches le refaire seul',
    ],
    badge: 'Service humain',
    badgeColor: '#10B981',
    categories: ['alimentaire', 'vitrine', 'detail'],
    mention: 'Nécessite un Kit Yoppaa Light ou Pro. Nous n\'installons pas de matériel acheté ailleurs : sans l\'avoir testé, on ne peut rien te garantir.',
  },
  {
    type: 'mise_en_route',
    envKey: 'MISE_EN_ROUTE',
    label: 'Mise en route du hardware, à distance',
    prix: 59,
    desc: 'Mise en route de la tablette et/ou de l\'imprimante de ton Kit Yoppaa, en visio, sans que personne ne se déplace.',
    contenu: [
      '30 minutes en visio, à la date qui t\'arrange',
      'Ta tablette et/ou ton imprimante connectées à ton Wi-Fi',
      'Yoppaa Pro posé sur l\'écran d\'accueil de ta tablette',
      'Une étiquette de test imprimée avec toi',
      'Le geste refait une fois par toi, pour que tu saches le refaire seul',
    ],
    badge: 'Service humain',
    badgeColor: '#10B981',
    categories: ['alimentaire', 'vitrine', 'detail'],
    // ⚠️ LE RÉSEAU DU COMMERÇANT EST LE SEUL POINT QU'ON NE VOIT PAS D'ICI.
    // Certaines box isolent les appareils entre eux, certains commerces n'ont
    // qu'un Wi-Fi invité : aucune visio ne s'en sort. La porte de sortie est
    // annoncée AVANT, jamais pendant.
    mention: 'Nécessite un Kit Yoppaa Light ou Pro. Si ton réseau ne permet pas la connexion à distance, on bascule sur un déplacement, convenu avec toi avant.',
  },
  {
    type: 'kit_pro',
    envKey: 'KIT_PRO',
    label: 'Kit Yoppaa Pro',
    prix: 469,
    // ⚠️ « CONFIGURATION PLUG-AND-PLAY LIVRÉE PRÊTE À L'EMPLOI » ÉTAIT UNE
    // PROMESSE INTENABLE : le Wi-Fi est chez le commerçant, on ne peut pas
    // y connecter les appareils depuis ici. Ce qui part est PRÉPARÉ (mis à
    // jour, testé, rouleau monté, raccourci posé), pas installé.
    desc: 'Le poste de comptoir complet : tu gères tes commandes et tes rendez-vous sans téléphone à la main.',
    contenu: [
      'Tablette 11 pouces Wi-Fi, avec son chargeur et un câble de 2 mètres',
      'Support de comptoir inclinable',
      'Imprimante d\'étiquettes Wi-Fi, bande de 62 mm',
      '8 rouleaux d\'étiquettes, environ 6 000 étiquettes, près d\'un an d\'usage',
      'Tablette préparée : mises à jour faites, Yoppaa Pro sur l\'écran d\'accueil, écran épinglé',
      'Imprimante testée avant l\'envoi, avec sa notice d\'installation',
      'Livraison comprise',
    ],
    badge: 'Matériel',
    badgeColor: '#6B35C4',
    // ⚠️ OUVERT AU DÉTAIL ET AUX SERVICES le 24/08 : l'étiquette sert aussi
    // aux produits d'un rendez-vous et d'une boutique, pas qu'au comptoir
    // d'une friterie. Fermé à l'alimentaire, un salon ne le voyait même pas.
    categories: ['alimentaire', 'detail'],
    mention: `Surtout utile si tu gères tes commandes au comptoir. Tu peux aussi tout piloter depuis ton téléphone, ta tablette ou ton PC, sans matériel. ${COMPAT_IMPRESSION}`,
  },
  {
    type: 'kit_light',
    envKey: 'KIT_LIGHT',
    label: 'Kit Yoppaa Light',
    prix: 259,
    // ⚠️ « TICKETS DE COMMANDE » ÉTAIT FAUX : la machine imprime des
    // ÉTIQUETTES sur une bande de 62 mm, pas des tickets de caisse. Le mot
    // aurait créé une déception au déballage.
    desc: 'L\'imprimante seule, à brancher sur le téléphone, la tablette ou le PC que tu as déjà.',
    contenu: [
      'Imprimante d\'étiquettes Wi-Fi, bande de 62 mm',
      '8 rouleaux d\'étiquettes, environ 6 000 étiquettes, près d\'un an d\'usage',
      'Une étiquette qui sort quand tu passes une commande en « prête »',
      'Les étiquettes produits de tes rendez-vous et de tes ventes de détail',
      'Imprimante testée avant l\'envoi, avec sa notice d\'installation',
      'Livraison comprise',
    ],
    badge: 'Matériel',
    badgeColor: '#6B35C4',
    categories: ['alimentaire', 'detail'],
    mention: `Surtout utile si tu prépares des commandes à retirer. Pour un service seul, ton smartphone ou ton PC suffisent largement. ${COMPAT_IMPRESSION}`,
  },
  {
    type: 'rouleau_etiquettes',
    envKey: 'ROULEAU',
    // ⚠️ LE SINGULIER ÉTAIT INDÉFENDABLE : « Rouleau d'étiquettes » à 44,90 €
    // se comparait à un rouleau d'origine trouvable autour de 20 €. C'est un
    // PACK DE HUIT, et le dire fait passer l'offre de scandaleuse à
    // imbattable : 5,99 € le rouleau.
    label: 'Pack de 8 rouleaux d\'étiquettes',
    prix: 47.90,
    desc: 'La recharge de tes étiquettes, à commander quand tu approches de la fin.',
    contenu: [
      '8 rouleaux continus de 62 mm, 30 mètres chacun',
      'Environ 6 000 étiquettes, près d\'un an à vingt commandes par jour',
      'Compatibles Kit Yoppaa Light et Kit Yoppaa Pro',
      'Livraison comprise',
    ],
    badge: 'Consommable',
    badgeColor: '#F59E0B',
    categories: ['alimentaire', 'detail'],
    mention: `Nécessite un Kit Yoppaa Light ou Pro. ${COMPAT_IMPRESSION}`,
  },
]

// Retourne les produits « recommandés » pour la catégorie + ceux affichés en
// options secondaires.
export function classerProduitsParCategorie(categorie) {
  const principaux = SHOP_PRODUCTS.filter(p => p.categories.includes(categorie))
  const secondaires = SHOP_PRODUCTS.filter(p => !p.categories.includes(categorie))
  return { principaux, secondaires }
}

export function produitParType(type) {
  return SHOP_PRODUCTS.find(p => p.type === type) || null
}

// ⚠️ UN PRIX ÉCRIT DEUX FOIS EST UN PRIX QUI DIVERGERA. La page d'inscription
// annonçait « 399€ » et « 179€ » en dur dans sa liste d'arguments pendant que
// ce fichier faisait foi ailleurs : au premier changement de tarif, les deux
// surfaces se contredisaient sans que rien ne rougisse. Tout texte qui cite un
// prix passe désormais par ici.
export function prixProduitTexte(type) {
  const p = produitParType(type)
  if (!p) return ''
  return Number.isInteger(p.prix) ? `${p.prix}€` : `${p.prix.toFixed(2).replace('.', ',')}€`
}
