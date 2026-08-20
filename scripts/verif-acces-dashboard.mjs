// Banc de LA PORTE DU TABLEAU DE BORD.
//
// Ce qui peut se casser ici ne se voit pas :
//
//   ⚠️ UN COMMERÇANT NON VALIDÉ ENTRE, OU UN COMMERÇANT VALIDÉ RESTE DEHORS.
//
// Les deux sont silencieux. Le premier ne se remarque que le jour où Alex
// découvre un espace ouvert qu'il n'a jamais validé. Le second est pire : le
// commerçant se croit expulsé, il n'écrit même pas, il s'en va.
//
// Le banc tient donc trois promesses :
//   1. la règle est EXÉCUTÉE sur chaque état réel de la base, y compris le
//      `actif` posé à la main qui n'apparaît nulle part dans le code ;
//   2. chaque refus a sa RAISON, parce qu'une porte fermée sans explication
//      est la pire des réponses ;
//   3. l'écran est bien MONTÉ, et l'admin n'est jamais bloqué.

import { readFileSync } from 'node:fs'
import {
  accesDashboard, STATUTS_ACCES_AUTORISE,
  RAISON_OK, RAISON_AUCUN_COMPTE, RAISON_ONBOARDING, RAISON_REJETE, RAISON_ATTENTE,
} from '../lib/statut-commercant.js'

// ⚠️ On NORMALISE LES FINS DE LIGNE. Git rend ces fichiers en CRLF sous
// Windows, et une expression qui cherche `return\n` ne trouve alors rien : la
// garde passe au vert sans avoir rien vérifié. Ce piège a déjà fait échouer des
// remplacements en silence dans ce projet.
const lire = (chemin) =>
  readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}

function sansCommentaires(src) {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')
}

// ═══ 1. LES ÉTATS RÉELS DE LA BASE ═══════════════════════════════════════
// Relevé fait par Alex le 20/08 sur les 8 comptes existants. Ce sont eux qui
// doivent passer, pas des cas imaginaires.
{
  const RELEVE = [
    { nom: '6 comptes complets',     c: { statut: 'valide', statut_publication: 'publie', kyb_statut: 'valide' },      passe: true },
    { nom: 'le compte « actif »',    c: { statut: 'actif',  statut_publication: 'publie', kyb_statut: 'non_demarre' }, passe: true },
    { nom: 'validé, KYB non démarré', c: { statut: 'valide', statut_publication: 'publie', kyb_statut: 'non_demarre' }, passe: true },
  ]
  for (const cas of RELEVE) {
    const v = accesDashboard(cas.c)
    verifier(`${cas.nom} garde son accès`, v.autorise === cas.passe,
      `rendu ${v.autorise} (${v.raison})`)
  }

  // ⚠️ LA GARDE QUI COMPTE VRAIMENT ICI.
  // `actif` n'existe nulle part dans le code : il a été posé à la main. Le
  // retirer de la liste mettrait ce commerçant dehors du jour au lendemain,
  // sans que rien ne le signale. C'est la raison pour laquelle on ne devine
  // jamais un statut, on va le lire.
  verifier('le statut « actif » de la base est autorisé',
    STATUTS_ACCES_AUTORISE.includes('actif'),
    'un compte en production le porte, il serait expulsé')
  verifier('le statut « valide » du code est autorisé',
    STATUTS_ACCES_AUTORISE.includes('valide'))
  verifier("et la liste ne s'ouvre pas à n'importe quoi",
    STATUTS_ACCES_AUTORISE.length === 2, STATUTS_ACCES_AUTORISE.join(', '))
}

// ═══ 2. QUI RESTE DEHORS, ET AVEC QUELLE RAISON ══════════════════════════
{
  const REFUS = [
    { nom: 'aucune fiche',              c: null,
      raison: RAISON_AUCUN_COMPTE },
    { nom: 'inscription jamais soumise', c: { statut: null, statut_publication: 'brouillon' },
      raison: RAISON_ONBOARDING },
    { nom: 'soumis, pas encore validé',  c: { statut: null, statut_publication: 'en_attente' },
      raison: RAISON_ATTENTE },
    { nom: 'dossier rejeté',             c: { statut: 'rejete', statut_publication: 'en_attente', motif_rejet: 'Extrait BCE illisible' },
      raison: RAISON_REJETE },
    { nom: 'statut inconnu',             c: { statut: 'zorglub', statut_publication: 'publie' },
      raison: RAISON_ATTENTE },
  ]
  for (const cas of REFUS) {
    const v = accesDashboard(cas.c)
    verifier(`${cas.nom} n'entre pas`, v.autorise === false, `rendu ${v.autorise}`)
    verifier(`${cas.nom} : la raison est nommée`, v.raison === cas.raison,
      `rendu « ${v.raison} », attendu « ${cas.raison} »`)
  }

  // ⚠️ UN STATUT INCONNU DOIT FERMER, PAS OUVRIR.
  // C'est le sens de la liste blanche : une valeur ajoutée demain en base sans
  // que le code le sache laisse la porte close, elle ne l'ouvre pas.
  verifier('un statut jamais vu ferme la porte',
    accesDashboard({ statut: 'quelque_chose_de_neuf' }).autorise === false)

  // Le motif de rejet doit REMONTER : c'est la seule chose utile de cet écran.
  const rejet = accesDashboard({ statut: 'rejete', motif_rejet: 'Extrait BCE illisible' })
  verifier('le motif du rejet est transmis à l\'écran',
    rejet.motif === 'Extrait BCE illisible', String(rejet.motif))
  verifier('un rejet sans motif ne fabrique pas de texte',
    accesDashboard({ statut: 'rejete' }).motif === null)

  // Le rejet prime sur l'inscription inachevée : il est plus informatif, et il
  // appelle un geste précis.
  verifier('un rejet reste un rejet même en brouillon',
    accesDashboard({ statut: 'rejete', statut_publication: 'brouillon' }).raison === RAISON_REJETE)

  // Et l'accès accordé ne porte jamais de raison de refus.
  verifier('un accès accordé est marqué comme tel',
    accesDashboard({ statut: 'valide' }).raison === RAISON_OK)
}

