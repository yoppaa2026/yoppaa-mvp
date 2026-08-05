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
import { CONSEILS_PHOTOS, MAX_PHOTOS, conseilPhoto, etatGalerie, deplacerPhoto } from '../lib/guide-photos.js'
import { normaliserUrl, estIpPrivee, texteUtile } from '../lib/site-web.js'

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}
const egal = (nom, a, b) => verifier(nom, JSON.stringify(a) === JSON.stringify(b), `obtenu ${JSON.stringify(a)}, attendu ${JSON.stringify(b)}`)
const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')

// ═══════════════════════════════════════════════════════════════════════════
// 1. LA BANNIÈRE — toujours le nom, jamais la photo
// ═══════════════════════════════════════════════════════════════════════════
const banniere = lire('app/components/BanniereCommerce.js')
verifier('la bannière affiche le nom du commerce', /\{nom\}/.test(banniere))
verifier('la bannière n\'affiche aucune photo', !/<img/.test(banniere))

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

const signup = lire('app/signup/page.js')
verifier('le signup demande le site web', /site_web/.test(signup))
verifier('le signup guide ce qu\'il faut donner à l\'IA', /Donne trois éléments/.test(signup))
verifier('le signup affiche le nombre de demandes restantes', /restant/.test(signup))
verifier('le texte proposé reste modifiable', /c'est le tien|c\\'est le tien/.test(signup))

// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Fiche commerçant verte.')
