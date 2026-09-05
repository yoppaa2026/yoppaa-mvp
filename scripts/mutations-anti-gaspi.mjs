// HARNAIS DE MUTATION — L'OFFRE DE FIN DE JOURNÉE (04/09).
//
// 🔴 CE QU'ON MESURE : qu'une offre s'affiche pendant sa fenêtre et JAMAIS en
// dehors. Un invendu ne vit que quelques heures. Se tromper d'une heure, c'est
// envoyer quelqu'un devant une porte fermée, ou cacher l'offre pendant qu'elle
// existe. Aucune erreur ne s'afficherait dans les deux cas.
//
// La mutation qui compte est celle du FUSEAU : les heures sont belges, le temps
// machine est universel, et l'écart vaut UNE heure en hiver, DEUX en été.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES. Le dépôt est stocké en LF, mais le
// disque peut porter du CRLF là où git n a pas encore normalisé : une ancre à
// cheval sur deux lignes ne vaut alors que sur une machine. Vérifié par
// npm run verif:ancres.
//
//   node scripts/mutations-anti-gaspi.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:anti-gaspi'
const MODULE = 'lib/anti-gaspi.js'
const HEURE = 'lib/heure-belge.js'

const MUTATIONS = [
  // ─── LE FUSEAU, LE PIÈGE PRINCIPAL ──────────────────────────────────────
  //
  // ⚠️ QUATRE MUTATIONS VISENT `lib/heure-belge.js` DEPUIS LE 04/09 : les
  // primitives d'heure y ont été extraites pour que le module des délais de
  // commande les partage, plutôt que d'en garder une seconde copie qui aurait
  // divergé au premier changement d'heure. `minutesDeLHeure` et `libelleHeure`
  // ont suivi le même chemin quelques heures plus tard, et leurs deux mutations
  // ont périmé à leur tour.
  //
  // ✅ ET C'EST LE HARNAIS QUI L'A DIT, en « TEXTE INTROUVABLE ». Une mutation
  // dont l'ancre a disparu ne s'applique pas, donc le banc reste vert : sans ce
  // rapport, on aurait compté deux gardes mesurées qui ne l'étaient plus.
  // Sixième fois qu'un point d'ancrage périme après un déplacement de code.
  { nom: '🔴 le module lit l’heure UNIVERSELLE au lieu de l’heure belge',
    fichier: HEURE,
    de: "  timeZone: FUSEAU, hour: '2-digit', minute: '2-digit', hour12: false,",
    vers: "  timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false," },

  { nom: '🔴 minuit redevient 1440 (hors de toutes les fenetres)',
    fichier: HEURE,
    de: '  return h === 24 ? 0 : h',
    vers: '  return h' },

  // ─── LIRE UNE HEURE ─────────────────────────────────────────────────────
  { nom: '🔴 une heure absente rend ZERO au lieu de rien',
    fichier: HEURE,
    de: '  if (!m) return null',
    vers: '  if (!m) return 0' },

  { nom: '🔴 une heure impossible est acceptee',
    fichier: HEURE,
    de: '  if (h > 23 || min > 59) return null',
    vers: '  if (false) return null' },

  // ─── LA FENÊTRE ─────────────────────────────────────────────────────────
  { nom: '🔴 la fin redevient incluse (on affiche a l’heure de fermeture)',
    de: '    ? (t >= debut && t < fin)',
    vers: '    ? (t >= debut && t <= fin)' },

  { nom: '🔴 une fenetre qui franchit minuit ne s’ouvre plus jamais',
    de: '    : (t >= debut || t < fin)',
    vers: '    : (false)' },

  { nom: '🔴 une fenetre de duree nulle s’affiche une minute par jour',
    de: '  if (debut === fin) return false',
    vers: '  if (false) return false' },

  { nom: '🔴 une demi-fenetre passe pour une offre de fin de journee',
    de: "  return minutesDeLHeure(offre?.heure_debut) !== null",
    vers: "  return true || minutesDeLHeure(offre?.heure_debut) !== null" },

  // ─── LE TEMPS RESTANT ───────────────────────────────────────────────────
  { nom: '🔴 le compte a rebours devient NEGATIF apres minuit',
    de: '  return reste > 0 ? reste : reste + 24 * 60',
    vers: '  return reste' },

  { nom: '🔴 « encore 0 minute » redevient possible',
    de: '  if (minutes === null || minutes === undefined || !Number.isFinite(minutes) || minutes <= 0) return \'\'',
    vers: '  if (minutes === null || minutes === undefined || !Number.isFinite(minutes) || minutes < 0) return \'\'' },

  // ─── L'ORDRE DE LECTURE ─────────────────────────────────────────────────
  // ⚠️ ANCRE REPOINTÉE LE 05/09. La comparaison vivait en DEUX exemplaires,
  // identiques au caractère près : `offresOuvertes` et `offresProches`.
  // `String.replace` visant toujours la première, la seconde n'était pas
  // mesurable. Elle a donc été extraite dans `dabordLeReservable`, et cette
  // mutation couvre désormais les deux appelants d'un coup.
  { nom: '🔴 le reservable ne passe plus devant',
    de: '  return a.reservable ? -1 : 1',
    vers: '  return 0' },

  { nom: '🔴 les offres fermees s’affichent aussi',
    de: '    .filter(o => offreValable(o) && fenetreOuverte(o, instant))',
    vers: '    .filter(o => offreValable(o))' },

  // ─── LE PRIX, ET LE JEU JOUÉ ────────────────────────────────────────────
  { nom: '🔴 le plancher de remise disparait (10 % occuperait l ecran)',
    de: 'export const REMISE_MINIMALE = 30',
    vers: 'export const REMISE_MINIMALE = 0' },

  // ⚠️ PAS DE MUTATION SUR LA CONSTRUCTION DU CONSEIL, ET C EST DELIBERE.
  //
  // Remplacer le gabarit par la chaine ecrite a la main produit EXACTEMENT le
  // meme texte tant que le plancher vaut 30 : la mutation ne change aucun
  // resultat, donc elle ne mesure rien. UNE MUTATION QUI NE MUTE RIEN EST UNE
  // MUTATION MANQUEE, pas une garde faible.
  //
  // Le lien est deja mesure par la mutation du plancher ci-dessus : mise a 0,
  // un conseil ecrit en dur continuerait d annoncer « -30 % » et la garde
  // « le conseil cite le plancher reel » rougirait.

  { nom: '🔴 le conseil ne vise plus plus haut que l obligation',
    de: 'export const REMISE_CONSEILLEE = 50',
    vers: 'export const REMISE_CONSEILLEE = 10' },

  { nom: '🔴 le prix plein passe pour une affaire',
    de: '  return casse < plein',
    vers: '  return casse <= plein' },

  { nom: '🔴 un prix ABSENT vaut zero et laisse passer l offre',
    de: '  if (casse <= 0 || plein <= 0) return false',
    vers: '  if (false) return false' },

  { nom: '🔴 la lecture cesse de se defendre seule (offres non valables affichees)',
    de: '    .filter(o => offreValable(o) && fenetreOuverte(o, instant))',
    vers: '    .filter(o => fenetreOuverte(o, instant))' },

  { nom: '🔴 le titre cote Yopper emprunte le verbe de Too Good To Go',
    de: "export const TITRE_YOPPER = 'Rien ne se perd'",
    vers: "export const TITRE_YOPPER = 'A sauver pres de chez toi'" },

  { nom: '🔴 le bouton redevient une injonction',
    de: "export const LIBELLE_BOUTON = 'Je le prends'",
    vers: "export const LIBELLE_BOUTON = 'Depeche-toi !'" },

  // ─── LES CRÉNEAUX, ET LE REFUS QUI DIT POURQUOI ─────────────────────────
  { nom: '🔴 le chevauchement ne se lit plus que dans un sens',
    de: '    return dansFenetre(debutC, debutF, finF) || dansFenetre(debutF, debutC, finC)',
    vers: '    return dansFenetre(debutC, debutF, finF)' },

  // ⚠️ PAS DE DEUXIEME MUTATION SUR LE FILTRE, ET C EST DELIBERE. Ma premiere
  // tentative enveloppait le filtre dans un `.filter(() => true)` : le filtre
  // suivant s appliquait quand meme, donc RIEN NE CHANGEAIT. Une mutation qui
  // ne mute rien est une mutation manquee. La regle du chevauchement est deja
  // mesuree par la mutation ci-dessus.

  { nom: '🔴 on publie une offre que personne ne peut venir chercher',
    de: '  if (creneauxUtilisables(offre, creneaux).length === 0) {',
    vers: '  if (false) {' },

  // ⚠️ CIBLE SUR LA PARTIE STABLE DE LA LIGNE. Le gabarit contient des accents
  // graves et des `${}` : les faire traverser un shell les detruit, et la
  // mutation ecrite de travers a fait PLANTER le banc au lieu de le faire
  // rougir. On ne vise donc que le debut de la phrase.
  //
  // ⚠️ ET ON VISE LE CHIFFRE, PAS LA PROSE AUTOUR. Ma deuxieme tentative
  // remplacait « Ta remise est de » par « Remise insuffisante. » : le message
  // gardait ses deux nombres, donc la garde, qui mesure les NOMBRES, restait
  // verte a juste titre. Retirer le chiffre du commercant, la, degrade
  // vraiment ce qu il lit.
  { nom: '🔴 le refus cesse de donner la remise obtenue',
    de: 'Ta remise est de ${remise} %',
    vers: 'Ta remise est trop faible' },

  { nom: '🔴 le refus du creneau ne nomme plus le geste qui repare',
    de: "    return 'Aucun créneau de retrait dans cette plage. Ajoute un créneau, sinon personne ne pourra venir chercher.'",
    vers: "    return 'Plage invalide.'" },

  // ⚠️ LES TROIS MUTATIONS DU STOCK ONT ETE RETIREES LE 04/09 : la fonction
  // qu elles mesuraient reposait sur une premisse fausse et a ete supprimee.
  // La quantite vit desormais sur l OFFRE, pas sur l article. Voir
  // migrations/MIGRATION_OFFRE_QUANTITE.sql.

  // ─── CE QUE L'ÉCRAN ÉCRIT ───────────────────────────────────────────────
  { nom: '🔴 l’heure s’ecrit sans espace (« 19h »)',
    fichier: HEURE,
    de: "  return min === 0 ? `${h} h` : `${h} h ${String(min).padStart(2, '0')}`",
    vers: "  return min === 0 ? `${h}h` : `${h}h${String(min).padStart(2, '0')}`" },

  // ─── LE CRÉNEAU DOIT RESTER RÉSERVABLE (04/09) ──────────────────────────
  //
  // 🔴 CETTE FONCTION NE REGARDAIT QUE LE CHEVAUCHEMENT, c'est-à-dire une
  // FORME, là où la vraie question est un COMPORTEMENT : peut-on encore le
  // réserver ? Une offre publiée à 17 h pour un créneau de 18 h dont la
  // clôture est réglée à 48 h passait toutes les vérifications, s'affichait,
  // et n'était réservable par personne. Le commerçant aurait accusé Yoppaa.
  { nom: '🔴 un creneau DEJA COMMENCE redevient reservable',
    de: '    if (apres >= duree) return false',
    vers: '    if (false) return false' },

  { nom: '🔴 la cloture du creneau n’est plus regardee a la publication',
    de: '    return apres >= margeDeCloture(c)',
    vers: '    return true' },

  { nom: '🔴 la cloture se compte en MINUTES au lieu d’heures',
    de: "  return (Number.isFinite(h) && h > 0) ? h * 60 : 0",
    vers: "  return (Number.isFinite(h) && h > 0) ? h : 0" },

  // ⚠️ La friterie ouverte de 22 h à 1 h : comparer deux heures de pendule à
  // la soustraction se trompe d'une journée entière.
  { nom: '🔴 le calcul circulaire disparait (la fenetre de nuit casse)',
    de: '  return (((instant - debutFenetre) % 1440) + 1440) % 1440',
    vers: '  return instant - debutFenetre' },

  // ⚠️ DEUX CAUSES, DEUX GESTES. « Ajoute un créneau » quand le créneau existe
  // pousse le commerçant à en créer un second, aussi inutilisable.
  { nom: '🔴 le refus ne distingue plus la cloture de l’absence de creneau',
    de: '    if (dansLaPlage.length > 0) {',
    vers: '    if (false) {' },

  // ─── LE GESTE DE L'INVENDU (04/09) ──────────────────────────────────────
  //
  // 🔴 IL EST 17 H ET IL A LES MAINS DANS LA FARINE. Chacune de ces mutations
  // remet un defaut qui lui ferait rater une vente ou publier dans le vide.

  // 🔴 Une journee coupee ferme LE SOIR, pas a midi. Se tromper ici publierait
  // un invendu deja termine au moment ou il s affiche.
  { nom: '🔴 la fermeture se lit sur la PREMIERE plage (midi au lieu du soir)',
    fichier: 'lib/ouverture.js',
    de: '  const fins = plages.map(([, f]) => String(f || \'\')).filter(Boolean).sort()',
    vers: '  const fins = plages.map(([, f]) => String(f || \'\')).filter(Boolean).sort().reverse()' },

  // 🔴 Publier a 17 h 58 pour 18 h n envoie personne, et le commercant croit
  // avoir publie.
  { nom: '🔴 on publie encore deux minutes avant la fermeture',
    de: '  if (fin - debut < MINUTES_UTILES_MINIMUM) return null',
    vers: '  if (false) return null' },

  { nom: '🔴 le quart d heure utile tombe a zero',
    de: 'export const MINUTES_UTILES_MINIMUM = 15',
    vers: 'export const MINUTES_UTILES_MINIMUM = 0' },

  { nom: '🔴 l heure perd son zero de tete (« 9:05 » au lieu de « 09:05 »)',
    de: "  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`",
    vers: '  return `${Math.floor(m / 60)}:${Math.round(m % 60)}`' },

  { nom: '🔴 minuit-et-un-jour passe pour une heure du jour',
    de: '  if (!Number.isFinite(m) || m < 0 || m >= 1440) return null',
    vers: '  if (!Number.isFinite(m)) return null' },

  // ⚠️ Le conseil SUIT la constante, il ne la recopie pas.
  { nom: '🔴 le prix conseille cesse de suivre la remise conseillee',
    de: '  return Math.round(plein * (100 - REMISE_CONSEILLEE)) / 100',
    vers: '  return Math.round(plein * 80) / 100' },

  { nom: '🔴 un prix habituel absent vaut zero et se publie',
    de: '  if (!Number.isFinite(plein) || plein <= 0) return null',
    vers: '  if (!Number.isFinite(plein)) return null' },

  // 🔴 Un invendu ne survit pas a sa journee, et la lecture des deals du jour
  // passe par ces colonnes : sans elles, l offre existerait sans s afficher.
  { nom: '🔴 l invendu ne porte plus la date du jour',
    de: '    date_deal: jour,',
    vers: '    date_deal: null,' },

  // 🔴 « remise_pct » aurait remise TOUT le stock du jour, pas seulement le
  // reste declare.
  { nom: '🔴 l invendu remise tout le stock au lieu d etre une offre a part',
    de: "    deal_type: 'lot',",
    vers: "    deal_type: 'remise_pct'," },

  // ⚠️ Le Good Morning part a 7 h, l invendu vit a 17 h.
  { nom: '🔴 l invendu part dans le Good Morning du lendemain',
    de: '    inclus_morning: false,',
    vers: '    inclus_morning: true,' },

  { nom: '🔴 une quantite nulle se publie',
    de: '  if (!Number.isFinite(quantite) || quantite < 1) return null',
    vers: '  if (!Number.isFinite(quantite)) return null' },

  { nom: '🔴 le titre n est plus le nom de l article',
    de: '    titre: article.nom,',
    vers: "    titre: 'Offre du soir'," },

  // ─── LE CÂBLAGE DES DEUX ÉCRANS ─────────────────────────────────────────
  { nom: '🔴 le geste de l invendu disparait du tableau de bord',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: '      <AvantLaFermeture commercantId={commercantId} commercant={commercant}',
    vers: '      <AvantLaFermeterX commercantId={commercantId} commercant={commercant}' },

  // 🔴 `peut` applique la CATEGORIE : en detail le stock se decremente en dur,
  // la meme offre le compterait deux fois.
  { nom: '🔴 l invendu s ouvre au detail, ou le stock se compte deux fois',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: "  if (!peut(commercant, 'anti_gaspi')) return null",
    vers: "  if (!canDo(planEffectif(commercant), 'anti_gaspi')) return null" },

  { nom: '🔴 le refus de publication n est plus oppose avant l envoi',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: '  const refus = offre ? refusDePublication(offre, creneaux) : null',
    vers: '  const refus = null' },

  { nom: '🔴 le resultat de la publication n est plus lu',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: "    const { error } = await supabase.from('yoppaa_deals').insert(ligne)",
    vers: "    const error = null; await supabase.from('yoppaa_deals').insert(ligne)" },

  { nom: '🔴 la vitrine se met a se brader',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: '  const vendables = (articles || []).filter(a => a.actif !== false && !a.est_vitrine && Number(a.prix) > 0)',
    vers: '  const vendables = (articles || []).filter(a => a.actif !== false)' },

  { nom: '🔴 le filtre et le tri des invendus se refont dans l ecran',
    fichier: 'app/commander/page.js',
    de: '    const ouvertes = offresOuvertes(invendus || [])',
    vers: '    const ouvertes = (invendus || []).map(o => ({ offre: o, restant: 0, remise: 0 }))' },

  { nom: '🔴 l accueil releve des deals qui ne portent aucune fenetre',
    fichier: 'app/commander/page.js',
    de: "      .not('heure_fin', 'is', null)",
    vers: '      .limit(50)' },

  // ⚠️ ANCRE REPOINTÉE LE 05/09 : la section se juge désormais sur le PÉRIMÈTRE,
  // pas sur ce qui est ouvert dans tout le pays.
  { nom: '🔴 la section « Rien ne se perd » s affiche vide',
    fichier: 'app/commander/page.js',
    de: '              {invendusProches.length > 0 && (',
    vers: '              {true && (' },

  // ─── LE PLAFOND DE L'OFFRE (04/09 au soir) ──────────────────────────────
  //
  // 🔴 IL PUBLIE TROIS ASSIETTES, LA FICHE EN PROPOSAIT QUINZE. Elle lisait le
  // stock du jour de l ARTICLE, pas la quantite de l OFFRE : 71 € de manque a
  // gagner sur une offre censee ecouler trois restes, sans aucune erreur nulle
  // part. Chacune de ces mutations remet ce defaut.

  { nom: '🔴 un lot ordinaire herite d un plafond et devient invendable',
    de: '  return Number.isFinite(q) && q > 0 ? Math.floor(q) : null',
    vers: '  return Number.isFinite(q) ? Math.floor(q) : 0' },

  // ⚠️ Deux paniers partis en meme temps peuvent depasser : l ecran ne doit pas
  // annoncer « -1 restant » a celui d apres.
  { nom: '🔴 un depassement affiche un reste NEGATIF',
    de: '  return Math.max(0, plafond - (Number.isFinite(vendu) && vendu > 0 ? vendu : 0))',
    vers: '  return plafond - (Number.isFinite(vendu) && vendu > 0 ? vendu : 0)' },

  { nom: '🔴 le refus ne dit plus combien il en reste',
    de: '  return `${quoi} : il n\'en reste que ${reste} à ce prix.`',
    vers: '  return `${quoi} : il n\'y en a pas assez.`' },

  { nom: '🔴 le depassement passe au paiement',
    de: '  if (veut <= reste) return null',
    vers: '  return null' },

  { nom: '🔴 la carte annonce un reste quand tout est parti',
    de: '  if (!Number.isFinite(n) || n <= 0) return \'\'',
    vers: '  if (!Number.isFinite(n)) return \'\'' },

  // ─── LE SERVEUR, C'EST-À-DIRE LA SEULE PROTECTION RÉELLE ────────────────
  { nom: '🔴 les lignes d un meme panier ne s additionnent plus',
    fichier: 'lib/lignes-commande.js',
    de: '    demandeParDeal[l.deal_id] = (demandeParDeal[l.deal_id] || 0) + l.quantite',
    vers: '    demandeParDeal[l.deal_id] = l.quantite' },

  // 🔴 Un releve en echec traite comme « rien de vendu » ouvrirait le plafond en
  // grand exactement le jour ou la base tousse.
  { nom: '🔴 un releve en echec laisse passer au lieu de refuser',
    fichier: 'lib/lignes-commande.js',
    de: "    return { ok: false, status: 503, error: 'Impossible de vérifier ce qu\\'il reste sur cette offre. Réessaie dans un instant.' }",
    vers: '    return { ok: true }' },

  // ⚠️ Memes statuts que le stock, mot pour mot : une commande non retiree rend
  // sa marchandise, une commande en attente de paiement tient sa place.
  { nom: '🔴 les commandes annulees se remettent a consommer l offre',
    fichier: 'lib/lignes-commande.js',
    // ⚠️ ANCRE SUR UNE SEULE LIGNE. La première portait un saut de ligne, ce
    // que l'en-tête interdit : elle n'aurait valu que sur une machine.
    //
    // ⚠️ ET MA DEUXIÈME TENTATIVE A FAIT PLANTER LE BANC au lieu de le faire
    // rougir : elle ajoutait un `.limit(0)` que la fausse base ne connaît pas.
    // UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
    // 🔴 ET LA TROISIÈME TENTATIVE A RÉVÉLÉ LE VRAI DÉFAUT. La liste était
    // écrite DEUX FOIS dans le même fichier, pour le stock et pour l'offre, avec
    // un commentaire promettant qu'elles disaient la même chose. `String.replace`
    // prenait la première — celle du stock — et le banc restait vert à juste
    // titre. La duplication est retirée : une seule constante, deux lecteurs.
    de: 'export const STATUTS_QUI_NE_CONSOMMENT_PAS = \'("non_retire","annulee_paiement_ko","annulee_client_refund")\'',
    vers: 'export const STATUTS_QUI_NE_CONSOMMENT_PAS = \'("non_retire")\'' },

  { nom: '🔴 le select des deals ne demande plus la quantite',
    fichier: 'lib/lignes-commande.js',
    de: 'heure_debut, heure_fin, quantite\'',
    vers: 'heure_debut, heure_fin\'' },

  { nom: '🔴 la route cesse d opposer le plafond de l offre',
    fichier: 'app/api/stripe/checkout/create-commande/route.js',
    de: '    if (!verifOffres.ok) {',
    vers: '    if (false) {' },

  { nom: '🔴 la commande n ecrit plus quelle offre l a produite',
    fichier: 'app/api/stripe/checkout/create-commande/route.js',
    de: '        deal_id: l.deal_id || null,',
    vers: '        deal_id: null,' },

  // ─── LES DEUX ÉCRANS ────────────────────────────────────────────────────
  { nom: '🔴 l accueil affiche le total publie au lieu de ce qui reste',
    fichier: 'app/commander/page.js',
    de: '        ouvertes.forEach(o => { o.reste = resteSurOffre(o.offre, vendus[o.offre.id] || 0) })',
    vers: '        ouvertes.forEach(o => { o.reste = o.offre.quantite })' },

  { nom: '🔴 l accueil invente un chiffre quand le releve ne repond pas',
    fichier: 'app/commander/page.js',
    de: '      if (Array.isArray(comptes)) {',
    vers: '      if (true) {' },

  { nom: '🔴 le panier n oppose plus le plafond de l offre',
    fichier: 'app/commander/[slug]/page.js',
    de: '    if (plafond !== null && (panier[key]?.quantite || 0) + 1 > plafond) return',
    vers: '    if (false) return' },

  // 🔴 Alex, 04/09 : « ca ne doit pas etre confondu avec un deal classique ».
  { nom: '🔴 l invendu redevient le « deal du jour » en bandeau',
    fichier: 'app/commander/[slug]/page.js',
    de: '    const ordinaires = dealsActifs.filter(d => !porteUneFenetre(d))',
    vers: '    const ordinaires = dealsActifs' },

  { nom: '🔴 l invendu reprend l habit d un deal ordinaire',
    fichier: 'app/commander/[slug]/page.js',
    de: '  const invendu = porteUneFenetre(deal)',
    vers: '  const invendu = false' },

  { nom: '🔴 le bouton reste cliquable quand tout est parti',
    fichier: 'app/commander/[slug]/page.js',
    de: '          {reste === 0 ? (',
    vers: '          {false ? (' },

  // ─── LE PÉRIMÈTRE (05/09) ───────────────────────────────────────────────
  //
  // 🔴 ALEX : « la card anti gaspi s'affiche sur quels critères ? » La réponse
  // était AUCUN : toute la Belgique, triée par temps restant. Ces mutations
  // mesurent que le rayon existe, que l'ordre suit la proximité, et que la
  // distance inconnue ne se fait pas passer pour zéro mètre.
  { nom: '🔴 le rayon ne plafonne plus rien (toute la Belgique revient)',
    de: '    .filter(o => o.distance === null || o.distance <= plafond)',
    vers: '    .filter(() => true)' },

  { nom: '🔴 l’ordre repasse a l’urgence au lieu de la proximite',
    de: '      || comparerDistance(a.distance, b.distance)',
    vers: '      || 0' },

  // 🔴 CELLE-CI A ATTRAPÉ UN VRAI DÉFAUT LE 05/09, dans ce module même.
  { nom: '🔴 le piege du zero revient : une distance inconnue vaut 0 metre',
    de: "      const d = brut === null || brut === undefined || brut === '' ? NaN : Number(brut)",
    vers: '      const d = Number(brut)' },

  // ⚠️ LES DEUX BRANCHES SE MUTENT SÉPARÉMENT. `comparerDistance` est
  // symétrique, et le tri de V8 n'appelle le comparateur que dans un sens sur
  // une liste de deux : n'en muter qu'une laissait le banc vert.
  { nom: '🔴 la distance inconnue repasse devant celle qu’on connait',
    de: '  if (a === null) return 1',
    vers: '  if (a === null) return -1' },

  { nom: '🔴 idem dans l’autre sens de comparaison',
    de: '  if (b === null) return -1',
    vers: '  if (b === null) return 1' },

  { nom: '🔴 le lien oublie l’offre et renvoie en haut de la fiche',
    de: '  if (!offreId) return base',
    vers: '  return base' },

  { nom: '🔴 le slug n’est plus encode dans le lien de l’offre',
    de: '  const base = `/commander/${encodeURIComponent(slug)}`',
    vers: '  const base = `/commander/${slug}`' },

  { nom: '🔴 le partage promet une quantite qui aura change en chemin',
    de: '  return `${quoi}${chez}${combien}, avant la fermeture. ${TITRE_YOPPER}, sur Yoppaa.`',
    vers: '  return `${quoi}${chez}${combien}, il en reste. ${TITRE_YOPPER}, sur Yoppaa.`' },

  // ─── L'ÉCRAN D'ACCUEIL ──────────────────────────────────────────────────
  { nom: '🔴 la section se juge sur ce qui est ouvert, pas sur le perimetre',
    fichier: 'app/commander/page.js',
    de: '              {invendusProches.length > 0 && (',
    vers: '              {invendusOuverts.length > 0 && (' },

  { nom: '🔴 l’accueil ne relaie plus la distance du commercant',
    fichier: 'app/commander/page.js',
    de: '    distanceDe: offre => commercants.find(c => c.id === offre?.commercant_id)?.distance ?? null,',
    vers: '    distanceDe: () => null,' },

  // ─── LA BANDE D'UNE LIGNE ET SON PANNEAU (05/09, deuxième passe) ─────────
  //
  // ⚠️ TROIS ANCRES RETIRÉES ICI. Le plafond « quatre cartes », le bouton
  // « Voir les 9 » et le repli n'existent plus : l'accueil ne porte AUCUNE
  // carte, et le panneau les montre toutes. Une mutation sur du code supprimé
  // ne mesure rien, elle se contente de faire du bruit dans le rapport.
  { nom: '🔴 le decompte disparait de la bande',
    fichier: 'app/commander/page.js',
    de: '<span style={{ fontSize: 12, fontWeight: 700, color: T.light, whiteSpace: \'nowrap\', flexShrink: 0, marginLeft: \'auto\' }}>{libelleDecompte(invendusProches)}</span>',
    vers: '<span>{null}</span>' },

  { nom: '🔴 le decompte se tronque au lieu du titre',
    fichier: 'app/commander/page.js',
    de: "color: T.light, whiteSpace: 'nowrap', flexShrink: 0, marginLeft: 'auto'",
    vers: "color: T.light, overflow: 'hidden', textOverflow: 'ellipsis', marginLeft: 'auto'" },

  { nom: '🔴 le sous-titre revient encombrer l’accueil',
    fichier: 'app/commander/page.js',
    de: '                  <IconeAntiGaspi taille={18} epaisseur={2.3} couleur={MARQUE_SUR_NUIT}/>',
    vers: '                  <span>{SOUS_TITRE_YOPPER}</span>' },

  { nom: '🔴 le panneau se plafonne et cache des offres',
    fichier: 'app/commander/page.js',
    de: '              {invendusProches.map(({ offre, restant, remise, reste, distance }) => {',
    vers: '              {invendusProches.slice(0, 4).map(({ offre, restant, remise, reste, distance }) => {' },

  { nom: '🔴 le clic perd l’offre et retombe en haut du catalogue',
    fichier: 'app/commander/page.js',
    de: '                    onOuvrir={() => commerce && selectionnerCommercant(commerce, offre.id)}',
    vers: '                    onOuvrir={() => commerce && selectionnerCommercant(commerce)}' },

  { nom: '🔴 le bouton retour quitte l application au lieu de fermer',
    fichier: 'app/commander/page.js',
    de: '    if (listePoussee.current) { listePoussee.current = false; window.history.back(); return }',
    vers: '    window.history.back(); return' },

  { nom: '🔴 l ouverture n empile plus d etape : le retour sort de l app',
    fichier: 'app/commander/page.js',
    de: "      window.history.pushState({ yoppaaListe: true }, '', url.toString())",
    vers: "      window.history.replaceState({ yoppaaListe: true }, '', url.toString())" },

  { nom: '🔴 le retour inverse un booleen au lieu de relire l adresse',
    fichier: 'app/commander/page.js',
    de: '      const ouvert = lireLAdresse()',
    vers: '      const ouvert = !listeInvendus' },

  { nom: '🔴 la redirection s empile et enferme le Yopper dans la liste',
    fichier: 'app/rien-ne-se-perd/page.js',
    de: '  redirect(CHEMIN_LISTE)',
    vers: "  redirect(CHEMIN_LISTE, RedirectType.push)" },

  { nom: '🔴 le partage ouvre la fiche sous le doigt',
    fichier: 'app/commander/page.js',
    de: "    e?.stopPropagation?.()  // toute la carte est cliquable : sans ça, la fiche s'ouvre sous le doigt",
    vers: '    const _sansGarde = true' },

  { nom: '🔴 le partage renvoie vers la fiche au lieu de l’offre',
    fichier: 'app/commander/page.js',
    de: '    const chemin = lienVersOffre(commerce?.slug, offre?.id)',
    vers: '    const chemin = lienVersOffre(commerce?.slug, null)' },

  { nom: '🔴 le titre de la carte se retronque a une ligne',
    fichier: 'app/commander/page.js',
    de: "lineHeight: 1.25, display: '-webkit-box', WebkitLineClamp: 2",
    vers: "lineHeight: 1.25, display: '-webkit-box', WebkitLineClamp: 1" },

  { nom: '🔴 la pastille de temps restant disparait',
    fichier: 'app/commander/page.js',
    de: '        {tempsRestant && (',
    vers: '        {false && (' },

  { nom: '🔴 la pastille de quantite disparait',
    fichier: 'app/commander/page.js',
    de: '        {quantite && (',
    vers: '        {false && (' },

  { nom: '🔴 la pastille de distance disparait',
    fichier: 'app/commander/page.js',
    de: '        {distance != null && (',
    vers: '        {false && (' },

  { nom: '🔴 la carte redevient un bouton (bouton dans bouton)',
    fichier: 'app/commander/page.js',
    de: '    <div onClick={onOuvrir}',
    vers: '    <button onClick={onOuvrir}' },

  // ─── LA FICHE, ARRIVER À HAUTEUR DE L'OFFRE ─────────────────────────────
  { nom: '🔴 la fiche vise n’importe quel identifiant venu de l’adresse',
    fichier: 'app/commander/[slug]/page.js',
    de: '    if (String(offreAttendue.current) !== String(id)) return',
    vers: '    if (false) return' },

  { nom: '🔴 le saut se rejoue a chaque redessin du catalogue',
    fichier: 'app/commander/[slug]/page.js',
    de: '    offreAttendue.current = null',
    vers: '    offreAttendue.current = offreAttendue.current' },

  { nom: '🔴 la mesure redevient dependante d’un ancetre positionne',
    fichier: 'app/commander/[slug]/page.js',
    de: '      const haut = scroll.scrollTop + (el.getBoundingClientRect().top - scroll.getBoundingClientRect().top) - 90',
    vers: '      const haut = scroll.scrollTop + el.offsetTop - 90' },

  // ⚠️ AUCUN SAUT DE LIGNE DANS L'ANCRE : on remplace la référence par `null`
  // plutôt que de supprimer la ligne. Le premier des deux rendus perd son
  // ancre, le compte passe de deux à un, et la garde doit le dire.
  { nom: '🔴 un seul des deux rendus porte l’ancre',
    fichier: 'app/commander/[slug]/page.js',
    de: '                                ancre={el => viserOffre(dl.id, el)}',
    vers: '                                ancre={null}' },

  // ⚠️ LE MINUTEUR NE DOIT PAS REVENIR. La première écriture guettait la carte
  // avec un `setInterval` de 140 ms, refusé par le banc de la fiche.
  { nom: '🔴 le minuteur de guet revient',
    fichier: 'app/commander/[slug]/page.js',
    de: '  function viserOffre(id, el) {',
    vers: '  function viserOffre(id, el) { setInterval(() => viserOffre(id, el), 140)' },

  // ⚠️ ANCRE REPOINTÉE LE 05/09 : la lecture de l'adresse est passée d'un effet
  // à l'initialisation paresseuse de la référence, pour être faite AVANT que la
  // première carte ne se signale.
  { nom: '🔴 la fiche ne lit plus le parametre d’offre',
    fichier: 'app/commander/[slug]/page.js',
    de: '        : new URLSearchParams(window.location.search).get(PARAM_OFFRE)',
    vers: '        : null' },

  // ⚠️ ANCRE REPOINTÉE LE 05/09 : l'en-tête de l'invendu est devenu une pastille
  // nuit, plus un simple libellé.
  { nom: '🔴 la marque anti-gaspi coiffe aussi le deal ordinaire',
    fichier: 'app/commander/[slug]/page.js',
    de: '              <IconeAntiGaspi taille={11} epaisseur={2.6} couleur={MARQUE_SUR_NUIT}/>',
    vers: '              {null}' },

  // ─── BANDEAU NUIT, CARTES PAPIER (05/09) ────────────────────────────────
  //
  // 🔴 CE QUE CES MUTATIONS GARDENT : que le poids reste sur le TITRE, une
  // seule fois, et jamais sur chacune des quatre cartes. C'est la densité à
  // quatre qui a tranché entre les six habits.
  // ⚠️ ANCRE REPOINTÉE : le bandeau est devenu une bande cliquable d'une ligne.
  { nom: '🔴 la bande perd sa nuit et redevient un titre nu',
    fichier: 'app/commander/page.js',
    de: "background: NUIT_ANTI_GASPI, border: 'none', borderRadius: 12",
    vers: "border: 'none', borderRadius: 12" },

  { nom: '🔴 l en-tete du panneau perd sa nuit',
    fichier: 'app/commander/page.js',
    de: "background: NUIT_ANTI_GASPI, padding: 'max(env(safe-area-inset-top)",
    vers: "padding: 'max(env(safe-area-inset-top)" },

  // ⚠️ CELLE-CI EST RESTÉE VERTE LE 05/09 : la nuit apparaît à DEUX endroits, et
  // la garde cherchait le MOT. Elle compte désormais les deux.
  { nom: '🔴 la marque perd son Light sur l en-tete du panneau',
    fichier: 'app/commander/page.js',
    de: '<IconeAntiGaspi taille={20} epaisseur={2.2} couleur={MARQUE_SUR_NUIT}/>',
    vers: '<IconeAntiGaspi taille={20} epaisseur={2.2}/>' },

  { nom: '🔴 la marque perd son Light sur la bande',
    fichier: 'app/commander/page.js',
    de: '<IconeAntiGaspi taille={18} epaisseur={2.3} couleur={MARQUE_SUR_NUIT}/>',
    vers: '<IconeAntiGaspi taille={18} epaisseur={2.3}/>' },

  // ⚠️ LA GARDE INTERDIT LA PRATIQUE, PAS UNE COULEUR : n'importe quel code
  // hexadécimal en dur dans la carte doit la faire rougir.
  { nom: '🔴 une couleur revient en dur dans la carte',
    fichier: 'app/commander/page.js',
    de: 'fontWeight: 800, color: ENCRE_DOUCE_ANTI_GASPI,',
    vers: "fontWeight: 800, color: '#5B4A3A'," },

  { nom: '🔴 la carte reprend la nuit : quatre masses sombres au lieu d une',
    fichier: 'app/commander/page.js',
    de: "style={{ position: 'relative', background: FOND_ANTI_GASPI",
    vers: "style={{ position: 'relative', background: NUIT_ANTI_GASPI" },

  { nom: '🔴 la fiche perd sa pastille nuit et le papier s y noie',
    fichier: 'app/commander/[slug]/page.js',
    de: "color: '#fff', background: NUIT_ANTI_GASPI",
    vers: "color: ENCRE_ANTI_GASPI, background: 'transparent'" },

  { nom: '🔴 « tout est parti » redevient illisible sur une carte sombre',
    fichier: 'app/commander/[slug]/page.js',
    de: "color: encreDouce, whiteSpace: 'nowrap' }}>Tout est parti",
    vers: "color: '#92400E', whiteSpace: 'nowrap' }}>Tout est parti" },
]

