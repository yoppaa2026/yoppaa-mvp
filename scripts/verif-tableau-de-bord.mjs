// BANC : les règles du tableau de bord commerçant.
//
// ⚠️ LES DEUX RÈGLES SONT PURES ET S'EXÉCUTENT ICI. Le branchement des écrans,
// lui, se vérifie au source EN DÉCOUPANT LA SECTION concernée.
//
//   npm run verif:bord

import { readFileSync } from 'node:fs'
import { retourArriereAutorise, alerteAutreOnglet, travailEnAttente, indexBlocages, appliquerBlocage, etatCreneau } from '../lib/tableau-de-bord.js'
import { calculerCapaciteCreneau } from '../lib/creneaux.js'
import { chiffreAffaires } from '../lib/statistiques.js'

let ok = 0
const echecs = []
const verifie = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  echecs.push(`${nom}${detail ? ` — ${detail}` : ''}`)
}

// ═══ 1) LE RETOUR ARRIÈRE, ET IL N'Y EN A QU'UN ═══════════════════════════
//
// ⚠️ CE BANC PROTÈGE SURTOUT CE QUI N'EST **PAS** OFFERT. Alex a demandé un
// retour arrière général, puis a demandé s'il était nécessaire avant que je
// code : trois des quatre transitions ne méritent pas de bouton, et l'une
// d'elles ferait un dégât de stock. Élargir la règle « pour bien faire » est
// donc le risque numéro un ici.
{
  const retrait = { statut: 'recupere', mode_retrait: 'retrait' }
  const r = retourArriereAutorise(retrait)
  verifie('un retrait récupéré se défait', !!r)
  verifie('et il revient en « prête »', r?.versStatut === 'pret', r?.versStatut)
  verifie('le bouton dit le geste, pas le statut',
    /Annuler le retrait/.test(r?.libelle || ''), r?.libelle)
  verifie('un retrait ne touche pas au statut de livraison', r?.effaceStatutLivraison === false)

  const liv = retourArriereAutorise({ statut: 'recupere', mode_retrait: 'livraison' })
  verifie('une livraison livrée se défait', !!liv)
  // ⚠️ SANS CECI, la commande redeviendrait active tout en restant hors de la
  // tournée : le commerçant la verrait sans jamais pouvoir la relivrer.
  verifie('et son statut de livraison est effacé', liv?.effaceStatutLivraison === true)
  verifie('son bouton parle de livraison', /Annuler la livraison/.test(liv?.libelle || ''), liv?.libelle)

  // 🔴 LES QUATRE REFUS, ET CHACUN A SA RAISON.
  verifie('🔴 « non retirée » ne se défait PAS (le stock a été rendu)',
    retourArriereAutorise({ statut: 'non_retire', mode_retrait: 'retrait' }) === null)
  verifie('🔴 une expédition ne se défait PAS (le colis est parti)',
    retourArriereAutorise({ statut: 'recupere', mode_retrait: 'expedition' }) === null)
  verifie('« prête » ne se défait pas (l\'email est déjà parti)',
    retourArriereAutorise({ statut: 'pret', mode_retrait: 'retrait' }) === null)
  verifie('« en préparation » non plus (un clic raté n\'y coûte rien)',
    retourArriereAutorise({ statut: 'en_preparation', mode_retrait: 'retrait' }) === null)
  verifie('une commande annulée ne revient pas',
    retourArriereAutorise({ statut: 'annule', mode_retrait: 'retrait' }) === null)
  verifie('aucun argument ne casse rien', retourArriereAutorise() === null)
  verifie('une commande absente non plus', retourArriereAutorise(null) === null)

  // ⚠️ 🔴 LE RELEVÉ DU COMPTOIR S'EFFACE, ET J'AVAIS TRANCHÉ L'INVERSE.
  // Alex l'a vu à l'essai le 23/08 : la commande revenait dans la liste « à
  // remettre » en restant marquée PAYÉE. Il n'y a qu'UN clic — la fenêtre
  // d'encaissement s'ouvre AU MOMENT de la remise depuis le 17/08 — donc un
  // clic raté emporte forcément une réponse ratée sur le paiement.
  verifie('🔴 un relevé au comptoir s\'efface avec la remise',
    retourArriereAutorise({ statut: 'recupere', mode_retrait: 'retrait', encaisse_mode: 'especes' })
      ?.effaceEncaissement === true)
  verifie('🔴 un paiement par terminal aussi',
    retourArriereAutorise({ statut: 'recupere', mode_retrait: 'retrait', encaisse_mode: 'terminal' })
      ?.effaceEncaissement === true)
  // ⚠️ `'rien'` EST UNE RÉPONSE, PAS UNE ABSENCE : c'est l'impayé assumé. Elle
  // a été donnée sur le même clic raté, elle part avec.
  verifie('un impayé assumé s\'efface aussi',
    retourArriereAutorise({ statut: 'recupere', mode_retrait: 'retrait', encaisse_mode: 'rien' })
      ?.effaceEncaissement === true)
  verifie('sans relevé, il n\'y a rien à effacer', r?.effaceEncaissement === false)
  // ⚠️ ET UNE LIVRAISON RÉGLÉE AU LIVREUR SUIT LA MÊME RÈGLE, sans quoi le cas
  // le plus exposé — le liquide, loin du comptoir — serait le seul oublié.
  verifie('une livraison encaissée au livreur s\'efface aussi',
    retourArriereAutorise({ statut: 'recupere', mode_retrait: 'livraison', encaisse_mode: 'especes' })
      ?.effaceEncaissement === true)

  // ⚠️ ET L'AIDE DIT CE QUE ÇA EFFACE. Une conséquence sur l'argent ne se
  // découvre pas après coup (feedback_information_complete). Mais elle ne
  // s'affiche pas quand il n'y a rien à effacer : elle inquiéterait pour rien.
  const aideAvec = retourArriereAutorise({ statut: 'recupere', mode_retrait: 'retrait', encaisse_mode: 'especes' })?.aide || ''
  verifie('l\'aide annonce ce que le retour efface', /relevé au comptoir est effacé/.test(aideAvec), aideAvec)
  verifie('et elle dit que la question se reposera', /se reposera/.test(aideAvec))
  verifie('sans relevé, l\'aide ne parle pas d\'argent', !/comptoir/.test(r?.aide || ''), r?.aide)

  // ⚠️ 🔴 LE PAIEMENT EN LIGNE N'EST JAMAIS TOUCHÉ. L'argent est chez Stripe,
  // il ne doit rien à ce clic. La règle ne doit même pas nommer ce champ.
  verifie('🔴 la règle ne parle JAMAIS du paiement en ligne',
    !Object.keys(r || {}).some(k => /ligne|stripe/i.test(k)),
    Object.keys(r || {}).join(', '))
  verifie('🔴 et une commande payée en ligne sans relevé n\'efface rien',
    retourArriereAutorise({ statut: 'recupere', mode_retrait: 'retrait', paye_en_ligne: true })
      ?.effaceEncaissement === false)
}

