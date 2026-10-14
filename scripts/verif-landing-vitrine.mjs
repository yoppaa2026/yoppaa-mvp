// Ce que la landing MONTRE du produit.
//
// La landing est le premier outil de recrutement du projet : c'est là qu'un
// commerçant décide s'il nous rappelle, et là qu'un habitant décide s'il
// installe. Elle montre le produit de deux façons, et ces deux façons ne font
// pas le même travail :
//
//   • des MAQUETTES dessinées en JSX. Elles ne pèsent rien, restent nettes à
//     toutes les tailles, suivent la charte toutes seules, et surtout elles
//     simplifient : on y lit un geste, pas un écran.
//   • des CAPTURES du vrai produit. Elles pèsent, elles figent, et c'est le
//     prix de la seule chose qu'un dessin ne peut pas faire : prouver.
//
// 🔴 LE DÉFAUT QUE CE BANC EXISTE POUR FERMER : UNE MAQUETTE QUI MENT.
// Le 13/09, `MockRdv` montrait encore la prise de rendez-vous d'avant le module
// d'agenda : pas d'indicateur d'étapes, « Avec qui » en pastilles de texte, les
// créneaux pris affichés barrés, le jour en titre au lieu d'un carrousel. Rien
// ne cassait, aucun banc ne rougissait, et la landing racontait un produit qui
// n'existait plus depuis des semaines. C'est ce que produit, à terme, toute
// maquette dessinée d'après le CODE plutôt que d'après l'ÉCRAN.
//
//   npm run verif:vitrine

import { readFileSync } from 'node:fs'
import { sansProse } from './lire-code.mjs'
import { CAPTURES_YOPPER, CAPTURES_COMMERCANT } from '../lib/captures-landing.js'
import { recompenseDue, presetFidelite } from '../lib/fidelite.js'
import { PLAN_FEATURES } from '../lib/plans.js'

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}

// 🔴 `sansProse`, ET CE N'EST PAS UNE PRÉCAUTION DE STYLE. Ce banc cherche dans
// la landing des libellés que les commentaires de la landing CITENT pour
// expliquer pourquoi ils comptent. Lu avec ses commentaires, le fichier répond
// « présent » même si l'écran les a perdus. C'est le quatrième faux vert de ce
// type dans le projet, et le seul moyen de ne pas le refaire est de dépouiller
// avant de chercher.
const LANDING = sansProse(readFileSync(new URL('../app/components/LandingReveal.js', import.meta.url), 'utf8'))
const CADRAGES = sansProse(readFileSync(new URL('./preparer-captures-landing.mjs', import.meta.url), 'utf8'))

