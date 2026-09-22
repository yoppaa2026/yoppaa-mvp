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
// On ne paie ce prix que là où la réalité vaut mieux qu'un dessin.
//
// ⚠️ ET CE CRITÈRE A SERVI, LE 22/09 : les deux captures de l'inscription sont
// parties, parce qu'un formulaire ne fait s'inscrire personne et parce qu'elles
// étaient les premières à périmer. Ce qui reste montre le PRODUIT, jamais le
// parcours d'inscription.
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

// 🔴 LES DEUX CAPTURES DE L'INSCRIPTION SONT PARTIES LE 22/09 (Alex : « elles
// ne servent pas à grand-chose, les captures qui comptent sont celles de l'app
// côté Yopper »). Deux raisons, et la seconde est écrite plus haut dans ce
// fichier :
//
//   1. Elles montraient un FORMULAIRE. Personne ne se décide à s'inscrire
//      parce que le formulaire est joli : ce qui convainc un commerçant, c'est
//      de voir ce que SES CLIENTS auront sous les yeux.
//   2. « Une capture FIGE l'écran du jour où elle a été prise : le jour où
//      l'inscription change, la landing ment sans que personne ne le voie. »
//      L'écran d'inscription a été retouché deux fois le 22/09. Ces deux
//      captures étaient les plus exposées du lot, et les moins utiles.
//
// ⚠️ LES FICHIERS RESTENT DANS `public/captures/` : `VISUELS_RESEAUX.md` s'en
// sert pour les réseaux sociaux. On les retire de la landing, pas du disque.
//
// ⚠️ CELLE QUI RESTE NE MONTRE PAS UN FORMULAIRE, et c'est pour ça qu'elle
// reste : elle montre le bandeau qui annonce l'essai sans carte, c'est-à-dire
// la PREUVE de ce que les trois cartes de tarifs se contentent d'affirmer.
// Trois commerçants ont choisi Exister par peur d'être prélevés ; c'est le seul
// endroit de la page qui leur répond par une image.
export const CAPTURES_COMMERCANT = [
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
    largeur: 760,
    hauteur: 1532,
    alt: 'La liste d’accueil de Yoppaa : les commerces proches, leurs horaires, leurs avis et ce que chacun propose.',
    titre: 'Ton village tient dans un écran',
    legende: 'Ce qui est ouvert, ce qui vient de fermer, et ce que chaque commerce sait faire : commander, réserver, sa carte de fidélité, ses bons. Tu le vois sans ouvrir une seule fiche.',
  },
  {
    cle: 'yopper_options',
    fichier: 'yopper-options.webp',
    largeur: 760,
    hauteur: 1585,
    alt: 'La personnalisation d’un tacos : le choix de sauce marqué obligatoire, une dizaine de sauces, et les suppléments payants.',
    titre: 'Tu commandes comme au comptoir',
    legende: 'Les sauces, ce qui est obligatoire, ce qui coûte un supplément. Ton snack met sa carte telle qu’il la dit, et tu la commandes telle que tu la commandes.',
  },
  {
    cle: 'yopper_variantes',
    fichier: 'yopper-variantes.webp',
    largeur: 760,
    hauteur: 1532,
    alt: 'Une fiche produit de boutique : les photos de la robe, puis le choix de la taille et de la couleur.',
    titre: 'Une robe a une taille, pas juste un prix',
    legende: 'Les boutiques ont leur place ici aussi. Tu choisis ta version avant de venir, et elle t’attend au comptoir.',
  },
  {
    cle: 'yopper_bon_cadeau',
    fichier: 'yopper-bon-cadeau.webp',
    largeur: 760,
    hauteur: 1532,
    alt: 'L’achat d’un bon cadeau : les montants proposés, le montant libre, et le choix entre l’offrir ou le garder.',
    titre: 'Et tu peux offrir en deux minutes',
    legende: 'Un montant, un petit mot, l’adresse email de la personne. Le bon part par email, il vaut un an, et il s’utilise en une ou plusieurs fois.',
  },

  // ─── LES CINQ AJOUTÉES LE 22/09, À LA DEMANDE D'ALEX ──────────────────────
  //
  // Elles viennent des huit visuels composés pour les stores, dont
  // `scripts/extraire-ecran-visuel.mjs` retire l'habillage pour n'en garder que
  // l'écran. Les trois premières de cette liste ont été remplacées par la même
  // voie : c'est pourquoi elles ont toutes le même format désormais.
  //
  // ⚠️ CE SONT DES ÉCRANS ENTIERS, PAS DES CADRAGES, et ça change la page.
  // Deux fois plus hautes que larges, là où les anciennes étaient presque
  // carrées : les blocs de la landing s'allongent d'autant. C'était la demande
  // d'Alex, qui voulait ses vraies captures ; le jour où la page paraît trop
  // longue, c'est ici qu'on recadre, pas ailleurs.
  {
    cle: 'yopper_carte',
    fichier: 'yopper-carte.webp',
    largeur: 760,
    hauteur: 1532,
    alt: 'La carte d’un snack dans Yoppaa : les photos du commerce, les horaires, le choix du jour de retrait, puis les assiettes avec leurs prix.',
    titre: 'Tu commandes sans faire la file',
    legende: 'La carte de ton snack, ses vraies heures d’ouverture, et le créneau où tu passes prendre. C’est prêt quand tu arrives.',
  },
  {
    cle: 'yopper_creneaux',
    fichier: 'yopper-creneaux.webp',
    largeur: 720,
    hauteur: 1526,
    alt: 'La prise de rendez-vous dans un salon : la prestation choisie, le choix de la personne, le jour, puis les créneaux libres de la journée.',
    titre: 'Tu prends rendez-vous le dimanche soir',
    legende: 'Le salon est fermé, son agenda ne l’est pas. Tu choisis ta prestation, la personne si tu en as une, et l’heure qui t’arrange.',
  },
  {
    cle: 'yopper_invendus',
    fichier: 'yopper-invendus.webp',
    largeur: 760,
    hauteur: 1532,
    alt: 'La section « Rien ne se perd » : les invendus du jour près de chez soi, leur prix barré, le temps restant et la distance.',
    titre: 'Ce qui reste ce soir ne part pas à la poubelle',
    legende: 'Les derniers du jour, à prix réduit, chez les commerces à côté de chez toi. Tu vois ce qu’il reste et jusqu’à quelle heure.',
  },
  {
    cle: 'yopper_fidelite',
    fichier: 'yopper-fidelite.webp',
    largeur: 760,
    hauteur: 1532,
    alt: 'La fiche d’un snack avec la carte de fidélité du client : sa cagnotte en cours, ce qu’il reste à atteindre, et son bon en attente.',
    titre: 'Ta fidélité se remplit toute seule',
    legende: 'Plus de carton au fond d’un sac. Ta cagnotte suit tes passages, et tu vois ce qu’il te reste avant ta prochaine récompense.',
  },
  {
    cle: 'yopper_livraison',
    fichier: 'yopper-livraison.webp',
    largeur: 760,
    hauteur: 1532,
    alt: 'Le choix entre retrait et livraison : le panier, les frais, l’adresse de livraison et un mot facultatif pour le livreur.',
    titre: 'Ou livré chez toi, quand le commerçant le propose',
    legende: 'Ton adresse, un mot pour le livreur si ta sonnette est capricieuse, et le créneau qui t’arrange. Les frais sont annoncés avant de payer.',
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