const lancer = () => {
  try {
    const sortie = execSync(`npm run ${BANC}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    // ⚠️ ON DISTINGUE « ROUGE » DE « PLANTÉ ». Un banc qui explose au lieu de
    // rougir n'est pas une mesure, c'est un accident.
    const plante = !/vérifications/.test(sortie)
    return { rouge: true, plante, extrait: sortie.slice(-400) }
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
    console.log(`\n🔴 RESTAURATION RATÉE sur ${MODULE}. On s'arrête.`)
    process.exit(2)
  }

  if (res.rouge && !res.plante) { attrapees++; console.log(`  ✓ attrapée : ${m.nom}`) }
  else if (res.plante) { manquees.push(`${m.nom} — le banc a PLANTÉ`); console.log(`  ⚠ plantage : ${m.nom}`) }
  else { manquees.push(`${m.nom} — RESTÉ VERT`); console.log(`  ✕ MANQUÉE : ${m.nom}`) }
}

console.log(`\n${attrapees}/${MUTATIONS.length} mutations attrapées.`)
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach(x => console.log('   • ' + x)) }

const finalRouge = lancer().rouge
if (finalRouge) console.log(`🔴 ${BANC} ROUGE APRÈS RESTAURATION.`)
else console.log('\nBanc vert après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