// ═══ 2) « TU AS DU TAF DE L'AUTRE CÔTÉ » ══════════════════════════════════
{
  const cmds = [
    { mode_retrait: 'retrait',   statut: 'en_attente' },
    { mode_retrait: 'retrait',   statut: 'en_preparation' },
    { mode_retrait: 'retrait',   statut: 'pret' },          // attend LE CLIENT
    { mode_retrait: 'retrait',   statut: 'recupere' },      // terminée
    { mode_retrait: 'livraison', statut: 'en_attente' },
    // ⚠️ AJOUTÉE PARCE QUE LE BANC M'A REPRIS. J'attendais trois livraisons en
    // n'en mettant que deux dans le jeu d'essai : c'est mon ATTENTE qui était
    // fausse, pas le code. Plutôt que de baisser l'attente à deux, on couvre
    // le cas qui manquait vraiment, une livraison en préparation.
    { mode_retrait: 'livraison', statut: 'en_preparation' },
    { mode_retrait: 'livraison', statut: 'pret', statut_livraison: null },        // à charger
    { mode_retrait: 'livraison', statut: 'pret', statut_livraison: 'en_livraison' }, // partie
    { mode_retrait: 'livraison', statut: 'recupere', statut_livraison: 'livree' },
  ]

  verifie('le retrait compte ses deux gestes en attente', travailEnAttente(cmds, 'retrait') === 2,
    String(travailEnAttente(cmds, 'retrait')))
  // ⚠️ L'ASYMÉTRIE EST VOULUE : une livraison « prête » n'est pas terminée, le
  // sac est sur le comptoir et personne ne viendra le chercher. La compter
  // comme un retrait tairait la livraison au moment précis où il faut partir.
  verifie('la livraison en compte trois, dont la prête à charger',
    travailEnAttente(cmds, 'livraison') === 3, String(travailEnAttente(cmds, 'livraison')))

  // ⚠️ CE QUI NE RÉCLAME PLUS RIEN NE DOIT PAS ALERTER : envoyer le commerçant
  // voir pour ne rien trouver, c'est lui apprendre à ignorer la pastille.
  verifie('une commande terminée ne réclame rien',
    travailEnAttente([{ mode_retrait: 'retrait', statut: 'recupere' }], 'retrait') === 0)
  verifie('une livraison déjà partie non plus',
    travailEnAttente([{ mode_retrait: 'livraison', statut: 'pret', statut_livraison: 'en_livraison' }], 'livraison') === 0)

  const surRetrait = alerteAutreOnglet(cmds, 'retrait')
  verifie('depuis le retrait, l\'alerte parle de LIVRAISON', surRetrait?.mode === 'livraison', surRetrait?.mode)
  verifie('elle donne le nombre', surRetrait?.nb === 3, String(surRetrait?.nb))
  verifie('et le texte le porte', /3 livraisons/.test(surRetrait?.texte || ''), surRetrait?.texte)

  const surLivraison = alerteAutreOnglet(cmds, 'livraison')
  verifie('depuis la livraison, elle parle de RETRAIT', surLivraison?.mode === 'retrait', surLivraison?.mode)
  // ⚠️ LES DEUX BRANCHES, MESURÉ. Le banc ne jugeait que le texte de la
  // livraison : en vidant celui du retrait de son nombre, il restait VERT.
  // Deux textes symétriques se vérifient tous les deux, sinon l'un des deux
  // dérive en silence (reference_tests_faussement_verts, « chercher au lieu de
  // compter »).
  verifie('et son texte porte AUSSI le nombre',
    /2 commandes à retirer/.test(surLivraison?.texte || ''), surLivraison?.texte)
  verifie('son singulier est respecté aussi',
    /^1 commande à retirer t/.test(alerteAutreOnglet([{ mode_retrait: 'retrait', statut: 'en_attente' }], 'livraison')?.texte || ''))
  verifie('le singulier est respecté',
    /^1 livraison t/.test(alerteAutreOnglet([{ mode_retrait: 'livraison', statut: 'en_attente' }], 'retrait')?.texte || ''))

  // ⚠️ ON N'ALERTE JAMAIS SUR L'ONGLET OUVERT. Ce qu'il a sous les yeux n'a
  // pas besoin d'une pastille, et une alerte sur la vue courante apprend à
  // ignorer les alertes.
  verifie('rien à faire ailleurs → aucune alerte',
    alerteAutreOnglet([{ mode_retrait: 'retrait', statut: 'en_attente' }], 'retrait') === null)
  verifie('liste vide → aucune alerte', alerteAutreOnglet([], 'retrait') === null)
  verifie('liste absente → aucune alerte', alerteAutreOnglet(null, 'retrait') === null)
  verifie('une entrée nulle ne casse pas le compte',
    travailEnAttente([null, { mode_retrait: 'retrait', statut: 'en_attente' }], 'retrait') === 1)
}

