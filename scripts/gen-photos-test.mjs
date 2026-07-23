// Génère les photos de galerie (illustrations stylisées 1200x675, 16:9) des
// 5 commerçants de test, 3 par commerce, dans test-logos/photos/.
// Style flat + palette par catégorie + pastille « démo » (pas de fausse photo :
// l'authenticité est le moat Yoppaa, on assume l'illustration).
// Usage : node scripts/gen-photos-test.mjs
import sharp from 'sharp'
import { mkdirSync } from 'fs'

const OUT = 'test-logos/photos'
mkdirSync(OUT, { recursive: true })
const W = 1200, H = 675

// Enveloppe commune : fond dégradé + sol + pastille démo
const cadre = (bg1, bg2, contenu) => `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/>
  </linearGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <ellipse cx="${W / 2}" cy="590" rx="430" ry="46" fill="rgba(26,8,64,0.10)"/>
  ${contenu}
  <rect x="${W - 132}" y="${H - 52}" width="108" height="30" rx="15" fill="rgba(255,255,255,0.85)"/>
  <text x="${W - 78}" y="${H - 31}" font-family="Arial, sans-serif" font-size="16" font-weight="bold"
    fill="#6B35C4" text-anchor="middle">démo</text>
</svg>`

const S = {}

// ── LA MIE DE TEST (violet pâle + dorés) ──────────────────────────────────────
S['mie-1-baguettes'] = cadre('#F3EBFF', '#E4D5FA', `
  <rect x="330" y="470" width="540" height="90" rx="16" fill="#B08968"/>
  <rect x="350" y="452" width="500" height="26" rx="13" fill="#9C7653"/>
  <g transform="rotate(-18 600 360)">
    ${[0, 1, 2].map(i => `
      <rect x="${420 + i * 120}" y="180" width="74" height="360" rx="37" fill="${i === 1 ? '#E8B86D' : '#F0C987'}"/>
      ${[0, 1, 2, 3].map(j => `<line x1="${428 + i * 120}" y1="${240 + j * 70}" x2="${486 + i * 120}" y2="${218 + j * 70}" stroke="#C98A3B" stroke-width="10" stroke-linecap="round"/>`).join('')}
    `).join('')}
  </g>`)

S['mie-2-boule'] = cadre('#EDE0FF', '#DCC8F7', `
  <rect x="320" y="500" width="560" height="46" rx="20" fill="#B08968"/>
  <ellipse cx="600" cy="400" rx="240" ry="165" fill="#E0A95C"/>
  <ellipse cx="600" cy="375" rx="240" ry="150" fill="#F7DDA4"/>
  <path d="M480 340 q34 44 0 92" stroke="#C98A3B" stroke-width="20" fill="none" stroke-linecap="round"/>
  <path d="M600 325 q34 50 0 106" stroke="#C98A3B" stroke-width="20" fill="none" stroke-linecap="round"/>
  <path d="M720 340 q34 44 0 92" stroke="#C98A3B" stroke-width="20" fill="none" stroke-linecap="round"/>`)

S['mie-3-tarte'] = cadre('#F6F0FF', '#E8DAFA', `
  <ellipse cx="600" cy="420" rx="270" ry="140" fill="#E8B86D"/>
  <ellipse cx="600" cy="400" rx="270" ry="132" fill="#F0C987"/>
  <ellipse cx="600" cy="398" rx="215" ry="102" fill="#B4457A"/>
  ${Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2
    return `<circle cx="${600 + Math.cos(a) * 150}" cy="${398 + Math.sin(a) * 66}" r="21" fill="#8E2F5D"/>`
  }).join('')}
  <circle cx="600" cy="392" r="30" fill="#8E2F5D"/>`)

// ── CISEAUX PROVISOIRES (verts) ───────────────────────────────────────────────
S['ciseaux-1-outils'] = cadre('#E6F7F0', '#CDEEDF', `
  <g transform="translate(330,150) scale(15)" stroke="#047857" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
    <path d="M20 4 8.12 15.88"/><path d="M14.8 14.8 20 20"/><path d="M8.12 8.12 12 12"/>
  </g>
  <rect x="760" y="200" width="52" height="300" rx="14" fill="#10B981"/>
  ${Array.from({ length: 8 }, (_, i) => `<rect x="806" y="${212 + i * 35}" width="60" height="16" rx="8" fill="#10B981"/>`).join('')}`)

