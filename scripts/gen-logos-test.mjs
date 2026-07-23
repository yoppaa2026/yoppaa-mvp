// Génère les logos PNG 512x512 des 3 commerçants de test (La Mie de Test,
// Ciseaux Provisoires, La Boutique Témoin) dans test-logos/. Couleurs par
// catégorie du design system (violet alim / vert service / orange détail)
// + ruban TEST. Usage : node scripts/gen-logos-test.mjs
import sharp from 'sharp'
import { mkdirSync } from 'fs'

const OUT = 'test-logos'
mkdirSync(OUT, { recursive: true })

// Ruban TEST commun (coin supérieur droit)
const ruban = `
  <g transform="translate(512,0) rotate(45)">
    <rect x="-130" y="58" width="260" height="46" fill="#FFC94D"/>
    <text x="0" y="91" font-family="Arial, sans-serif" font-size="30" font-weight="bold"
      fill="#1A0840" text-anchor="middle" letter-spacing="6">TEST</text>
  </g>`

const svgs = {
  // ── La Mie de Test · boulangerie · violet Yoppaa ──
  'la-mie-de-test': `
<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#2D0F6B"/><stop offset="1" stop-color="#6B35C4"/>
  </linearGradient></defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <ellipse cx="256" cy="235" rx="152" ry="106" fill="#E0A95C"/>
  <ellipse cx="256" cy="218" rx="152" ry="96" fill="#F7DDA4"/>
  <path d="M184 196 q22 28 0 58" stroke="#C98A3B" stroke-width="14" fill="none" stroke-linecap="round"/>
  <path d="M256 186 q22 32 0 68" stroke="#C98A3B" stroke-width="14" fill="none" stroke-linecap="round"/>
  <path d="M328 196 q22 28 0 58" stroke="#C98A3B" stroke-width="14" fill="none" stroke-linecap="round"/>
  <text x="256" y="428" font-family="Arial, sans-serif" font-size="50" font-weight="bold"
    fill="#FFFFFF" text-anchor="middle">La Mie de Test</text>
  ${ruban}
</svg>`,

  // ── Ciseaux Provisoires · coiffeur · vert service ──
  'ciseaux-provisoires': `
<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#065F46"/><stop offset="1" stop-color="#10B981"/>
  </linearGradient></defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <g transform="translate(123,58) scale(11.1)" stroke="#FFFFFF" stroke-width="2"
     fill="none" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="6" cy="6" r="3"/>
    <circle cx="6" cy="18" r="3"/>
    <path d="M20 4 8.12 15.88"/>
    <path d="M14.8 14.8 20 20"/>
    <path d="M8.12 8.12 12 12"/>
  </g>
  <text x="256" y="428" font-family="Arial, sans-serif" font-size="42" font-weight="bold"
    fill="#FFFFFF" text-anchor="middle">Ciseaux Provisoires</text>
  ${ruban}
</svg>`,

  // ── La Table d'Essai · restaurant · violet alim ──
  'la-table-d-essai': `
<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#1A0840"/><stop offset="1" stop-color="#6B35C4"/>
  </linearGradient></defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <g transform="translate(123,52) scale(11.1)" stroke="#FFFFFF" stroke-width="2"
     fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/>
    <path d="M7 2v20"/>
    <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>
  </g>
  <text x="256" y="428" font-family="Arial, sans-serif" font-size="48" font-weight="bold"
    fill="#FFFFFF" text-anchor="middle">La Table d'Essai</text>
  ${ruban}
</svg>`,

  // ── Le Food Trick · food truck · violet alim (variante mid) ──
  'le-food-trick': `
<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#4C1D95"/><stop offset="1" stop-color="#9660E0"/>
  </linearGradient></defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <g transform="translate(123,64) scale(11.1)" stroke="#FFFFFF" stroke-width="2"
     fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/>
    <path d="M15 18H9"/>
    <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/>
    <circle cx="17" cy="18" r="2"/>
    <circle cx="7" cy="18" r="2"/>
  </g>
  <text x="256" y="428" font-family="Arial, sans-serif" font-size="50" font-weight="bold"
    fill="#FFFFFF" text-anchor="middle">Le Food Trick</text>
  ${ruban}
</svg>`,

  // ── La Boutique Témoin · détail · orange boutique ──
  'la-boutique-temoin': `
<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#C2410C"/><stop offset="1" stop-color="#F97316"/>
  </linearGradient></defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <g transform="translate(123,52) scale(11.1)" stroke="#FFFFFF" stroke-width="2"
     fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/>
    <path d="M3 6h18"/>
    <path d="M16 10a4 4 0 0 1-8 0"/>
  </g>
  <text x="256" y="428" font-family="Arial, sans-serif" font-size="44" font-weight="bold"
    fill="#FFFFFF" text-anchor="middle">La Boutique Témoin</text>
  ${ruban}
</svg>`,
}

// density 144 = rendu à 2x (1024x1024) : le signup exige min 800 px sur le
// plus grand côté (validerFichier), 512 px était refusé.
for (const [nom, svg] of Object.entries(svgs)) {
  await sharp(Buffer.from(svg), { density: 144 }).png().toFile(`${OUT}/${nom}.png`)
  console.log(`✓ ${OUT}/${nom}.png`)
}
