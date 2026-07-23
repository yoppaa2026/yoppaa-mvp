// Génère 2 images de carte d'identité FICTIVE (recto/verso) pour tester
// l'upload KYB du signup. Volontairement SANS ressemblance avec la vraie
// carte belge : filigrane SPÉCIMEN + mentions DOCUMENT DE TEST partout.
// Usage : node scripts/gen-id-test.mjs  →  test-logos/carte-id-test-*.png
import sharp from 'sharp'
import { mkdirSync } from 'fs'

const OUT = 'test-logos'
mkdirSync(OUT, { recursive: true })

// Format carte ID-1 (85,6 × 54 mm) → 856 × 540 px
const W = 856, H = 540

const filigrane = `
  <text x="${W / 2}" y="${H / 2 + 40}" font-family="Arial, sans-serif" font-size="120"
    font-weight="bold" fill="rgba(220,38,38,0.18)" text-anchor="middle"
    transform="rotate(-18 ${W / 2} ${H / 2})">SPÉCIMEN</text>`

const cadre = `
  <rect width="${W}" height="${H}" rx="28" fill="#F4F1FA"/>
  <rect x="6" y="6" width="${W - 12}" height="${H - 12}" rx="24" fill="none"
    stroke="#C4A0F4" stroke-width="3"/>`

const bandeau = (titre) => `
  <rect x="6" y="6" width="${W - 12}" height="74" rx="24" fill="#6B35C4"/>
  <rect x="6" y="44" width="${W - 12}" height="36" fill="#6B35C4"/>
  <text x="36" y="54" font-family="Arial, sans-serif" font-size="30" font-weight="bold"
    fill="#FFFFFF">${titre}</text>
  <text x="${W - 36}" y="54" font-family="Arial, sans-serif" font-size="22" font-weight="bold"
    fill="#FFC94D" text-anchor="end">DOCUMENT DE TEST</text>`

const champ = (x, y, label, valeur) => `
  <text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="17" font-weight="bold"
    fill="#9CA3AF" letter-spacing="1">${label}</text>
  <text x="${x}" y="${y + 30}" font-family="Arial, sans-serif" font-size="26" font-weight="bold"
    fill="#1A0840">${valeur}</text>`

const recto = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  ${cadre}
  ${bandeau("CARTE D'IDENTITÉ FICTIVE · YOPPAA")}
  <!-- photo silhouette -->
  <rect x="36" y="116" width="200" height="260" rx="14" fill="#E5DDF3"/>
  <circle cx="136" cy="210" r="46" fill="#9660E0"/>
  <path d="M62 376 q74 -110 148 0 Z" fill="#9660E0"/>
  <text x="136" y="352" font-family="Arial, sans-serif" font-size="16" font-weight="bold"
    fill="#6B35C4" text-anchor="middle">PHOTO TEST</text>
  <!-- champs -->
  ${champ(280, 150, 'NOM', 'SPÉCIMEN')}
  ${champ(280, 230, 'PRÉNOM', 'Testine')}
  ${champ(280, 310, 'DATE DE NAISSANCE', '01.01.1990')}
  ${champ(600, 150, 'NATIONALITÉ', 'Fictive')}
  ${champ(600, 230, 'N° DOCUMENT', 'TEST-0000-000')}
  ${champ(600, 310, 'VALIDITÉ', 'Aucune (test)')}
  <text x="280" y="400" font-family="Arial, sans-serif" font-size="18" font-weight="bold"
    fill="#DC2626">Document sans aucune valeur légale, généré pour tester Yoppaa.</text>
  <!-- pseudo MRZ clairement factice -->
  <text x="36" y="470" font-family="Courier New, monospace" font-size="30" font-weight="bold"
    fill="#6B7280" letter-spacing="4">TEST&lt;&lt;SPECIMEN&lt;&lt;TESTINE&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;</text>
  <text x="36" y="508" font-family="Courier New, monospace" font-size="30" font-weight="bold"
    fill="#6B7280" letter-spacing="4">0000000000&lt;&lt;YOPPAA&lt;&lt;TEST&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;</text>
  ${filigrane}
</svg>`

const verso = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  ${cadre}
  ${bandeau('VERSO · CARTE FICTIVE · YOPPAA')}
  ${champ(36, 150, 'LIEU DE NAISSANCE', 'Testville (BE)')}
  ${champ(36, 230, 'SEXE', 'X')}
  ${champ(36, 310, 'DÉLIVRÉE PAR', 'Générateur de test Yoppaa')}
  ${champ(460, 150, 'N° REGISTRE FICTIF', '00.00.00-000.00')}
  ${champ(460, 230, 'SIGNATURE', 'Testine Spécimen')}
  <text x="36" y="410" font-family="Arial, sans-serif" font-size="18" font-weight="bold"
    fill="#DC2626">Aucune donnée réelle. Sert uniquement à tester l'upload KYB du signup.</text>
  <text x="36" y="470" font-family="Courier New, monospace" font-size="30" font-weight="bold"
    fill="#6B7280" letter-spacing="4">VERSO&lt;&lt;TEST&lt;&lt;SANS&lt;&lt;VALEUR&lt;&lt;&lt;&lt;&lt;&lt;&lt;</text>
  <text x="36" y="508" font-family="Courier New, monospace" font-size="30" font-weight="bold"
    fill="#6B7280" letter-spacing="4">YOPPAA&lt;&lt;KYB&lt;&lt;SPECIMEN&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;</text>
  ${filigrane}
</svg>`

await sharp(Buffer.from(recto)).png().toFile(`${OUT}/carte-id-test-recto.png`)
console.log(`✓ ${OUT}/carte-id-test-recto.png`)
await sharp(Buffer.from(verso)).png().toFile(`${OUT}/carte-id-test-verso.png`)
console.log(`✓ ${OUT}/carte-id-test-verso.png`)
