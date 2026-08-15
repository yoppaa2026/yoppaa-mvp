// Banc du TRAVAIL QUI SE PERD : la barre d'enregistrement du tableau de bord.
//
// Défaut relevé par Alex le 15/08 : « des fois on ne trouve pas le bouton
// d'enregistrement et on perd le travail fait ». L'inventaire a montré pire que
// ça : `saveProfil` n'avait qu'UN SEUL appelant, un bouton logé dans le
// quatrième sous-onglet. Tout ce qui se saisissait dans « Ma fiche » ou « Mes
// coordonnées » n'avait aucun moyen d'être enregistré depuis l'écran où on le
// saisissait.
//
// ⚠️ LA COMPARAISON EST EXÉCUTÉE, JAMAIS RELUE. Une barre qui s'affiche sur un
// écran auquel personne n'a touché devient un décor qu'on n'écoute plus, et le
// seul moyen de le prouver est de lui donner de vraies valeurs de base et de
// vrais retours de champs de saisie.

import { readFileSync } from 'node:fs'
import {
  normaliserValeur, champsModifies, estModifie, libelleModifications, MESSAGE_QUITTER,
} from '../lib/formulaire-modifie.js'

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}
const egal = (nom, a, b) => verifier(nom, JSON.stringify(a) === JSON.stringify(b),
  `obtenu ${JSON.stringify(a)}, attendu ${JSON.stringify(b)}`)
const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')
// Un commentaire qui cite le terme cherché rend un test faussement vert, et un
// commentaire qui l'explique rend un test faussement rouge. On enlève les deux.
const sansCommentaires = (src) => src
  .split(/\r?\n/)
  .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l))
  .join('\n')