// ═══════════════════════════════════════════════════════════════════════════
// 1. LES MAQUETTES SONT RANGÉES, ET AUCUNE N'EST ORPHELINE
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ SEPT TÉLÉPHONES ALIGNÉS NE SE REGARDENT PAS. Les maquettes se sont
// ajoutées module par module jusqu'à faire un mur qui passait à la ligne tout
// seul. Chaque rangée porte une idée, et c'est le titre qui la porte : une
// rangée sans titre redevient une file d'attente.
{
  // ⚠️ REPOINTÉE LE 14/10 : la landing v2 n'a PLUS AUCUNE MAQUETTE DESSINÉE
  // (Alex : « trop lourde »). Les sept téléphones dessinés et leurs deux
  // rangées sont partis ; le haut de page montre une VRAIE capture, et la
  // preuve tient dans un seul carrousel de captures (section 3). Les gardes
  // des rangées n'ont plus de sujet. Celle des orphelines GARDE le sien : une
  // maquette qu'on réécrirait sans la poser serait un écran que personne ne
  // verra.
  const posees = [...LANDING.matchAll(/<(Mock[A-Za-z]+)\s*\/>/g)].map(m => m[1])
  const definies = [...LANDING.matchAll(/^function (Mock[A-Za-z]+)\(/gm)].map(m => m[1])
  const orphelines = definies.filter(d => !posees.includes(d))
  verifier('aucune maquette définie ne reste hors de la page',
    orphelines.length === 0, orphelines.join(', '))

  // Le téléphone du haut de page porte une vraie capture, et elle existe.
  const cleHero = LANDING.match(/const CAPTURE_HERO = CAPTURES_YOPPER\.find\(c => c\.cle === '([^']+)'\)/)?.[1] || ''
  verifier('le haut de page montre une vraie capture, qui existe',
    !!cleHero && CAPTURES_YOPPER.some(c => c.cle === cleHero), cleHero || 'introuvable')
  verifier('et ce téléphone est posé dans le haut de page',
    /<TelephoneHero\/>/.test(LANDING))
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. LA PRISE DE RENDEZ-VOUS EST MONTRÉE, ET C'EST LA VRAIE
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 CETTE SECTION MESURAIT UN DESSIN QUI N'EXISTE PLUS (22/09). Ses six
// gardes figeaient les écarts relevés le 13/09 entre `MockRdv` et l'écran réel
// (indicateur d'étapes, tuiles à initiale, trou de midi, créneaux non barrés).
// Le dessin est parti parce que la capture `yopper_creneaux` montre le MÊME
// écran en vrai : aucun de ces écarts n'est plus possible, une capture ne peut
// pas oublier le trou de midi.
//
// 🔴 MAIS UNE SECTION QUI PERD SA CIBLE NE DEVIENT PAS VIDE, ELLE CHANGE DE
// CIBLE. Supprimer ces gardes avec leur sujet laisserait un trou silencieux :
// la landing pourrait cesser d'afficher la prise de rendez-vous sans que rien
// ne rougisse, et c'est exactement le genre de vert complice que ce banc
// existe pour empêcher. On ne mesure donc plus le dessin : on mesure que la
// PREUVE est là, qu'elle est décrite, et qu'elle n'a rien perdu de ce que le
// dessin était seul à dire.
{
  const rdv = CAPTURES_YOPPER.find(c => c.cle === 'yopper_creneaux')
  verifier('la prise de rendez-vous est montrée par une capture', !!rdv)
  verifier('elle est décrite pour qui ne voit pas l’image',
    (rdv?.alt?.length || 0) > 60 && (rdv?.legende?.length || 0) > 60)

  // ⚠️ ELLE NOMME LES TROIS CHOIX DU TUNNEL. C'est ce que la maquette montrait
  // et ce qu'un lecteur pressé doit lire sans ouvrir l'image : la prestation,
  // la personne, l'heure.
  const dit = `${rdv?.alt || ''} ${rdv?.legende || ''}`.toLowerCase()
  for (const mot of ['prestation', 'personne', 'heure']) {
    verifier(`la capture du rendez-vous nomme « ${mot} »`, dit.includes(mot))
  }

  // 🔴 ET LE RAPPEL, QUE LE DESSIN ÉTAIT SEUL À ANNONCER. Son étiquette est la
  // seule ligne de la landing à l'avoir jamais dit ; en la retirant sans la
  // déplacer, on aurait perdu un argument sans que personne ne s'en aperçoive.
  verifier('la capture annonce toujours le rappel', /rappel/i.test(dit))

  // 🔴 LA GARDE QUI VAUT LES SIX AUTRES : LE DÉLAI ANNONCÉ EST CELUI DU CODE.
  // La landing écrit « une heure avant » ; `lib/rappels.js` décide vraiment.
  // Le jour où ce réglage bouge, la page d'accueil promettra autre chose que
  // ce que le produit envoie, et rien d'autre ne le dirait.
  const RAPPELS = readFileSync(new URL('../lib/rappels.js', import.meta.url), 'utf8')
  const minutes = Number(RAPPELS.match(/RAPPEL_RDV_MIN\s*=\s*(\d+)/)?.[1] || 0)
  verifier('le délai du rappel RDV se lit dans le code', minutes > 0, `${minutes} min`)
  verifier('et la landing annonce ce délai-là',
    minutes === 60 ? /une heure avant/i.test(dit) : new RegExp(`${minutes}`).test(dit),
    `code : ${minutes} min · page : ${dit.slice(-40)}`)

  // ⚠️ ET PERSONNE NE REDESSINE CE QUE LA CAPTURE PROUVE. Une maquette du même
  // écran remise à côté d'elle ferait deux fois le même geste dans la page, et
  // rouvrirait le défaut du 13/09 : un dessin qui vieillit sans le dire.
  verifier('aucune maquette ne redouble la capture du rendez-vous',
    !/function MockRdv\(/.test(LANDING))
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. LES CAPTURES SONT AFFICHÉES, DES DEUX CÔTÉS, SUR LE BON FOND
// ═══════════════════════════════════════════════════════════════════════════
{
  // 🔴 LA SÉRIE COMMERÇANT VIT À DEUX ENDROITS DEPUIS LE 22/09, et c'est ce qui
  // rend cette garde délicate. La capture du tableau de bord a remplacé une
  // maquette, à la place de cette maquette ; les autres forment le bloc de
  // preuve plus bas. La page les sépare avec un `find` sur une clé.
  //
  // 🔴 UN `find` QUI NE TROUVE RIEN NE CASSE RIEN, IL EFFACE. Une clé mal
  // orthographiée fait disparaître le visuel de la page d'accueil sans qu'une
  // ligne ne bronche, sans erreur, sans écran blanc. C'est exactement le genre
  // de panne muette que ce banc existe pour attraper.
  // ⚠️ REPOINTÉE LE 14/10 : les deux séries (le bloc de preuve commerçant et
  // la série Yopper) sont devenues UN carrousel, `CAPTURES_CARROUSEL`, qui
  // commence par le tableau de bord. Les mêmes pannes muettes restent
  // possibles, et c'est elles qu'on vise : une clé qui ne trouve rien efface.
  verifier('le carrousel de preuve est affiché',
    /CAPTURES_CARROUSEL\.map/.test(LANDING))
  verifier('la capture du tableau de bord ouvre le carrousel',
    /const CAPTURES_CARROUSEL = \[CAPTURE_DASHBOARD,/.test(LANDING))
  {
    const cles = [...(LANDING.match(/const CLES_CARROUSEL = \[([^\]]*)\]/)?.[1] || '').matchAll(/'([^']+)'/g)].map(m => m[1])
    verifier('le carrousel nomme ses captures', cles.length >= 3, `${cles.length} clé(s)`)
    const absentes = cles.filter(k => !CAPTURES_YOPPER.some(c => c.cle === k))
    verifier('🔴 chaque clé du carrousel existe vraiment (un find vide efface sans rien dire)',
      absentes.length === 0, absentes.join(', '))
    verifier('six captures au plus (brief du 14/10)', cles.length + 1 <= 6, `${cles.length + 1}`)
    // La capture de l'ESSAI affiche l'ancienne fin au 8 janvier : elle ne
    // doit pas revenir tant qu'elle n'est pas refaite.
    verifier('la capture qui affiche l’ancienne fin d’essai n’est pas montrée',
      !cles.includes('dashboard_essai') && !/CAPTURES_PREUVE/.test(LANDING))
  }

  {
    const cleLue = LANDING.match(/const CLE_DASHBOARD = '([^']+)'/)?.[1] || ''
    verifier('la page nomme la clé qu’elle cherche', cleLue.length > 0, cleLue)
    verifier('et cette clé existe vraiment dans la liste',
      CAPTURES_COMMERCANT.some(c => c.cle === cleLue),
      `cherchée : « ${cleLue} » · présentes : ${CAPTURES_COMMERCANT.map(c => c.cle).join(', ')}`)
  }
  // 🔴 UN TITRE BLANC SUR FOND CLAIR NE SE VOIT PAS, ET RIEN NE LE DIT.
  // ⚠️ REPOINTÉE LE 14/10 : le carrousel vit dans une section CLAIRE (pas
  // `lp-noir`, pas `lp-calc`), et sa légende prend l'encre de la page.
  {
    const iCarrousel = LANDING.indexOf('CAPTURES_CARROUSEL.map')
    const section = LANDING.slice(LANDING.lastIndexOf('<section', iCarrousel), iCarrousel)
    verifier('le carrousel est posé sur un fond clair',
      /lp-section-captures/.test(section) && !/lp-noir|lp-calc|lp-habitants/.test(section), section.slice(0, 90))
    verifier('et sa légende prend l’encre de la page',
      /\.lp-captures figcaption \{[^}]*color: \$\{T\.ink\}/.test(LANDING))
    // ⚠️ Une piste qui déborde passe par `BandeDefilante` (règle d'Alex du 15/08).
    verifier('le carrousel passe par BandeDefilante',
      /<BandeDefilante libelle="les captures" className="lp-captures">/.test(LANDING))
  }

  verifier('les deux séries sont non vides',
    CAPTURES_YOPPER.length > 0 && CAPTURES_COMMERCANT.length > 0)

  // ═════════════════════════════════════════════════════════════════════════
  // 🔴 LE TEXTE D'ANNONCE S'ACCORDE AU NOMBRE DE CAPTURES (22/09)
  // ═════════════════════════════════════════════════════════════════════════
  //
  // 🔴 TROUVÉ PAR ALEX, EN PRODUCTION, À L'ŒIL NU : « et ça, ce ne sont pas des
  // maquettes... il y a UNE image en dessous. » Le retrait des deux captures de
  // l'inscription, la veille, avait laissé leur chapeau en place : un titre et
  // un sous-titre au PLURIEL au-dessus d'une seule figure. Le banc était vert à
  // 93 vérifications pendant ce temps, parce qu'il ne mesurait que la PRÉSENCE
  // d'un `.map` et jamais l'accord entre ce qui est dit et ce qui est montré.
  //
  // ⚠️ LA GARDE EST BORNÉE DES DEUX CÔTÉS, ET ÇA COMPTE DOUBLE ICI. Une tranche
  // ouverte (`split(...)[1]`) court jusqu'à la fin du fichier : elle trouverait
  // le chapeau de l'AUTRE série, qui est au pluriel à bon droit avec ses neuf
  // captures, et resterait verte quoi qu'il arrive au bloc commerçant. On prend
  // donc exactement ce qui vit ENTRE la condition et le rendu, là où le chapeau
  // d'une série se trouve, et on vérifie que le cadrage n'a pas glissé.
  {
    // ⚠️ LE BLOC DE PREUVE NE REND PLUS TOUTE LA SÉRIE COMMERÇANT : la capture du
    // tableau de bord est rendue ailleurs. C'est donc le nombre d'images DE CE
    // BLOC qu'il faut accorder à son chapeau, pas le nombre d'entrées de la
    // liste. Compter la liste entière ici rendrait la garde fausse le jour où
    // une troisième capture part à un troisième endroit.
    // ⚠️ REPOINTÉE LE 14/10 : une seule série, le carrousel, et son nombre
    // d'images est celui de ses clés plus le tableau de bord.
    const nbCarrousel = [...(LANDING.match(/const CLES_CARROUSEL = \[([^\]]*)\]/)?.[1] || '').matchAll(/'([^']+)'/g)].length + 1
    const SERIES = [
      { nom: 'du carrousel', cle: 'CAPTURES_CARROUSEL', liste: { length: nbCarrousel } },
    ]
    // ⚠️ LES APOSTROPHES SONT DES ENTITÉS DANS CE JSX (`n&rsquo;est`). Une regex
    // écrite avec une apostrophe ordinaire ne trouverait jamais rien et la garde
    // naîtrait verte.
    const APO = '(?:&rsquo;|’|\')'
    const PLURIEL = new RegExp(`ce ne sont pas|ce sont des|ce sont les|les écrans que tu verras`, 'i')
    const SINGULIER = new RegExp(`ce n${APO}est pas une|c${APO}est l${APO}écran que tu verras|une seule capture`, 'i')

    for (const s of SERIES) {
      const debut = LANDING.indexOf(`${s.cle}.length > 0`)
      const rendu = LANDING.indexOf(`${s.cle}.map(`, debut)
      const chapeau = debut >= 0 && rendu > debut ? LANDING.slice(debut, rendu) : ''

      // Le cadrage lui-même : si ces deux repères s'éloignent, on ne mesure plus
      // le chapeau mais la moitié de la page.
      verifier(`le chapeau de la série ${s.nom} est cadré`,
        chapeau.length > 0 && chapeau.length < 1500, `${chapeau.length} caractères`)

      if (s.liste.length === 1) {
        verifier(`la série ${s.nom} n’annonce pas plusieurs images pour une seule`,
          !PLURIEL.test(chapeau), chapeau.match(PLURIEL)?.[0] || '')
      } else {
        verifier(`la série ${s.nom} n’annonce pas une seule image pour ${s.liste.length}`,
          !SINGULIER.test(chapeau), chapeau.match(SINGULIER)?.[0] || '')
      }
    }
  }

  // Chaque capture doit dire ce qu'elle montre, sinon la légende ne sert à
  // rien : un titre sans phrase laisse le lecteur deviner ce qu'il regarde.
  for (const c of [...CAPTURES_YOPPER, ...CAPTURES_COMMERCANT]) {
    verifier(`« ${c.cle} » porte un titre et une légende`,
      typeof c.titre === 'string' && c.titre.trim().length >= 10 &&
      typeof c.legende === 'string' && c.legende.trim().length >= 40, c.titre)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. LES COMPTEURS D'UN COMPTE DE TEST NE PARTENT PAS EN LIGNE
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 CETTE GARDE PROTÈGE UNE DÉCISION, PAS UN FICHIER. L'écran du profil montre
// le temps économisé, et c'est l'argument le plus touchant de l'application :
// il reviendra sur la table, et il sera tentant de le publier « puisqu'il est
// beau ». Ses chiffres sont ceux d'un compte de test, gonflés par des mois
// d'essais : les montrer promet un usage que personne n'a encore.
//
// C'est la même règle que les zéros d'un commerce de démonstration, prise par
// l'autre bout. Le jour où un vrai Yopper aura de vrais chiffres, on refera la
// capture, et cette garde tombera avec une phrase d'explication.
{
  verifier('aucun cadrage ne vise l’écran du profil de test',
    !/IMG_4665/.test(CADRAGES))
  verifier('aucune capture du temps économisé n’est déclarée',
    ![...CAPTURES_YOPPER, ...CAPTURES_COMMERCANT].some(c => /active|profil|temps/i.test(c.fichier)),
    [...CAPTURES_YOPPER, ...CAPTURES_COMMERCANT].map(c => c.fichier).join(', '))

  // ⚠️ ET LE CADRAGE RESTE UNE DÉCISION HUMAINE. Le script ignore toute image
  // sans entrée dans CADRAGES : c'est ce refus qui empêche une capture non
  // regardée, portant une adresse ou un code de bon, d'atterrir en ligne.
  verifier('une image sans cadrage décidé reste ignorée',
    /if \(!c\) \{/.test(CADRAGES) && /continue/.test(CADRAGES))
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. LA FICHE DE COMMANDE ET LES CARTES DE FIDÉLITÉ DISENT LE PRODUIT
// ═══════════════════════════════════════════════════════════════════════════
//
// Les deux maquettes les plus anciennes de la landing, refaites le 13/09 après
// qu'Alex les a pointées comme « trop éloignées de la vraie app ».
{
  // ⚠️ REPOINTÉE LE 14/10 : `MockFiche`, `VignetteArticle` et `MockFidelite`
  // sont partis avec la landing v2. La fiche de commande est montrée par une
  // CAPTURE (`yopper_options`), qui ne peut pas s'éloigner de l'écran réel.
  // Ce qui reste à garder, c'est ce que la page DIT de la fidélité : la règle
  // des deux mécaniques, exécutée, et aucune promesse en euros sur des
  // passages.
  verifier('aucune maquette de fiche ni de fidélité n’est redessinée à côté des captures',
    !/function (MockFiche|MockFidelite|VignetteArticle)\(/.test(LANDING))
  verifier('la fidélité est dite par le numéro de GSM',
    /numéro de GSM/.test(LANDING))
  const fid = LANDING

  // 🔴 ET CE QUE CES GARDES NE REGARDAIENT PAS : CE QUE LA CARTE PROMET.
  // Elles comptaient les cartes, cherchaient un `gagne: true` et la phrase du
  // GSM. Pendant ce temps la maquette annonçait « 9/10 passages → le 11e te
  // fait gagner 5 € », six jours après que la refonte du 16/09 ait supprimé le
  // montant fixe en euros. Un banc vert, une page d'accueil qui vendait une
  // mécanique que plus aucun commerçant ne peut régler.
  //
  // ⚠️ LA GARDE NE RECOPIE PAS LA RÈGLE, ELLE L'EXÉCUTE. `recompenseDue` décide
  // seule de l'unité de chaque mécanique ; on lui demande, et on compare à ce
  // que l'écran affiche. Le jour où l'unité change, la maquette rougit.
  const duePassages = recompenseDue(presetFidelite('alimentaire'))
  const dueCagnotte = recompenseDue(presetFidelite('detail'))
  verifier('le code rend un POURCENTAGE sur la mécanique à passages',
    duePassages.type === 'remise_pct', duePassages.type)
  verifier('et un MONTANT sur la mécanique à cagnotte',
    dueCagnotte.type === 'remise_montant', dueCagnotte.type)

  // 🔴 LE DÉFAUT DU 22/09, VISÉ SUR TOUT LE TEXTE DE LA PAGE : un montant en
  // euros promis sur des PASSAGES, alors que la refonte du 16/09 a supprimé le
  // montant fixe. Toute phrase de la page et des captures qui parle de
  // passages ne doit annoncer aucun euro.
  const TEXTES_FID = [
    ...[...fid.matchAll(/'([^'\\\n]{3,200})'/g)].map(m => m[1]),
    ...[...CAPTURES_YOPPER, ...CAPTURES_COMMERCANT].flatMap(c => [c.alt, c.legende, c.titre]).filter(Boolean),
  ]
  const enPassages = TEXTES_FID.filter(t => /passages?/i.test(t))
  verifier('aucune phrase sur des passages ne promet un montant en euros',
    enPassages.every(t => !/\d\s*€/.test(t)), enPassages.filter(t => /\d\s*€/.test(t)).join(' | '))

  // ⚠️ ET LE PASSAGE QUI DÉCLENCHE. `appliquerCredit` débloque sur
  // `passages >= seuil` : c'est le 10e qui remplit la carte. La version
  // précédente annonçait « le 11e », soit un passage de plus que la règle.
  verifier('aucune carte ne décale le passage qui déclenche',
    !/le 11e|11e passage/i.test(fid))
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. LE GOOD MORNING YOPPERS EST UNE ÉDITION, PAS UN FIL D'ACTUALITÉ
// ═══════════════════════════════════════════════════════════════════════════
//
// L'ancienne maquette montrait un bandeau violet et trois cartes empilées :
// n'importe quelle application fait ça. Le vrai écran est une carte qui s'ouvre
// par-dessus l'application, DATÉE, NUMÉROTÉE, rattachée à une commune, avec deux
// onglets qui comptent ce qu'il y a dedans et un pied qui donne rendez-vous au
// lendemain. C'est cette forme de journal qui explique pourquoi on l'ouvre, et
// aucun de ces éléments n'était là.
{
  // ⚠️ REPOINTÉE LE 14/10 : `MockMorning` est parti avec la landing v2. Ce qui
  // reste à garder est la PROMESSE que la page fait du Good Morning, et c'est
  // là que la page en ligne mentait (erreur n° 1 du brief, « la plus grave ») :
  // « chaque matin, ton commerce part dans le Good Morning Yoppers, même en
  // Exister ». En Exister, c'est une actu par semaine ; chaque matin, c'est
  // Communiquer. La garde lit la grille ET le texte.
  verifier('en Exister, la présence au Good Morning passe par une actu, sans actus illimitées',
    PLAN_FEATURES.exister?.actu_gmy === true && PLAN_FEATURES.exister?.actus_illimitees === false
    && PLAN_FEATURES.communiquer?.actus_illimitees === true)
  verifier('🔴 la page ne promet jamais « chaque matin » à Exister',
    !/Même en Exister|même en Exister/.test(LANDING) && !/chaque matin[^.]{0,80}Exister/.test(LANDING))
  verifier('la grille dit « chaque semaine » pour Exister',
    /'Une place chaque semaine dans le Good Morning Yoppers'/.test(LANDING))
  verifier('et la page dit la différence en une phrase',
    /chaque semaine en Exister, chaque matin en Communiquer/.test(LANDING))
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. LA LANDING N'AFFICHE AUCUNE ENSEIGNE DE DÉMONSTRATION
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 TROIS Y ÉTAIENT, EN PRODUCTION, ET C'EST ALEX QUI LES A VUES. « La mie de
// test » affichait le mot TEST sur la page qui recrute les commerçants. Les
// deux autres désignent des commerces qui existent vraiment en base : leur
// prêter une fausse offre du soir ou une fausse carte de fidélité sur une page
// publique, c'est écrire à leur place.
//
// ⚠️ LA GARDE VISE LES PAGES PUBLIQUES, PAS LE CODE ENTIER. Ces mêmes noms
// vivent dans des commentaires de `lib/` qui racontent des cas vécus, et ils y
// sont utiles : c'est l'AFFICHAGE qui est en cause, pas la mention.
//
// 🔴 ET CETTE GARDE ÉTAIT VERTE EN NE REGARDANT PRESQUE RIEN (constaté le
// 22/09). Son filet général cherchait `enseigne: '...'` : DEUX noms sur la
// vingtaine que les maquettes affichent, parce que les autres s'écrivent
// `n:`, `nom:`, ou directement dans le JSX. Elle couvrait 10 % de la page et
// répondait « tout va bien » pour les 90 % restants. Le piège n'est pas la
// regex, c'est d'avoir visé une CLÉ là où il fallait viser le TEXTE AFFICHÉ.
//
// 🔴 ELLE NE REGARDAIT QUE LA LANDING, ALORS QUE LA PAGE MONTRE DES IMAGES.
// Depuis le 22/09 elle affiche dix captures, et leurs `alt` et légendes sont
// du texte public comme le reste : une légende qui nommerait une enseigne
// passait sous la garde. Elles sont balayées ici aussi.
//
// ⚠️ CE QUE CETTE GARDE NE PEUT PAS FAIRE, ET IL FAUT L'ÉCRIRE : elle lit du
// texte, pas des pixels. Ce qu'une capture montre À L'ÉCRAN (le nom d'un
// commerce sur sa fiche, un prix, une adresse) ne se vérifie qu'en ouvrant
// l'image. C'est le prix des captures, et ce contrôle-là reste humain.
{
  const DEMOS = ['Kebabistro', 'La mie de test', 'La Boutique Témoin', 'Ciseaux et Soins', 'Centre Respire']
  // Le texte public de la page : les maquettes ET ce que les captures disent.
  const TEXTES_CAPTURES = [...CAPTURES_YOPPER, ...CAPTURES_COMMERCANT]
    .flatMap(c => [c.alt, c.legende, c.titre]).filter(Boolean)
  const PUBLIC = `${LANDING}\n${TEXTES_CAPTURES.join('\n')}`

  for (const nom of DEMOS) {
    verifier(`la page n’affiche pas l’enseigne « ${nom} »`, !PUBLIC.includes(nom))
  }

  // ⚠️ ET LA RÈGLE AU-DELÀ DE CES CINQ NOMS : rien de ce que la page affiche ne
  // se dit un essai. On balaie TOUTES les chaînes littérales du fichier
  // dépouillé, plus les textes des captures, au lieu d'une seule clé.
  const ESSAI = /\b(tests?|t[ée]moins?|d[ée]mos?)\b/i
  const affichees = [...LANDING.matchAll(/'([^'\\\n]{3,80})'/g)].map(m => m[1])
  const fautives = [...affichees, ...TEXTES_CAPTURES].filter(t => ESSAI.test(t))
  verifier('rien de ce que la page affiche ne se dit de test',
    fautives.length === 0, fautives.join(' | '))

  // 🔴 ET LE COMPTEUR, PARCE QU'UNE LISTE VIDE PASSE TOUJOURS. C'est ce défaut
  // exact qui rendait la version précédente complice : deux chaînes examinées,
  // vert franc. Si la page cesse d'être lisible ici, la garde doit le dire.
  verifier('la garde regarde vraiment le texte de la page',
    affichees.length > 300 && TEXTES_CAPTURES.length >= 12,
    `${affichees.length} chaînes · ${TEXTES_CAPTURES.length} textes de captures`)
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. LE CALCULATEUR LIT LA MATRICE, ET DIT LA VÉRITÉ QUAND ELLE NOUS DESSERT
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 LA GARDE LA PLUS IMPORTANTE DE CE BANC. La formule d'un poste est DÉDUITE
// de `PLAN_FEATURES` et jamais recopiée : le jour où une capacité change de
// palier, le calculateur suit tout seul. Une table de correspondance écrite en
// dur continuerait d'annoncer l'ancien prix sans que rien ne casse, et c'est
// exactement le défaut qu'Alex a vu à la main : la fidélité est dans
// COMMUNIQUER à 19,90 €, et le calculateur répondait 49,90 € à un commerçant
// qui ne paie que ça.
{
  const calc = LANDING.split('function CalculateurCommission()')[1]?.split('\nfunction ')[0] || ''
  const res = LANDING.split('function ResultatCalcul(')[1]?.split('\nfunction ')[0] || ''
  verifier('le calculateur est écrit', calc.length > 1000)
  verifier('il est monté sur la landing', /<CalculateurCommission\/>/.test(LANDING))

  verifier('la formule d’un poste est déduite de la matrice',
    /PLANS\.find\(p => canDo\(p, capacite\)\)/.test(LANDING))
  verifier('aucun poste ne code sa formule en dur',
    !/formule: '(exister|communiquer|vendre)'/.test(LANDING))
  verifier('chaque poste déclare la capacité qui le couvre',
    (LANDING.match(/capacite: '/g) || []).length >= 10)
  verifier('les prix viennent de getPrixPlan',
    /getPrixPlan\(formule\)/.test(calc))

  // ⚠️ REPOINTÉE LE 14/10 : DEUX MODES. Le pourcentage et le montant par
  // commande ne sont plus deux onglets exclusifs (Alex : beaucoup prennent
  // LES DEUX, « 0,50 par commande » en plus du pourcentage) ; ils s'ajoutent
  // dans le même onglet. Le mode des abonnements reste.
  for (const m of ['pct', 'abo']) {
    verifier(`le mode « ${m} » existe`, new RegExp(`'${m}'`).test(calc))
  }
  verifier('🔴 le pourcentage ET le montant par commande s’additionnent',
    /paye = v \* p \/ 100 \+ n \* f/.test(calc))
  // 🔴 L'ERREUR N° 7 DU BRIEF : le champ était prérempli à 14 %. C'est le
  // chiffre du commerçant, jamais le nôtre : tous les champs partent VIDES,
  // l'exemple n'est qu'un texte gris.
  verifier('🔴 les champs du calcul partent vides',
    ['ventes', 'commandes', 'taux', 'parCommande'].every(c => new RegExp(`const \\[${c}, set\\w+\\] = useState\\(''\\)`).test(calc)))
  verifier('et l’exemple n’est qu’un texte gris (placeholder)',
    /placeholder=\{exemple\}/.test(LANDING) && /exemple="14"/.test(calc))
  verifier('aucun poste d’abonnement n’est coché d’avance',
    /\{ actif: false, prix: p\.prix \}/.test(calc) && !/defaut: true/.test(LANDING))
  // Le comparatif PAR JOUR (Alex, 14/10), sur l'année entière.
  verifier('le résultat se lit aussi par jour, sur l’année entière',
    /const jourEux = paye \* 12 \/ 365/.test(calc) && /const jourNous = prixFormule \* 12 \/ 365/.test(calc))
  // ✅ LE TICKET (Alex, 14/10) : une commande moyenne tirée de SES chiffres.
  // 🔴 Un panier par défaut serait NOTRE chiffre déguisé en le sien : le
  // ticket n'existe que si ses ventes ET ses commandes sont saisies.
  verifier('🔴 le panier du ticket vient de ses chiffres, jamais d’une valeur par défaut',
    /const panier = mode === 'pct' && v > 0 && n > 0 \? v \/ n : 0\n/.test(calc))
  verifier('le ticket ne s’affiche que s’il a un panier et une part prise',
    /\{panier > 0 && prisParCommande > 0 && \(/.test(calc))
  verifier('le ticket Yoppaa nomme sa commission avec son sujet',
    /<span>Commission Yoppaa<\/span><span>\{euro\(0, true\)\}<\/span>/.test(calc))
  // « 0,50 » se tape avec une virgule : sans conversion, Number() rend NaN.
  verifier('une virgule décimale est comprise', /replace\(',', '\.'\)/.test(LANDING))

  // 🔴 ET LE VERDICT QUI NOUS DONNE TORT. Un calculateur qui ne peut jamais
  // conclure contre son auteur se repère en trois secondes, et il emporte le
  // reste de la page. À petit volume, la commission gagne : on le dit, et on
  // renvoie vers la formule gratuite.
  verifier('le résultat prévoit le cas où la commission coûte moins cher',
    /ecart <= 0/.test(res))
  verifier('et renvoie alors vers la formule gratuite',
    /gratuit à vie/.test(res))

  // ⚠️ L'ACCORD SUIT LE MOT PORTEUR (Alex, 13/09). Quand la page écrit « LA
  // FORMULE Exister », le féminin est juste ; quand « Exister » est seul, il se
  // lit comme le nom du forfait et prend le masculin. Laisser « gratuite » sans
  // le mot formule obligeait le lecteur à retrouver un mot absent.
  // ⚠️ REPOINTÉE LE 14/10 : `RangeeMaquettes` est partie ; la zone du
  // calculateur se ferme sur le composant qui le suit, `CompteurJours`.
  const zoneAccord = LANDING.split('const POSTES_CALCUL')[1]?.split('function CompteurJours')[0] || ''
  verifier('Exister employé seul ne prend pas le féminin',
    !/Exister<\/strong>, qui est gratuite|Exister, qui est gratuite/.test(zoneAccord))

  // 🔴 LA LIVRAISON N'EST PAS RÉSERVÉE À L'ALIMENTAIRE, ET LE DIRE ÉCARTAIT LES
  // BOUTIQUES. La capacité `livraison` ne désigne que la TOURNÉE ; un commerce
  // de détail sert ses clients à domicile en EXPÉDIANT (`boutique_mode_vente`).
  // Décision d'Alex du 27/08, déjà écrite dans lib/signaux.js : c'est le besoin
  // du client qu'on nomme, pas le nom de notre mécanique.
  verifier('la livraison nomme la tournée ET l’expédition',
    /Livraison à domicile : ta tournée en alimentaire, l\\'expédition pour une boutique/.test(LANDING))
  verifier('et ne la réserve pas à l’alimentaire',
    !/Livraison[^']{0,40}pour l\\'alimentaire/.test(LANDING))

  // ⚠️ « LA COMMISSION YOPPAA », JAMAIS LA FORMULE NUE.
  verifier('la commission est toujours nommée avec son sujet',
    /la commission Yoppaa sur tes ventes/.test(calc))
  verifier('ce que Yoppaa ne fait pas est dit dans le mode abonnements',
    /ta caisse, ton stock ou les plannings/.test(calc))

  // ⚠️ ON NE NOMME AUCUNE PLATEFORME : publicité comparative, et le commerçant
  // qu'on recrute est souvent déjà leur client.
  //
  // 🔴 LA ZONE TESTÉE PART DE `POSTES_CALCUL`, PAS DU CORPS DE LA FONCTION. La
  // première version ne regardait que l'intérieur de `CalculateurCommission` :
  // les noms de postes sont déclarés AU-DESSUS, une marque glissée dans l'un
  // d'eux passait sans rien faire rougir. Trouvé par mutation, comme le
  // découpage de la vignette : borner trop court est aussi faux que ne pas
  // border du tout.
  const zoneCalc = LANDING.split('const POSTES_CALCUL')[1]?.split('function CompteurJours')[0] || ''
  verifier('la zone du calculateur est bien cadrée',
    zoneCalc.length > 3000 && zoneCalc.length < 40000, `${zoneCalc.length} caractères`)
  for (const marque of ['Uber', 'Deliveroo', 'Takeaway', 'TheFork', 'Planity', 'Salonkee', 'Fidelybox']) {
    verifier(`le calculateur ne nomme pas ${marque}`, !new RegExp(marque, 'i').test(zoneCalc))
  }
  // ⚠️ ÉTENDUE LE 14/10 À TOUTE LA PAGE : la v2 pique dans chaque bloc (la
  // bande des secteurs, « pas pour toi », le titre), et c'est là qu'un nom
  // glisserait. Décision d'Alex au tableau : piquer SANS NOMMER. Fritzy est
  // la publicité qu'il a montrée en exemple ce jour-là.
  for (const marque of ['Uber', 'Deliveroo', 'Takeaway', 'Just Eat', 'TheFork', 'Planity', 'Salonkee', 'Fidelybox', 'Fritzy', 'Treatwell', 'Zenchef']) {
    verifier(`la page ne nomme pas ${marque}`, !new RegExp(marque, 'i').test(LANDING))
  }

  // La newsletter n'est pas ouverte : le calculateur ne la vend pas.
  verifier('aucun poste ne s’appuie sur la newsletter, qui n’est pas ouverte',
    !/capacite: 'newsletter_ciblee'/.test(LANDING))
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. « ON T'APPELLE » : UN CONTACT, JAMAIS UN RELAIS DE COURRIER (14/10)
// ═══════════════════════════════════════════════════════════════════════════
//
// Alex : « un contact s'ils ont des questions ? Tu veux une démo ? ». Un
// formulaire public qui envoie des emails est exactement la forme du défaut
// le plus grave de l'audit du 21/08 (`notify-yoppaa`, relais ouvert). Les
// verrous se gardent un par un.
{
  const ROUTE = sansProse(readFileSync(new URL('../app/api/contact-pro/route.js', import.meta.url), 'utf8'))
  verifier('🔴 la demande part vers Yoppaa seul, jamais vers une adresse du corps',
    /await envoyerAuAdmin\(\{/.test(ROUTE) && !/\bto\s*:/.test(ROUTE) && !/envoyerAuCommercant|envoyerAuYopper/.test(ROUTE))
  verifier('🔴 tout ce que l’appelant écrit est échappé avant d’entrer dans l’email',
    /\$\{echapperHtml\(v\)\}/.test(ROUTE) && /\$\{nomCommerce\.slice\(0, 60\)\}/.test(ROUTE))
  verifier('le motif vient d’une liste fermée',
    /motifsActifs\(\)\.find\(m => m\.cle === motif\)/.test(ROUTE))
  verifier('🔴 sur un site déployé, sans clé anti-robot, on refuse',
    /if \(verdict\.skipped && deploye\)/.test(ROUTE) && /status: 503/.test(ROUTE))
  verifier('un envoi qui échoue est dit au commerçant',
    /if \(envoi && envoi\.ok === false\)/.test(ROUTE))
  verifier('le GSM est validé par la règle commune',
    /if \(!telephoneValide\(gsm\)\)/.test(ROUTE))

  verifier('le bloc « On t’appelle » est monté sur la page',
    /<OnTeRappelle siteKey=\{siteKey\}\/>/.test(LANDING))
  verifier('il a son propre anti-robot, pas celui des habitants',
    /callback: \(t\) => setJeton\(t\)/.test(LANDING))
  verifier('WhatsApp passe par lib/contact, aucun numéro recopié',
    /href=\{lienWhatsApp\(\)\}/.test(LANDING) && !/wa\.me/.test(LANDING))
  verifier('l’encodage offert suit son drapeau, partout où il est dit',
    (LANDING.match(/\{ENCODAGE_OFFERT && /g) || []).length >= 3)
  verifier('la barre du pouce est montée, et respecte le bas de l’iPhone',
    /<BarrePouce visible=\{barrePouce\}\/>/.test(LANDING) && /env\(safe-area-inset-bottom\)/.test(LANDING))
}

console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Vitrine de la landing verte.')
