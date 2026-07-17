// Génère app/favicon.ico (dots Yoppaa) à partir de public/icon-512.png.
// Remplace le favicon.ico par défaut de Next/Vercel (triangle noir) qui s'affichait
// dans les aperçus de partage (WhatsApp lit /favicon.ico, pas l'og:image).
//
// L'ICO enveloppe une seule image PNG 64x64 (format ICO "PNG compressé", supporté
// par tous les navigateurs modernes + WhatsApp). Lancer : node scripts/gen-favicon.mjs
import sharp from 'sharp'
import { writeFileSync } from 'fs'

const SIZE = 64
const png = await sharp('public/icon-512.png').resize(SIZE, SIZE).png().toBuffer()

// En-tête ICONDIR (6 octets)
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0)   // réservé
header.writeUInt16LE(1, 2)   // type = 1 (icône)
header.writeUInt16LE(1, 4)   // nombre d'images = 1

// Entrée ICONDIRENTRY (16 octets)
const entry = Buffer.alloc(16)
entry.writeUInt8(SIZE, 0)          // largeur
entry.writeUInt8(SIZE, 1)          // hauteur
entry.writeUInt8(0, 2)             // couleurs palette (0 = sans)
entry.writeUInt8(0, 3)             // réservé
entry.writeUInt16LE(1, 4)          // plans
entry.writeUInt16LE(32, 6)         // bits par pixel
entry.writeUInt32LE(png.length, 8) // taille des données
entry.writeUInt32LE(22, 12)        // offset des données (6 + 16)

writeFileSync('app/favicon.ico', Buffer.concat([header, entry, png]))
console.log(`favicon.ico écrit (${png.length} octets PNG, ${SIZE}x${SIZE})`)
