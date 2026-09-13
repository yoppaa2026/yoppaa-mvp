// Les vraies captures du produit, sur la landing.
//
// L'IDÉE, D'ALEX (26/08) : « on montre la réalité ». Un mockup dessiné dit
// « voilà à quoi ça POURRAIT ressembler » ; une capture dit « voilà ce que tu
// AURAS ». Pour un commerçant qui hésite, la différence est décisive.
//
// ⚠️ MAIS ON NE REMPLACE PAS TOUT, ET C'EST UN ARBITRAGE, PAS UNE PARESSE.
// Les mockups de cette landing sont écrits en JSX : ils ne pèsent rien, restent
// nets à toutes les tailles, et suivent la charte automatiquement. Une capture,
// elle, pèse, et surtout elle FIGE l'écran du jour où elle a été prise : le
// jour où l'inscription change, la landing ment sans que personne ne le voie.
// On ne paie ce prix qu'aux endroits où la réalité vaut mieux qu'un dessin,
// c'est-à-dire là où le commerçant doute :
//   • « ça va me prendre des heures » → l'inscription terminée, score à l'appui ;
//   • « ça ne s'adresse pas à mon métier » → les métiers, en toutes lettres.
//
// ⚠️ LES DIMENSIONS SONT OBLIGATOIRES, ET CE NE SONT PAS DES INDICATIONS.
// Sans elles, l'image arrive après le texte et fait sauter toute la page au
// moment précis où le visiteur commence à lire. Elles valent celles du fichier,
// vérifiées par le banc : une valeur recopiée de travers produit exactement le
// saut qu'on voulait éviter.
//
// Fabriquées par `node scripts/preparer-captures-landing.mjs`, à partir des
// captures brutes déposées dans `captures-brutes/`.

export const DOSSIER_CAPTURES = '/captures'

// ⚠️ L'ORDRE RACONTE L'HISTOIRE, il n'est pas alphabétique : je m'inscris et
// mon métier y est déjà · ma fiche est complète en quelques minutes · et voilà
// ce que je trouve en arrivant.
export const CAPTURES_COMMERCANT = [
  {
    cle: 'signup_metiers',
    fichier: 'signup-metiers.webp',
    largeur: 695,
    hauteur: 470,
    alt: 'Le choix du métier à l’inscription : boulangerie, friterie, pizzeria, traiteur, food truck et une quinzaine d’autres.',
    titre: 'Ton métier est déjà dans la liste',
    legende: 'Et s’il n’y est pas, tu l’écris. Yoppaa s’adapte à ton commerce, pas l’inverse.',
  },
  {
    cle: 'signup_complete',
    fichier: 'signup-complete.webp',
    largeur: 698,
    hauteur: 382,
    alt: 'Dernière étape de l’inscription Yoppaa : la fiche est complète, score de 100 sur 100.',
    titre: 'Ta fiche est prête en quelques minutes',
    legende: 'Le score te dit ce qui manque, et quand il n’y a plus rien à ajouter. Le catalogue, les créneaux et les deals attendent tranquillement dans ton tableau de bord.',
  },
  // ⚠️ CELLE-CI EST PRISE SUR UN VRAI TÉLÉPHONE, et c'est ce qui la rend
  // lisible. La même chose capturée sur un écran de bureau faisait 1912 px de
  // large : réduite à la taille d'une landing, les libellés d'onglets tombaient
  // à six pixels de haut. Une capture doit être lisible À LA LARGEUR OÙ ELLE
  // SERA VUE, et la plupart des visiteurs sont sur un téléphone.
  {
    cle: 'dashboard_essai',
    fichier: 'dashboard-essai.webp',
    largeur: 900,
    hauteur: 681,
    alt: 'Le tableau de bord commerçant sur téléphone : le bandeau qui annonce l’essai de la formule Vendre jusqu’au 8 janvier, et la barre d’onglets.',
    titre: 'Et tu peux tout essayer, sans carte',
    legende: 'Ton tableau de bord te dit ce que tu as, ce que tu peux essayer, et jusqu’à quand. Si tu n’en fais rien, tu gardes ta formule : rien ne se déclenche dans ton dos.',
  },
]

