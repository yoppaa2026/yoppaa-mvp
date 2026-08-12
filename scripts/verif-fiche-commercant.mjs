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

import { readFileSync } from 'node:fs'
import { CONSEILS_PHOTOS, MAX_PHOTOS, conseilPhoto, etatGalerie, deplacerPhoto, metierPhotos } from '../lib/guide-photos.js'
import { normaliserUrl, estIpPrivee, texteUtile } from '../lib/site-web.js'

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}
const egal = (nom, a, b) => verifier(nom, JSON.stringify(a) === JSON.stringify(b), `obtenu ${JSON.stringify(a)}, attendu ${JSON.stringify(b)}`)
const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')

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
const styleBanniere = banniere.slice(banniere.indexOf('className="banniere-commerce"'))
verifier('le retrait du nom ne dépend pas de la largeur du bandeau',
  !/padding[^:]*:\s*[`'"]?\$?\{?[^;]*\d+%/.test(styleBanniere.slice(0, 400)),
  styleBanniere.slice(0, 200))
verifier('le retrait est exprimé en pixels', /RETRAIT_HAUT = \d+/.test(banniere))
// Les classes servent d'accroche aux règles PC : sans elles, impossible
// d'agrandir le nom sur grand écran, un style en ligne ne porte pas de media query.
verifier('la bannière est accrochable depuis la feuille globale',
  /className="banniere-commerce"/.test(banniere) && /className="banniere-nom"/.test(banniere))

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

// ⚠️ DÉCOCHER SANS DONNER D'ADRESSE NE DOIT PAS PASSER. Le commerçant vient de
// déclarer que son activité se passe ailleurs : avancer sans dire où, c'est une
// fiche sans lieu de retrait, donc un client sans destination.
verifier('on ne peut pas avancer sans dire où se passe l’activité',
  /!activiteAilleurs \|\| \(lieu\.adresse\?\.trim\(\)\.length > 0 && lieu\.latitude && lieu\.longitude\)/.test(signupSrc))

// ⚠️ LES COORDONNÉES SONT ENREGISTRÉES AVEC L'ADRESSE, jamais devinées plus
// tard. C'est ce qui manquait aux emplacements de food truck : sans elles, la
// distance affichée au client se mesurait depuis le dépôt.
// ⚠️ ANCRÉ SUR LE PAYLOAD ÉCRIT, pas sur la table. La première version cherchait
// `commercant_lieux` puis les trois colonnes dans les 600 caractères suivants :
// elle tombait sur la requête de LECTURE, qui les sélectionne aussi, et restait
// verte alors que l'écriture ne les enregistrait plus.
verifier('le lieu d’activité est enregistré avec ses coordonnées',
  /type: 'permanent'[\s\S]{0,200}adresse, latitude, longitude/.test(signupSrc))

// ⚠️ UNE SEULE RECHERCHE D'ADRESSE POUR LES DEUX CHAMPS. Les recopier aurait
// garanti qu'ils divergent : l'un corrigé, l'autre oublié.
egal('la recherche d’adresse n’est écrite qu’une fois',
  (signupSrc.match(/nominatim\.openstreetmap\.org/g) || []).length, 1)

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
