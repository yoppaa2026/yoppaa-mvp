// HARNAIS DE MUTATION — « MON COMPTE » (20/09)
//
// 🔴 CE QU ON MESURE. La page `/dashboard/abonnement` existait, complete, et
// n etait RELIEE A RIEN : ni onglet, ni menu. On n y arrivait que par le
// bandeau d essai, par une fonction verrouillee, ou par un email de relance
// qu il faut avoir recu. « Ou je vois mon abonnement » est la question des
// premiers jours, et elle n avait aucune reponse (Alex, 10/09).
//
// Chacune des mutations ci-dessous remet une des formes fausses possibles. Si
// le banc reste vert sur l une d elles, ce lot ne protege pas ce qu il pretend.
//
// ⚠️ INSTANTANE DE CONTENU, RESTAURATION CONTROLEE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RESULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
//
//   node scripts/mutations-mon-compte.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:bord'
const MODULE = 'app/dashboard/ConfigDashboard.js'

const MUTATIONS = [
  // ─── 22/09 : L ONGLET « FACTURATION » ────────────────────────────────────
  //
  // 🔴 POURQUOI IL EXISTE. Alex : « est-ce que toutes les coordonnees utiles a
  // la facturation sont visibles dans Mon compte ? » Non. L ecran montrait la
  // formule, le prix et le portail, et pas une seule des donnees qui
  // apparaissent sur la facture. Le commercant payait sans jamais voir sous
  // quel nom il etait facture.
  { nom: '🔴 l onglet Facturation disparait de la barre',
    de: "    { id: 'facturation', label: 'Facturation', icon: 'user' },",
    vers: '',
    garde: 'l’onglet « Facturation » existe dans la barre' },

  { nom: '🔴 un cadenas de forfait se pose sur ses propres coordonnees',
    de: "    { id: 'facturation', label: 'Facturation', icon: 'user' },",
    vers: "    { id: 'facturation', label: 'Facturation', icon: 'user', feature: 'export_comptable' },",
    garde: 'et il n’est derrière aucun forfait' },

  // ⚠️ ANCRE SUR UNE SEULE LIGNE, comme la règle du dépôt l'exige. La version
  // d'avant portait un bloc entier avec ses sauts de ligne, parce que la ligne
  // de garde n'était pas unique dans le fichier. Elle l'est devenue en
  // supprimant la duplication : c'est le code qu'on a réparé, pas l'ancre.
  { nom: '🔴 le formulaire s affiche sans dossier : des champs vides passent pour des valeurs',
    de: '  if (!commercant) return <DossierAbsent illisible={illisible} quoi="tes coordonnées de facturation" />',
    vers: '  if (false) return <DossierAbsent illisible={illisible} quoi="tes coordonnées de facturation" />',
    garde: 'il refuse d’afficher un formulaire sans dossier' },

  { nom: '🔴 les champs se reecrivent pendant que le commercant tape',
    de: '    if (charge || !commercant) return',
    vers: '    if (!commercant) return',
    garde: 'et il ne réécrit pas les champs pendant la saisie' },

  // 🔴 LE NUMERO D ENTREPRISE EST VERIFIE PAR ALEX AU KYB. Le laisser changer
  // apres coup voudrait dire qu un dossier valide peut designer une autre
  // entreprise.
  { nom: '🔴 le numero d entreprise redevient modifiable apres validation',
    de: '        <input style={{ ...s.input, background: T.bg, color: T.muted }} value={bceLisible || \'—\'} disabled readOnly />',
    vers: '        <input style={{ ...s.input, background: T.bg, color: T.muted }} value={bceLisible || \'—\'} />',
    garde: 'le numéro d’entreprise n’est pas modifiable depuis l’écran' },

  { nom: '⚠️ l ecran ne dit plus que ces donnees sont aussi celles de la fiche',
    de: 'change aussi ce que tes clients voient',
    vers: 'sert a te facturer',
    garde: 'il prévient que ces données sont aussi celles de la fiche' },

  // ─── LA ROUTE, ET LA MOITIE QUI MANQUAIT ────────────────────────────────
  //
  // 🔴 `stripe.customers.update` N EXISTAIT NULLE PART dans le depot : une
  // correction d adresse restait en base et la facture gardait l ancienne.
  { nom: '🔴 LE DEFAUT D ORIGINE : plus rien ne remonte chez Stripe',
    fichier: 'app/api/dashboard/facturation/route.js',
    de: '        await stripe.customers.update(commercant.stripe_customer_id, {',
    vers: '        await Promise.resolve({ id: commercant.stripe_customer_id, ignore: {',
    garde: 'la route pousse vraiment vers Stripe' },

  // 🔴 LA BASE EST MAITRESSE : perdre la saisie du commercant parce qu un
  // service tiers ne repond pas, ce serait lui faire payer un probleme qui n
  // est pas le sien.
  { nom: '🔴 un echec Stripe fait perdre la saisie du commercant',
    fichier: 'app/api/dashboard/facturation/route.js',
    de: "        stripeSynchro = 'en retard'",
    vers: "        stripeSynchro = 'à jour'",
    garde: 'un échec Stripe ne fait pas perdre la saisie' },

  { nom: '🔴 l ecran cesse de dire que Stripe n a pas suivi',
    de: 'Stripe n’a pas pu être mis à jour',
    vers: 'tout est enregistré',
    garde: 'et l’écran le répète au commerçant' },

  // 🔴 LA PROPRIETE SE VERIFIE PAR LE JETON, JAMAIS PAR LE CORPS DE LA REQUETE.
  { nom: '🔴 n importe qui ecrit les coordonnees de n importe quel commerce',
    fichier: 'app/api/dashboard/facturation/route.js',
    de: '  if (!c || c.auth_user_id !== user.id) return null',
    vers: '  if (!c) return null',
    garde: 'la route vérifie la propriété de la fiche' },

  { nom: '🔴 le numero de TVA n est plus verifie, seulement compte',
    fichier: 'app/api/dashboard/facturation/route.js',
    de: '  const { valide } = validerBCE(chiffres)',
    vers: '  const valide = true',
    garde: 'le numéro de TVA est vérifié, pas seulement compté' },

  // ⚠️ LA FRANCHISE EST UN ETAT NORMAL. Refuser le vide empecherait un commerce
  // en franchise d enregistrer le reste de ses coordonnees.
  { nom: '⚠️ un commerce en franchise ne peut plus enregistrer',
    fichier: 'app/api/dashboard/facturation/route.js',
    de: "  if (net === '') return { ok: true, valeur: null }",
    vers: "  if (net === '') return { ok: false, erreur: 'Numéro obligatoire.' }",
    garde: 'un champ vide reste accepté (franchise de TVA)' },

  // ⚠️ ET L ADRESSE, sans quoi l onglet n est atteignable par aucun lien.
  { nom: '🔴 l adresse ?config=facturation redevient invalide',
    fichier: 'app/dashboard/page.js',
    de: "    'avis', 'signaux', 'compte', 'facturation']",
    vers: "    'avis', 'signaux', 'compte']",
    garde: 'l’adresse ?config=facturation est acceptée' },


  // ─── 22/09 : CE QUE CONTIENT CHAQUE FORMULE RESTE LISIBLE ───────────────
  //
  // 🔴 LES CARTES DISPARAISSAIENT DES QU ON ETAIT ABONNE, et c etait le SEUL
  // endroit du produit qui dit ce que chaque formule contient. Pour monter en
  // gamme, il fallait deja savoir ce qu on montait chercher.
  { nom: '🔴 les formules se referment des la premiere souscription',
    fichier: 'app/dashboard/abonnement/page.js',
    de: '        {!isExempt && (',
    vers: '        {!hasActiveSub && !isExempt && (',
    garde: 'les formules restent lisibles quand on est abonné' },

  // 🔴 ET C EST UNE QUESTION D ARGENT : proposer « souscrire » a un abonne lui
  // creerait un SECOND abonnement. Un changement de formule passe par le
  // portail, qui sait faire le prorata.
  { nom: '🔴 un abonne peut souscrire une deuxieme fois',
    fichier: 'app/dashboard/abonnement/page.js',
    de: '          onClick={abonne ? onPortail : onClick}',
    vers: '          onClick={onClick}',
    garde: 'un abonné est envoyé au portail, pas vers une seconde souscription' },

  { nom: '🔴 la carte de sa propre formule lui propose d y souscrire',
    fichier: 'app/dashboard/abonnement/page.js',
    de: '      {actuelle ? (',
    vers: '      {false ? (',
    garde: 'et la carte de sa propre formule ne lui propose rien' },

  { nom: '🔴 une seule des deux cartes se reconnait',
    fichier: 'app/dashboard/abonnement/page.js',
    de: "                actuelle={plan === 'vendre'}",
    vers: '                actuelle={false}',
    garde: 'les deux formules savent si elles sont la sienne' },

  // ─── 22/09 : LE RETOUR RAMENE LA D OU L ON VIENT ────────────────────────
  { nom: '🔴 le retour repose le commercant a l entree du tableau de bord',
    fichier: 'app/dashboard/abonnement/page.js',
    de: '        <a href="/dashboard?onglet=config&config=compte"',
    vers: '        <a href="/dashboard"',
    garde: 'le retour ramène à l’onglet « Mon compte »' },

  // 🔴 ET L ADRESSE DOIT ETRE ACCEPTEE, SINON ELLE REPLIE SUR LE DEFAUT EN
  // SILENCE. « compte » manquait a la liste depuis la creation de l onglet.
  { nom: '🔴 l adresse ?config=compte redevient invalide',
    fichier: 'app/dashboard/page.js',
    // ⚠️ ANCRE RECALEE LE 22/09 : la liste a gagne 'facturation' depuis.
    de: "'compte', 'facturation']",
    vers: "'facturation']",
    garde: 'l’adresse ?config=compte est acceptée par le tableau de bord' },

  // ⚠️ ET LA LANGUE DU PRODUIT. Tout Yoppaa tutoie.
  { nom: '⚠️ la page d abonnement se remet a vouvoyer',
    fichier: 'app/dashboard/abonnement/page.js',
    de: 'Ta formule, tes paiements et tes factures.',
    vers: 'Gérez votre formule, vos paiements et vos factures.',
    garde: 'la page d’abonnement ne vouvoie plus' },


  // ─── 22/09 : LA DEGUSTATION EXISTE DANS CET ECRAN ───────────────────────
  //
  // 🔴 QUESTION D ALEX : « normal qu il n y ait pas de mention de periode
  // d essai ? » Non. L ecran ne lisait que le MIROIR STRIPE, et la degustation
  // de lancement ne passe pas par Stripe : elle vit dans `essai_plan` et dans
  // la date d inscription. Le bandeau du haut l annoncait, l onglet juste en
  // dessous l ignorait.
  { nom: '🔴 LE DEFAUT D ALEX : l ecran redevient aveugle a la degustation',
    de: '  const degustation = planEnEssai(commercant)',
    vers: '  const degustation = null',
    garde: 'l’écran du compte connaît la dégustation, pas seulement Stripe' },

  // ⚠️ SA DATE, PAS CELLE DE TOUT LE MONDE. `finEssai` rend le MAX entre
  // l inscription + 30 jours et le 9 janvier : qui s inscrit en decembre a plus
  // que les autres. `libelleDernierJourGratuit()` ne prend aucun commercant en
  // argument, c est donc une constante.
  { nom: '🔴 la date de degustation redevient la meme pour tout le monde',
    de: '  const finDeg = dateLongue(dernierJourGratuit(commercant?.created_at))',
    vers: '  const finDeg = libelleDernierJourGratuit()',
    garde: 'et la date affichée est celle de CE commerçant' },

  // 🔴 UN JOUR DE TROP SUR UNE PROMESSE DE GRATUITE. `finDegustation` rend
  // l INSTANT DE FACTURATION : l afficher suivi de « inclus » promet une
  // journee de plus que la regle. C est la premiere version de cet ecran, et
  // c est Alex qui l a vue, en lisant la regle plutot que le code.
  { nom: '🔴 la date affichee redevient celle de la premiere facture',
    de: '  const finDeg = dateLongue(dernierJourGratuit(commercant?.created_at))',
    vers: '  const finDeg = dateLongue(finDegustation(commercant?.created_at))',
    garde: 'l’écran ne confond pas le dernier jour offert et la facturation' },

  { nom: '🔴 la degustation annonce une date sans dire ce qu elle change',
    de: 'tu perds les fonctions de {getPlanLabel(degustation)}',
    vers: 'tu continues comme avant',
    garde: 'la dégustation dit ce qu’il advient ensuite' },

  // ─── 22/09 : LA FORMULE OUVERTE DEPUIS L ADMINISTRATION ─────────────────
  //
  // 🔴 LE CAS VU CHEZ UN COMMERCANT REEL. L ecran annoncait « 49,90 € HTVA par
  // mois » ET « tu n as pas encore d abonnement payant », dans la meme carte.
  // Les deux phrases sont vraies separement et se contredisent ensemble.
  { nom: '🔴 l ecran ne reconnait plus la formule ouverte sans abonnement',
    de: "  const ouvertSansFacture = !exempt && !abonne && plan !== 'exister' && !degustation",
    vers: '  const ouvertSansFacture = false',
    garde: 'et il le déduit de l’absence d’abonnement, pas d’un drapeau' },

  { nom: '🔴 le tarif se represente comme un prelevement en cours',
    de: "            <Ligne quoi={ouvertSansFacture ? 'Le tarif de cette formule' : 'Ce que ça coûte'} fort valeur={",
    vers: "            <Ligne quoi=\"Ce que ça coûte\" fort valeur={",
    garde: 'le tarif ne se présente pas comme un prélèvement en cours' },

  { nom: '🔴 l ecran cesse de dire que rien n est facture',
    de: 'rien ne t’est facturé aujourd’hui',
    vers: 'ta formule est active',
    garde: 'et l’écran dit clairement que rien n’est facturé' },


  // ─── 22/09 : L ECRAN NE REPOND PAS A LA PLACE DU DOSSIER QU IL N A PAS ───
  //
  // 🔴 SANS COMMERCANT, CET ECRAN AFFIRMAIT « EXISTER, GRATUIT A VIE ». Toutes
  // ses valeurs sont des replis : avec un dossier absent elles s alignent sur
  // le cas gratuit, et l ecran ANNONCE une formule au lieu d avouer qu il ne
  // sait pas. Un ecran vide se remarque ; un ecran faux se croit.
  { nom: '🔴 la garde de chargement saute : l ecran redevine « Exister, gratuit a vie »',
    de: '  if (!commercant) return <DossierAbsent illisible={illisible} quoi="ta formule et tes paiements" />',
    vers: '  if (false) return <DossierAbsent illisible={illisible} quoi="ta formule et tes paiements" />',
    garde: 'l’écran du compte refuse de deviner une formule sans dossier' },

  { nom: '🔴 le chargement et la panne redonnent le meme ecran',
    de: 'function TabMonCompte({ commercant, toast, illisible = false }) {',
    vers: 'function TabMonCompte({ commercant, toast }) {\n  const illisible = false',
    garde: 'et il distingue le chargement de la panne' },

  // ─── 22/09 : UN RECHARGEMENT RATE N EFFACE PAS LE COMMERCANT ────────────
  //
  // 🔴 `setCommercant(data)` ETAIT APPELE SANS CONDITION, et l `error` n etait
  // meme pas destructuree. Cette fonction repasse apres CHAQUE enregistrement
  // du Profil, de la Fidelite, des Bons : un commercant en Vendre qui
  // sauvegarde pendant une coupure voyait son ecran retomber sur « Exister ».
  { nom: '🔴 le rechargement cesse de lire son erreur',
    // ⚠️ L ANCRE PORTE LA REQUETE ENTIERE, et c est mesure : « const { data,
    // error } » vit SEIZE fois dans ce fichier, et `replace` ne touche que la
    // premiere. La mutation mutait une autre fonction, la garde restait verte,
    // et on aurait conclu qu elle ne protege pas.
    de: "    const { data, error } = await supabase.from('commercants').select('*').eq('id', commercantId).maybeSingle()",
    vers: "    const { data } = await supabase.from('commercants').select('*').eq('id', commercantId).maybeSingle()",
    garde: 'le rechargement lit son erreur' },

  { nom: '🔴 une lecture ratee ecrase le commercant payant par une absence',
    // ⚠️ L ANCRE EST UNIQUE, ET C EST MESURE. « if (error || !data) { » avec
    // quatre espaces se trouve AUSSI dans une ligne indentee de HUIT espaces
    // huit mille lignes plus haut, parce qu une sous-chaine ignore les lignes :
    // la mutation mutait cette ligne-la et laissait la vraie intacte.
    //
    // 🔴 ET ELLE REINTRODUIT LE DEFAUT EXACT : ecrire dans l etat AVANT de
    // sortir de la branche d echec, donc remplacer un commercant payant par
    // `null`. C est ce que faisait le code avant le 22/09.
    de: '      setCommercantIllisible(true)',
    vers: '      setCommercant(data)',
    garde: 'et il n’écrase pas le dossier par une absence' },

  // ─── 22/09 : LES DEUX ECRANS DISENT LA MEME CHOSE DU MEME STATUT ────────
  //
  // 🔴 LA PAGE D ABONNEMENT AFFICHAIT « ABONNEMENT ACTIF », EN VERT, A UN
  // COMMERCANT EN RETARD DE PAIEMENT. Et c est l ecran ou nos propres emails
  // de relance l envoient : il lisait « ton paiement a echoue », cliquait, et
  // trouvait un badge vert.
  { nom: '🔴 LE DEFAUT D ORIGINE : le badge vert reprend le retard de paiement',
    fichier: 'app/dashboard/abonnement/page.js',
    de: '            {hasActiveSub && !enRetard && (',
    vers: '            {hasActiveSub && (',
    garde: 'le badge vert exclut le retard de paiement' },

  { nom: '🔴 le badge rouge disparait : le statut est connu, rien ne le montre',
    fichier: 'app/dashboard/abonnement/page.js',
    // ⚠️ « {enRetard && ( » VIT DEUX FOIS : le badge en tete de carte, puis le
    // bandeau qui porte le geste. `replace` ne touche que la PREMIERE, donc
    // cette mutation retire le BADGE et laisse le bandeau. C est exactement ce
    // qu il faut mesurer, et c est ce qui a montre que la garde d origine
    // etait trop faible : elle cherchait le motif, qui survivait dans l autre.
    de: '            {enRetard && (',
    vers: '            {false && (',
    garde: 'et son bandeau rouge, distinct du badge' },

  { nom: '🔴 la page ne sait plus ce qu est un retard de paiement',
    fichier: 'app/dashboard/abonnement/page.js',
    de: "  const enRetard = commercant.subscription_status === 'past_due'",
    vers: '  const enRetard = false',
    garde: 'la page d’abonnement connaît le retard de paiement' },

  // 🔴 LE GESTE, PAS SEULEMENT LE CONSTAT. Le mail promet « Mettre a jour mes
  // informations de paiement » : la page doit tenir cette promesse.
  { nom: '🔴 le bandeau rouge constate sans dire quoi faire',
    fichier: 'app/dashboard/abonnement/page.js',
    de: 'Mets ton moyen de paiement à jour',
    vers: 'Ton abonnement est suspendu',
    garde: 'et il dit quoi faire' },


  // ─── LA PORTE ───────────────────────────────────────────────────────────
  { nom: '🔴 LE DEFAUT D ORIGINE : l onglet disparait, la page redevient inatteignable',
    de: "    { id: 'compte', label: 'Mon compte', icon: 'user' },",
    vers: '' },

  { nom: '⚠️ le libelle change : il ne reconnait plus l onglet qu il cherche',
    de: "    { id: 'compte', label: 'Mon compte', icon: 'user' },",
    vers: "    { id: 'compte', label: 'Facturation', icon: 'user' }," },

  // 🔴 LUI POSER UN FORFAIT LE FERMERAIT A CEUX QUI EN ONT LE PLUS BESOIN :
  // celui qui est en Exister ne pourrait plus lire qu il ne paie rien, et celui
  // dont l essai se termine ne verrait pas sa date.
  { nom: '🔴 un cadenas de forfait se pose sur le compte du commercant',
    de: "    { id: 'compte', label: 'Mon compte', icon: 'user' },",
    vers: "    { id: 'compte', label: 'Mon compte', icon: 'user', feature: 'export_comptable' }," },

  { nom: '🔴 l onglet existe mais n affiche plus rien',
    de: "      {tab === 'compte' && <TabMonCompte commercant={commercant} toast={showToast} illisible={commercantIllisible} />}",
    vers: '' },

  { nom: '🔴 le contenu se cache derriere le forfait, en plus de la barre',
    de: "      {tab === 'compte' && <TabMonCompte commercant={commercant} toast={showToast} illisible={commercantIllisible} />}",
    vers: "      {tab === 'compte' && peut(commercant, 'export_comptable') && <TabMonCompte commercant={commercant} toast={showToast} />}" },

  // ─── CE QUE L ECRAN DIT ─────────────────────────────────────────────────
  // 🔴 LA LECON DE L OFFRE DE LANCEMENT : un texte qui devine sa date finit par
  // contredire la facture. La date affichee doit etre le miroir de Stripe.
  { nom: '🔴 la date de fin d essai se calcule en local au lieu de venir de Stripe',
    de: "  const finEssai = dateLongue(commercant?.subscription_trial_end)",
    vers: "  const finEssai = dateLongue(commercant?.essai_demande_le)" },

  { nom: '⚠️ le montant TVA comprise disparait : il ne voit plus ce qui sera debite',
    de: "              prix?.mensuel ? `${euros(prix.mensuel)} HTVA par mois, soit ${euros(ttc)} TVA comprise` : 'Gratuit à vie'",
    vers: "              prix?.mensuel ? `${euros(prix.mensuel)} HTVA par mois` : 'Gratuit à vie'" },

  { nom: '🔴 le rappel du moyen de paiement ne se declenche plus jamais',
    de: "  const rappelCarte = enEssai && joursAvantFin !== null && joursAvantFin <= 30",
    vers: "  const rappelCarte = false" },

  // ⚠️ UN RAPPEL QUI ARRIVE LA VEILLE NE SERT A RIEN : il faut le temps de
  // sortir sa carte, et souvent d en parler a son comptable.
  { nom: '⚠️ le rappel n arrive plus qu a la veille de la fin d essai',
    de: "  const rappelCarte = enEssai && joursAvantFin !== null && joursAvantFin <= 30",
    vers: "  const rappelCarte = enEssai && joursAvantFin !== null && joursAvantFin <= 1" },

  // 🔴 LE 200 QUI DIT NON. `postPro` rend la `Response` et ne leve pas sur un
  // code HTTP : lire le code sans lire le corps annonce une reussite sur un
  // refus, et le commercant attend un portail qui ne s ouvrira jamais.
  { nom: '🔴 le portail ne lit plus le corps de la reponse, seulement le code',
    de: "    if (!res.ok || !corps?.url) {",
    vers: "    if (!res.ok) {" },
]