// ═══ CÔTÉ YOPPER ════════════════════════════════════════════════════════════
//
// 13/09. Les maquettes JSX de la landing racontent un GESTE : on y voit un
// parcours, une intention, un écran idéal. Ces quatre-ci racontent autre chose,
// et c'est pour ça qu'elles ne les remplacent pas : elles montrent ce que
// l'application fait DÉJÀ, avec ses vraies listes de sauces et ses vraies
// tailles de robe. Un dessin ne peut pas prouver ça, il ne fait que l'affirmer.
//
// ⚠️ CHACUNE EST UN BLOC, PAS UN ÉCRAN. Une capture de téléphone entier ramenée
// à la largeur d'une colonne tombe sous la barre des dix pixels de texte : les
// cadrages de `scripts/preparer-captures-landing.mjs` prennent donc un morceau
// d'écran, jamais l'écran.
//
// ⚠️ CE QUI N'Y EST PAS EST UN CHOIX, PAS UN OUBLI. Le profil et son temps
// économisé sont l'écran le plus touchant de l'application, et ils resteront
// dehors tant que leurs compteurs seront ceux d'un compte de test.
export const CAPTURES_YOPPER = [
  {
    cle: 'yopper_liste',
    fichier: 'yopper-liste.webp',
    largeur: 900,
    hauteur: 879,
    alt: 'La liste d’accueil de Yoppaa : les commerces proches, leurs horaires, leurs avis et ce que chacun propose.',
    titre: 'Ton village tient dans un écran',
    legende: 'Ce qui est ouvert, ce qui vient de fermer, et ce que chaque commerce sait faire : commander, réserver, sa carte de fidélité, ses bons. Tu le vois sans ouvrir une seule fiche.',
  },
  {
    cle: 'yopper_options',
    fichier: 'yopper-options.webp',
    largeur: 900,
    hauteur: 1269,
    alt: 'La personnalisation d’un tacos : le choix de sauce marqué obligatoire, une dizaine de sauces, et les suppléments payants.',
    titre: 'Tu commandes comme au comptoir',
    legende: 'Les sauces, ce qui est obligatoire, ce qui coûte un supplément. Ton snack met sa carte telle qu’il la dit, et tu la commandes telle que tu la commandes.',
  },
  {
    cle: 'yopper_variantes',
    fichier: 'yopper-variantes.webp',
    largeur: 900,
    hauteur: 1176,
    alt: 'Une fiche produit de boutique : les photos de la robe, puis le choix de la taille et de la couleur.',
    titre: 'Une robe a une taille, pas juste un prix',
    legende: 'Les boutiques ont leur place ici aussi. Tu choisis ta version avant de venir, et elle t’attend au comptoir.',
  },
  {
    cle: 'yopper_bon_cadeau',
    fichier: 'yopper-bon-cadeau.webp',
    largeur: 900,
    hauteur: 898,
    alt: 'L’achat d’un bon cadeau : les montants proposés, le montant libre, et le choix entre l’offrir ou le garder.',
    titre: 'Et tu peux offrir en deux minutes',
    legende: 'Un montant, un petit mot, l’adresse email de la personne. Le bon part par email, il vaut un an, et il s’utilise en une ou plusieurs fois.',
  },
]

// ⚠️ PAS DE LISTE « TOUTES LES CAPTURES » ICI, ET C'EST VOLONTAIRE. Le banc
// lit ce module et prend TOUTE liste de captures qu'il y trouve, plutôt qu'une
// liste nommée : une troisième série sera donc gardée le jour où elle sera
// écrite, sans que personne n'ait à y penser. Ajouter un tableau qui recopie
// les deux autres ferait échouer sa garde d'unicité des clés, sur des doublons
// qui n'existent pas.

export function captureSrc(c) {
  return `${DOSSIER_CAPTURES}/${c.fichier}`
}