// ═══ 3. LA PORTE EST-ELLE POSÉE ? ════════════════════════════════════════
// ⚠️ Une règle parfaite que personne n'appelle ne garde rien. C'est le défaut
// des quatre écrans d'accueil : vivants pendant des semaines, jamais montrés.
{
  const dash = lire('app/dashboard/page.js')
  const visible = sansCommentaires(dash)

  verifier('le tableau de bord lit la règle',
    /from '@\/lib\/statut-commercant'/.test(dash))
  verifier('et il APPELLE la règle sur la fiche chargée',
    /accesDashboard\(data\[0\]\)/.test(visible),
    'importer sans appeler ne garde rien')
  verifier('un refus interrompt le chargement',
    /if \(!verdict\.autorise\) \{[\s\S]{0,200}return\n/.test(visible))
  verifier("l'écran de refus est MONTÉ",
    /<EcranValidation[\s/>]/.test(visible))
  // ⚠️ `lastIndexOf` et non `indexOf` : la police est chargée DEUX fois dans ce
  // fichier, une première dans l'écran de choix du commerce, qui vient AVANT
  // la porte. Comparer à la première occurrence faisait échouer une garde
  // pourtant juste. Chercher au bon endroit, encore une fois.
  const posRefus = visible.indexOf('if (refusAcces) return')
  verifier('la garde de rendu existe', posRefus > -1)
  verifier('le refus se rend AVANT le tableau de bord',
    posRefus > -1 && posRefus < visible.lastIndexOf('<link href="https://fonts.googleapis.com'),
    'sinon le tableau de bord se peint quand même une fraction de seconde')

  // ⚠️ ET SURTOUT : le refus ne doit PAS rediriger vers /login. Une
  // redirection ferait croire à un problème de mot de passe alors que le
  // compte est parfaitement valide, juste pas encore ouvert.
  verifier('un refus ne renvoie pas vers /login',
    !/if \(!verdict\.autorise\)[\s\S]{0,160}router\.push\('\/login'\)/.test(visible),
    'la personne doit lire POURQUOI, pas croire à un mot de passe refusé')

  // L'admin regarde les dossiers en attente : c'est tout l'intérêt.
  verifier("l'impersonation admin sort AVANT la porte",
    visible.indexOf('yoppaa_admin_impersonating') < visible.indexOf('accesDashboard(data[0])'),
    'Alex doit pouvoir ouvrir un dossier qu\'il n\'a pas encore validé')
}

// ═══ 4. CE QUE L'ÉCRAN DIT ═══════════════════════════════════════════════
// Une porte fermée sans sa raison est la pire des réponses. Chaque situation a
// son texte ET son geste.
{
  const ecran = sansCommentaires(lire('app/dashboard/EcranValidation.js'))

  verifier("l'attente annonce un délai",
    /sous 24 heures/.test(ecran),
    'sans délai, « en cours de validation » ne répond pas à la question posée')
  verifier("l'attente promet un email",
    /email dès que ton espace s&rsquo;ouvre/.test(ecran))
  verifier("l'attente rassure sur le travail déjà fait",
    /rien n&rsquo;est perdu/.test(ecran))
  verifier('le rejet montre le motif',
    /\{motif\}/.test(ecran))
  verifier('le rejet mène à la correction',
    /Corriger mon dossier/.test(ecran))
  verifier("l'inscription inachevée renvoie la finir",
    /Reprendre mon inscription/.test(ecran))
  verifier('on peut toujours se déconnecter',
    /onDeconnexion/.test(ecran))

  // ⚠️ Le rouge est réservé à ce qui DÉTRUIT. Un refus est une mauvaise
  // nouvelle, pas une destruction.
  verifier("le refus n'est pas peint en rouge",
    !/#DC2626|#EF4444/.test(ecran),
    'l\'ambre dit « à corriger », le rouge dit « perdu »')
  verifier("l'écran mesure en dvh, jamais en vh",
    !/[^d]vh\b/.test(ecran))
}

console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Porte du tableau de bord verte.')
