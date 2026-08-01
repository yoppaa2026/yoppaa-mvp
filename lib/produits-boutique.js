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

export const SHOP_PRODUCTS = [
  {
    type: 'success_pack',
    envKey: 'SUCCESS_PACK',
    label: 'Success Pack on-site',
    prix: 199,
    desc: 'On vient chez toi : photos pro de ton commerce, setup complet de ton menu ou de tes prestations, formation rapide, suivi à J+30. Idéal pour démarrer sereinement.',
    badge: 'Service humain',
    badgeColor: '#10B981',
    categories: ['alimentaire', 'vitrine', 'detail'],
    mention: null,
  },
  {
    type: 'kit_pro',
    envKey: 'KIT_PRO',
    label: 'Kit Yoppaa Pro',
    prix: 399,
    desc: 'Tablette tactile + imprimante thermique. Tu gères tes commandes ou tes RDV au comptoir, sans téléphone à la main. Configuration plug-and-play livrée prête à l\'emploi.',
    badge: 'Matériel',
    badgeColor: '#6B35C4',
    categories: ['alimentaire'],
    mention: 'Surtout utile en alimentaire (gestion comptoir Click & Collect). Tu peux aussi gérer ton activité depuis n\'importe quel téléphone, tablette ou PC sans matériel.',
  },
  {
    type: 'kit_light',
    envKey: 'KIT_LIGHT',
    label: 'Kit Yoppaa Light',
    prix: 179,
    desc: 'Imprimante thermique seule. Idéale pour imprimer les tickets de commande, les bons de retrait ou les étiquettes produits. Connecte-la à ton téléphone ou ta tablette existante.',
    badge: 'Matériel',
    badgeColor: '#6B35C4',
    categories: ['alimentaire'],
    mention: 'Surtout utile en alimentaire. Pour service ou détail, ton smartphone ou ton PC suffisent largement.',
  },
  {
    type: 'rouleau_etiquettes',
    envKey: 'ROULEAU',
    label: 'Rouleau d\'étiquettes',
    prix: 44.90,
    desc: 'Recharge papier thermique compatible Kit Pro et Kit Light. Tu peux en commander à tout moment quand tu seras à court, depuis ton tableau de bord.',
    badge: 'Consommable',
    badgeColor: '#F59E0B',
    categories: ['alimentaire'],
    mention: 'Nécessite un Kit Pro ou Kit Light.',
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