S['ciseaux-2-fauteuil'] = cadre('#DEF3EA', '#C2E8D6', `
  <rect x="565" y="470" width="70" height="90" fill="#065F46"/>
  <ellipse cx="600" cy="565" rx="130" ry="22" fill="#065F46"/>
  <rect x="430" y="180" width="340" height="240" rx="42" fill="#10B981"/>
  <rect x="460" y="330" width="280" height="130" rx="30" fill="#0B9E6F"/>
  <rect x="400" y="300" width="66" height="150" rx="30" fill="#047857"/>
  <rect x="734" y="300" width="66" height="150" rx="30" fill="#047857"/>`)

S['ciseaux-3-seche'] = cadre('#E9F9F1', '#D2F0E1', `
  <g transform="rotate(-20 600 380)">
    <rect x="430" y="300" width="270" height="150" rx="72" fill="#10B981"/>
    <rect x="680" y="322" width="120" height="106" rx="22" fill="#047857"/>
    <rect x="470" y="430" width="96" height="180" rx="34" fill="#0B9E6F"/>
    ${[0, 1, 2].map(i => `<path d="M${330 - i * 46} ${330 + i * 24} q-40 22 0 46" stroke="#6EE7B7" stroke-width="14" fill="none" stroke-linecap="round"/>`).join('')}
  </g>`)

// ── LA BOUTIQUE TÉMOIN (oranges) ──────────────────────────────────────────────
S['temoin-1-portant'] = cadre('#FFF1E6', '#FFE0C7', `
  <rect x="270" y="196" width="660" height="18" rx="9" fill="#C2410C"/>
  <rect x="286" y="210" width="16" height="360" fill="#C2410C"/>
  <rect x="898" y="210" width="16" height="360" fill="#C2410C"/>
  ${[['#F97316', 360], ['#FDBA74', 500], ['#EA580C', 640], ['#FFD8B5', 780]].map(([c, x]) => `
    <path d="M${x} 214 l-8 26 h16 Z" fill="#7C2D12"/>
    <rect x="${x - 62}" y="240" width="124" height="210" rx="20" fill="${c}"/>
    <rect x="${x - 84}" y="240" width="30" height="90" rx="14" fill="${c}"/>
    <rect x="${x + 54}" y="240" width="30" height="90" rx="14" fill="${c}"/>
  `).join('')}`)

S['temoin-2-pulls'] = cadre('#FFF4EA', '#FFE3CB', `
  ${[['#C2410C', 470], ['#F97316', 380], ['#FDBA74', 290], ['#FFD8B5', 200]].map(([c, y], i) => `
    <rect x="${400 + i * 12}" y="${y}" width="${400 - i * 24}" height="86" rx="24" fill="${c}"/>
  `).join('')}`)

S['temoin-3-boites'] = cadre('#FFF0E4', '#FFDFC4', `
  <rect x="360" y="330" width="230" height="230" rx="16" fill="#F97316"/>
  <rect x="360" y="330" width="230" height="34" fill="#EA580C"/>
  <rect x="462" y="330" width="26" height="230" fill="#FFF1E6"/>
  <rect x="620" y="400" width="180" height="160" rx="14" fill="#FDBA74"/>
  <rect x="620" y="400" width="180" height="26" fill="#F0A85C"/>
  <rect x="698" y="400" width="22" height="160" fill="#FFF7EF"/>
  <circle cx="700" cy="300" r="70" fill="#C2410C"/>
  <circle cx="700" cy="300" r="42" fill="#FFF1E6"/>`)

// ── LA TABLE D'ESSAI (violets sombres) ────────────────────────────────────────
S['table-1-assiette'] = cadre('#EFE7FC', '#DCCBF6', `
  <circle cx="600" cy="390" r="200" fill="#FFFFFF"/>
  <circle cx="600" cy="390" r="150" fill="#EDE0FF"/>
  <circle cx="600" cy="390" r="60" fill="#9660E0"/>
  <g stroke="#2D0F6B" stroke-width="16" stroke-linecap="round" fill="none">
    <path d="M310 260 v110 M280 260 v70 q0 30 30 30 M340 260 v70 q0 30 -30 30 M310 370 v160"/>
    <path d="M880 260 q40 60 10 150 l-10 30 v90 M880 260 v270"/>
  </g>`)

