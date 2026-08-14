// Banc de la FICHE COMMERÇANT : bannière, photos, rédaction assistée.
//
// Deux natures de risque ici, et le banc les traite différemment.
//
// Les décisions produit (05/08) se verrouillent en lisant les sources : le
// haut de fiche ne doit plus jamais afficher de photo, et les photos ne doivent
// pas se perdre au passage. Ces règles-là ne se déduisent d'aucun calcul.
//
// La lecture du site web, elle, est du code exposé : une adresse fournie par un
// inconnu que NOTRE serveur va chercher. Elle mérite de vrais tests, parce
// qu'une erreur y coûte bien plus qu'un affichage de travers.

import { readFileSync, readdirSync } from 'node:fs'
import { CONSEILS_PHOTOS, MAX_PHOTOS, conseilPhoto, etatGalerie, deplacerPhoto, metierPhotos } from '../lib/guide-photos.js'
import { normaliserUrl, estIpPrivee, texteUtile } from '../lib/site-web.js'
import { symbolePourType, symbolesPourType, couleurPourNom, logoProvisoireSvg, propositionsLogo } from '../lib/logo-provisoire.js'
import { TYPES_SERVICE, TYPES_ALIMENTAIRE, TYPES_DETAIL } from '../lib/types-commerce.js'
import { emailMerciPreinscription } from '../lib/resend-landing.js'

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}
const egal = (nom, a, b) => verifier(nom, JSON.stringify(a) === JSON.stringify(b), `obtenu ${JSON.stringify(a)}, attendu ${JSON.stringify(b)}`)
const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')

// Tous les fichiers JS sous ces dossiers, pour les règles qui portent sur le
// PROJET ENTIER et non sur un fichier nommé. Une règle du genre « ceci ne doit
// exister qu'une fois » ne vaut que si elle regarde partout : bornée à un
// fichier, elle interdit surtout de déplacer le code.
function fichiersJs(dossiers) {
  const trouves = []
  const parcourir = (url) => {
    for (const e of readdirSync(url, { withFileTypes: true })) {
      const enfant = new URL(`${e.name}${e.isDirectory() ? '/' : ''}`, url)
      if (e.isDirectory()) parcourir(enfant)
      else if (/\.jsx?$/.test(e.name)) trouves.push(enfant)
    }
  }
  for (const d of dossiers) parcourir(new URL(`../${d}/`, import.meta.url))
  return trouves
}

// ⚠️ RETIRER LES COMMENTAIRES AVANT DE JUGER UN FICHIER SOURCE. Celui qui
// explique un défaut corrigé cite forcément la ligne fautive, et la recherche
// tombe dessus. Le piège s'est refermé cinq fois sur ce projet.
const sansCommentaires = (src) =>
  src.split(/\r?\n/).filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

// ═══════════════════════════════════════════════════════════════════════════
// 1. LA BANNIÈRE — toujours le nom, jamais la photo
// ═══════════════════════════════════════════════════════════════════════════
const banniere = lire('app/components/BanniereCommerce.js')
verifier('la bannière affiche le nom du commerce', /\{nom\}/.test(banniere))
verifier('la bannière n\'affiche aucune photo', !/<img/.test(banniere))

// ⚠️ LE PIÈGE DU PADDING EN POURCENTAGE, vécu deux fois.
// Le nom doit tomber dans le TIERS HAUT du bandeau, sinon la carte blanche
// d'identité, qui flotte par-dessus le bas, le recouvre. Le retrait valait
// `18%`, ce qui marchait tant que la colonne faisait 390 px.
//
// Sauf qu'un padding en pourcentage se calcule sur la LARGEUR du bloc, JAMAIS
// sur sa hauteur. Le jour où la colonne est passée à 1200 px sur PC, ces 18 %
// sont devenus 216 px sur un bandeau de 280 px : le nom est allé se cacher
// derrière la carte. Même défaut qu'en mai, revenu par une autre porte.
// ⚠️ CES DEUX TESTS VERROUILLAIENT UNE SYNTAXE, pas une règle, et le 15/08
// l'un a rougi pendant que L'AUTRE DEVENAIT FAUSSEMENT VERT. En passant la
// classe en gabarit, pour y ajouter `banniere-compacte`, l'écriture
// `className="banniere-commerce"` a disparu du fichier :
//
//   • le test d'accroche, qui la cherchait mot pour mot, a rougi ;
//   • le test du retrait découpait le fichier à partir de cette même chaîne.
//     `indexOf` a rendu -1, `slice(-1)` a rendu UN SEUL CARACTÈRE, et le test
//     a continué de passer en ne regardant plus rien du tout.
//
// C'est la deuxième fois qu'un découpage par `indexOf` se retourne ainsi, après
// le renommage d'une section de Config le 12/08. On juge donc le fichier ENTIER,
// et on cherche la classe telle qu'elle est UTILISÉE, quelle que soit la façon
// de l'écrire.
//
// ⚠️ ET LA VALEUR S'ARRÊTE À LA VIRGULE, pas au point-virgule : on est dans un
// objet JavaScript, pas dans une feuille de style. Bornée au point-virgule, la
// recherche courait au-delà du `padding` jusqu'aux pourcentages des dégradés
// radiaux, et rougissait sur un code parfaitement correct.
verifier('le retrait du nom ne dépend pas de la largeur du bandeau',
  !/padding[^:]*:[^,]*\d+%/.test(banniere))
verifier('le retrait est exprimé en pixels', /RETRAIT_HAUT = \d+/.test(banniere))
// Les classes servent d'accroche aux règles PC : sans elles, impossible
// d'agrandir le nom sur grand écran, un style en ligne ne porte pas de media query.
verifier('la bannière est accrochable depuis la feuille globale',
  /className=[^>]*banniere-commerce/.test(banniere) && /className=[^>]*banniere-nom/.test(banniere))

for (const chemin of ['app/commander/[slug]/page.js', 'app/commander/rdv/[slug]/page.js']) {
  const src = lire(chemin)
  // Viser le JSX, pas la feuille de style : `.fiche-hero { height }` apparaît
  // plusieurs centaines de lignes AVANT le bandeau lui-même.
  const debutHero = src.indexOf('className="fiche-hero"')
  verifier(`${chemin} : le bandeau existe`, debutHero > 0)
  const hero = src.slice(debutHero, debutHero + 1400)
  verifier(`${chemin} : le haut de fiche est la bannière`, /<BanniereCommerce/.test(hero))
  // C'est LE piège de ce changement : basculer le hero en bannière sans
  // descendre les photos, et faire disparaître les images de tout le monde.
  verifier(`${chemin} : les photos sont reprises plus bas`, /<GalerieCommerce/.test(src))
  verifier(`${chemin} : la couverture ouvre la série`, /photosFiche/.test(src))

  // ⚠️ LE TEST QUI MANQUAIT, ET QUI A COÛTÉ LES PHOTOS DU SALON (09/08).
  // Le banc vérifiait que `<GalerieCommerce` était bien ÉCRIT dans la page,
  // jamais que des photos y arrivaient. La fiche rendez-vous demandait
  // `select('id, url, type, ordre, legende')` : la colonne `legende` n'existe
  // pas dans `commercant_photos`, PostgREST répondait 400, `data` valait null,
  // et la galerie disparaissait SANS la moindre erreur visible. La fiche
  // boutique, elle, lisait `*` et n'a jamais rien eu.
  //
  // La règle qui l'attrape : sur une table partagée par les deux fiches, on
  // lit de la MÊME façon. Une liste de colonnes écrite à la main d'un seul
  // côté est exactement la divergence qu'on ne veut plus.
  const requetePhotos = /\.from\('commercant_photos'\)\s*\n?\s*\.select\((?:\s*\n\s*)?'([^']*)'\)/.exec(src)
    || /from\('commercant_photos'\)\.select\('([^']*)'\)/.exec(src)
  verifier(`${chemin} : la requête des photos est identifiable`, !!requetePhotos)
  verifier(`${chemin} : les photos se lisent avec select('*'), comme l'autre fiche`,
    requetePhotos?.[1] === '*', `obtenu « ${requetePhotos?.[1]} »`)
}

// Le titre du carrousel devait cesser de parler de « maison » : ça ne veut rien
// dire pour un salon, un food truck ou un artisan.
const galerie = lire('app/components/GalerieCommerce.js')
verifier('le carrousel s\'appelle « Mon commerce en images »', /Mon commerce en images/.test(galerie))
for (const chemin of ['app/components/GalerieCommerce.js', 'app/commander/[slug]/page.js', 'app/dashboard/ConfigDashboard.js']) {
  // Seul l'AFFICHÉ compte : les commentaires ont le droit d'expliquer d'où l'on
  // vient, c'est même leur travail.
  const affiche = lire(chemin).split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
  verifier(`${chemin} ne dit plus « La maison en images »`, !/La maison en images/.test(affiche))
}

