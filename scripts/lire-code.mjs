// LIRE DU CODE SANS SA PROSE — le dépouilleur partagé des bancs.
//
// ⚠️ POURQUOI IL EXISTE. Pour chercher ce qui NE DOIT PAS exister, on ne peut
// pas lire un fichier tel quel : le commentaire qui explique pourquoi
// `document.write` a été retiré contient forcément `document.write`. Six fois
// en trois jours une garde a verdi sur ma propre prose. On dépouille.
//
// ⚠️ ET IL EST DANS UN SEUL FICHIER DEPUIS LE 29/08. Il vivait recopié dans
// HUIT bancs, en trois variantes légèrement différentes : le défaut ci-dessous
// aurait dû être corrigé huit fois, et l'aurait été une ou deux.
//
// ═══════════════════════════════════════════════════════════════════════════
// 🔴 LE DÉFAUT DU 29/08 : UN DÉPOUILLEUR QUI AVALE LE CODE, EN SILENCE
//
// Un commentaire de LIGNE qui contient « /* » ouvrait un faux bloc pour le
// premier `replace` :
//
//     // sert /_next/static/media/*.woff2      ← ce « /* » n'en est pas un
//     ... 2 000 caractères de VRAI CODE ...
//     } catch { /* rien à faire */ }           ← ce « */ » ferme le faux bloc
//
// Tout ce qu'il y a entre les deux disparaît. Et le silence est le vrai
// problème : les gardes en « ce motif ne doit PAS apparaître » deviennent
// TOUTES vraies, sans rien prouver. Mesuré sur le dépôt : 3 fichiers sur 303.
//
// ⚠️ ET L'INVERSE NE MARCHE PAS NON PLUS. Retirer les commentaires de ligne en
// premier expose l'autre règle, celle des commentaires JSX : `{/*` cherche
// alors le prochain `*/}` À TRAVERS TOUT LE FICHIER. Essayé le 29/08 :
// `ConfigDashboard.js` est passé de 644 000 à 112 000 caractères, et deux
// gardes qui marchaient sont devenues rouges. Le bon ordre n'existe pas.
//
// ✅ LE REMÈDE N'EST DONC PAS UN ORDRE, C'EST DE DÉSARMER LE PIÈGE : on
// neutralise d'abord les marqueurs de bloc ÉCRITS DANS une ligne « // ». Ces
// lignes-là seront de toute façon effacées ensuite ; les toucher ne peut donc
// rien coûter, et l'ordre éprouvé sur les 300 autres fichiers ne bouge pas.
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// 🔴 LE DÉFAUT DU 25/09 : `accept="image/*"` AVALAIT 8 000 CARACTÈRES
//
// Même mécanique que le 29/08, une famille plus loin. Ce n'est plus un « /* »
// écrit dans un commentaire, c'est un « /* » écrit dans une CHAÎNE :
//
//     <input accept="image/*" …/>          ← ce « /* » n'en est pas un
//     … 8 000 caractères de VRAI CODE …
//     {/* un commentaire JSX quelconque */} ← ce « */ » ferme le faux bloc
//
// Mesuré sur le dépôt ce jour-là : 4 fichiers sur 501, dont
// `ConfigDashboard.js` (8 017 caractères) et `signup/page.js` (1 983). Les
// gardes qui visaient ces zones étaient aveugles, dans les deux sens : celles
// qui cherchent un motif ne le trouvaient plus, celles qui vérifient qu'un
// motif est ABSENT verdissaient sans rien prouver. C'est exactement comme ça
// que le défaut a été trouvé : une garde toute neuve, juste, restait rouge.
//
// ✅ LE REMÈDE SUIT CELUI DU 29/08 : désarmer le marqueur plutôt qu'espérer un
// ordre. Un vrai commentaire s'ouvre après un espace, un début de ligne, une
// accolade ou une parenthèse ; un `/*` COLLÉ à une lettre, un chiffre ou une
// étoile vient d'un type MIME ou d'un glob, jamais d'un commentaire lisible.
// ═══════════════════════════════════════════════════════════════════════════

export function sansProse(texte) {
  return texte
    // 0) Les faux marqueurs venus des chaînes : `image/*`, `text/*`, `*/*`.
    .replace(/(?<=[A-Za-z0-9_*])\/\*/g, '  ')
    // 1) Sur les seules lignes de commentaire, les « /* » et « */ » deviennent
    //    inoffensifs. Ces lignes disparaissent à l'étape 3 de toute façon.
    .replace(/^[ \t]*\/\/.*$/gm, (ligne) => ligne.replace(/\/\*|\*\//g, '  '))
    // 2) Les vrais blocs.
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    // 3) Les commentaires de ligne.
    .replace(/^[ \t]*\/\/.*$/gm, ' ')
    // 4) Ce qui reste des accolades des commentaires JSX.
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
}