// ═══ 3) LE BRANCHEMENT, ET SES TROIS PRÉCAUTIONS ══════════════════════════
{
  const src = readFileSync(new URL('../app/dashboard/page.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')

  const debut = src.indexOf('async function annulerRemise')
  const corps = debut === -1 ? '' : src.slice(debut, src.indexOf('\n  }', debut))
  verifie('le corps de l\'annulation se découpe', corps.length > 200)

  // ⚠️ IL RELIT LA RÈGLE, IL NE LA REFAIT PAS. Une seconde copie finirait par
  // autoriser le retour depuis « non retirée », qui rendrait le stock deux fois.
  verifie('l\'annulation consulte la règle partagée', /retourArriereAutorise\(commande\)/.test(corps))
  verifie('et renonce quand elle refuse', /if \(!regle\) return/.test(corps))

  // 🔴 LA PRÉCAUTION QUI COMPTE : l'écriture est filtrée sur l'ancien statut,
  // donc deux taps rapides ou deux onglets ouverts ne peuvent pas la rejouer.
  verifie('🔴 l\'écriture est filtrée sur l\'ancien statut',
    /\.eq\('statut', 'recupere'\)/.test(corps), 'un double tap pourrait rejouer l\'annulation')
  verifie('et une écriture sans effet ne touche pas l\'écran',
    /if \(!data \|\| data\.length === 0\) return/.test(corps))
  // ⚠️ LES TROIS COLONNES DU RELEVÉ PARTENT ENSEMBLE. En laisser une seule
  // suffirait à mentir : un montant sans moyen, ou une date sans montant, et
  // le journal comptable garde une vente qui n'a pas eu lieu.
  verifie('🔴 le moyen relevé au comptoir est effacé', /patch\.encaisse_mode = null/.test(corps))
  verifie('🔴 le montant aussi', /patch\.encaisse_montant = null/.test(corps))
  verifie('🔴 et la date aussi', /patch\.encaisse_le = null/.test(corps))
  verifie('mais seulement quand la règle le dit', /if \(regle\.effaceEncaissement\) \{/.test(corps),
    'l\'effacement s\'appliquerait même sans relevé')
  // ⚠️ 🔴 ET JAMAIS LE PAIEMENT EN LIGNE : l'argent est chez Stripe, il ne doit
  // rien à ce clic. Ce champ ne doit pas être ÉCRIT ici.
  //
  // ⚠️ ANCRÉE SUR L'AFFECTATION, PAS SUR LE MOT — QUATRIÈME FOIS EN TROIS
  // JOURS. Écrite `!/paye_en_ligne/`, cette garde rougissait sur le COMMENTAIRE
  // qui explique précisément cette règle. La parade n'est jamais de retirer le
  // commentaire, c'est d'exiger une forme que la prose ne produit pas : une
  // affectation ou une clé d'objet (reference_tests_faussement_verts).
  verifie('🔴 le paiement en ligne n\'est JAMAIS écrit ici',
    !/paye_en_ligne\s*[:=]/.test(corps), 'une écriture toucherait à l\'argent de Stripe')

  // Le bouton ne vit que dans le filtre « Récupérées ».
  verifie('le retour arrière n\'apparaît que dans les récupérées',
    /filtreCourant === 'recupere' && retourArriereAutorise\(commande\)/.test(src))

  // La pastille ne s'allume que sur l'onglet qu'il ne regarde pas.
  verifie('l\'alerte inter-onglets est branchée',
    /alerteAutreOnglet\(commandesDuJourTous, vueMode\)/.test(src))
  verifie('la pastille ne s\'affiche que sur l\'AUTRE onglet',
    /alerte\?\.mode === m\.v &&/.test(src))
}

// ═══ 4) LE CRÉNEAU FERMÉ À LA VOLÉE ══════════════════════════════════════
{
  const blocages = [
    { creneau_id: 'A', date_blocage: '2026-08-22' },
    { creneau_id: 'B', date_blocage: '2026-08-23' },
  ]
  const idx = indexBlocages(blocages.filter(b => b.date_blocage === '2026-08-22'))
  verifie('le créneau fermé ce jour-là est reconnu', idx.has('A'))
  // ⚠️ UN BLOCAGE VAUT POUR UN JOUR, PAS POUR LE MODÈLE. `creneaux` décrit une
  // SEMAINE TYPE : sans ce filtrage par date, fermer « vendredi 16 h 15 » le
  // fermerait tous les vendredis, et le commerçant ne le découvrirait que la
  // semaine suivante.
  verifie('celui d\'un autre jour ne l\'est pas', !idx.has('B'))
  verifie('liste vide → aucun blocage', indexBlocages([]).size === 0)
  verifie('liste absente → aucun blocage', indexBlocages(null).size === 0)
  verifie('une entrée sans créneau est ignorée', indexBlocages([{ date_blocage: 'x' }]).size === 0)

  const libre = { capacite: 5, utilise: 2, utiliseEff: 2, complet: false, places: 3, bientot: false, presque: true }
  const ferme = appliquerBlocage(libre, true)
  // ⚠️ LA RÈGLE D'ALEX : « si des commandes sont déjà présentes, elles restent,
  // il bloque la capacité restante ». Le blocage NE TOUCHE PAS au réalisé.
  verifie('🔴 les commandes déjà prises restent comptées', ferme.utiliseEff === 2, String(ferme.utiliseEff))
  verifie('🔴 et la capacité affichée ne change pas', ferme.capacite === 5, String(ferme.capacite))
  verifie('mais il ne reste plus une place', ferme.places === 0, String(ferme.places))
  verifie('le créneau est clos pour la suite', ferme.complet === true)
  // Les états intermédiaires n'ont plus de sens sur un créneau fermé.
  verifie('« presque plein » s\'efface', ferme.presque === false)
  verifie('« bientôt plein » aussi', ferme.bientot === false)

  const ouvert = appliquerBlocage(libre, false)
  verifie('sans blocage, rien ne bouge', ouvert.complet === false && ouvert.places === 3)
  verifie('et le drapeau est explicitement faux', ouvert.bloque === false)
  verifie('une capacité absente ne casse rien', appliquerBlocage(null, true) === null)

  // ⚠️ « FERMÉ » ET « COMPLET » NE DISENT PAS LA MÊME CHOSE. Complet veut dire
  // que ses clients ont rempli, fermé qu'il a fermé LUI-MÊME. Les confondre,
  // c'est lui faire chercher des commandes qui n'existent pas.
  verifie('un créneau fermé le dit', etatCreneau(ferme) === 'Fermé par toi', etatCreneau(ferme))
  verifie('un créneau plein dit autre chose',
    etatCreneau({ complet: true, utiliseEff: 5 }) === 'Complet')
  verifie('les deux libellés diffèrent',
    etatCreneau(ferme) !== etatCreneau({ complet: true, utiliseEff: 5 }))
  verifie('un créneau vide est « Libre »', etatCreneau({ utiliseEff: 0 }) === 'Libre')
  verifie('un créneau entamé a « De la place »', etatCreneau({ utiliseEff: 1 }) === 'De la place')

  // ⚠️ CÔTÉ YOPPER, UN CRÉNEAU FERMÉ EST UN CRÉNEAU COMPLET (Alex, 23/08).
  // La règle descend dans le calcul de capacité : la fiche n'a rien à savoir
  // des blocages, elle lit `complet` comme pour n'importe quel créneau plein.
  // C'est aussi ce qui garantit que les deux écrans ne divergeront pas.
  const capFermee = calculerCapaciteCreneau({ max_commandes: 5, count: 2, bloque: true })
  verifie('🔴 un créneau fermé se rend COMPLET au client', capFermee.complet === true)
  verifie('🔴 sans effacer les commandes déjà prises', capFermee.utiliseEff === 2, String(capFermee.utiliseEff))
  verifie('et sans laisser une seule place', capFermee.places === 0, String(capFermee.places))
  verifie('« dernière place » ne s\'affiche pas dessus',
    capFermee.bientot === false && capFermee.presque === false)

  const capOuverte = calculerCapaciteCreneau({ max_commandes: 5, count: 2 })
  verifie('un créneau sans drapeau reste ouvert',
    capOuverte.complet === false && capOuverte.bloque === false)
  // ⚠️ LE DÉFAUT DOIT ÊTRE SÛR : les tournées de livraison passent par la même
  // fonction sans jamais connaître les blocages, qui ne valent que pour le
  // retrait. Une absence, ou toute valeur qui n'est pas exactement `true`, ne
  // doit fermer rien du tout (reference_deux_formes_absence).
  verifie('un drapeau absent ne ferme rien',
    calculerCapaciteCreneau({ max_commandes: 5, count: 0, bloque: undefined }).complet === false)
  verifie('un drapeau nul non plus',
    calculerCapaciteCreneau({ max_commandes: 5, count: 0, bloque: null }).complet === false)
  verifie('et une valeur qui n\'est pas `true` non plus',
    calculerCapaciteCreneau({ max_commandes: 5, count: 0, bloque: 'non' }).complet === false)
}

// ═══ 5) 🔴 LA BARRIÈRE EST SERVEUR, PAS ÉCRAN ════════════════════════════
//
// ⚠️ C'EST LA RAISON D'ÊTRE DE LA FONCTIONNALITÉ. Le commerçant ferme parce
// qu'il est débordé. Si seule la fiche cachait le créneau, un onglet ouvert
// depuis dix minutes ferait tomber exactement la commande qu'il vient de
// refuser. Une garde d'écran n'est jamais une réponse.
{
  const route = readFileSync(new URL('../app/api/stripe/checkout/create-commande/route.js', import.meta.url), 'utf8')
  const debut = route.indexOf('4.6) LE CRÉNEAU FERMÉ')
  const bloc = debut === -1 ? '' : route.slice(debut, route.indexOf('4.7)', debut))
  verifie('la garde serveur se découpe', bloc.length > 300)
  verifie('🔴 le serveur interroge les blocages', /from\('creneaux_blocages'\)/.test(bloc))
  verifie('🔴 pour CE créneau et CE jour',
    /\.eq\('creneau_id', creneau\.id\)/.test(bloc) && /\.eq\('date_blocage', date_commande\)/.test(bloc))
  verifie('🔴 et il refuse la commande', /status: 409/.test(bloc))
  // ⚠️ MESURÉ : les gardes ci-dessus jugeaient la REQUÊTE et le CODE DE REFUS,
  // pas la CONDITION entre les deux. En neutralisant le `if`, le serveur
  // laissait passer et le banc restait vert : la requête partait toujours, le
  // 409 était toujours écrit, il n'était simplement plus jamais atteint.
  // C'est « l'appel est écrit, son résultat ne sert pas ».
  verifie('🔴 et le refus est réellement déclenché par le blocage',
    /if \(blocage\) \{/.test(bloc), 'la condition de refus a disparu')
  // ⚠️ La note interne du commerçant ne doit pas partir au client : il n'a pas
  // à se justifier, on dit le fait, pas la raison.
  //
  // ⚠️ ANCRÉ SUR L'INTERPOLATION, PAS SUR LE MOT. Une garde qui cherchait le
  // mot seul rougissait sur le COMMENTAIRE qui explique cette règle — le même
  // piège que ce matin dans `create-commande`, et la troisième fois de la
  // journée. Un `${blocage…}` ne peut apparaître que dans du code.
  verifie('le refus ne renvoie rien de la ligne de blocage', !/\$\{blocage/.test(bloc))
  verifie('et il ne lit que l\'existence du blocage', /\.select\('id'\)/.test(bloc))

  const fiche = readFileSync(new URL('../app/commander/[slug]/page.js', import.meta.url), 'utf8')
  // ⚠️ IL S'AFFICHE COMPLET, IL NE DISPARAÎT PLUS (Alex, 23/08, après essai) :
  // un créneau retiré de la grille est indiscernable d'un créneau qui n'a
  // jamais existé, et le client en conclut que le commerce n'ouvre pas.
  verifie('la fiche MARQUE le créneau fermé', /bloque: fermesCeJour\.has\(cr\.id\)/.test(fiche))
  verifie('🔴 et elle ne le retire plus de la grille',
    !/filter\(cr => !fermesCeJour\.has/.test(fiche), 'le créneau redisparaîtrait')
  verifie('et elle le marque PAR JOUR', /=== jourISO/.test(fiche))

  // ⚠️ LES TROIS MAILLONS DU BRANCHEMENT, ET C'EST LÀ QUE LE DÉFAUT VIVAIT.
  // Le filtre était juste, testé, et parfaitement INERTE : les blocages étaient
  // lus en base, rangés dans le cache, et l'état ne les recevait jamais. La
  // garde d'avant vérifiait la PIÈCE, pas son BRANCHEMENT — c'est Alex qui l'a
  // vu à l'écran (reference_colonne_absente_du_select).
  verifie('🔴 les blocages lus en base arrivent dans l\'état',
    /setBlocagesCreneaux\(data\.blocagesCreneaux \|\| \[\]\)/.test(fiche),
    'l\'état resterait vide, le marquage serait inerte')
  verifie('🔴 et ils sont passés EN CLAIR au premier calcul',
    /buildJoursDispos\(data\.commercant, data\.creneaux, data\.fermetures, data\.chargeCreneaux \|\| \{\}, data\.blocagesCreneaux \|\| \[\]\)/.test(fiche),
    'setState ne vaut qu\'au rendu suivant, le calcul lirait l\'ancien tableau vide')
  verifie('🔴 et le calendrier se recalcule quand ils changent',
    /\}, \[commercant, creneaux, fermetures, chargeCreneaux, blocagesCreneaux\]\)/.test(fiche),
    'le calendrier garderait son calcul d\'avant')

  // ⚠️ SÉCURITÉ : `creneaux_blocages` est lisible par `anon` (la policy large
  // est la seule qui marche pour la fiche publique). Le `motif` est une note
  // que le commerçant écrit POUR LUI — « je suis débordé », « je pars tôt ».
  // La fiche ne doit demander que ce dont elle a besoin.
  verifie('la fiche ne rapatrie PAS le motif interne du commerçant',
    /from\('creneaux_blocages'\)\.select\('creneau_id, date_blocage'\)/.test(fiche),
    'le motif partirait dans le navigateur du client')

  const dash = readFileSync(new URL('../app/dashboard/page.js', import.meta.url), 'utf8')
  const bascule = dash.slice(dash.indexOf('async function basculerBlocageCreneau'), dash.indexOf('async function annulerRemise'))
  verifie('le geste de bascule se découpe', bascule.length > 300)
  // ⚠️ AUCUNE COMMANDE N'EST TOUCHÉE PAR CE GESTE : il n'écrit que dans la
  // table des blocages. C'est la règle d'Alex, et le banc l'exige.
  verifie('🔴 le blocage ne touche AUCUNE commande', !/from\('commandes'\)/.test(bascule))
  verifie('il n\'écrit que dans la table des blocages', /from\('creneaux_blocages'\)/.test(bascule))
  // Deux taps rapides, ou deux appareils : la contrainte d'unicité renvoie
  // 23505, et ce n'est pas une erreur à montrer.
  verifie('un double tap n\'affiche pas d\'erreur', /error\.code !== '23505'/.test(bascule))
  verifie('l\'état se relit en base après écriture', /chargerBlocages\(commercant\.id\)/.test(bascule))

  // ⚠️ CES DEUX GARDES MANQUAIENT, ET LA MUTATION LES A RÉCLAMÉES. Sans elles,
  // le blocage pouvait valoir pour TOUS LES JOURS, ou n'être plus appliqué du
  // tout au remplissage, sans que rien ne rougisse.
  verifie('🔴 le blocage est filtré sur LE JOUR AFFICHÉ',
    /indexBlocages\(blocages\.filter\(b => b\.date_blocage === jourActif\)\)/.test(dash),
    'un blocage vaudrait pour tous les jours')
  verifie('et il est bien appliqué au remplissage',
    /appliquerBlocage\(c, blocagesDuJour\.has\(c\.creneau\?\.id\)\)/.test(dash))
}

// 🔴 LE TOTAL S'AFFICHAIT ICI, À LA LIGNE 367 D'UN BANC QUI EN FAIT 580. Les
// deux cents vérifications suivantes tournaient et pouvaient rougir, mais elles
// n'étaient PAS COMPTÉES : le banc annonçait « 100 vérifications » et en faisait
// bien davantage. ⚠️ Un banc qui annonce son total avant d'avoir fini ment sur
// son propre travail, et c'est ce chiffre-là qu'on recopie dans un commit.
// Trouvé le 06/09 en ajoutant cinq gardes qui n'ont pas fait bouger le total.

// ═══ LES ONGLETS : LE SEGMENT DÉCIDE QU'ILS EXISTENT, LE FORFAIT LEUR ÉTAT ══
//
// ⚠️ CE QUE CES GARDES PROTÈGENT N'EST PAS UNE FORME MAIS DEUX RÈGLES.
// Avant le 26/08, un onglet hors forfait n'était pas grisé, il était ABSENT :
// le commerçant en Exister ne savait même pas que la fidélité existait.
// Alex : « tous les onglets du segment affichés, grisés si besoin, ça montre
// l'ampleur des possibilités et ça donne envie ».
//
// Le COMPORTEMENT des quatre états est prouvé par exécution dans
// scripts/verif-plans.mjs. Ici on vérifie seulement que l'écran s'y branche.
{
  // ⚠️ LES COMMENTAIRES SONT RETIRÉS, ET C'EST LA LEÇON DU MATIN MÊME.
  // Le scanner de scripts/verif-plans.mjs prenait un appel CITÉ EN EXEMPLE
  // dans un commentaire pour un vrai appel. Le symptôme est bénin — une garde
  // qui rougit à tort — mais la maladie ne l'est pas : dans l'autre sens, un
  // appel MIS EN COMMENTAIRE validait une garde, et c'est la famille des tests
  // faussement verts. Une date écrite dans un commentaire ne ment à personne ;
  // la même date dans une chaîne affichée, si.
  const sansCommentaires = (src) => src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map(l => (/^\s*\/\//.test(l) ? '' : l)).join('\n')
  const cfg = sansCommentaires(readFileSync(new URL('../app/dashboard/ConfigDashboard.js', import.meta.url), 'utf8'))
  const bord = sansCommentaires(readFileSync(new URL('../app/dashboard/page.js', import.meta.url), 'utf8'))

  // ═══════════════════════════════════════════════════════════════════════
  // LE CATALOGUE NE PROMET QUE CE QU'IL CONTIENT (Alex, 06/09)
  // ═══════════════════════════════════════════════════════════════════════
  //
  // 🔴 LE SOUS-ONGLET S'APPELAIT « PRESTATIONS ET PRODUITS » ET NE LISAIT QUE
  // `articles`. Les prestations vivent dans `rdv_prestations`, sous Prise de
  // RDV. Et cette barre ne s'affiche QUE si le commerce a la prise de
  // rendez-vous : le titre ne se montrait donc qu'à ceux qui ont des
  // prestations, les seuls à qui il promettait quelque chose d'absent.
  verifie('🔴 le catalogue ne promet plus les prestations qu’il ne montre pas',
    !/label: 'Prestations et produits'/.test(cfg),
    'le sous-onglet annonce des prestations que `articles` ne contient pas')

  // ⚠️ ET IL MONTRE LA PORTE. Un titre juste mais muet laisse le commerçant
  // chercher : il vient d'apprendre qu'elles ne sont pas là, il ne sait
  // toujours pas où elles sont.
  verifie('et il dit où les prestations se règlent',
    /Tes prestations se règlent dans <strong>Prise de RDV<\/strong>/.test(cfg))

  // 🔴 LA GARDE QUI COMPTE : que l'onglet visé EXISTE. Renommer l'identifiant
  // de l'onglet sans toucher ce renvoi rendrait le bouton mort en silence — il
  // resterait cliquable et ne ferait rien.
  //
  // ⚠️ ON DÉCOUPE LA FONCTION, ON NE MESURE PAS UNE DISTANCE. Une première
  // version cherchait `onAllerA('…')` à moins de deux cents caractères du
  // libellé du bouton : elle a rougi sur la longueur d'un attribut de style,
  // c'est-à-dire sur rien. Ce projet s'est déjà fait prendre à mesurer un
  // écart entre deux lignes plutôt qu'un fait.
  const iCat = cfg.indexOf('function TabCatalogue(')
  const finCat = cfg.indexOf('\nfunction ', iCat + 1)
  const blocCat = iCat === -1 ? '' : cfg.slice(iCat, finCat === -1 ? undefined : finCat)
  verifie('le bloc du catalogue se découpe', blocCat.length > 500, String(blocCat.length))
  const cibleRenvoi = (blocCat.match(/onAllerA\('([a-z-]+)'\)/) || [])[1]
  verifie('🔴 le renvoi vise un onglet qui existe vraiment',
    !!cibleRenvoi && new RegExp(`\\{ id: '${cibleRenvoi}', label: 'Prise de RDV'`).test(cfg),
    `« ${cibleRenvoi} » ne correspond à aucun onglet`)

  // ⚠️ ET IL EMPRUNTE LA PORTE DE LA BARRE D'ONGLETS, comme le renvoi du
  // générateur : `changerOnglet` refuse un onglet hors forfait en ouvrant la
  // proposition et retient un formulaire non enregistré. `setTab` ferait ni
  // l'un ni l'autre.
  verifie('🔴 le renvoi du catalogue emprunte `changerOnglet`',
    /<TabCatalogue[^>]*onAllerA=\{changerOnglet\}/.test(cfg))

  // ═══════════════════════════════════════════════════════════════════════
  // LE DÉROULANT DE CIBLE D'UN DEAL NE PROMET QUE CE QU'IL CONTIENT (06/09)
  // ═══════════════════════════════════════════════════════════════════════
  //
  // 🔴 SUR « PRIX PROMO » LE LIBELLÉ DISAIT « ARTICLE CONCERNÉ » pendant que le
  // menu proposait aussi les catégories et les prestations : le branchement ne
  // connaissait que `remise_pct` et `bundle`.
  //
  // ⚠️ LE COMPORTEMENT EST PROUVÉ PAR EXÉCUTION dans `verif-logique.mjs`, où
  // `libelleCibleDeal` est appelée sur douze cas. Ici on vérifie seulement que
  // l'écran s'en sert au lieu de réécrire la règle dans son coin — deux gardes
  // pour deux endroits, parce qu'une garde qui mesure le module ne dit rien de
  // l'écran.
  verifie('🔴 le libellé de la cible vient du module',
    /<label style=\{s\.label\}>\{cibleDeal\.label\}<\/label>/.test(cfg),
    'l’écran réécrirait une règle qui se mesure ailleurs')
  verifie('🔴 et la première ligne du menu aussi',
    /<option value="">\{cibleDeal\.optionGenerale\}<\/option>/.test(cfg))
  // ⚠️ ET IL LUI PASSE CE QUI EXISTE VRAIMENT : sans ces trois-là, le libellé
  // annoncerait des cibles absentes du menu.
  verifie('et il lui passe ce que le commerçant a réellement',
    /aProduits: articlesLiables\.length > 0,/.test(cfg)
    && /aCategories: categoriesLiables\.length > 0,/.test(cfg)
    && /aPrestations: prestationsLiables\.length > 0,/.test(cfg))

  // ⚠️ RÈGLE 1 — UN DROIT NE SE CALCULE JAMAIS SUR UN `.plan` DÉTACHÉ.
  // C'est en détachant le plan de son commerçant qu'on perd `created_at`, donc
  // l'essai en cours, et qu'un commerçant se retrouve privé en silence de ce
  // qu'il vient d'activer. Le défaut « colonne absente du select », septième
  // occurrence du projet, prend exactement cette forme.
  verifie("le tableau de bord ne décide aucun droit sur un plan détaché",
    !/canDo\((?:commercant\??\.|form\.)plan\b/.test(cfg + bord),
    'un canDo(x.plan, …) subsiste')

  // ⚠️ RÈGLE 2 — CE QUI EST SANS OBJET DISPARAÎT, LE RESTE NE DISPARAÎT PLUS.
  // Un boulanger ne doit jamais voir « Prise de RDV », même grisée : ce n'est
  // pas une question d'argent, et la lui montrer serait lui promettre ce qui
  // n'arrivera pas, quel que soit son chèque.
  verifie("la liste d'onglets ne retire que ce qui est sans objet",
    /\.filter\(t => t\.etat !== null\)/.test(cfg))
  verifie("et l'état de chaque onglet vient de la matrice, pas d'un booléen maison",
    /etat: t\.feature \? etatDe\(t\.feature\) : FONCTION_INCLUSE/.test(cfg))

  // ⚠️ RÈGLE 3 — PENDANT SA PÉRIODE, RIEN N'EST VERROUILLÉ.
  // Un cadenas dit « tu n'as pas payé ». C'est la leçon des pastilles grises
  // retirées de la fiche publique le 03/08 : ce qui est gris ne se lit pas
  // comme un tarif, ça se lit comme un jugement. Il n'apparaît donc qu'une
  // fois la période passée.
  verifie('le cadenas ne se pose que sur une fonction fermée',
    /const ferme = t\.etat === FONCTION_FERMEE/.test(cfg)
    && /ferme\s*\n?\s*\? <Lock/.test(cfg))
  // ⚠️ UNE SECONDE GARDE A ÉTÉ ÉCRITE PUIS RETIRÉE ICI, VOLONTAIREMENT.
  // Elle cherchait `<Lock` dans les 120 caractères suivant
  // FONCTION_ESSAI_POSSIBLE : c'est la « fenêtre qui lit chez le voisin »,
  // piège consigné le 15/08, qui rougit ou verdit au gré d'une accolade
  // déplacée. La règle est déjà portée par la ligne ci-dessus, et le
  // comportement des quatre états par verif-plans. On ne rafistole pas une
  // garde fragile, on la retire.

  // ⚠️ RÈGLE 4 — LA GARDE D'ÉCRAN N'EST JAMAIS UNE RÉPONSE À ELLE SEULE.
  // Griser un onglet n'empêche rien : `tab` peut venir d'un raccourci, d'une
  // URL, d'un état resté en mémoire. Ce sont ces conditions-ci qui empêchent
  // vraiment le contenu de s'afficher.
  for (const [onglet, fonction] of [
    ['fidelite', 'fidelite'], ['bons', 'bons_cadeaux'],
    ['comptabilite', 'export_comptable'], ['deals', 'deals'],
  ]) {
    verifie(`le contenu de l'onglet « ${onglet} » reste gardé au rendu`,
      new RegExp(`tab === '${onglet}'[^\\n]*peut\\(commercant, '${fonction}'\\)`).test(cfg))
  }

  // ⚠️ RÈGLE 5 — LA DATE ANNONCÉE EST LA SIENNE, JAMAIS UNE DATE ÉCRITE À LA
  // MAIN. Celui qui s'inscrira en mars aura trente jours, pas cent. Et c'est
  // le DERNIER JOUR GRATUIT qu'on annonce : « offert jusqu'au 9 janvier »
  // serait faux d'une journée, distinction gardée depuis le 20/08.
  verifie("le bandeau d'essai calcule la date de fin",
    /libelleDernierJourGratuit\(/.test(cfg))
  verifie("et n'écrit aucune date en dur",
    !/9 janvier|8 janvier/.test(cfg), 'une date est écrite à la main')
}

// ═══ 6) LE PAVÉ « CA DU JOUR », ET LES QUATRE FAÇONS DONT IL MENTAIT ══════
//
// 🔴 TROUVÉ PAR ALEX EN PRODUCTION LE 28/08. Un nœud papillon à 8 € réglé
// ENTIÈREMENT par une récompense de fidélité entrait pour 8 € dans le CA du
// jour : le commerçant a offert l'article, personne ne lui a versé cet argent,
// et son tableau de bord le comptait quand même.
//
// ⚠️ LE CALCUL EST EXÉCUTÉ ICI, PAS DÉCRIT. Une garde qui cherche le nom
// `chiffreAffaires` dans le source resterait verte si la fonction rendait un
// mauvais nombre. Le cas d'Alex est donc rejoué tel quel, chiffres compris.
{
  const cmd = (o) => ({ statut: 'recupere', total: 0, fidelite_remise: 0, ...o })

  // La journée exacte de la capture : une robe à 36 €, un nœud papillon à 8 €
  // payé par une récompense de 8 €, et une troisième commande à 8 €.
  const journee = [
    cmd({ total: 36 }),
    cmd({ total: 8, fidelite_remise: 8 }),
    cmd({ total: 8 }),
  ]
  const ca = chiffreAffaires(journee).produits
  verifie('la journée d\'Alex ne vaut plus 52 €', ca !== 52, `rend ${ca}`)
  verifie('elle vaut les 44 € réellement encaissés', ca === 44, `rend ${ca}`)

  // ⚠️ ET LE BON CADEAU NE SE RETRANCHE PAS. Se tromper de sens ici coûte
  // aussi cher que l'oubli de la récompense : le bon est de l'argent DÉJÀ
  // encaissé le jour de sa vente, le retrancher effacerait cette vente-là.
  const avecBon = chiffreAffaires([cmd({ total: 30, bon_cadeau_montant: 30 })]).produits
  verifie('un bon cadeau ne sort pas du chiffre d\'affaires', avecBon === 30, `rend ${avecBon}`)

  // Une récompense plus grosse que le panier ne rend jamais un CA négatif.
  const trop = chiffreAffaires([cmd({ total: 8, fidelite_remise: 10 })]).produits
  verifie('une récompense plus grosse que le panier plancher à zéro', trop === 0, `rend ${trop}`)

  // ⚠️ DEUX STATUTS QUE LE PAVÉ COMPTAIT AUSSI, et qui n'ont rien à y faire :
  // `paiement_en_attente` est une commande dont Stripe n'a rien confirmé, et
  // `non_retire` de la marchandise restée sur l'étagère.
  for (const statut of ['paiement_en_attente', 'non_retire', 'annulee_client_refund', 'annulee_paiement_ko']) {
    const r = chiffreAffaires([cmd({ statut, total: 50 })]).produits
    verifie(`« ${statut} » n'entre pas dans le CA du jour`, r === 0, `rend ${r}`)
  }
  // Et les quatre qui, elles, comptent.
  for (const statut of ['en_attente', 'en_preparation', 'pret', 'recupere']) {
    const r = chiffreAffaires([cmd({ statut, total: 50 })]).produits
    verifie(`« ${statut} » compte bien`, r === 50, `rend ${r}`)
  }

  // ⚠️ LA GARDE DE BRANCHEMENT, ancrée sur l'EXPRESSION ENTIÈRE. Ancrée sur le
  // seul mot `chiffreAffaires`, elle resterait verte si le calcul revenait à
  // `Number(c.total)` juste à côté : c'est le défaut des six gardes molles du
  // 28/08, toutes vertes parce que le mot existait AILLEURS.
  const src = readFileSync(new URL('../app/dashboard/page.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  verifie('le pavé appelle la fonction de la page Statistiques',
    /ca:\s*chiffreAffaires\(commandesDuJour\)\.produits/.test(src))
  verifie('et ne recalcule plus le CA à la main',
    !/acc \+ Number\(c\.total\)/.test(src),
    'le total brut est encore additionné')
}

// ═══ 7) UN MONTANT S'ÉCRIT « 12,50 € », Y COMPRIS CHEZ LE COMMERÇANT ══════
//
// 🔴 Alex, 28/08 : le tableau de bord affichait « 52.00€ » et « 8.00€ » sur la
// même commande dont l'email au Yopper disait « 8,00 € ». Le balayage de la
// virgule du 28/08 s'était arrêté au produit côté client.
{
  const FICHIERS = [
    'page.js', 'ConfigDashboard.js', 'ModalNouveauRdv.js', 'abonnement/page.js',
  ]
  for (const f of FICHIERS) {
    const src = readFileSync(new URL(`../app/dashboard/${f}`, import.meta.url), 'utf8')
    // ⚠️ UNE SEULE EXCEPTION, ET ELLE EST VOULUE : le `placeholder` d'un
    // `<input type="number">`, où la valeur se SAISIT avec un point. Y mettre
    // une virgule montrerait au commerçant un exemple qu'il ne peut pas taper.
    const restes = src.split('\n')
      .filter(l => l.includes('toFixed(2)') && !l.includes('placeholder='))
    verifie(`aucun montant formaté à la main dans ${f}`,
      restes.length === 0,
      restes.length > 0 ? `${restes.length} reste(s), dont : ${restes[0].trim().slice(0, 70)}` : '')
  }
}

// ⚠️ LE TOTAL SE DIT ICI, QUAND TOUT A TOURNÉ. Il vivait au deux tiers du
// fichier et n'annonçait donc qu'un tiers du travail.
console.log(`\nTableau de bord : ${ok} vérifications`)

if (echecs.length > 0) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