S['table-2-verres'] = cadre('#ECE2FB', '#D8C5F4', `
  <rect x="530" y="180" width="80" height="290" rx="30" fill="#2D0F6B"/>
  <rect x="548" y="130" width="44" height="80" rx="16" fill="#2D0F6B"/>
  <rect x="530" y="300" width="80" height="80" fill="#9660E0"/>
  <path d="M710 240 h150 l-30 120 q-8 40 -45 40 t-45 -40 Z" fill="#C4A0F4"/>
  <rect x="777" y="396" width="16" height="120" fill="#C4A0F4"/>
  <rect x="730" y="514" width="110" height="16" rx="8" fill="#C4A0F4"/>`)

S['table-3-cloche'] = cadre('#F1EAFD', '#DFCFF8', `
  <path d="M370 470 a230 230 0 0 1 460 0 Z" fill="#9660E0"/>
  <path d="M420 470 a180 180 0 0 1 360 0 Z" fill="#B285EC"/>
  <circle cx="600" cy="228" r="26" fill="#6B35C4"/>
  <rect x="320" y="470" width="560" height="30" rx="15" fill="#6B35C4"/>`)

// ── LE FOOD TRICK (violet clair) ──────────────────────────────────────────────
S['truck-1-camion'] = cadre('#F0E8FD', '#DED0F6', `
  <rect x="270" y="240" width="440" height="260" rx="26" fill="#9660E0"/>
  <path d="M710 320 h140 l70 100 v80 h-210 Z" fill="#7A48CE"/>
  <rect x="740" y="345" width="90" height="70" rx="12" fill="#EDE0FF"/>
  ${[0, 1, 2, 3, 4, 5].map(i => `<rect x="${292 + i * 70}" y="216" width="60" height="42" rx="8" fill="${i % 2 ? '#FFFFFF' : '#C4A0F4'}"/>`).join('')}
  <rect x="300" y="290" width="240" height="120" rx="16" fill="#EDE0FF"/>
  <circle cx="400" cy="516" r="52" fill="#2D0F6B"/><circle cx="400" cy="516" r="24" fill="#EDE0FF"/>
  <circle cx="790" cy="516" r="52" fill="#2D0F6B"/><circle cx="790" cy="516" r="24" fill="#EDE0FF"/>`)

S['truck-2-frites'] = cadre('#F3ECFE', '#E1D3F8', `
  ${[-60, -30, 0, 30, 60].map((dx, i) => `<rect x="${586 + dx}" y="${170 + Math.abs(dx) * 0.6}" width="34" height="220" rx="17" fill="${i % 2 ? '#E8B86D' : '#F0C987'}" transform="rotate(${dx / 6} ${600 + dx} 280)"/>`).join('')}
  <path d="M460 330 h280 l-36 240 h-208 Z" fill="#9660E0"/>
  <path d="M460 330 h280 l-10 66 h-260 Z" fill="#7A48CE"/>
  <circle cx="600" cy="470" r="44" fill="#EDE0FF"/>
  <path d="M583 470 l13 13 24 -26" stroke="#6B35C4" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`)

S['truck-3-burger'] = cadre('#F1E9FD', '#DFD0F7', `
  <path d="M400 330 a200 110 0 0 1 400 0 Z" fill="#E8B86D"/>
  ${[0, 1, 2, 3].map(i => `<circle cx="${470 + i * 86}" cy="${268 - (i % 2) * 18}" r="7" fill="#FFF7EA"/>`).join('')}
  <rect x="400" y="334" width="400" height="36" rx="18" fill="#7BAE4E"/>
  <rect x="416" y="372" width="368" height="52" rx="16" fill="#6B4226"/>
  <rect x="400" y="428" width="400" height="30" rx="15" fill="#F0C987"/>
  <path d="M400 462 h400 v18 a30 30 0 0 1 -30 30 h-340 a30 30 0 0 1 -30 -30 Z" fill="#E8B86D"/>`)

const fichiers = Object.entries(S)
for (const [nom, svg] of fichiers) {
  await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toFile(`${OUT}/${nom}.jpg`)
  console.log(`✓ ${OUT}/${nom}.jpg`)
}
console.log(`\n${fichiers.length} photos générées dans ${OUT}/`)
