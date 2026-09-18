// LES CAPTURES D'ÉCRAN, AUX DIMENSIONS EXACTES DES DEUX STORES.
//
// Alex photographie sur ses téléphones — c'est la vraie interface, les vraies
// polices, la vraie barre d'état, bien mieux qu'une simulation sur PC. Ce
// script ne fait que les mettre au format que chaque store exige.
//
// 🔴 APPLE REFUSE UNE DIMENSION QUI N'EST PAS DANS SA LISTE, au pixel près, et
// le rejet arrive après la soumission : un cycle de revue perdu pour un
// redimensionnement de trois secondes.
//
// ⚠️ GOOGLE EST SOUPLE (320 à 3840 px, ratio entre 16:9 et 9:16) : une capture
// Android brute passe telle quelle. On la recopie quand même, pour que tout
// parte du même dossier le jour du dépôt.
//
// ⚠️ ON NE DÉFORME JAMAIS. Les iPhone récents partagent tous un ratio proche de
// 19,5:9 : un redimensionnement direct ne se voit pas. Si le ratio de la source
// s'écarte trop, le script le DIT et ajoute des bandes plutôt que d'étirer des
// visages et des prix.
//
//   1. Poser les captures dans  captures-stores/android/  et  captures-stores/ios/
//   2. npm run captures:stores
//   3. Récupérer  captures-stores/pret/
//
// ⚠️ `captures-stores/` n'est pas versionné : ce sont des images lourdes, et
// elles changeront à chaque refonte d'écran.

import sharp from 'sharp'
import { mkdirSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, parse } from 'node:path'

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..')
const ENTREE = join(RACINE, 'captures-stores')
const SORTIE = join(ENTREE, 'pret')

// Les formats attendus. Pour Apple, ce sont les dimensions de sa liste ; en
// donner une autre est un rejet.
const FORMATS = {
  ios: [
    { nom: 'iphone-6.9', l: 1290, h: 2796, note: 'iPhone 6,9" — le format PRINCIPAL, obligatoire' },
    { nom: 'iphone-6.5', l: 1242, h: 2688, note: 'iPhone 6,5" — demandé en plus par App Store Connect' },
  ],
  android: [
    { nom: 'telephone', l: 1080, h: 2340, note: 'Google accepte large ; on normalise pour l’uniformité' },
  ],
}

// Au-delà de cet écart de ratio, un redimensionnement direct déformerait
// visiblement. On complète alors par des bandes de la couleur de la marque.
const ECART_TOLERE = 0.03
const FOND = '#1A0840'

const journal = []
const dire = (s) => { journal.push(s); console.log(s) }