const lancer = () => {
  try {
    const sortie = execSync(`npm run ${BANC}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    const echecs = [...sortie.matchAll(/• ([^\n—]+)/g)].map(m => m[1].trim())
    // ⚠️ ON DISTINGUE « ROUGE » DE « PLANTE ». Un banc qui explose au lieu de
    // rougir n est pas une mesure, c est un accident.
    const plante = !/vérifications/.test(sortie)
    return { rouge: true, echecs, plante, extrait: sortie.slice(-400) }
  }
}

const depart = lancer()
if (depart.rouge) {
  console.log(`🔴 ${BANC} EST DÉJÀ ROUGE. On ne mesure rien sur un banc rouge.`)
  console.log(depart.extrait)
  process.exit(1)
}
console.log('Banc vert au départ.\n')

let attrapees = 0
const manquees = []

for (const m of MUTATIONS) {
  const f = chemin(m.fichier || MODULE)
  const original = readFileSync(f, 'utf8')
  if (!original.includes(m.de)) {
    manquees.push(`${m.nom} — TEXTE INTROUVABLE`)
    console.log(`  ? introuvable : ${m.nom}`)
    continue
  }
  ecrireSur(f, original.replace(m.de, m.vers))
  const res = lancer()
  ecrireSur(f, original)

  if (readFileSync(f, 'utf8') !== original) {
    console.log(`\n🔴 RESTAURATION RATÉE sur ${m.fichier || MODULE}. On s'arrête.`)
    process.exit(2)
  }

  // 🔴 ROUGE NE SUFFIT PAS : ROUGE SUR LA BONNE GARDE (ajoute le 22/09). Une
  // mutation peut casser une garde VOISINE et passer pour une mesure de celle
  // qu on visait ; la vraie garde reste alors non eprouvee tout en paraissant
  // tenue. Les mutations qui declarent une `garde` sont donc verifiees par son
  // nom ; celles d avant, qui n en declarent pas, gardent l ancien contrat.
  if (res.plante) { manquees.push(`${m.nom} — le banc a PLANTÉ`); console.log(`  ⚠ plantage : ${m.nom}`) }
  else if (!res.rouge) { manquees.push(`${m.nom} — RESTÉ VERT`); console.log(`  ✕ MANQUÉE : ${m.nom}`) }
  else if (m.garde && !(res.echecs || []).some(e => e.includes(m.garde))) {
    manquees.push(`${m.nom} — rouge sur une AUTRE garde : ${(res.echecs || []).slice(0, 2).join(' / ') || '(aucune nommée)'}`)
    console.log(`  ⚠ mauvaise garde : ${m.nom}`)
  }
  else { attrapees++; console.log(`  ✓ attrapée : ${m.nom}`) }
}

console.log(`\n${attrapees}/${MUTATIONS.length} mutations attrapées.`)
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach(x => console.log('   • ' + x)) }

const finalRouge = lancer().rouge
if (finalRouge) console.log(`🔴 ${BANC} ROUGE APRÈS RESTAURATION.`)
else console.log('\nBanc vert après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
