// HARNAIS DE MUTATION — COPIER ET AGIR EN LOT SUR LE CATALOGUE (25/09)
//
// 🔴 CE QU ON MESURE. Alex : « une liste complete de sauces, des garnitures de
// pizza ne peuvent pas etre reecrites sur 40 pizzas differentes ». Le pire cas
// de ces deux modules n est pas une copie ratee : c est une copie qui ECRASE
// un reglage existant, une copie qui arrive TOUTE SEULE sur la fiche publique,
// ou un lot qui touche plus d articles que ce que le commercant a lu.
//
// ⚠️ INSTANTANE DE CONTENU, RESTAURATION CONTROLEE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RESULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
// ⚠️ CHAQUE MUTATION NOMME LE BANC qui doit la faire rougir.
//
//   node scripts/mutations-catalogue-copie.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:copie'

const COPIE = 'lib/catalogue-copie.js'
const LOT = 'lib/catalogue-lot.js'
const ECRAN = 'app/dashboard/ConfigDashboard.js'

const MUTATIONS = [
  // ─── MODIFIER UN GROUPE (10/10) ──────────────────────────────────────────
  { nom: '🔴 une option modifiée est recréée (le panier en cours la perd)',
    fichier: COPIE, de: '      let k = origines[i] ? restantes.findIndex(x => cleNom(x?.nom) === origines[i]) : -1', vers: '      let k = -2' },
  { nom: '🔴 les versions ne deviennent pas identiques : l option en trop reste',
    fichier: COPIE, de: '    for (const r of restantes) if (r?.id != null) suppressions.push(r.id)', vers: '' },
  { nom: '🔴 renommer vers un groupe existant du même article passe',
    fichier: COPIE, de: '  if (enConflit.length > 0) {', vers: '  if (false) {' },
  { nom: '⚠️ le résumé tait les options retirées',
    fichier: COPIE, de: '  if (plan.suppressions.length > 0) {', vers: '  if (false) {' },
  { nom: '⚠️ « obligatoire » n est plus porté par la modification',
    // ⚠️ ANCRE REPOINTÉE LE 13/10 : le patch porte aussi le nombre de choix.
    fichier: COPIE, de: 'patch: { nom: cible.nom, type: cible.type, obligatoire: cible.obligatoire, choix_min:', vers: 'patch: { nom: cible.nom, type: cible.type, choix_min:' },
  { nom: '🔴 la bibliothèque ne modifie qu une copie',
    fichier: ECRAN, de: '<EditionGroupe key={entree.nom} copies={entree.copies}', vers: '<EditionGroupe key={entree.nom} copies={[entree.modele]}' },
  { nom: '🔴 la modification d une option ne relit plus ce qu elle a touché (refus RLS muet)',
    fichier: ECRAN, de: "    const { data, error } = await supabase.from('article_options_valeurs').update(patch).eq('id', id).select('id')", vers: "    const { data, error } = await supabase.from('article_options_valeurs').update(patch).eq('id', id)" },

  // ─── LA COPIE D UN ARTICLE ───────────────────────────────────────────────
  //
  // 🔴 UNE COPIE QUI NAIT ACTIVE est une promesse faite au client : elle porte
  // le nom et le prix de sa voisine, avant toute relecture.
  { nom: '🔴 la copie d un article arrive en ligne toute seule',
    fichier: COPIE,
    de: '  sortie.actif = false',
    vers: '  sortie.actif = true' },

  { nom: '⚠️ la copie garde le nom exact de l original',
    fichier: COPIE,
    de: '  sortie.nom = nomDeLaCopie(article.nom, nomsExistants)',
    vers: '  sortie.nom = article.nom' },

  // 🔴 L IDENTIFIANT COPIE ECRASERAIT L ORIGINAL a l insertion.
  { nom: '🔴 la copie emporte l identifiant de l original',
    fichier: COPIE,
    de: '  for (const champ of CHAMPS_COPIES) sortie[champ] = article[champ] ?? null',
    vers: '  Object.assign(sortie, article)' },

  { nom: '⚠️ le numerotage des copies ne regarde plus les noms pris',
    fichier: COPIE,
    de: '  if (!pris.has(candidat.toLowerCase())) return candidat',
    vers: '  if (true) return candidat' },

  // ─── VERS QUI ON COPIE ───────────────────────────────────────────────────
  { nom: '🔴 l article source se propose a lui-meme',
    fichier: COPIE,
    de: '    a && String(a.id) !== String(sourceId) && a.est_vitrine !== true',
    vers: '    a && a.est_vitrine !== true' },

  { nom: '⚠️ un article de vitrine recoit des options invisibles',
    fichier: COPIE,
    de: '    a && String(a.id) !== String(sourceId) && a.est_vitrine !== true',
    vers: '    a && String(a.id) !== String(sourceId)' },

  // ─── CE QU ON REFUSE D ECRASER ───────────────────────────────────────────
  //
  // 🔴 LE CONFLIT NON VU, c est le reglage du commercant remplace ou double.
  { nom: '🔴 le conflit devient sensible a la casse et aux espaces',
    fichier: COPIE,
    de: '    return groupes.some(g => String(g?.nom || \'\').trim().toLowerCase() === nom)',
    vers: '    return groupes.some(g => String(g?.nom || \'\') === nom)' },

  { nom: '🔴 les articles en conflit ne sont plus ecartes',
    fichier: COPIE,
    de: '    aCopier: liste.filter(id => !bloques.has(String(id))),',
    vers: '    aCopier: liste.slice(),' },

  // ─── CE QUE LA COPIE D UN GROUPE EMPORTE ─────────────────────────────────
  //
  // 🔴 UNE SAUCE A 0,50 € COPIEE A ZERO se vend gratuitement sur 39 pizzas, et
  // personne ne le voit avant la comptabilite.
  { nom: '🔴 le supplement de prix est perdu a la copie',
    fichier: COPIE,
    de: '      prix_supplement: Number(v?.prix_supplement) || 0,',
    vers: '      prix_supplement: 0,' },

  { nom: '⚠️ « un seul choix » devient « plusieurs » a la copie',
    fichier: COPIE,
    de: "      type: groupe.type === 'multiple' ? 'multiple' : 'unique',",
    vers: "      type: 'multiple'," },

  { nom: '⚠️ le resume annonce les coches au lieu de ce qui sera ecrit',
    fichier: COPIE,
    de: '  const aCopier = Math.max(0, cibles - conflits)',
    vers: '  const aCopier = cibles' },

  // ─── LES VARIANTES, CHEZ QUI N A PAS DE GROUPES (25/09) ──────────────────
  //
  // 🔴 LE TROU TROUVE PAR ALEX : dupliquer un t-shirt rendait une fiche NUE,
  // sans meme la definition de ses axes.
  { nom: '🔴 la copie d un article perd ses axes de variantes',
    fichier: COPIE,
    de: '    if (article[champ] !== undefined) sortie[champ] = article[champ]',
    vers: '    if (false) sortie[champ] = article[champ]' },

  // 🔴 « 12 EN TAILLE M » DECRIT UN CARTON, pas un modele : recopier le stock
  // vendrait douze t-shirts qui n existent pas.
  { nom: '🔴 le stock des variantes est recopie au lieu de repartir a zero',
    fichier: COPIE,
    de: '    stock: 0,',
    vers: '    stock: Number(v?.stock) || 0,' },

  { nom: '⚠️ la copie de variantes n allume pas le drapeau de gestion',
    fichier: COPIE,
    de: '  sortie.gere_variantes = true',
    vers: '  sortie.gere_variantes = false' },

  // 🔴 UNE MATRICE REMPLACE CELLE QUI EST LA : copier vers un article equipe
  // detruirait ses tailles, ses prix et ses stocks.
  { nom: '🔴 les articles deja equipes ne sont plus ecartes',
    fichier: COPIE,
    de: '    return a.gere_variantes === true && axes.length > 0',
    vers: '    return false' },

  { nom: '⚠️ le resume des variantes ne dit plus le stock a zero',
    fichier: COPIE,
    de: '  const base = `Les mêmes variantes seront créées sur ${quoi}, à stock zéro.`',
    vers: '  const base = `Les mêmes variantes seront créées sur ${quoi}.`' },

  // ─── LA BIBLIOTHEQUE (25/09) ─────────────────────────────────────────────
  //
  // 🔴 LA PLUS COMPLETE SERT DE MODELE : ajouter une valeur oubliee ne coute
  // rien, retrouver une valeur silencieusement retiree coute quarante
  // relectures.
  { nom: '🔴 le modele de la bibliotheque n est plus le plus complet',
    fichier: COPIE,
    de: '      if ((g?.valeurs?.length || 0) > (modele?.valeurs?.length || 0)) modele = g',
    vers: '      if (false) modele = g' },

  // 🔴 SANS CE COMPTE, on applique une version que le commercant n a pas
  // choisie, sans qu il le sache.
  { nom: '🔴 les versions differentes ne sont plus comptees',
    fichier: COPIE,
    de: '    const versions = new Set(mêmes.map(signature)).size',
    vers: '    const versions = 1' },

  { nom: '⚠️ l ordre des valeurs fabrique de fausses versions differentes',
    fichier: COPIE,
    de: '      .sort()',
    vers: '      ' },

  { nom: '⚠️ la bibliotheque ne met plus le plus utilise en tete',
    fichier: COPIE,
    de: '  return sortie.sort((a, b) => (b.articles.length - a.articles.length) || a.nom.localeCompare(b.nom))',
    vers: '  return sortie' },

  // ─── LES PRESTATIONS (25/09) ─────────────────────────────────────────────
  //
  // 🔴 DEUX JOINTURES SUR LES MEMES TABLES feraient compter deux fois le meme
  // inventaire, et le service afficherait des places qui n existent pas.
  { nom: '🔴 une jointure de tables se duplique',
    fichier: COPIE,
    de: '  if (prestation.jointure_de) return null',
    vers: '  if (false) return null' },

  { nom: '🔴 la prestation copiee arrive en ligne toute seule',
    fichier: COPIE,
    de: '  sortie.nom = nomDeLaCopie(prestation.nom, nomsExistants)',
    vers: '  sortie.nom = prestation.nom' },

  // ─── LA FENETRE DE VERIFICATION (25/09) ──────────────────────────────────
  //
  // 🔴 ALEX : « il faut juste une fenetre qui explique ce qui n est pas copie
  // et la verification necessaire. S il est informe, c est tres bien. »
  //
  // ⚠️ LE PIRE CAS N EST PAS UNE LIGNE OUBLIEE, c est une liste GENERIQUE dont
  // la moitie ne s applique pas : on cesse de la lire.
  { nom: '🔴 la liste parle de photos a qui n en a pas',
    fichier: COPIE,
    de: '  if (galerie > 0) {',
    vers: '  if (galerie >= 0) {' },

  { nom: '🔴 la liste ne dit plus que les variantes sont a zero',
    fichier: COPIE,
    de: '  if (variantes > 0) {',
    vers: '  if (false) {' },

  { nom: '⚠️ elle ne dit plus la consequence : rien ne se vend',
    fichier: COPIE,
    de: "      faire: 'Remets les quantités : tant qu’elles sont à zéro, rien ne se vend.',",
    vers: "      faire: 'Remets les quantités.'," },

  { nom: '⚠️ elle ne dit plus que la copie est invisible du client',
    fichier: COPIE,
    de: "      ? 'Personne ne peut la réserver tant que tu ne l’as pas activée.'",
    vers: "      ? 'Elle est inactive.'" },

  { nom: '⚠️ elle n annonce plus que les stocks par jour n ont pas suivi',
    fichier: COPIE,
    de: '  if (stocksJour > 0) {',
    vers: '  if (false) {' },

  // 🔴 QUINZE FOIS LA MEME FENETRE N EST PAS UNE INFORMATION (Alex, 25/09) :
  // « pas 15 fois la meme chose s il fait la manip sur 15 articles ». Douze
  // fenetres par jour deviennent un reflexe, et le jour ou elle compte
  // vraiment, plus personne ne la lit.
  { nom: '🔴 la fenetre se leve pour une copie ordinaire',
    fichier: COPIE,
    de: "  return (Array.isArray(points) ? points : []).some(p => p?.grave === true)",
    vers: '  return true' },

  { nom: '🔴 la fenetre se releve a chaque duplication',
    fichier: COPIE,
    de: '  if (dejaVue) return false',
    vers: '  if (false) return false' },

  // 🔴 LE SEUL POINT QUI NE SE VOIT NULLE PART : l article a l air pret, il s
  // active, et rien ne se vend.
  { nom: '🔴 le stock zero des variantes cesse d etre un point grave',
    fichier: COPIE,
    de: '      grave: true,',
    vers: '      grave: false,' },

  // ⚠️ LA MODALE REND UNE LIGNE PAR ENTREE : lui passer un texte colle donnait
  // le pave illisible de la capture du 25/09.
  { nom: '⚠️ la fenetre recoit un pave au lieu d une ligne par point',
    fichier: COPIE,
    de: "  return (Array.isArray(points) ? points : []).map(p => `• ${p.quoi}. ${p.faire}`)",
    vers: "  return [(Array.isArray(points) ? points : []).map(p => `${p.quoi}. ${p.faire}`).join(' ')]" },

  // ⚠️ LE MESSAGE COURT NE REPREND QUE CE QUI SE RETIENT : recopier les six
  // lignes de la fenetre dans un message de trois secondes ne sert personne.
  { nom: '⚠️ le message court deverse tous les points',
    fichier: COPIE,
    de: '    .map(p => p?.court)',
    vers: '    .map(p => p?.court || p?.quoi)' },

  // ─── CE QUI EST ECRIT DOIT SE VOIR (25/09, trouve par Alex) ──────────────
  //
  // 🔴 « Il faut rafraichir la page pour voir les groupes ajoutes, le message
  // dit que c est fait mais on ne le voit pas, on pense que ca n a pas
  // fonctionne. » Un succes invisible fait recopier, et le groupe se retrouve
  // en double.
  // ⚠️ ANCRE REPOINTEE LE 13/10 : le panneau ne lit plus lui-meme (45
  // requetes), il suit le parent ; c'est le PARENT qui doit relire apres une
  // ecriture.
  { nom: '🔴 le panneau ne relit plus ses groupes apres une copie',
    fichier: ECRAN,
    de: '  }, [cleArticles, totalTouches])',
    vers: '  }, [cleArticles])' },

  { nom: '🔴 la copie ne nomme plus les articles touches',
    fichier: ECRAN,
    de: '    onCopie?.(aCopier)',
    vers: '    onCopie?.([])' },

  // 🔴 LE FRERE, DANS L AUTRE SENS : la bibliotheque annoncait « sur 3
  // articles » alors qu il y en avait quinze.
  //
  // ⚠️ L ANCRE A SUIVI LE DEMENAGEMENT (25/09). La lecture vivait dans la
  // bibliotheque ; elle est passee chez le parent, ou elle sert aussi aux
  // vignettes. `verif:ancres` a dit « ancre perimee » des le premier passage —
  // c est exactement son travail : une ancre qui ne trouve plus sa cible ne
  // mesure rien, et sans lui elle serait restee muette.
  { nom: '🔴 la bibliotheque garde un compte perime',
    fichier: ECRAN,
    de: '  }, [cleArticles, totalTouches])',
    vers: '  }, [cleArticles])' },

  // ─── AGIR EN LOT ─────────────────────────────────────────────────────────
  //
  // 🔴 LA DERIVE BINAIRE SUR DE L ARGENT : `9.5 * 0.99` vaut 9,404999… donc
  // 9,40 € au lieu de 9,41 €. Un centime par article, a chaque saison.
  // ⚠️ CETTE CIBLE EST L ANCIENNE FORMULE, MOT POUR MOT. Une premiere version
  // mutait `Math.round(base * 100)` en `base * 100` : sur 9,50 € les deux
  // donnent 950, la mutation ne changeait donc RIEN et restait verte. Une
  // mutation doit rejouer le defaut, pas le frole.
  // ─── LE STOCK EN LOT ET LA GRILLE (10/10) ────────────────────────────────
  { nom: '🔴 la grille jour par jour n est plus remplacée (le Croissant reste à 30)',
    fichier: ECRAN, banc: 'verif:lot',
    de: "        .delete().in('article_id', grilles.articleIds).eq('actif', true).select('id')", vers: "        .select('id').in('article_id', grilles.articleIds).eq('actif', true)" },
  { nom: '🔴 le lot efface aussi les jours fermés',
    fichier: ECRAN, banc: 'verif:lot',
    de: "        .delete().in('article_id', grilles.articleIds).eq('actif', true).select('id')", vers: "        .delete().in('article_id', grilles.articleIds).select('id')" },
  { nom: '⚠️ un article dont seule la grille change n est pas compté',
    fichier: LOT, banc: 'verif:lot',
    de: "    ...(action === 'stock' ? (grilles?.articleIds || []).map(String) : []),", vers: '' },
  { nom: '⚠️ le résumé ne nomme plus les grilles remplacées',
    fichier: LOT, banc: 'verif:lot',
    de: '      if (grilles?.details?.length) morceaux.push(', vers: '      if (false) morceaux.push(' },
  { nom: '🔴 un jour fermé compte comme une quantité à remplacer',
    fichier: LOT, banc: 'verif:lot',
    de: '    const actifs = jours.filter(e => e && e.actif !== false)', vers: '    const actifs = jours.filter(e => e)' },
  { nom: '🔴 l écran retombe sur « déjà ce stock » au lieu du refus',
    fichier: ECRAN, banc: 'verif:lot',
    // ⚠️ ANCRE RECALÉE LE 15/10 : le résumé reçoit aussi les articles écartés.
    de: '                          {refus || resumeDuLot({ action: lotAction, patchs, coches: lotIds.length, valeur, grilles, ecarts })}', vers: '                          {resumeDuLot({ action: lotAction, patchs, coches: lotIds.length, valeur, grilles, ecarts })}' },

  { nom: '🔴 l ajustement de prix repart des euros et derive d un centime',
    fichier: LOT,
    banc: 'verif:lot',
    de: '  return Math.round(centimes * (1 + p / 100)) / 100',
    vers: '  return Math.round(base * (1 + p / 100) * 100) / 100' },

  // 🔴 -100 % MET LE CATALOGUE A ZERO EURO sur la fiche publique.
  { nom: '🔴 une baisse de 100 % passe',
    fichier: LOT,
    banc: 'verif:lot',
    de: "  if (p <= -100) return 'Un article ne peut pas tomber à 0 €. Choisis une baisse plus petite.'",
    vers: '  if (false) return null' },

  { nom: '⚠️ une baisse sous le centime passe',
    fichier: LOT,
    banc: 'verif:lot',
    de: '    return nouveau !== null && nouveau < 0.01',
    vers: '    return false' },

  // ⚠️ UNE ECRITURE POUR RIEN reveille le temps reel de la fiche publique et
  // fausse le compte annonce au commercant.
  { nom: '⚠️ on reecrit les articles qui n ont rien a changer',
    fichier: LOT,
    banc: 'verif:lot',
    de: '      if (a.actif === cible) continue',
    vers: '      if (false) continue' },

  // 🔴 UNE CHAINE VIDE FABRIQUE UNE CATEGORIE FANTOME au nom invisible.
  { nom: '🔴 vider la categorie ecrit une chaine vide au lieu de null',
    fichier: LOT,
    banc: 'verif:lot',
    de: "      const cible = typeof valeur === 'string' && valeur.trim() ? valeur.trim() : null",
    vers: "      const cible = typeof valeur === 'string' ? valeur : null" },

  { nom: '🔴 le resume oublie de dire que les anciens prix sont perdus',
    fichier: LOT,
    banc: 'verif:lot',
    de: '  return `Le prix de ${quoi} ${sens} de ${Math.abs(p)} %. Les anciens prix ne sont pas conservés.`',
    vers: '  return `Le prix de ${quoi} ${sens} de ${Math.abs(p)} %.`' },

  { nom: '⚠️ rendre indisponible ne dit plus la consequence visible',
    fichier: LOT,
    banc: 'verif:lot',
    // ⚠️ ANCRE RECALÉE LE 15/10 : « masqué », accordé au nombre.
    de: '    : `${quoi} seront masqués : ils disparaîtront de ta fiche, et restent ici, prêts à revenir.`',
    vers: '    : `${quoi} seront masqués.`' },

  // 🔴 LES CASES A COCHER RENDENT DU TEXTE, la base des nombres.
  { nom: '🔴 la selection ne reconnait plus un identifiant en texte',
    fichier: LOT,
    banc: 'verif:lot',
    de: '  const vises = new Set((Array.isArray(ids) ? ids : []).map(String))',
    vers: '  const vises = new Set(Array.isArray(ids) ? ids : [])' },

  // ─── L ECRAN ─────────────────────────────────────────────────────────────
  //
  // 🔴 SANS LES OPTIONS, DUPLIQUER NE SERT A RIEN : c est justement la liste
  // des garnitures qu on ne veut plus reecrire.
  { nom: '🔴 la duplication d article n emporte plus les options',
    fichier: ECRAN,
    de: "      .eq('article_id', a.id)",
    vers: "      .eq('article_id', '00000000-0000-0000-0000-000000000000')" },

  // 🔴 UNE ACTION QUI NE SE DEFAIT PAS NE PART PAS SUR UN CLIC.
  //
  // ⚠️ ON MUTE LE VERDICT, PAS LE LIBELLE DU BOUTON. Une premiere version
  // changeait « Oui, changer les prix » en « Oui » : la confirmation restait
  // la, la garde restait verte, et la mutation ne mesurait rien. Ici la boite
  // s affiche encore mais sa reponse n arrete plus rien — une confirmation
  // decorative, exactement le defaut qu on veut voir rougir.
  { nom: '🔴 le refus de la confirmation n arrete plus l ecriture des prix',
    fichier: ECRAN,
    banc: 'verif:lot',
    de: '      if (!okPrix) return',
    vers: '      if (!okPrix) void 0' },

  // ⚠️ LES REGLES VIENNENT DU MODULE : une copie dans l ecran, et le resume lu
  // par le commercant finit par ne plus decrire ce qui s ecrit.
  { nom: '⚠️ l ecran refait le tri des cibles au lieu d appeler la regle',
    fichier: ECRAN,
    de: '    const { aCopier } = repartirCibles(cibles, conflits)',
    vers: '    const aCopier = cibles.filter(id => !conflits.includes(id))' },

  // 🔴 LES VALEURS SE RATTACHENT PAR ARTICLE, jamais par l ordre de retour.
  //
  // ⚠️ L INDENTATION FAIT PARTIE DE L ANCRE. Cette ligne vivait dans un
  // composant (6 espaces) ; depuis que l ecriture est partagee entre deux
  // ecrans, elle vit au niveau du module (4 espaces). Le harnais a dit
  // « TEXTE INTROUVABLE » — c est exactement ce qu on lui demande, et c est
  // pour ca qu une ancre introuvable ne compte jamais comme une reussite.
  { nom: '🔴 les options copiees se rattachent par l ordre d insertion',
    fichier: ECRAN,
    de: '    const groupeId = idParArticle.get(String(g.article_id))',
    vers: '    const groupeId = (crees || [])[i]?.id' },

  // ─── LE GROUPE CRÉÉ SUR L ARTICLE PRÉVIENT LE PARENT (Alex, 10/10) ───────
  { nom: '🔴 une option ajoutée ne prévient plus le parent : vignette et bibliothèque périmées',
    fichier: ECRAN,
    de: "    toast('Option ajoutée'); apresEcriture()",
    vers: "    toast('Option ajoutée')" },
  // ⚠️ ANCRE REPOINTEE LE 13/10 : plus de repli local, le parent relit.
  { nom: '🔴 le chemin après écriture ne prévient plus personne',
    fichier: ECRAN,
    de: '    onCopie?.([articleId])',
    vers: '    void articleId' },
  // ─── L ORDRE DES ARTICLES (Alex, 10/10) ─────────────────────────────────
  { nom: '🔴 les articles non rangés passent devant les rangés',
    fichier: 'lib/ordre-articles.js',
    de: '  if (ra !== null && rb === null) return -1',
    vers: '  if (ra !== null && rb === null) return 1' },
  { nom: '🔴 le tri oublie l accent : É part en fin de liste',
    fichier: 'lib/ordre-articles.js',
    de: "  return nom(a).localeCompare(nom(b), 'fr', { sensitivity: 'base' })",
    vers: '  return nom(a) < nom(b) ? -1 : nom(a) > nom(b) ? 1 : 0' },
  { nom: '🔴 la flèche déplace un article hors de sa catégorie',
    fichier: 'lib/ordre-articles.js',
    de: '  const voisins = trierArticles((articles || []).filter(a => memeCategorie(a, article)))\n  const i = voisins.findIndex(a => String(a.id) === String(id))\n  const j = i + sens',
    vers: '  const voisins = trierArticles(articles || [])\n  const i = voisins.findIndex(a => String(a.id) === String(id))\n  const j = i + sens' },
  { nom: '⚠️ toute la catégorie est réécrite à chaque flèche',
    fichier: 'lib/ordre-articles.js',
    de: '    .filter(p => p.avant !== p.ordre)',
    vers: '    .filter(Boolean)' },
  { nom: '🔴 la fiche publique ignore l ordre du commerçant',
    fichier: 'app/commander/[slug]/page.js',
    de: '      articles: trierArticles(arts || []),',
    vers: '      articles: arts || [],' },
  { nom: '🔴 les flèches écrivent sans filtrer le commerce',
    fichier: ECRAN,
    de: ".update({ ordre: p.ordre }).eq('id', p.id).eq('commercant_id', commercantId).select('id')",
    vers: ".update({ ordre: p.ordre }).eq('id', p.id).select('id')" },
  { nom: '⚠️ un échec de rangement passe en silence',
    fichier: ECRAN,
    de: "    if (rate) toast('L’ordre n’a pas pu être enregistré. Réessaie.', 'error')",
    vers: '' },

  // ─── « + NOUVEAU GROUPE » (Alex, 10/10) ─────────────────────────────────
  { nom: '🔴 un nouveau groupe garde les options en double',
    fichier: COPIE,
    de: '    if (vues.has(cle)) continue',
    vers: '' },
  { nom: '🔴 un groupe sans option se crée',
    fichier: COPIE,
    de: "  if (valeurs.length === 0) return { ok: false, error: 'Ajoute au moins une option au groupe.' }",
    vers: '' },
  { nom: '🔴 le nouveau groupe se pose sur un article qui l a déjà',
    fichier: ECRAN,
    de: '    const { aCopier, ignores } = repartirCibles(cibles, conflits)',
    vers: '    const { aCopier, ignores } = { aCopier: cibles, ignores: [] }' },

  // ─── LE LOT : STOCK, TVA, TEMPS (Alex, 10/10) ───────────────────────────
  { nom: '🔴 le lot met 0 par jour, que le formulaire refuse',
    fichier: LOT, banc: 'verif:lot',
    de: '      if (refusQuantite(valeur?.mode, valeur?.quantite)) continue',
    vers: '' },
  { nom: '🔴 « ne pas changer » la TVA sur place l efface quand même',
    fichier: LOT, banc: 'verif:lot',
    de: '      if (s !== TVA_INCHANGEE && !memeTaux(a.tva_taux_sur_place, tauxOuNull(s))) patch.tva_taux_sur_place = tauxOuNull(s)',
    vers: '      if (!memeTaux(a.tva_taux_sur_place, tauxOuNull(s))) patch.tva_taux_sur_place = tauxOuNull(s === TVA_INCHANGEE ? \'\' : s)' },
  { nom: '⚠️ le lot réécrit un temps de préparation identique',
    fichier: LOT, banc: 'verif:lot',
    de: '      if (a.temps_prepa !== null && a.temps_prepa !== undefined && Number(a.temps_prepa) === n) continue',
    vers: '' },
  { nom: '🔴 l écran écrit le stock sans demander son refus',
    fichier: ECRAN, banc: 'verif:lot',
    // ⚠️ ANCRE RECALÉE LE 15/10 : la liste est nommée (`ACTIONS_AVEC_REFUS`).
    de: "const ACTIONS_AVEC_REFUS = ['prix', 'stock', 'tva', 'temps_prepa', 'vente', 'jour_meme', 'sur_commande']",
    vers: "const ACTIONS_AVEC_REFUS = ['prix', 'tva', 'temps_prepa', 'vente', 'jour_meme', 'sur_commande']" },

  { nom: '⚠️ le bouton Dupliquer redevient une icône muette',
    fichier: ECRAN,
    de: '<Copy size={14} strokeWidth={1.8} color={T.bgPanel}/> Dupliquer',
    vers: '<Copy size={14} strokeWidth={1.8} color={T.bgPanel}/>' },

  // ─── 13/10 : le nombre de choix voyage avec le groupe ────────────────────
  { nom: '🔴 une copie de groupe perd le nombre de choix',
    fichier: 'lib/catalogue-copie.js',
    de: '      choix_min: Number.isInteger(groupe.choix_min) ? groupe.choix_min : null,',
    vers: '      choix_min: null,' },
  { nom: '🔴 la création ignore le nombre de choix saisi',
    fichier: 'lib/catalogue-copie.js',
    de: '      choix_min: bornes.choix_min, choix_max: bornes.choix_max,',
    vers: '      choix_min: null, choix_max: null,' },
  { nom: '🔴 des bornes impossibles passent à la création',
    fichier: 'lib/catalogue-copie.js',
    de: '  if (!bornes.ok) return { ok: false, error: `Nombre de choix : ${bornes.error}` }',
    vers: '' },
  { nom: '🔴 modifier un groupe n écrit plus ses bornes',
    fichier: 'lib/catalogue-copie.js',
    de: '      groupes.push({ id: g.id, patch: { nom: cible.nom, type: cible.type, obligatoire: cible.obligatoire, choix_min: cible.choix_min, choix_max: cible.choix_max } })',
    vers: '      groupes.push({ id: g.id, patch: { nom: cible.nom, type: cible.type, obligatoire: cible.obligatoire } })' },
  { nom: '🔴 la modification ignore un changement de bornes',
    fichier: 'lib/catalogue-copie.js',
    de: '    const memesChoix = (g.choix_min ?? null) === cible.choix_min && (g.choix_max ?? null) === cible.choix_max',
    vers: '    const memesChoix = true' },
  { nom: '🔴 le formulaire de modification part de bornes vides (il effacerait le « 3 au choix »)',
    fichier: ECRAN,
    de: "    choix_min: Number.isInteger(depart.choix_min) ? String(depart.choix_min) : '',",
    vers: "    choix_min: ''," },

  // ══ ✅ POSER ET RETIRER UN GROUPE, ET LE SUPPRIMER (Alex, 15/10) ══
  { nom: '🔴 tout decocher retire aussi la copie d un article en vitrine (hors liste)',
    fichier: 'lib/catalogue-copie.js', banc: 'verif:copie',
    de: '    && visibles.has(String(g.article_id)) && !coche.has(String(g.article_id)))',
    vers: '    && !coche.has(String(g.article_id)))' },
  { nom: '🔴 decocher ne retire plus rien',
    fichier: 'lib/catalogue-copie.js', banc: 'verif:copie',
    de: '    aRetirer: retirees.map(g => g.id),', vers: '    aRetirer: [],' },
  { nom: '🔴 la liste s ouvre vide : enregistrer retirerait le groupe de partout',
    fichier: ECRAN, banc: 'verif:copie',
    de: '    setCibles(listeCibles.filter(a => poses.has(String(a.id))).map(a => a.id))', vers: '    setCibles([])' },
  { nom: '🔴 le retrait part sans confirmation',
    fichier: ECRAN, banc: 'verif:copie',
    de: '      if (!okRetrait) return\n', vers: '' },
  { nom: '🔴 « Supprimer » part sans confirmation',
    fichier: ECRAN, banc: 'verif:copie',
    de: "      action: 'Oui, supprimer le groupe',\n    }))\n    if (!ok) return\n", vers: "      action: 'Oui, supprimer le groupe',\n    }))\n" },
  { nom: '🔴 un retrait refuse par la RLS passe pour un succes',
    fichier: ECRAN, banc: 'verif:copie',
    de: "    if (!data || data.length === 0) return { ok: false, erreur: 'Retrait refusé par les permissions (aucune ligne retirée).' }\n", vers: '' },

  // ══ ✅ LA FAÇON DE VENDRE, D'UN COUP (Alex, 15/10) ══
  { nom: '🔴 un article sans commande a l avance passe a « non » au jour meme (plus vendu du tout)',
    fichier: LOT, banc: 'verif:lot',
    de: "      if (a.commande_active !== true) return 'il ne se vend pas sur commande : il ne serait plus vendu du tout'\n",
    vers: '' },
  { nom: '🔴 un article « que sur commande » perd sa commande (plus vendu du tout)',
    fichier: LOT, banc: 'verif:lot',
    de: "      if (a.vente_jour === false) return 'il ne se vend que sur commande : il ne serait plus vendu du tout'\n",
    vers: '' },
  { nom: '🔴 un article a « 0 par jour » repasse en ligne (epuise d office)',
    fichier: LOT, banc: 'verif:lot',
    de: '    if (aujourdhui && refusQuantite(modeStockDe(a), a.stock_jour)) return SANS_QUANTITE\n',
    vers: '' },
  { nom: '🔴 les ecartes sont ecrits quand meme',
    fichier: LOT, banc: 'verif:lot',
    de: '      if (ecartDuLot({ action, article: a, valeur, deuxCircuits })) continue\n',
    vers: '' },
  { nom: '🔴 passer en vitrine efface le stock et le delai (retour impossible a l identique)',
    fichier: LOT, banc: 'verif:lot',
    de: '        sortie.push({ id: a.id, patch: { est_vitrine: cible } })',
    vers: '        sortie.push({ id: a.id, patch: { est_vitrine: cible, stock_jour: 0, delai_minutes: 0 } })' },
  { nom: '🔴 hors alimentaire, le jour meme s ecrit quand meme',
    fichier: LOT, banc: 'verif:lot',
    de: "    if (!deuxCircuits) return 'réglage réservé aux commerces alimentaires'\n",
    vers: '' },
  { nom: '🔴 le lot sur commande garde le delai en jours au lieu des minutes',
    fichier: LOT, banc: 'verif:lot',
    de: '  return /^\\d+$/.test(brut) ? Number(brut) * MINUTES_JOUR : NaN',
    vers: '  return /^\\d+$/.test(brut) ? Number(brut) : NaN' },
  { nom: '⚠️ le resume tait les articles laisses de cote',
    fichier: LOT, banc: 'verif:lot',
    de: '  return coches === 0 ? phrase : `${phrase}${ecartes}`',
    vers: '  return phrase' },
  { nom: '🔴 l ecran oublie deuxCircuits a l ecriture',
    fichier: ECRAN, banc: 'verif:lot',
    de: '    const patchs = patchsDuLot({ action: lotAction, articles: vises, valeur, deuxCircuits })\n    // ✅ 15/10',
    vers: '    const patchs = patchsDuLot({ action: lotAction, articles: vises, valeur })\n    // ✅ 15/10' },
  { nom: '🔴 le refus des nouvelles actions n est plus verifie avant d ecrire',
    fichier: ECRAN, banc: 'verif:lot',
    de: "const ACTIONS_AVEC_REFUS = ['prix', 'stock', 'tva', 'temps_prepa', 'vente', 'jour_meme', 'sur_commande']",
    vers: "const ACTIONS_AVEC_REFUS = ['prix', 'stock', 'tva', 'temps_prepa']" },
  { nom: '⚠️ le lot choisit « en ligne » d avance',
    fichier: ECRAN, banc: 'verif:lot',
    de: '  const [lotVente, setLotVente] = useState(null)', vers: '  const [lotVente, setLotVente] = useState(VENTE_EN_LIGNE)' },
]