async function convertir(source, cible, format) {
  const meta = await sharp(source).metadata()
  const ratioSource = meta.width / meta.height
  const ratioCible = format.l / format.h
  const ecart = Math.abs(ratioSource - ratioCible) / ratioCible

  if (ecart <= ECART_TOLERE) {
    await sharp(source).resize(format.l, format.h, { fit: 'fill', kernel: sharp.kernel.lanczos3 }).png().toFile(cible)
    return { mode: 'ajusté', ecart }
  }
  // ⚠️ DES BANDES PLUTÔT QU'UN ÉTIREMENT. Une capture étirée se voit
  // immédiatement sur les visages et les prix, et c'est ce que le relecteur
  // regarde en premier.
  await sharp(source)
    .resize(format.l, format.h, { fit: 'contain', background: FOND, kernel: sharp.kernel.lanczos3 })
    .png().toFile(cible)
  return { mode: 'bandes', ecart }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔴 CE SCRIPT EST NEUTRALISÉ DEPUIS LE 18/09. IL PRODUISAIT DU HORS-RÈGLES.
//
// Deux défauts, tous deux SILENCIEUX, trouvés en préparant les vrais visuels :
//
//   1. L'ÉTIREMENT SOUS LE SEUIL. `ECART_TOLERE` vaut 3 % ; l'écart entre les
//      captures d'Alex (1080 × 2400, ratio 0,45) et le format d'Apple
//      (1290 × 2796, ratio 0,4613) vaut 2,5 %. JUSTE EN DESSOUS. Il aurait
//      étiré les prix et les visages de 2,5 %, sans un mot, et c'est
//      exactement ce que le relecteur regarde.
//
//   2. LE FORMAT ANDROID VIOLAIT LA RÈGLE DE GOOGLE. Google demande un ratio
//      entre 16:9 et 9:16, donc AU MOINS 0,5625 en portrait. Ce script
//      produisait du 1080 × 2340, soit 0,4615. Le bon format est 1080 × 1920.
//
// ✅ LE REMPLAÇANT : yoppaa.app/brand-kit/captures. Il POSE la capture à sa
// taille sur un fond au format du store, au lieu de la déformer pour qu'elle
// y entre. Le ratio du fond est alors celui qu'on veut, quelle que soit la
// source, et plus rien n'est étiré.
//
// ⚠️ ON NE LE SUPPRIME PAS, ON L'ARRÊTE. Le code reste lisible pour que la
// prochaine personne comprenne POURQUOI, plutôt que de le réécrire à
// l'identique. Mais il ne doit plus rien produire : un outil qui fabrique du
// hors-règles et qui reste lançable finit par être lancé.
// ═══════════════════════════════════════════════════════════════════════════
const NEUTRALISE = true

async function main() {
  if (NEUTRALISE) {
    console.log('\n🔴 Ce script ne sert plus : il produisait des captures ETIREES de 2,5 %')
    console.log('   vers le format d Apple, et un format Android au ratio 0,4615 que')
    console.log('   Google refuse (il en veut 0,5625 au minimum).')
    console.log('\n✅ Utilise plutot  yoppaa.app/brand-kit/captures')
    console.log('   Il pose ta capture a sa taille sur un fond au format du store,')
    console.log('   sans jamais la deformer, et les memes captures servent aux deux.\n')
    process.exit(1)
  }
  for (const p of [ENTREE, join(ENTREE, 'android'), join(ENTREE, 'ios'), SORTIE]) mkdirSync(p, { recursive: true })

  let total = 0
  for (const [plateforme, formats] of Object.entries(FORMATS)) {
    const dossier = join(ENTREE, plateforme)
    const fichiers = existsSync(dossier)
      ? readdirSync(dossier).filter((n) => /\.(png|jpe?g)$/i.test(n)).sort()
      : []

    if (!fichiers.length) {
      dire(`⚠️ Aucune capture dans captures-stores/${plateforme}/`)
      continue
    }
    dire(`\n${plateforme.toUpperCase()} — ${fichiers.length} capture(s)`)

    for (const format of formats) {
      const dest = join(SORTIE, `${plateforme}-${format.nom}`)
      mkdirSync(dest, { recursive: true })
      for (const [i, nom] of fichiers.entries()) {
        const source = join(dossier, nom)
        const cible = join(dest, `${String(i + 1).padStart(2, '0')}-${parse(nom).name}.png`)
        const { mode, ecart } = await convertir(source, cible, format)
        if (mode === 'bandes') {
          dire(`   ⚠️ ${nom} → ${format.l}×${format.h} avec des bandes (ratio écarté de ${Math.round(ecart * 100)} %)`)
        }
        total++
      }
      dire(`   ✅ ${format.l}×${format.h} — ${format.note}`)
    }
  }

  if (!total) {
    dire('\nRien à faire. Dépose tes captures dans captures-stores/android/ et captures-stores/ios/.')
    return
  }
  dire(`\n${total} fichier(s) dans captures-stores/pret/`)
  // ⚠️ LE RAPPEL QUI COMPTE PLUS QUE LE FORMAT : une capture montrant une fiche
  // « de test » dit au relecteur qu'il regarde un brouillon.
  dire('⚠️ Vérifie qu’aucune capture n’affiche une enseigne qui se dit « test »,')
  dire('   « témoin » ou « provisoire » : c’est ce que le relecteur lit en premier.')
}

main().catch((e) => { console.error('🔴 Échec :', e?.message || e); process.exit(1) })