// ⚠️ LE CORPS EXACT, ACCOLADE PAR ACCOLADE. Une fenêtre de N caractères après
// le nom de la fonction déborde sur la SUIVANTE : c'est ce qui a fait accuser
// l'enregistrement de la fidélité d'une sortie muette qui appartenait en
// réalité à `desactiver`, juste en dessous. Un banc qui lit chez le voisin
// accuse le voisin.
function corpsDeLaFonction(src, nom) {
  const debut = src.indexOf(`async function ${nom}(`)
  if (debut < 0) return ''
  const ouvrante = src.indexOf('{', src.indexOf(')', debut))
  if (ouvrante < 0) return ''
  let profondeur = 0
  for (let i = ouvrante; i < src.length; i++) {
    if (src[i] === '{') profondeur++
    else if (src[i] === '}') {
      profondeur--
      if (profondeur === 0) return src.slice(ouvrante, i + 1)
    }
  }
  return ''
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. LES FORMES DE L'ABSENCE, LE VRAI PIÈGE
// ═══════════════════════════════════════════════════════════════════════════
// La base rend `null`, un champ de saisie rend `''`, une case jamais cochée
// rend `false`, et un nombre revient en texte. Les quatre doivent se ramener à
// la même chose, sinon ouvrir un écran suffit à le déclarer modifié.
egal('null se ramène au vide', normaliserValeur(null), '')
egal('undefined se ramène au vide', normaliserValeur(undefined), '')
egal('la chaîne vide reste vide', normaliserValeur(''), '')
egal('le booléen faux se ramène au vide', normaliserValeur(false), '')

// ⚠️ ET SURTOUT PAS CEUX-LÀ. `0` et `'0'` sont faux au sens de JavaScript : un
// test écrit avec `!v` les avalerait, et un délai de retrait remis à 0 ne
// serait jamais enregistré. C'est le piège `Number(null) === 0`, déjà vécu deux
// fois sur ce projet.
verifier('le nombre zéro N’EST PAS une absence', normaliserValeur(0) !== '')
egal('le nombre zéro se lit « 0 »', normaliserValeur(0), '0')
verifier('le booléen vrai n’est pas une absence', normaliserValeur(true) !== '')

egal('le nombre 50 et le texte « 50 » sont la même valeur',
  normaliserValeur(50), normaliserValeur('50'))
egal('un tableau se compare sur son contenu',
  normaliserValeur(['5640', '5070']), normaliserValeur(['5640', '5070']))
verifier('deux tableaux différents ne se confondent pas',
  normaliserValeur(['5640']) !== normaliserValeur(['5640', '5070']))

// ═══════════════════════════════════════════════════════════════════════════
// 2. CE QUI A CHANGÉ, ET RIEN D'AUTRE
// ═══════════════════════════════════════════════════════════════════════════
// Le profil tel que la base le rend, puis tel que l'écran le tient. Les valeurs
// sont celles du vrai `fetchProfil` : `?? ''` sur les nombres, `!!` sur les
// booléens, un objet pour les horaires.
const enBase = {
  nom: 'Centre Respire', telephone: null, site_web: '', description: null,
  boutique_frais_port: 4.9, boutique_gratuit_des: null, boutique_delai_heures: 2,
  livraison_actif: false, photos_catalogue_actif: true,
  horaires_detail: { lundi: { ouvert: true, debut: '09:00', fin: '18:00' } },
}
const aLEcran = {
  nom: 'Centre Respire', telephone: '', site_web: '', description: '',
  boutique_frais_port: '4.9', boutique_gratuit_des: '', boutique_delai_heures: '2',
  livraison_actif: false, photos_catalogue_actif: true,
  horaires_detail: { lundi: { ouvert: true, debut: '09:00', fin: '18:00' } },
}

// ⚠️ LE TEST QUI COMPTE LE PLUS. Ouvrir l'onglet Profil et ne rien toucher ne
// doit RIEN annoncer. Une barre affichée à l'ouverture serait pire que pas de
// barre du tout : on apprendrait à l'ignorer, et elle ne servirait plus le jour
// où il y a vraiment quelque chose à sauver.
egal('ouvrir un écran sans y toucher n’annonce aucune modification',
  champsModifies(enBase, aLEcran), [])
verifier('et estModifie le confirme', estModifie(enBase, aLEcran) === false)

egal('une seule frappe ne signale qu’un seul champ',
  champsModifies(enBase, { ...aLEcran, nom: 'Centre Respire Yoga' }), ['nom'])
egal('deux champs modifiés sont tous les deux nommés',
  champsModifies(enBase, { ...aLEcran, nom: 'Autre', telephone: '0470 12 34 56' }),
  ['nom', 'telephone'])
egal('remettre un délai à zéro EST une modification',
  champsModifies(enBase, { ...aLEcran, boutique_delai_heures: '0' }), ['boutique_delai_heures'])
egal('cocher une case EST une modification',
  champsModifies(enBase, { ...aLEcran, livraison_actif: true }), ['livraison_actif'])
egal('décocher une case déjà décochée n’est PAS une modification',
  champsModifies(enBase, { ...aLEcran, livraison_actif: false }), [])
egal('changer une heure au fond des horaires est vu',
  champsModifies(enBase, { ...aLEcran, horaires_detail: { lundi: { ouvert: true, debut: '10:00', fin: '18:00' } } }),
  ['horaires_detail'])

egal('un champ apparu compte', champsModifies({ a: 1 }, { a: 1, b: 2 }), ['b'])
egal('un champ disparu compte aussi', champsModifies({ a: 1, b: 2 }, { a: 1 }), ['b'])
egal('un champ ignoré ne compte pas',
  champsModifies({ a: 1, b: 2 }, { a: 1, b: 9 }, { ignorer: ['b'] }), [])

// ⚠️ Tant que le formulaire n'est pas chargé il n'y a rien à comparer : sans ce
// garde-fou l'écran s'annoncerait modifié pendant sa propre ouverture, c'est-à-
// dire exactement au moment où le commerçant n'a encore rien fait.
egal('un formulaire pas encore chargé n’annonce rien', champsModifies(null, aLEcran), [])
egal('et l’inverse non plus', champsModifies(enBase, null), [])

// ═══════════════════════════════════════════════════════════════════════════
// 3. LE CYCLE COMPLET, JOUÉ
// ═══════════════════════════════════════════════════════════════════════════
// Charger, saisir, abandonner, saisir encore, enregistrer. C'est le seul
// enchaînement qui prouve que « Ignorer » rend bien l'état d'avant et que la
// barre disparaît après un enregistrement réussi.
let initial = { ...enBase }
let form = { ...aLEcran }
egal('au chargement, rien en attente', champsModifies(initial, form).length, 0)

form = { ...form, nom: 'Centre Respire Yoga', telephone: '0470 12 34 56' }
egal('après deux saisies, deux modifications en attente', champsModifies(initial, form).length, 2)

// « Ignorer » restitue l'image de la base.
form = { ...initial }
egal('« Ignorer » remet le formulaire à ce qu’il était', champsModifies(initial, form).length, 0)

form = { ...form, description: 'Yoga et Pilates à Biesme' }
egal('une nouvelle saisie repart de un', champsModifies(initial, form).length, 1)

// Enregistrement réussi : ce qui est à l'écran devient la nouvelle référence.
initial = { ...form }
egal('après enregistrement, la barre n’a plus rien à annoncer',
  champsModifies(initial, form).length, 0)

// ⚠️ ET LE CAS QUI M'A ÉCHAPPÉ À L'ÉCRIT : une valeur bornée par le code au
// moment d'enregistrer. Un seuil saisi à 99 part à 50 en base. Si on prend le
// formulaire comme nouvelle référence au lieu de ce qui est VRAIMENT parti, la
// barre reste affichée après un enregistrement pourtant réussi.
const saisi = { fidelite_seuil_passages: '99' }
const parti = { fidelite_seuil_passages: Math.min(50, Math.max(2, parseInt(saisi.fidelite_seuil_passages))) }
verifier('la référence d’après enregistrement est la valeur BORNÉE, pas la saisie',
  champsModifies(parti, parti).length === 0 && champsModifies(parti, saisi).length === 1)

// ═══════════════════════════════════════════════════════════════════════════
// 4. CE QUE LA BARRE DIT
// ═══════════════════════════════════════════════════════════════════════════
egal('aucune modification ne se dit pas', libelleModifications(0), '')
egal('une modification au singulier', libelleModifications(1), '1 modification non enregistrée')
egal('trois modifications au pluriel', libelleModifications(3), '3 modifications non enregistrées')
egal('un nombre absent ne casse rien', libelleModifications(null), '')
verifier('le message de sortie parle de perte, pas de technique',
  /pas enregistrées/.test(MESSAGE_QUITTER) && /perdues/.test(MESSAGE_QUITTER))
verifier('aucun tiret cadratin dans les textes de la barre',
  !MESSAGE_QUITTER.includes('—') && !libelleModifications(2).includes('—'))

// ═══════════════════════════════════════════════════════════════════════════
// 5. LE CÂBLAGE : LA BARRE EXISTE VRAIMENT ET TOUT LE MONDE Y EST BRANCHÉ
// ═══════════════════════════════════════════════════════════════════════════
// Ici on ne peut pas exécuter : il faudrait un navigateur. On vérifie donc le
// CONTRAT, formulaire par formulaire, parce qu'un onglet oublié c'est
// exactement le défaut qu'on prétend corriger.
const cfg = sansCommentaires(lire('app/dashboard/ConfigDashboard.js'))
const barre = sansCommentaires(lire('app/dashboard/BarreEnregistrer.js'))

verifier('le tableau de bord monte la barre d’enregistrement', /<BarreEnregistrer/.test(cfg))
verifier('et la fenêtre de sortie', /<ModaleQuitter/.test(cfg))

// ⚠️ CHAQUE FORMULAIRE LONG DOIT ÊTRE BRANCHÉ. Le défaut d'origine est
// précisément un écran qui n'a pas de quoi enregistrer : en oublier un ici, ce
// serait le recréer.
for (const onglet of ['TabProfil', 'TabLivraison', 'TabFidelite', 'TabBonsCadeaux']) {
  const monte = new RegExp(`<${onglet}[^>]*surModifications=\\{declarerModifications\\}`).test(cfg)
  verifier(`${onglet} est branché à la barre`, monte)
  verifier(`${onglet} reçoit bien la déclaration en paramètre`,
    new RegExp(`function ${onglet}\\(\\{[^}]*surModifications`).test(cfg))
}

// Changer d'onglet démonte le formulaire : c'est la sortie la plus coûteuse et
// la seule qu'aucun bouton ne voit venir.
verifier('la barre d’onglets passe par le garde-fou et non par setTab',
  /onClick=\{\(\) => changerOnglet\(t\.id\)\}/.test(cfg))
verifier('et le garde-fou retient le changement quand il y a du travail en attente',
  /if \(modifs\.modifie\) \{ setOngletVise/.test(cfg))

// ⚠️ ON NE QUITTE QU'APRÈS UN ENREGISTREMENT RÉUSSI. Un nom vide, une erreur
// réseau, et enchaîner sur le changement d'onglet ferait perdre exactement le
// travail qu'on prétend protéger. Chaque fonction d'enregistrement doit donc
// rendre un verdict.
for (const [nom, fonction] of [
  ['le profil', 'saveProfil'],
  ['la livraison', 'sauvegarder'],
  ['la fidélité', 'sauverConfig'],
  ['les bons cadeaux', 'saveCfg'],
]) {
  const corps = corpsDeLaFonction(cfg, fonction)
  verifier(`l’enregistrement de ${nom} est bien retrouvé dans le source`, corps.length > 100, fonction)
  // ⚠️ TOUTES LES SORTIES, PAS UNE SEULE. Chercher « return false » quelque part
  // dans la fonction laisse passer le cas où une seule branche de refus le dit
  // et les autres se taisent : c'est un chemin muet qui ferait quitter l'écran
  // après un refus. On compte donc les refus ET les `return` nus.
  const refus = (corps.match(/return false/g) || []).length
  const nus = (corps.match(/;\s*return\s*\}/g) || []).length
  verifier(`l’enregistrement de ${nom} dit quand il échoue`, refus > 0, fonction)
  verifier(`aucune sortie muette dans l’enregistrement de ${nom}`, nus === 0,
    `${nus} « return » sans verdict`)
  verifier(`l’enregistrement de ${nom} dit quand il réussit`, /return true/.test(corps), fonction)
}
verifier('la sortie n’enchaîne PAS après un enregistrement refusé',
  /if \(ok === false\) \{ setOngletVise\(null\); return \}/.test(cfg))

// ⚠️ LE CADEAU DE 25 SMS NE DOIT PAS ENTRER DANS LA RÉFÉRENCE. `cfg` est
// recopié dans le patch à chaque enregistrement : y laisser
// `fidelite_sms_credits` ferait repartir ce cadeau à chaque fois, et un solde
// de SMS PAYÉS serait écrasé par 25. Défaut créé puis rattrapé le 15/08.
const corpsFidelite = corpsDeLaFonction(cfg, 'sauverConfig')
verifier('l’activation et les réglages sont deux objets séparés',
  /const reglages = \{/.test(corpsFidelite) && /const patch = \{ \.\.\.reglages \}/.test(corpsFidelite))
verifier('la nouvelle référence ne porte que les réglages',
  /setInitial\(reglages\)/.test(corpsFidelite) && !/setInitial\(patch\)/.test(corpsFidelite))

// La barre est en `fixed` : sans marge, elle recouvre le bas de l'écran, donc
// le dernier champ et souvent le bouton historique.
verifier('la page se réserve de la place quand la barre est là',
  /paddingBottom: modifs\.modifie \? \d+ : \d+/.test(cfg))

// ⚠️ L'encoche de l'iPhone mange le bas de l'écran. Sans cette marge,
// « Enregistrer » se retrouve à moitié dessous et devient intappable, ce qui
// reproduit très exactement le défaut qu'on corrige.
verifier('la barre passe au-dessus de la barre de gestes de l’iPhone',
  /env\(safe-area-inset-bottom\)/.test(barre))
verifier('la barre reste sous les notifications',
  /zIndex: 9990/.test(barre))
verifier('le mouvement se coupe pour qui demande moins d’animation',
  /prefers-reduced-motion/.test(barre))

// La fenêtre de sortie propose les trois issues d'Odoo, et « Rester ici » est
// le choix par défaut : quand on ne sait pas, on ne détruit pas le travail de
// quelqu'un.
verifier('la fenêtre propose d’enregistrer et de continuer', /Enregistrer et continuer/.test(barre))
verifier('la fenêtre propose de rester', /Rester ici/.test(barre))
verifier('la fenêtre propose d’abandonner', /Abandonner mes modifications/.test(barre))
verifier('Échap revient à rester, jamais à abandonner',
  /e\.key === 'Escape'\) onRester/.test(barre))
verifier('le clic sur le fond revient à rester aussi',
  /onClick=\{onRester\}/.test(barre))

// Fermer l'onglet ou recharger : aucune de nos surfaces ne voit passer ça.
// ⚠️ Sur l'ÉCOUTE, pas sur le mot. `removeEventListener` porte le même nom :
// une garde posée sur « beforeunload » reste verte alors que plus personne
// n'écoute rien.
verifier('le navigateur avertit avant de fermer',
  /addEventListener\('beforeunload'/.test(barre))
verifier('et l’avertissement est bien armé', /e\.returnValue = MESSAGE_QUITTER/.test(barre))

// Icônes en SVG, jamais d'emoji : règle du projet.
verifier('la barre n’utilise aucun emoji',
  !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(barre))

// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Formulaires verts.')