const lancer = (banc = BANC) => {
  try {
    const sortie = execSync(`npm run ${banc}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    const plante = !/vérifications/.test(sortie)
    return { rouge: true, plante, extrait: sortie.slice(-400) }
  }
}

const BANCS = [...new Set(MUTATIONS.map((m) => m.banc || BANC))]
for (const banc of BANCS) {
  const depart = lancer(banc)
  if (depart.rouge) {
    console.log(`🔴 ${banc} EST DÉJÀ ROUGE. On ne mesure rien sur un banc rouge.`)
    console.log(depart.extrait)
    process.exit(1)
  }
}
console.log(`Bancs verts au départ : ${BANCS.join(', ')}.\n`)

let attrapees = 0
const manquees = []

for (const m of MUTATIONS) {
  const f = chemin(m.fichier)
  const original = readFileSync(f, 'utf8')
  if (!original.includes(m.de)) {
    manquees.push(`${m.nom} — TEXTE INTROUVABLE`)
    console.log(`  ? introuvable : ${m.nom}`)
    continue
  }
  ecrireSur(f, original.replace(m.de, m.vers))
  const res = lancer(m.banc)
  ecrireSur(f, original)

  if (readFileSync(f, 'utf8') !== original) {
    console.log(`\n🔴 RESTAURATION RATÉE sur ${m.fichier}. On s'arrête.`)
    process.exit(2)
  }

  if (res.rouge && !res.plante) { attrapees++; console.log(`  ✓ attrapée : ${m.nom}`) }
  else if (res.plante) { manquees.push(`${m.nom} — le banc a PLANTÉ`); console.log(`  ⚠ plantage : ${m.nom}`) }
  else { manquees.push(`${m.nom} — RESTÉ VERT`); console.log(`  ✕ MANQUÉE : ${m.nom}`) }
}

console.log(`\n${attrapees}/${MUTATIONS.length} mutations attrapées.`)
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach((x) => console.log('   • ' + x)) }

const finalRouge = BANCS.some((banc) => lancer(banc).rouge)
if (finalRouge) console.log(`🔴 UN BANC EST ROUGE APRÈS RESTAURATION (${BANCS.join(', ')}).`)
else console.log('\nBancs verts après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