// ═══════════════════════════════════════════════════════════════════════════
// 1 bis. L'ORDRE DES BLOCS — les deux fiches doivent se répondre
// ═══════════════════════════════════════════════════════════════════════════
// Un commerce peut avoir DEUX fiches : celle des rendez-vous et celle des
// produits. Elles avaient dérivé chacune de leur côté (bandeau différent,
// photos sur une seule des deux, avantages avant les coordonnées). Alex, 05/08 :
// « il faut absolument que les deux soient identiques en structure ».
//
// L'ordre canonique, et le pourquoi de chaque place :
//   1. l'identité, les coordonnées   → à qui ai-je affaire, comment j'y vais
//   2. la fidélité                   → MA relation avec ce commerce, elle donne
//                                      une raison d'acheter AVANT le catalogue
//   3. les photos                    → l'envie
//   4. actus et deals                → ce qui se passe aujourd'hui
//   5. le catalogue                  → le cœur, ce pour quoi on est venu
//   6. le bon cadeau                 → une action de sortie, jamais avant
const ORDRE_CANONIQUE = [
  ['coordonnées', /aria-label="Appeler"/],
  ['fidélité', /<CarteFideliteFiche/],
  ['photos', /<GalerieCommerce/],
  ['bon cadeau', /Offrir un bon cadeau<\/span>/],
]
for (const chemin of ['app/commander/[slug]/page.js', 'app/commander/rdv/[slug]/page.js']) {
  const src = lire(chemin)
  const positions = ORDRE_CANONIQUE.map(([nom, motif]) => {
    const m = motif.exec(src)
    return { nom, index: m ? m.index : -1 }
  })
  for (const p of positions) {
    verifier(`${chemin} : le bloc « ${p.nom} » existe`, p.index > 0)
  }
  for (let i = 1; i < positions.length; i++) {
    verifier(`${chemin} : « ${positions[i].nom} » vient après « ${positions[i - 1].nom} »`,
      positions[i].index > positions[i - 1].index,
      `${positions[i - 1].nom}=${positions[i - 1].index}, ${positions[i].nom}=${positions[i].index}`)
  }
  // Le message de retour de paiement, lui, reste EN HAUT : celui qui revient de
  // sa banque doit le voir sans faire défiler la page.
  const retour = src.indexOf('Ton bon cadeau est payé')
  const bouton = /Offrir un bon cadeau<\/span>/.exec(src)?.index ?? -1
  verifier(`${chemin} : le retour de paiement reste au-dessus du bouton`,
    retour > 0 && bouton > 0 && retour < bouton)
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. LE GUIDE PHOTOS — dix places, dix conseils
// ═══════════════════════════════════════════════════════════════════════════
egal('dix conseils', CONSEILS_PHOTOS.length, MAX_PHOTOS)
verifier('les positions vont de 1 à 10',
  CONSEILS_PHOTOS.every((c, i) => c.position === i + 1))
verifier('chaque conseil a un titre et une aide',
  CONSEILS_PHOTOS.every(c => c.titre?.length > 3 && c.aide?.length > 15))
verifier('la première photo est la devanture', /rue|extérieur|devanture/i.test(conseilPhoto(1).titre + conseilPhoto(1).aide))
verifier('la deuxième est l\'intérieur', /intérieur/i.test(conseilPhoto(2).titre))
// Au-delà de dix, on ne doit pas renvoyer « undefined » dans l'écran.
verifier('une place hors barème reste utilisable', typeof conseilPhoto(99)?.titre === 'string')
verifier('une place absurde reste utilisable', typeof conseilPhoto(0)?.titre === 'string')

// ─── Les conseils s'adaptent au métier (Alex, 09/08) ──────────────────────
// « Recule-toi, prends l'enseigne et la porte » ne veut rien dire pour un
// camion, et « ton produit phare » sonne creux chez un coiffeur.
egal('un food truck se reconnaît à son type',
  metierPhotos({ categorie: 'alimentaire', type: 'Food truck' }), 'foodtruck')
egal('même écrit autrement',
  metierPhotos({ categorie: 'alimentaire', type: 'Snack & Food-Truck' }), 'foodtruck')
egal('une boulangerie reste alimentaire',
  metierPhotos({ categorie: 'alimentaire', type: 'Boulangerie' }), 'alimentaire')
egal('un salon est une vitrine', metierPhotos({ categorie: 'vitrine', type: 'Coiffeur' }), 'vitrine')
egal('sans catégorie, le socle', metierPhotos({}), 'generique')
egal('sans rien du tout, le socle', metierPhotos(), 'generique')

// Le camion n'a ni enseigne ni porte : la première photo doit le dire.
const truck1 = conseilPhoto(1, { categorie: 'alimentaire', type: 'Food truck' })
verifier('la photo 1 d\'un food truck parle du camion', /camion/i.test(truck1.titre + truck1.aide))
verifier('elle ne parle plus de porte ni d\'enseigne fixe', !/prends l'enseigne et la porte/.test(truck1.aide))
// Un salon montre un résultat, pas un rayon.
const salon3 = conseilPhoto(3, { categorie: 'vitrine', type: 'Coiffeur' })
verifier('la photo 3 d\'un salon montre un résultat', /coupe|soin|résultat/i.test(salon3.titre + salon3.aide))
// Et il faut demander l'accord avant de publier le visage de quelqu'un.
verifier('le salon rappelle de demander l\'accord', /accord/i.test(salon3.aide))
// Une boutique montre un rayon.
const detail3 = conseilPhoto(3, { categorie: 'detail', type: 'Librairie' })
verifier('la photo 3 d\'une boutique montre un rayon', /rayon/i.test(detail3.titre + detail3.aide))
// Ce qui n'est pas réécrit doit hériter du socle, sans trou.
for (const metier of ['foodtruck', 'vitrine', 'detail', 'alimentaire', 'generique']) {
  for (let i = 1; i <= MAX_PHOTOS; i++) {
    const c = conseilPhoto(i, metier)
    verifier(`${metier}, photo ${i} : titre et aide présents`, c.titre?.length > 3 && c.aide?.length > 15)
  }
}
// La position ne doit jamais être perdue par une variante.
verifier('la position survit à l\'adaptation',
  [1, 3, 6].every(i => conseilPhoto(i, 'foodtruck').position === i))

// Le ton de l'encouragement : jamais culpabilisant à zéro photo, jamais
// faussement enthousiaste à une seule.
egal('zéro photo', etatGalerie(0).ton, 'vide')
egal('une photo', etatGalerie(1).ton, 'debut')
egal('galerie complète', etatGalerie(MAX_PHOTOS).ton, 'complet')
verifier('aucun message n\'est culpabilisant',
  [0, 1, 3, 10].every(n => !/dommage|manque|devrais|obligatoire/i.test(etatGalerie(n).message)))

// Le réordonnancement. Il renumérote TOUT : deux photos partageant le même
// ordre rendaient l'affichage imprévisible.
const photos = [{ id: 'a', ordre: 0 }, { id: 'b', ordre: 1 }, { id: 'c', ordre: 2 }]
egal('descendre la première', deplacerPhoto(photos, 0, 'apres').map(p => p.id), ['b', 'a', 'c'])
egal('monter la dernière', deplacerPhoto(photos, 2, 'avant').map(p => p.id), ['a', 'c', 'b'])
egal('les positions sont renumérotées', deplacerPhoto(photos, 0, 'apres').map(p => p.ordre), [0, 1, 2])
egal('monter la première ne fait rien', deplacerPhoto(photos, 0, 'avant').map(p => p.id), ['a', 'b', 'c'])
egal('descendre la dernière ne fait rien', deplacerPhoto(photos, 2, 'apres').map(p => p.id), ['a', 'b', 'c'])
egal('index hors liste', deplacerPhoto(photos, 9, 'avant').map(p => p.id), ['a', 'b', 'c'])
egal('liste vide', deplacerPhoto([], 0, 'apres'), [])
// L'appelant ne doit jamais voir son état muté sous ses pieds.
const avant = [{ id: 'a', ordre: 0 }, { id: 'b', ordre: 1 }]
deplacerPhoto(avant, 0, 'apres')
egal('la liste d\'origine n\'est pas modifiée', avant.map(p => p.id), ['a', 'b'])

// ═══════════════════════════════════════════════════════════════════════════
// 3. LA LECTURE DU SITE WEB — une adresse fournie, un serveur qui va la chercher
// ═══════════════════════════════════════════════════════════════════════════
// Un commerçant tape « boulangerie-dupont.be », pas une URL complète.
egal('schéma ajouté', normaliserUrl('boulangerie-dupont.be'), 'https://boulangerie-dupont.be/')
egal('https conservé', normaliserUrl('https://exemple.be/page'), 'https://exemple.be/page')
egal('http accepté', normaliserUrl('http://exemple.be/'), 'http://exemple.be/')
egal('espaces ignorés', normaliserUrl('  exemple.be  '), 'https://exemple.be/')
egal('saisie vide', normaliserUrl(''), null)
egal('saisie absente', normaliserUrl(null), null)
// Les schémas exotiques sont la porte d'entrée classique : file:// lirait un
// fichier du serveur, javascript: n'a rien à faire ici.
egal('file:// refusé', normaliserUrl('file:///etc/passwd'), null)
egal('javascript: refusé', normaliserUrl('javascript:alert(1)'), null)
// Sans point, ce n'est pas un domaine public mais une machine du réseau.
egal('localhost refusé', normaliserUrl('localhost'), null)
egal('nom interne refusé', normaliserUrl('http://intranet/'), null)

// Et même avec un nom public, l'adresse obtenue peut pointer vers l'intérieur.
verifier('boucle locale', estIpPrivee('127.0.0.1'))
verifier('IPv6 locale', estIpPrivee('::1'))
verifier('réseau privé 10.x', estIpPrivee('10.0.0.5'))
verifier('réseau privé 192.168.x', estIpPrivee('192.168.1.1'))
verifier('réseau privé 172.16-31', estIpPrivee('172.20.10.1'))
verifier('172.32 est public', !estIpPrivee('172.32.0.1'))
verifier('métadonnées cloud 169.254.169.254', estIpPrivee('169.254.169.254'))
verifier('CGNAT 100.64', estIpPrivee('100.64.0.1'))
verifier('adresse vide refusée', estIpPrivee(''))
verifier('adresse absurde refusée', estIpPrivee('pas-une-ip'))
verifier('une adresse publique passe', !estIpPrivee('81.240.1.1'))

// Le texte envoyé à l'IA doit être du contenu, pas du code : sinon la moitié du
// budget part en scripts et la présentation est mauvaise.
const html = `<html><head><title>Boulangerie Dupont</title>
<meta name="description" content="Pain au levain depuis 1998">
<style>.a{color:red}</style><script>var x=1</script></head>
<body><!-- commentaire --><h1>Nos pains</h1><p>Cuisson &amp; levain</p></body></html>`
const texte = texteUtile(html)
verifier('le titre est retenu', /Boulangerie Dupont/.test(texte))
verifier('la description est retenue', /levain depuis 1998/.test(texte))
verifier('le contenu est retenu', /Nos pains/.test(texte))
verifier('les scripts sont retirés', !/var x/.test(texte))
verifier('les styles sont retirés', !/color:red/.test(texte))
verifier('les commentaires sont retirés', !/commentaire/.test(texte))
verifier('les entités sont décodées', /Cuisson & levain/.test(texte))
verifier('la longueur est bornée', texteUtile('<p>' + 'a'.repeat(50000) + '</p>', 100).length <= 100)
egal('html vide', texteUtile(''), '')

// ═══════════════════════════════════════════════════════════════════════════
// 4. LA RÉDACTION ASSISTÉE — bornée, honnête, jamais inventive
// ═══════════════════════════════════════════════════════════════════════════
const routeIa = lire('app/api/ia/presentation/route.js')
// Alex a demandé explicitement un plafond au signup (05/08).
verifier('le nombre de demandes est plafonné', /const MAX_PAR_COMMERCE = \d+/.test(routeIa))
const plafond = Number(/const MAX_PAR_COMMERCE = (\d+)/.exec(routeIa)?.[1])
verifier('le plafond est bas', plafond > 0 && plafond <= 5, `${plafond}`)
// Comparer à l'APPEL, pas à l'import : `genererTexte` figure en haut du
// fichier dans la liste des imports, ce qui rendait la comparaison absurde.
verifier('le plafond est vérifié avant de générer',
  routeIa.indexOf('MAX_PAR_COMMERCE)') > 0 &&
  routeIa.indexOf('>= MAX_PAR_COMMERCE') < routeIa.indexOf('await genererTexte('))
verifier('le rate-limit est branché', /checkLimit\(aiLimiter/.test(routeIa))
verifier('le cap global est respecté', /IA_QUOTA_GLOBAL_MOIS/.test(routeIa))
verifier('la propriété du commerce est vérifiée', /auth_user_id !== user\.id/.test(routeIa))
verifier('chaque génération est tracée', /ia_generations/.test(routeIa))
// Une présentation inventée se retourne contre le commerçant : c'est la règle
// la plus importante du prompt.
verifier('l\'IA a interdiction d\'inventer', /N'invente JAMAIS un fait/.test(routeIa))
verifier('l\'IA ne parle pas de Yoppaa dans le texte', /Ne mentionne ni Yoppaa/.test(routeIa))
verifier('pas de tiret cadratin', /jamais le tiret cadratin/.test(routeIa))
// Le site est une source à prendre avec des pincettes, pas une vérité.
verifier('le site est présenté comme une source prudente', /avec prudence/.test(routeIa))

// ═══════════════════════════════════════════════════════════════════════════
// LE SIÈGE SOCIAL N'EST PAS LE LIEU DE L'ACTIVITÉ (12/08)
// ═══════════════════════════════════════════════════════════════════════════
// Un champ unique servait à la fois de mention légale, de point de retrait, de
// base de calcul des distances et de rattachement communal. Un commerçant
// inscrit à la BCE à son DOMICILE le saisissait pour être en règle, et Yoppaa y
// envoyait ses clients.
const signupSrc = sansCommentaires(lire('app/signup/page.js'))

verifier('le signup nomme le siège social pour ce qu’il est',
  /Adresse du siège social/.test(signupSrc))
verifier('et rappelle d’où vient cette adresse',
  /Banque-Carrefour des Entreprises/.test(signupSrc))
verifier('la case demande si l’activité s’y passe',
  /Mon activité se passe à cette adresse/.test(signupSrc))
verifier('et elle écrit bien la colonne prévue',
  /siege_social_est_lieu_activite/.test(signupSrc))

// ⚠️ LE SIGNUP NE DEMANDE PLUS L'ADRESSE DU LIEU D'ACTIVITÉ (décision Alex du
// 13/08). « Siège d'exploitation » est un terme de la Banque-Carrefour qui
// désigne une unité d'établissement déclarée : une salle louée deux heures le
// mardi n'en est pas une, et le mot faisait croire à une formalité. Le signup
// était aussi le pire moment pour la question, ne gérant qu'UN lieu là où un
// food truck en a deux par jour.
//
// ⚠️ CES DEUX TESTS ONT ROUGI ICI, ET C'EST NORMAL : ils verrouillaient le
// comportement de la veille. On ne les supprime pas, on les remplace par la
// garantie qui compte VRAIMENT et qui, elle, ne doit jamais tomber : un client
// n'est jamais envoyé chez un commerçant qui n'a pas dit où il accueille.
verifier('le signup ne réclame plus d’adresse de lieu d’activité',
  !/Où se passe ton activité/.test(signupSrc))
verifier('et décocher la case ne bloque plus l’inscription',
  !/!activiteAilleurs \|\| \(lieu\./.test(signupSrc))
// Le contrôle n'est pas abandonné, il est DÉPLACÉ : le commerçant est prévenu
// que la suite se règle au tableau de bord, et que son adresse n'est pas
// montrée en attendant.
verifier('mais il annonce la suite au commerçant',
  /Tu diras où tes clients te trouvent juste après/.test(signupSrc))
verifier('et prévient que son adresse n’est pas montrée en attendant',
  /ton adresse n’est pas montrée à tes clients/.test(signupSrc))

// ⚠️ LE RAPPEL DE CONFIG EST CE QUI REND LE RETRAIT SANS DANGER. Sans lui, un
// professeur de yoga inscrit chez lui n'apprendrait qu'en voyant un client ne
// pas venir que sa fiche n'annonce aucune adresse.
const configSrcLieux = sansCommentaires(lire('app/dashboard/ConfigDashboard.js'))
verifier('« Mes lieux » réclame le lieu manquant',
  /Tes clients ne savent pas encore où te trouver/.test(configSrcLieux))
// Et seulement dans ce cas : afficher l'alerte à qui a coché la case, ou à qui
// a déjà déclaré un lieu, la viderait de son sens.
verifier('et seulement à qui a décoché la case sans rien déclarer',
  /siegeEstLeLieu === false && emps\.length === 0/.test(configSrcLieux))

// ⚠️ UNE SEULE RECHERCHE D'ADRESSE DANS TOUT LE PROJET. Les recopier aurait
// garanti qu'elles divergent : l'une corrigée, l'autre oubliée.
//
// ⚠️ CE TEST VERROUILLAIT UNE FORME et a rougi le 13/08 au moment exact où on
// l'améliorait : il comptait les appels DANS LE SIGNUP et valait 1, donc il
// interdisait de sortir le composant pour que l'éditeur de lieux s'en serve
// aussi. Il compte désormais dans TOUT le projet, ce qui est la règle qu'on
// voulait, et il est plus fort qu'avant : une seconde copie, où qu'elle
// naisse, le fait rougir.
// ⚠️ On cible le CHAMP DE SAISIE avec ses suggestions, pas tout appel à
// OpenStreetMap : le projet en fait trois usages sans rapport, l'autocomplétion
// d'une adresse saisie, le géocodage inverse d'une position, et la résolution
// d'une adresse unique. Les confondre ferait rougir le banc pour rien.
const champsAutocomplete = fichiersJs(['app', 'lib']).filter(f => {
  const src = readFileSync(f, 'utf8')
  return /nominatim\.openstreetmap\.org\/search/.test(src) && /suggestions/.test(src)
})
egal('un seul champ d’adresse à suggestions dans tout le projet',
  champsAutocomplete.length, 1)
verifier('et il vit dans le composant partagé',
  /ChampAdresse\.js$/.test(String(champsAutocomplete[0] || '')))

// ─── L'ÉDITEUR DE LIEUX, ouvert à tous ────────────────────────────────────
// ⚠️ Cette section était conditionnée à `estFoodTruck`, ce qui la rendait
// invisible à une professeure de yoga qui donne cours dans deux salles. Elle
// décrivait pourtant déjà exactement son besoin : un lieu par jour, avec des
// exceptions. Deux métiers sans rapport, le même besoin.
const configSrc = sansCommentaires(lire('app/dashboard/ConfigDashboard.js'))

verifier('l’éditeur de lieux n’est plus réservé aux food trucks',
  !/estFoodTruck\(form\.type\) && \(\s*<SectionLieux/.test(configSrc))
verifier('et il s’affiche pour tout le monde',
  /<SectionLieux commercantId=/.test(configSrc))
verifier('on peut y déclarer un lieu fixe',
  /type: 'permanent'/.test(configSrc))

// ─── LES LIEUX SAISIS DANS CONFIG ONT ENFIN LEURS COORDONNÉES ─────────────
// ⚠️ SANS LATITUDE, UN LIEU S'AFFICHE MAIS NE RAPPROCHE PERSONNE. L'accueil
// trie par distance et ignore un lieu sans coordonnées : une professeure de
// yoga pouvait déclarer sa seconde salle et rester invisible aux habitants de
// cette commune. Seuls les lieux du signup en avaient.
verifier('l’éditeur géocode les adresses saisies',
  /<ChampAdresse/.test(configSrc))
egal('les quatre formulaires de lieu géocodent',
  (configSrc.match(/<ChampAdresse/g) || []).length, 4)
// Ancré sur le payload ÉCRIT : la requête de lecture sélectionne aussi ces
// colonnes, et s'y accrocher laisserait passer une écriture qui les oublie.
egal('les trois sortes de lieu enregistrent leurs coordonnées',
  (configSrc.match(/latitude: (perm|auj|futur|formHebdo)\./g) || []).length, 4)

// ─── DEUX EMPLACEMENTS LE MÊME JOUR ───────────────────────────────────────
// ⚠️ C'est la norme chez les food trucks : le service du midi sur une place,
// celui du soir dans un zoning. La tournée les rangeait dans un objet indexé
// par jour, ce qui écrasait silencieusement le second.
verifier('la tournée range les emplacements par jour en LISTE',
  /\(hebdoParJour\[e\.jour_semaine\] \|\|= \[\]\)\.push\(e\)/.test(configSrc))
verifier('et on peut en ajouter un autre le même jour',
  /\+ Autre moment/.test(configSrc))
// ⚠️ Se repérer au JOUR pour modifier écraserait le service du midi en
// enregistrant celui du soir. On modifie CE lieu-là, par son identifiant.
verifier('modifier vise un emplacement précis, pas « le lieu du jour »',
  /formHebdo\.id \? emps\.find\(e => e\.id === formHebdo\.id\) : null/.test(configSrc))

// ─── ET ILS NE PEUVENT PAS SE MARCHER DESSUS ──────────────────────────────
// ⚠️ Sans ce refus, « où es-tu à 12h30 » rendrait le premier de la liste,
// c'est-à-dire l'ordre d'insertion en base : le client apprendrait où aller au
// hasard. On refuse la saisie plutôt que de trancher à sa place.
verifier('l’éditeur refuse deux emplacements qui se chevauchent',
  /lieuEnConflit\(emps, candidat\)/.test(configSrc))
egal('et les trois formulaires passent par ce refus',
  (configSrc.match(/if \(conflit\(\{/g) || []).length, 3)

// ─── L'INTERRUPTEUR, ET LE SYSTÈME CLASSIQUE QU'IL PROTÈGE ────────────────
// ⚠️ LA GARANTIE LA PLUS IMPORTANTE DU CHANTIER. Une boulangerie, un salon ou
// un cabinet ne bougeront jamais : leur demander à chaque plage horaire « et
// c'était à quel endroit ? » serait une question absurde posée à l'immense
// majorité pour servir une minorité.
verifier('le planning par emplacement s’active par une case',
  /planning_par_lieu: actif/.test(configSrc))
// Décoché par défaut : `=== true` et non une valeur qui traînerait.
verifier('et il est décoché tant qu’on ne l’a pas coché',
  /setPlanningParLieu\(c\?\.planning_par_lieu === true\)/.test(configSrc))
// ⚠️ La case elle-même ne s'affiche qu'à qui a déclaré un emplacement variable :
// poser la question à qui n'a qu'une adresse invente un doute qui n'existe pas.
verifier('la case ne s’affiche qu’à qui bouge',
  /emps\.some\(e => e\.type === 'hebdo' \|\| e\.type === 'ponctuel'\) && \(/.test(configSrc))
// ⚠️ ON COMPTE, on ne cherche pas. La première version testait la PRÉSENCE de
// `{parLieu && (` : il y a deux blocs conditionnés, le sélecteur du formulaire
// et l'emplacement affiché sur chaque créneau, et en décrocher un laissait le
// test vert puisque l'autre suffisait à le satisfaire.
egal('les deux blocs d’emplacement suivent la même case',
  (configSrc.match(/\{parLieu && \(/g) || []).length, 2)
// ⚠️ VIDE NE VEUT PAS DIRE « NULLE PART », il veut dire « là où se passe
// l'activité ». Sans ce garde-fou, activer puis désactiver la case laisserait
// des créneaux rattachés à un emplacement que plus rien n'affiche.
verifier('un créneau ne retient un emplacement que si la case est cochée',
  /lieu_id: parLieu \? \(form\.lieu_id \|\| null\) : null/.test(configSrc))
// Deux emplacements différents peuvent partager une heure sans se gêner : on ne
// compare les chevauchements qu'à l'intérieur d'un même emplacement.
verifier('le chevauchement de créneaux se juge par emplacement',
  /filter\(e => !parLieu \|\| \(e\.lieu_id \|\| null\) === \(form\.lieu_id \|\| null\)\)/.test(configSrc))

// ═══════════════════════════════════════════════════════════════════════════
// LE SIGNUP NE PROMET QUE CE QUI EXISTE
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ LA RÈGLE LA PLUS CHÈRE DE CET ÉCRAN. Un commerçant qui s'inscrit lit le
// glossaire, souscrit à un palier payant en comptant sur une fonction, attend,
// et ne revient pas. Le cas s'était produit le 10/08 avec une « réservation
// produit » dont aucune ligne n'avait jamais été écrite ; l'audit du 13/08 en a
// trouvé QUATRE de plus, à la veille d'ouvrir aux premiers vrais commerçants.
//
// Ce qui n'existe pas peut être annoncé, mais SEULEMENT avec le badge qui le
// dit. Sans badge, c'est une promesse.
const signupSrcTxt = lire('app/signup/page.js')

verifier('le badge « en construction » existe',
  /bientot:\s*\{[^}]*En construction, pas encore disponible/.test(signupSrcTxt))

// ⚠️ LA NEWSLETTER N'EST PAS BLOQUÉE PAR LA TECHNIQUE MAIS PAR LE DROIT : il
// n'existe aucun consentement marketing sur les Yoppers, donc aucun envoi
// commercial n'est légal aujourd'hui.
verifier('la newsletter est annoncée comme pas encore ouverte',
  /consentement explicite de chaque Yopper/.test(signupSrcTxt))
// ⚠️ La réservation de table arrive (module M6, décision Alex du 13/08), mais
// un restaurateur ne doit pas croire qu'il l'aura en payant aujourd'hui.
verifier('la réservation de table est annoncée comme à venir',
  /prochain module que nous construisons/.test(signupSrcTxt))
egal('et les deux portent bien le badge',
  (signupSrcTxt.match(/plan: 'bientot',/g) || []).length, 2)

// ⚠️ L'IA ÉCRIT, ELLE N'ANALYSE PAS. Deux routes existent, `presentation` et
// `generer-post`. « Segmentation automatique des Yoppers », « analyse de
// performance » et « benchmarking » ne correspondaient à rien.
verifier('l’IA ne promet plus d’analyser ni de segmenter',
  !/segmentation automatique|benchmarking|analyse de performance/.test(signupSrcTxt))
// ⚠️ Le push part à TOUS les favoris : aucun ciblage par ancienneté ou par
// centre d'intérêt n'existe.
verifier('le push ne promet plus de segmenter',
  !/segmenter \(par centre d’intérêt|segmenter \(par centre d'intérêt/.test(signupSrcTxt))

// ─── ET CE QUI EXISTE DOIT ÊTRE DIT ───────────────────────────────────────
// ⚠️ Le symétrique, tout aussi coûteux : un commerçant qui paie pour une
// fonction qu'il ignore ne s'en sert pas, et trouve que Yoppaa ne vaut pas son
// prix. Les bons cadeaux existaient depuis le 31/07 sans être mentionnés.
for (const [nom, marqueur] of [
  ['les bons cadeaux', 'Bons cadeaux'],
  ['les cours collectifs', 'Cours collectifs'],
  ['les emplacements multiples', 'Plusieurs endroits, ou un seul'],
]) {
  verifier(`le signup annonce ${nom}`, signupSrcTxt.includes(marqueur))
}

// ═══════════════════════════════════════════════════════════════════════════
// LE HAUT DE FICHE EST GÉNÉRÉ, ON NE LE DEMANDE PLUS
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ LA « PHOTO DE COUVERTURE » N'ALLAIT PAS OÙ LE COMMERÇANT CROYAIT. Le haut
// de fiche est dessiné par `BanniereCommerce` à partir du nom, et ne lit AUCUNE
// image. Cette photo servait de première photo de galerie, sous un titre qui
// promettait une bannière : on faisait travailler le commerçant pour un
// résultat qu'il ne verrait jamais là où on le lui annonçait.
verifier('le signup ne demande plus de photo de couverture',
  !/<Card titre="Photo de couverture"/.test(signupSrcTxt))
verifier('mais il montre le haut de fiche généré',
  /<BanniereCommerce nom=/.test(signupSrcTxt))
// ⚠️ `photo_ok` PORTE 20 DES 100 POINTS, et le seuil pour soumettre est 60. Le
// laisser branché sur une photo qu'on ne demande plus aurait rendu ces points
// inatteignables : un commerçant de service, qui peut déjà passer les horaires,
// se serait retrouvé bloqué sous le seuil sans comprendre pourquoi.
verifier('le score compte désormais les photos de galerie',
  /photo_ok: galerie\.length > 0/.test(signupSrcTxt))

// ─── LE LOGO DIT LE MÉTIER, PLUS UNE INITIALE ─────────────────────────────
// ⚠️ Sur l'accueil, la vignette fait 68 pixels : un « C » blanc dans un cercle
// violet peut être Ciseaux, Carrefour ou Chez Momo. Ça ressemblait à un avatar
// par défaut, donc à l'absence de logo, et ça desservait ce qu'un logo doit
// servir : reconnaître un commerce sans avoir à lire. Relevé par Alex le 14/08.
egal('un coiffeur reçoit des ciseaux', symbolePourType('Coiffeur'), 'ciseaux')
egal('une boulangerie reçoit du pain', symbolePourType('Boulangerie'), 'pain')
egal('un cours de yoga reçoit des haltères', symbolePourType('Cours - coaching'), 'halteres')
egal('un food truck reçoit une fourchette', symbolePourType('Food truck'), 'fourchette')
// Un métier inconnu ne doit rien inventer : la boutique dit « un commerce »,
// ce qui reste vrai quoi qu'il arrive.
egal('un métier inconnu retombe sur la boutique', symbolePourType('Métier inédit'), 'boutique')
egal('et un type vide aussi', symbolePourType(''), 'boutique')
egal('comme un type absent', symbolePourType(null), 'boutique')

// ⚠️ LA COULEUR VIENT DU NOM, pas du hasard : deux coiffeurs de la même rue
// partagent le même symbole et doivent rester distinguables.
verifier('deux commerces du même métier n’ont pas la même couleur',
  couleurPourNom('Ciseaux provisoires').clair !== couleurPourNom('Coiffure Martine').clair)
// ⚠️ Et elle ne bouge JAMAIS pour un nom donné : un logo qui changerait à
// chaque affichage ne serait pas un logo.
egal('la couleur d’un nom ne change pas',
  couleurPourNom('Le Fournil').clair, couleurPourNom('Le Fournil').clair)

// ─── ON PROPOSE, ON N'IMPOSE PAS ──────────────────────────────────────────
// ⚠️ Un logo qu'on choisit devient le sien ; un logo imposé reste « celui de
// Yoppaa », et le commerçant s'en détache au lieu de se l'approprier. Demande
// d'Alex du 14/08, après avoir vu la première version qui n'en donnait qu'un.
const propsCoiffeur = propositionsLogo({ nom: 'Ciseaux provisoires', type: 'Coiffeur' })
verifier('le commerçant a le choix entre plusieurs logos', propsCoiffeur.length >= 5)
// ⚠️ ON COMPTE LES SYMBOLES DISTINCTS, pas les propositions. La première
// version se contentait d'un total : ne garder qu'un seul symbole décliné en
// cinq couleurs l'aurait satisfaite, alors que le commerçant n'aurait plus eu
// aucun choix de DESSIN, seulement de teinte.
verifier('et entre plusieurs symboles, pas seulement plusieurs couleurs',
  new Set(propsCoiffeur.map(p => p.symbole)).size >= 3,
  [...new Set(propsCoiffeur.map(p => p.symbole))].join(' '))
// ⚠️ Le premier reste le symbole le plus ATTENDU pour son métier : proposer
// n'est pas noyer, et un coiffeur doit voir des ciseaux en premier.
egal('et le premier est le symbole de son métier', propsCoiffeur[0].symbole, 'ciseaux')
// Des clés uniques, sans quoi React rendrait n'importe quoi et le choix
// mémorisé désignerait deux propositions différentes.
egal('chaque proposition a sa propre clé',
  new Set(propsCoiffeur.map(p => p.cle)).size, propsCoiffeur.length)
verifier('toutes les propositions sont des SVG complets',
  propsCoiffeur.every(p => p.svg.startsWith('<svg') && p.svg.trim().endsWith('</svg>')))
// ⚠️ Les autres couleurs S'ÉLOIGNENT du violet, et c'est voulu : un fleuriste
// ou une boucherie peuvent vouloir du vert ou du rouge. Leur imposer notre
// violet reviendrait à leur imposer notre identité, alors que c'est la leur
// qu'un logo doit porter.
verifier('les propositions ne sont pas toutes du même violet',
  new Set(propsCoiffeur.map(p => p.teinte)).size >= 4)
// Le choix explicite doit être respecté, sans quoi la grille ne servirait à rien.
verifier('le symbole choisi est bien celui qu’on obtient',
  /d="M13 2 3 14/.test(logoProvisoireSvg({ nom: 'X', type: 'Coiffeur', symbole: 'eclair' })))
// Un métier sans correspondance propose quand même quelque chose.
verifier('un métier inconnu a lui aussi le choix',
  propositionsLogo({ nom: 'X', type: 'Métier inédit' }).length >= 5)

const svgLogo = logoProvisoireSvg({ nom: 'Ciseaux provisoires', type: 'Coiffeur' })
verifier('le logo est un SVG complet',
  svgLogo.startsWith('<svg') && svgLogo.trim().endsWith('</svg>'))
verifier('il porte bien le symbole du métier', /circle cx="6" cy="6"/.test(svgLogo))
verifier('et il n’écrit aucune initiale', !/<text|font-size/.test(svgLogo))

// ─── ET LE TEXTE DIT POURQUOI LE LOGO COMPTE ──────────────────────────────
// ⚠️ Demande d'Alex : le logo touche à l'identité du commerçant, c'est ce qui
// permet au Yopper de le retrouver. Le signup le présentait comme un ornement
// « affiché dans la card flottante », ce qui ne dit rien à personne.
verifier('le signup explique à quoi sert le logo',
  /tes clients te reconnaîtront/.test(signupSrcTxt))
verifier('et rappelle que le sien vaut mieux que le nôtre',
  /Le tien vaut mieux que le nôtre/.test(signupSrcTxt))
// La grille est affichée, et chaque vignette déclenche la génération de CE
// choix-là : sans les paramètres, tous les boutons rendraient le même logo.
// ⚠️ ANCRÉ SUR LE PARCOURS, pas sur le nom de la fonction. La première version
// cherchait `propositionsLogo({ nom:` et restait verte quand on neutralisait
// son résultat : l'appel était bien écrit, il ne servait simplement plus à rien.
//
// ⚠️ ET LA LIMITE EST ASSUMÉE : un test qui lit du source prouve que le code
// est écrit et relié, jamais qu'il s'exécute. Une expression glissée devant
// l'appel pour l'annuler passerait encore. C'est la ligne suivante qui porte la
// vraie garantie, parce qu'elle lie chaque vignette à SON symbole : sans elle,
// tous les boutons rendraient le même logo, ce qui se verrait à l'écran.
verifier('le signup affiche la grille de propositions',
  /propositionsLogo\(\{[^}]*\}\)\.map\(p => \(/.test(signupSrcTxt))
verifier('et chaque vignette applique son propre symbole',
  /genererLogoAuto\(\{ symbole: p\.symbole, teinte: p\.teinte \}\)/.test(signupSrcTxt))

// ─── DIRE QUE C'EST PROVISOIRE, ET POURQUOI ON Y TIENT ────────────────────
// ⚠️ Demande d'Alex du 14/08. « Yoppaa exige un logo pour l'uniformité de
// l'application » est vrai et se lit comme une contrainte administrative : le
// commerçant y entend une case à cocher de plus, et il passe. Ce qui le
// convainc, c'est ce que ça lui rapporte à LUI.
verifier('le signup dit que le logo prêté est provisoire',
  /C&apos;est un dépannage/.test(signupSrcTxt))
verifier('et explique ce que ça lui rapporte, pas ce que Yoppaa exige',
  /retrouve son boulanger dans une liste/.test(signupSrcTxt))
// ⚠️ Le mot qui ne doit PAS apparaître : on n'impose pas, on explique. Un
// commerçant à qui l'on dit « la plateforme exige » cherche comment y couper.
// ⚠️ SUR L'AFFICHÉ, PAS SUR LE SOURCE BRUT. Ce test a rougi à sa première
// écriture parce que le COMMENTAIRE qui explique la correction cite forcément
// la formulation qu'on bannit. Le piège est documenté en tête de ce banc, et il
// s'est quand même refermé : un commentaire a le droit de dire d'où l'on vient,
// c'est même son travail.
verifier('sans jamais parler d’exigence ni d’uniformité',
  !/exige un logo|uniformité de l’app|uniformité de l'app/.test(sansCommentaires(signupSrcTxt)))

// ─── AUCUN CHIFFRE QU'ON NE PEUT PAS PROUVER ──────────────────────────────
// ⚠️ « Une belle photo, c'est +40 % de clics » ne reposait sur RIEN : ni sur
// les statistiques de Yoppaa, qui n'existaient pas encore, ni sur une étude
// citée. Une allégation chiffrée invérifiable est une promesse commerciale, et
// le commerçant qui ne voit pas ces 40 % arriver a raison de nous le
// reprocher. C'est aussi le genre de phrase qu'une émission de défense du
// consommateur relève en premier.
verifier('le signup n’avance plus de pourcentage invérifiable',
  !/\+40 ?% de clics/.test(signupSrcTxt))

// ⚠️ NE JAMAIS LAISSER CROIRE QUE TOUT LUI REVIENT. Yoppaa ne prend aucune
// commission, c'est vrai, mais Stripe prélève ses frais à la source et c'est le
// commerçant qui les supporte. Les taire au signup pour les lui faire découvrir
// sur son premier versement est précisément le reproche à éviter.
verifier('les frais Stripe sont annoncés dès l’inscription',
  /1,4 ?% \+ 0,25 ?€/.test(signupSrcTxt))
verifier('et la commission Yoppaa est nommée, jamais sous-entendue',
  !/\(0 ?% commission\)/.test(signupSrcTxt))

// ─── LE SCORE S'ÉCRIT EN NOMBRE, JAMAIS EN OBJET ──────────────────────────
// ⚠️ DÉFAUT VÉCU LE 15/08, AU PIRE ENDROIT POSSIBLE : le tout dernier clic du
// parcours d'inscription. `scoreOnboarding` rendait un NOMBRE avant le 14/08 ;
// depuis, elle rend un bilan complet. Le nom de la variable, `score`, n'a pas
// changé, donc l'écriture en base a continué de passer l'objet entier dans une
// colonne `integer`. PostgreSQL refusait, et le commerçant lisait un pavé de
// JSON en rouge à la place de sa validation.
//
// ⚠️ AUCUN OUTIL NE POUVAIT L'ATTRAPER : ni le lint, ni le build, ni le banc,
// puisque le type ne change qu'à l'exécution et que la colonne est en base. Un
// changement de type de retour est un changement de contrat, et il faut aller
// relire CHAQUE appelant. Cette vérification tient la place de cette relecture.
// `signupSrc` est déjà lu plus haut, sans commentaires : on le réutilise.
verifier('le score écrit en base est un pourcentage',
  /validation_auto_score: *score\.pourcentage/.test(signupSrc))
verifier('et jamais le bilan complet',
  !/validation_auto_score: *score *[,}]/.test(signupSrc))
verifier('le score annoncé à Yoppaa est un pourcentage aussi',
  !/^\s*score, *$/m.test(signupSrc))

// ─── LES MÉTIERS, ET LE SYMBOLE QU'ON LEUR PROPOSE ────────────────────────
// ⚠️ AJOUT DU 15/08 : « Yoga - pilates ». Une professeure de yoga ne trouvait
// pas son métier dans la liste ; le plus proche, « Cours - coaching », ne dit
// rien d'elle. C'est la première impression d'un vrai commerçant sur le signup.
verifier('le yoga et le pilates ont leur propre métier',
  TYPES_SERVICE.includes('Yoga - pilates'))

// ⚠️ L'ORDRE DES SYMBOLES COMPTE PLUS QUE LEUR PRÉSENCE. Le bien-être et la
// salle de sport partageaient une seule ligne dans la table, donc un studio de
// yoga se voyait proposer un HALTÈRE en premier. Un commerçant pressé prend
// toujours la première proposition : mettre la feuille en second ne suffit pas.
egal('le yoga propose une feuille en premier', symbolePourType('Yoga - pilates'), 'feuille')
egal('le massage aussi', symbolePourType('Massage - bien-être'), 'feuille')
// Non-régression : le sport garde son haltère.
egal('la salle de sport garde son haltère', symbolePourType('Salle de sport'), 'halteres')
egal('et le coach sportif aussi', symbolePourType('Coach sportif'), 'halteres')
verifier('le yoga garde quand même l’haltère en secours',
  symbolesPourType('Yoga - pilates').includes('halteres'))

// ⚠️ LA CONTRAINTE QUI N'ÉTAIT TESTÉE NULLE PART. L'en-tête de
// `lib/types-commerce.js` l'écrit noir sur blanc depuis le 23/07 : les libellés
// ne peuvent contenir ni « & », ni « / », ni « , », parce que `splitTypes`
// découpe les doubles métiers sur ces trois caractères. Un libellé fautif
// couperait le métier en deux SANS ERREUR, et personne ne le verrait avant
// qu'un commerçant s'affiche avec un métier tronqué.
for (const [nomListe, liste] of [
  ['alimentaire', TYPES_ALIMENTAIRE], ['service', TYPES_SERVICE], ['détail', TYPES_DETAIL],
]) {
  const fautifs = liste.filter(t => /[&/,]/.test(t))
  verifier(`aucun métier ${nomListe} ne contient un séparateur de double métier`,
    fautifs.length === 0, fautifs.join(' · '))
  verifier(`aucun métier ${nomListe} n’est vide ou mal détouré`,
    liste.every(t => typeof t === 'string' && t === t.trim() && t.length > 1))
}
// ⚠️ ON MESURE LA SONDE : sans ce cas, un balayage qui ne trouve jamais rien
// passerait pour une preuve.
verifier('un libellé fautif serait bien repéré', /[&/,]/.test('Boulangerie & Pâtisserie'))

// Un métier inconnu ne casse rien, il retombe sur la boutique générique.
egal('un métier hors liste reste servi', symbolePourType('Astrologue'), 'boutique')

// ─── LA MÊME RÈGLE, MAIS PARTOUT AILLEURS ─────────────────────────────────
// ⚠️ Le signup avait été corrigé le 14/08, et lui seul. Onze autres surfaces
// publiques disaient encore « sans commission » sans dire de QUI, et deux
// allaient plus loin : « la totalité du paiement revient au commerçant », sur
// la diapositive intitulée « Notre transparence », juste au-dessus de la
// promesse d'offrir l'abonnement à vie à qui trouverait un piège dans nos
// conditions. Yoppaa ne prélève rien, c'est vrai ; le prestataire de paiement,
// lui, prélève, et c'est le commerçant qui le supporte.
//
// La règle tient en une phrase : LÀ OÙ UNE COMMISSION EST NIÉE, CELUI QUI NE
// LA PREND PAS EST NOMMÉ. Deux formes valent attribution, « commission
// Yoppaa » et la première personne (« nous ne prenons aucune commission ») :
// le banc accepte les deux et refuse l'affirmation sans sujet.
const TEXTES_PUBLICS = [
  'app/components/LandingReveal.js', 'app/kit/[slug]/KitClient.js', 'app/classement/page.js',
  'app/brand-kit/page.js', 'app/demo-mettet/slides/page.js', 'app/demo-mettet/slides/print/page.js',
  'app/demo-mettet/cheat-sheet/page.js', 'app/dashboard/TabPaiements.js', 'app/signup/page.js',
  'app/legal/page.js', 'app/page.tsx', 'lib/resend-landing.js',
]

// Une phrase entre guillemets est du discours RAPPORTÉ, pas une promesse : la
// landing cite le « 0% de commission » devenu ticket d'entrée du secteur, pour
// dire justement que tout le monde l'affiche. Sans cette exception, le banc
// nous interdirait de citer un concurrent.
const horsCitations = (src) => src.replace(/«[^»]*»/g, ' ')

function commissionsOrphelines(txt) {
  const orphelines = []
  // ⚠️ La fenêtre se découpe dans le texte NETTOYÉ, jamais dans l'original :
  // les index d'un `matchAll` ne valent que pour la chaîne qui l'a produit.
  const propre = horsCitations(sansCommentaires(txt))
  for (const m of propre.matchAll(/commission/gi)) {
    const fenetre = propre.slice(Math.max(0, m.index - 70), m.index + 70).replace(/\s+/g, ' ')
    if (/Commission europ/i.test(fenetre)) continue          // l'institution, pas un prélèvement
    if (/Yoppaa/i.test(fenetre)) continue                    // nommée
    if (/nous ne (prenons|prélevons|percevons)/i.test(fenetre)) continue   // première personne
    orphelines.push(fenetre)
  }
  return orphelines
}

// ⚠️ ON MESURE SUR LE DÉFAUT : la formulation d'origine doit bien être vue
// comme orpheline, sinon le balayage qui suit ne prouverait rien.
verifier('une commission sans sujet est bien détectée',
  commissionsOrphelines('Aucune commission sur tes ventes, promis.').length === 1)
verifier('une commission attribuée à Yoppaa passe',
  commissionsOrphelines('Yoppaa ne prend aucune commission sur tes ventes.').length === 0)
verifier('une commission attribuée à la première personne passe',
  commissionsOrphelines('Sur leurs ventes, nous ne prenons aucune commission.').length === 0)
verifier('la Commission européenne n’est pas un prélèvement',
  commissionsOrphelines('encadrés par les clauses types de la Commission européenne').length === 0)

for (const chemin of TEXTES_PUBLICS) {
  const orphelines = commissionsOrphelines(lire(chemin))
  verifier(`${chemin} nomme qui ne prend pas de commission`,
    orphelines.length === 0, orphelines[0] || '')
}

// L'affirmation ABSOLUE, elle, n'a aucune forme acceptable : il n'existe pas
// de paiement en ligne sans frais, et le dire est faux quel que soit le sujet.
const PROMESSE_ABSOLUE = /totalité du paiement revient|(0|zéro|zero|aucun|sans) frais cach/i
for (const chemin of TEXTES_PUBLICS) {
  verifier(`${chemin} ne promet pas l’absence totale de frais`,
    !PROMESSE_ABSOLUE.test(sansCommentaires(lire(chemin))))
}

// ⚠️ RENDU, PAS LU. L'email de pré-inscription est le tout premier contact
// écrit d'un commerçant avec Yoppaa : on le fabrique et on lit ce qui en sort.
const emailPionnier = emailMerciPreinscription({ mode_landing: 'reveal', type_utilisateur: 'commercant' })
verifier('l’email de pré-inscription annonce les frais du prestataire',
  /1,4 ?% \+ 0,25 ?€/.test(emailPionnier))
verifier('et il nomme Yoppaa là où il parle de commission',
  commissionsOrphelines(emailPionnier).length === 0, commissionsOrphelines(emailPionnier)[0] || '')
// Non-régression : le Yopper ne paie rien, la question ne le concerne pas.
verifier('l’email du Yopper ne parle toujours pas de commission',
  !/commission/i.test(emailMerciPreinscription({ mode_landing: 'reveal', type_utilisateur: 'yopper' })))

// Les cartes de plans sont ce qu'on voit AVANT le glossaire : elles portaient
// les mêmes promesses fantômes.
verifier('les cartes de plans ne vendent plus la newsletter',
  !/Newsletter, segmentation/.test(signupSrcTxt))
verifier('ni l’IA avancée',
  !/IA avancée, export comptable/.test(signupSrcTxt))
verifier('ni la réservation de table comme acquise',
  !/livraison \+ réservation table/.test(signupSrcTxt))

// ─── L'ÉTAPE HORAIRES SAIT QUE CERTAINS N'EN ONT PAS ──────────────────────
// ⚠️ TROU DE COHÉRENCE INTRODUIT LE JOUR MÊME. Depuis que les horaires se
// déduisent des emplacements, un commerçant qui change d'endroit remplissait
// sept lignes à l'inscription pour se les faire RÉÉCRIRE dès sa première
// tournée déclarée. Une question sans réponse, posée au pire moment.
verifier('l’étape horaires reconnaît qui change d’endroit',
  /function horairesViennentDesLieux/.test(signupSrcTxt))
// ⚠️ ON COMPTE : le message apparaît DEUX fois, dans l'encadré du haut et dans
// l'indication sous le bouton. En décrocher un laissait le test vert puisque
// l'autre suffisait, et le commerçant qui ne lit que le bouton n'aurait rien su.
egal('elle le lui dit aux deux endroits',
  (signupSrcTxt.match(/tes horaires viendront de tes emplacements/g) || []).length, 2)
verifier('et elle le laisse passer',
  /\|\| horairesViennentDesLieux\(commercant\)/.test(signupSrcTxt))

// ─── LES EXEMPLES DOIVENT PARLER À CEUX QU'ON VISE ────────────────────────
// ⚠️ Un studio de yoga, un coach ou une auto-école lisaient « Coiffeur,
// opticien, esthéticienne, garagiste » et concluaient que Yoppaa n'était pas
// pour eux. Les cours collectifs sont pourtant livrés, et le module RDV les
// couvre depuis toujours.
verifier('les services citent aussi les cours et le coaching',
  /yoga, coach, auto-école/.test(signupSrcTxt))
// Le food truck, lui, est le cas d'usage qui a fait naître tout le module
// LIEUX : il doit se reconnaître dès la première question.
verifier('l’alimentaire cite le food truck',
  /traiteur, food truck/.test(signupSrcTxt))

// ─── ON PEUT PASSER LES PACKS SANS RIEN PRENDRE ───────────────────────────
// ⚠️ Le message existait, mais en italique gris SOUS la liste : il ressemblait
// à une note de bas de page et ne se lisait qu'après avoir fait défiler tous
// les prix. Relevé par Alex le 13/08, avant d'ouvrir aux vrais commerçants.
verifier('l’étape des packs dit d’emblée que rien n’est obligatoire',
  /Rien n’est obligatoire ici/.test(signupSrcTxt))
verifier('et qu’on retrouvera tout dans le tableau de bord',
  /Tout reste disponible dans ton\s*\n?\s*tableau de bord/.test(signupSrcTxt))

// ═══════════════════════════════════════════════════════════════════════════
// L'ONGLET PROFIL, DÉCOUPÉ EN QUATRE
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ IL FAISAIT 647 LIGNES ET MÉLANGEAIT QUATRE SUJETS SANS RAPPORT : ce que le
// client voit, comment te joindre, où et quand tu travailles, et des réglages
// de fonctionnement. On y descendait en scrollant à travers tout, sans repère.
egal('l’onglet Profil a ses quatre sections',
  (configSrc.match(/\{ id: '(fiche|contact|lieux|reglages)',/g) || []).length, 4)
for (const [id, sujet] of [['fiche', 'la vitrine'], ['contact', 'les coordonnées'],
  ['lieux', 'où et quand'], ['reglages', 'le fonctionnement']]) {
  verifier(`la section « ${sujet} » s’affiche seule`,
    new RegExp(`sousOnglet === '${id}' &&`).test(configSrc))
}

// ⚠️ LES INTITULÉS DISENT CE QU'ON Y RÈGLE, jamais comment c'est rangé en base.
// « Mes lieux » ne parlait à personne, relevé par Alex le 13/08.
// ⚠️ CES TESTS FIGEAIENT LES MOTS, ET ILS ONT ROUGI UNE HEURE APRÈS AVOIR ÉTÉ
// ÉCRITS, au moment exact où Alex trouvait les intitulés encore tièdes. C'est
// la neuvième fois qu'un test de ce banc verrouille une forme au lieu d'une
// règle. Un libellé se retouche, c'est même le propre d'un libellé : ce qui ne
// doit pas revenir, c'est le VOCABULAIRE DE LA BASE dans l'écran du commerçant.
for (const jargon of ['Mes lieux fixes', 'Ma tournée habituelle', 'Emplacements ponctuels', 'lieu ponctuel']) {
  verifier(`« ${jargon} » ne s’affiche plus au commerçant`,
    !new RegExp(`>${jargon}|${jargon}</`).test(configSrc))
}
// ⚠️ ET CE QUI COMPTE VRAIMENT : les trois blocs se distinguent par leur DURÉE,
// dite en toutes lettres. C'est ce qu'Alex a retenu après trois propositions :
// un nom concret ne suffit pas si rien ne dit combien de temps il vaut.
verifier('la section porte un titre qui parle', /Où me trouver/.test(configSrc))
for (const duree of ['Valables tous les jours', 'Se répète chaque semaine', 'Ne valent qu’un jour donné']) {
  verifier(`un bloc dit sa durée : « ${duree} »`, configSrc.includes(duree))
}

// ─── LA QUESTION QUI COMMANDE TOUT ────────────────────────────────────────
// ⚠️ UNE SEULE QUESTION DÉCIDE DE CE QUI S'AFFICHE ENSUITE. Avant, le
// commerçant remplissait ses horaires PUIS ses emplacements avec leurs heures,
// sans que rien ne dise lequel faisait foi : deux saisies pour une réalité.
verifier('une seule question décide de la suite',
  /Où tes clients te trouvent-ils \?/.test(configSrc))
verifier('et la grille des horaires disparaît quand il bouge',
  /\{siegeEstLeLieu !== false && \(/.test(configSrc))
// ⚠️ SANS L'ÉCRITURE DÉDUITE, LE COMMERCE PASSERAIT POUR FERMÉ TOUTE LA
// SEMAINE : le moteur de créneaux croise les horaires avec les plages de
// rendez-vous et écarte tout créneau hors ouverture.
verifier('les horaires sont réécrits depuis les emplacements',
  /horairesDepuisLieux\(data \|\| \[\]\)/.test(configSrc))
// ⚠️ Et seulement pour qui bouge : écraser des horaires saisis à la main chez
// une boulangerie serait une catastrophe silencieuse.
verifier('mais jamais chez un commerce qui ne bouge pas',
  /if \(c\?\.siege_social_est_lieu_activite === false\) \{/.test(configSrc))

// ─── LES PLAGES DE RENDEZ-VOUS AUSSI ──────────────────────────────────────
// ⚠️ Une professeure de yoga donne cours à Mettet le mardi et à Biesme le
// jeudi : ses plages de réservation ne sont pas les mêmes, et son client doit
// savoir où se présenter. Seuls les créneaux de RETRAIT portaient un
// emplacement, ce qui laissait tout le module rendez-vous de côté.
verifier('une plage de réservation porte son emplacement',
  /lieu_id: parLieuRdv \? \(form\.lieu_id \|\| null\) : null/.test(configSrc))
// ⚠️ ON COMPTE, on ne cherche pas : le sélecteur du formulaire et l'emplacement
// affiché sur chaque plage dépendent tous deux de la case, et en décrocher un
// laisserait le test vert puisque l'autre suffirait à le satisfaire. Le même
// piège s'est refermé une heure plus tôt sur l'éditeur de créneaux de retrait.
egal('les deux blocs d’emplacement des plages suivent la même case',
  (configSrc.match(/\{parLieuRdv && \(/g) || []).length, 2)
// Modifier une plage doit reprendre son emplacement, sans quoi chaque
// modification le remettrait à « partout » en silence.
verifier('modifier une plage garde son emplacement',
  /lieu_id: c\.lieu_id \|\| '',/.test(configSrc))
egal('les deux éditeurs proposent les mêmes emplacements du jour',
  (configSrc.match(/type === 'permanent'\s*\n?\s*\|\| \(l\.type === 'hebdo' && l\.jour_semaine === jour\)/g) || []).length, 2)

// ─── LE VERROU : un emplacement qui porte des rendez-vous ne bouge plus ───
// ⚠️ Règle d'Alex du 13/08. Déplacer en silence enverrait des gens à une
// adresse où personne ne les attend, et ils ne l'apprendraient qu'en arrivant.
verifier('un emplacement qui porte des rendez-vous est verrouillé',
  /async function rdvsQuiBloquent\(lieuId\)/.test(configSrc))
egal('le verrou protège la suppression ET la modification',
  (configSrc.match(/await rdvsQuiBloquent\(/g) || []).length, 2)
// ⚠️ Seuls les rendez-vous À VENIR et encore debout bloquent : un rendez-vous
// honoré la semaine dernière appartient au passé et ne doit rien interdire.
verifier('seuls les rendez-vous à venir et confirmés bloquent',
  /\.eq\('statut', 'confirme'\)[\s\S]{0,80}\.gte\('date_rdv', todayISO\)/.test(configSrc))
verifier('et le message dit quoi faire, pas seulement non',
  /Annule-les depuis l’agenda/.test(configSrc))
// ⚠️ SANS LIEU PRINCIPAL, un commerçant qui a décoché la case du signup n'a
// aucune adresse de référence : sa fiche n'aurait rien à afficher les jours
// sans tournée.
verifier('le premier lieu déclaré devient le principal',
  /principal: permanents\.length === 0/.test(configSrc))

// ⚠️ PLUS UNE SEULE RÉFÉRENCE À L'ANCIEN NOM DE TABLE. Elle a été renommée en
// base : une requête oubliée échouerait en silence, la fiche affichant
// simplement aucun lieu, sans que rien ne le signale.
for (const chemin of ['app/dashboard/ConfigDashboard.js', 'app/commander/[slug]/page.js', 'app/signup/page.js']) {
  verifier(`${chemin} interroge commercant_lieux et non l’ancienne table`,
    !/foodtruck_emplacements/.test(lire(chemin)))
}

// ─── LA FICHE DIT OÙ ALLER, POUR TOUT LE MONDE ────────────────────────────
// Le bandeau « aujourd'hui je suis ici » était conditionné au MÉTIER food
// truck. Une professeure de yoga qui donne cours dans deux salles ne l'avait
// donc jamais, et sa fiche affichait l'adresse de son domicile.
const ficheClient = sansCommentaires(lire('app/commander/[slug]/page.js'))

verifier('la fiche résout le lieu par la fonction partagée',
  /lieuxDuJour\(\{/.test(ficheClient))
verifier('le bandeau du jour se décide sur les lieux, pas sur le métier',
  /\{commerceItinerant && \(/.test(ficheClient))
// ⚠️ SAVOIR OÙ IL EST AUJOURD'HUI NE SUFFIT PAS. Le client qui consulte un mardi
// soir veut savoir s'il pourra venir jeudi, et où.
verifier('un commerce qui bouge annonce sa semaine',
  /Où me trouver cette semaine/.test(ficheClient))
// Un itinérant sans lieu du jour : on masque l'adresse du siège, il n'y est pas.
verifier('l’adresse du siège est masquée quand le commerce est ailleurs',
  /!\(commerceItinerant && !emplacementDuJour\)/.test(ficheClient))

const signup = lire('app/signup/page.js')
verifier('le signup demande le site web', /site_web/.test(signup))
verifier('le signup guide ce qu\'il faut donner à l\'IA', /Donne trois éléments/.test(signup))
verifier('le signup affiche le nombre de demandes restantes', /restant/.test(signup))
verifier('le texte proposé reste modifiable', /c'est le tien|c\\'est le tien/.test(signup))

// ═══════════════════════════════════════════════════════════════════════════
// LE PANIER NE DOIT JAMAIS ÊTRE UN CUL-DE-SAC (Alex, 09/08)
// ═══════════════════════════════════════════════════════════════════════════
// Sur la fiche rendez-vous, ajouter un produit ne menait NULLE PART : ni total,
// ni bouton. Le client était coincé, sauf à prendre un rendez-vous dont il
// n'avait pas besoin, ou à ouvrir un produit pour rebondir vers la boutique,
// ce qui vidait son panier au passage.
//
// Deux règles se vérifient ici, et elles sont indissociables : un panier non
// vide doit toujours offrir une sortie, et cette sortie doit emporter le
// panier avec elle.
const fRdv = lire('app/commander/rdv/[slug]/page.js')
const fBoutique = lire('app/commander/[slug]/page.js')

verifier('la fiche rendez-vous montre une barre dès qu\'un produit est ajouté',
  /barrePanierVisible/.test(fRdv))

// ⚠️ ZONE MORTE TEMPORELLE — la fiche a planté en production le 09/08.
// `barrePanierVisible` avait été déclaré AU-DESSUS de `produitsAchetables`
// qu'il lit. Un `const` n'existe pas avant sa ligne : React levait une
// ReferenceError au rendu et le Yopper voyait « This page couldn't load ».
//
// Ni le build ni le lint ne l'attrapent, et aucun banc qui lit du TEXTE ne
// peut détecter une erreur d'exécution. Ce qu'on peut vérifier, en revanche,
// c'est l'ORDRE des deux déclarations : c'est exactement la régression.
verifier('la barre est déclarée APRÈS ce qu\'elle lit',
  fRdv.indexOf('const barrePanierVisible') > fRdv.indexOf('const produitsAchetables'),
  `barre=${fRdv.indexOf('const barrePanierVisible')}, produitsAchetables=${fRdv.indexOf('const produitsAchetables')}`)
verifier('peutReserverIci aussi',
  fRdv.indexOf('const peutReserverIci') > fRdv.indexOf('const [prestations'))
verifier('la barre affiche le total du panier', /totalProduits\.toFixed\(2\)/.test(fRdv))
verifier('la barre propose de prendre rendez-vous', /Je prends rendez-vous/.test(fRdv))
// LA SORTIE QUI MANQUAIT : celui qui veut juste un shampoing n'a aucune raison
// de réserver un créneau.
verifier('la barre propose de commander SANS rendez-vous',
  /Je commande sans rendez-vous/.test(fRdv))
verifier('cette sortie emporte le panier', /function commanderSansRdv\(\)[\s\S]{0,160}emporterPanierVersBoutique/.test(fRdv))
// Les deux liens qui quittaient la page en perdant tout.
verifier('le lien « Voir tout » dépose le panier',
  /Voir tout[\s\S]{0,200}?/.test(fRdv) && /href=\{`\/commander\/\$\{commercant\.slug\}`\} onClick=\{emporterPanierVersBoutique\}/.test(fRdv))
verifier('ouvrir un produit dépose le panier',
  /\?article=\$\{p\.id\}`\} onClick=\{emporterPanierVersBoutique\}/.test(fRdv))
// La barre est en position fixe : sans réserve en bas, elle recouvre le
// dernier produit et le bouton du bon cadeau.
verifier('la page réserve la place de la barre', /paddingBottom: 170/.test(fRdv))

// Le panier voyage DANS LES DEUX SENS. C'est ce qui manquait : la boutique
// déposait déjà pour le rendez-vous, jamais l'inverse.
verifier('la boutique dépose vers le rendez-vous', /deposerPanierPourRdv/.test(fBoutique))
verifier('la boutique reprend ce qui vient du rendez-vous', /reprendrePanierPourBoutique/.test(fBoutique))
verifier('le rendez-vous reprend ce qui vient de la boutique', /reprendrePanierPourRdv/.test(fRdv))
verifier('le rendez-vous dépose vers la boutique', /deposerPanierPourBoutique/.test(fRdv))
// Chaque sens dit au client ce qui a suivi, plutôt que de laisser des articles
// disparaître sans un mot.
// ⚠️ CE TEST VISAIT LE TEXTE MOT POUR MOT, et il visait un texte FAUX : « Tes
// {n} article{s} t'ont suivi depuis la fiche », dont le pluriel ne s'appliquait
// qu'au mot « article ». Avec un seul produit, le client lisait « Tes 1 article
// t'ont suivi ». Le banc verrouillait donc la faute au lieu de l'interdire.
// On vise désormais l'APPEL à la phrase partagée ; son contenu, lui, est
// exécuté et vérifié dans verif:logique.
verifier('la boutique annonce le panier repris', /messagePanierRepris\(\{/.test(fBoutique))
verifier('le rendez-vous annonce le panier repris', /messagePanierRepris\(\{/.test(fRdv))

// ⚠️ UNE CLÉ PAR SENS. Avec une clé unique, la page qui dépose relit son propre
// dépôt si le client fait marche arrière, et double ses articles.
const { CLES, DUREE_PARTAGE_MS } = await import('../lib/panier-partage.js')
verifier('les deux sens ont des clés distinctes', CLES.rdv('ciseaux') !== CLES.boutique('ciseaux'))
verifier('la clé porte le slug du commerce', CLES.rdv('ciseaux').includes('ciseaux'))
verifier('le dépôt ne survit pas à la journée', DUREE_PARTAGE_MS <= 60 * 60 * 1000)

// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Fiche commerçant verte.')
