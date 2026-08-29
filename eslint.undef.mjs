// Config JETABLE : rallume `no-undef`, éteinte dans la config normale parce que
// typescript-eslint la désactive. C'est elle, et elle seule, qui voit un
// identifiant utilisé sans être importé — invisible au build comme au banc.
// Lancée par `npm run verif:undef`.
//
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ CE QU'ELLE NE COUVRE PAS, ET IL FAUT LE SAVOIR : LA ZONE MORTE TEMPORELLE
//
// Le défaut du 12/08 qui a cassé l'accueil EN PRODUCTION avait DEUX moitiés :
// un import oublié, et un `const` inséré TROP HAUT, lu pendant le rendu avant
// sa déclaration. Cette config n'attrape que la première.
//
// ⚠️ Et le 17/08 j'ai reproduit la seconde en écrivant un `useEffect` cent
// lignes au-dessus du `useState` dont son tableau de dépendances dépend. Écran
// blanc garanti, et `verif:undef` est resté vert.
//
// `no-use-before-define` a été essayée le 17/08 pour combler ce trou. Elle
// rend 21 erreurs, et TOUTES sont du code juste : elle ne distingue pas le
// CORPS du composant, exécuté immédiatement, d'un CALLBACK appelé plus tard,
// où lire une variable déclarée plus bas est parfaitement légal. Une garde qui
// rougit sur du code correct coûte plus cher que pas de garde : on l'a retirée.
//
// ✅ LE FILET EXISTE DEPUIS LE 29/08 : `npm run verif:zone-morte`.
//
// Il a fallu un TROISIÈME écran blanc pour l'écrire. Mon effet du bouton
// flottant lisait `peutCommander` dans son tableau de dépendances, 428 lignes
// AVANT sa déclaration : plus AUCUNE fiche commerçant ne s'ouvrait.
//
// La garde ne regarde QUE les tableaux de dépendances, et c'est ce qui la rend
// tenable là où `no-use-before-define` avait échoué. Un tableau de dépendances
// est évalué PENDANT LE RENDU : y lire un `const` déclaré plus bas dans le même
// composant lève à coup sûr, sans exception et donc sans faux positif.
//
// ⚠️ CE QUI RESTE DÉCOUVERT : un `const` lu ailleurs que dans un tableau de
// dépendances, directement dans le corps du composant. Là, il faut toujours
// RELIRE l'ordre des déclarations quand on insère du code loin de l'endroit où
// vivent ses dépendances.
// ═══════════════════════════════════════════════════════════════════════════
import { defineConfig, globalIgnores } from 'eslint/config'

const NAVIGATEUR = {
  window: 'readonly', document: 'readonly', navigator: 'readonly', location: 'readonly',
  fetch: 'readonly', console: 'readonly', localStorage: 'readonly', sessionStorage: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
  requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly',
  alert: 'readonly', confirm: 'readonly', prompt: 'readonly',
  URL: 'readonly', URLSearchParams: 'readonly', Blob: 'readonly', File: 'readonly',
  FileReader: 'readonly', FormData: 'readonly', Image: 'readonly', Audio: 'readonly',
  Headers: 'readonly', Request: 'readonly', Response: 'readonly', AbortController: 'readonly',
  Notification: 'readonly', ResizeObserver: 'readonly', IntersectionObserver: 'readonly',
  MutationObserver: 'readonly', Event: 'readonly', CustomEvent: 'readonly',
  HTMLElement: 'readonly', Element: 'readonly', Node: 'readonly', DOMParser: 'readonly',
  getComputedStyle: 'readonly', XMLSerializer: 'readonly',
  atob: 'readonly', btoa: 'readonly', crypto: 'readonly', structuredClone: 'readonly',
  performance: 'readonly', history: 'readonly', screen: 'readonly', matchMedia: 'readonly',
  requestIdleCallback: 'readonly', queueMicrotask: 'readonly', TextEncoder: 'readonly',
  TextDecoder: 'readonly', ReadableStream: 'readonly', Canvas: 'readonly', OffscreenCanvas: 'readonly',
  self: 'readonly', caches: 'readonly', indexedDB: 'readonly', WebSocket: 'readonly',
  XMLHttpRequest: 'readonly', MediaRecorder: 'readonly', SpeechSynthesisUtterance: 'readonly',
  speechSynthesis: 'readonly', AbortSignal: 'readonly', BroadcastChannel: 'readonly',
}

const NODE = {
  process: 'readonly', Buffer: 'readonly', __dirname: 'readonly', __filename: 'readonly',
  global: 'readonly', module: 'writable', require: 'readonly', exports: 'writable',
}

export default defineConfig([
  globalIgnores(['.next/**', 'out/**', 'build/**', 'node_modules/**', 'public/**']),
  {
    files: ['**/*.{js,jsx,mjs}'],
    // La règle factice ci-dessous ne signale jamais rien : sans ça, chaque
    // `eslint-disable` du code remonterait comme directive inutile.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...NAVIGATEUR, ...NODE, React: 'readonly' },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    // Le code porte des `eslint-disable-next-line react-hooks/exhaustive-deps`.
    // Ce plugin factice évite 43 « rule not found » qui noieraient le vrai signal.
    plugins: { 'react-hooks': { rules: { 'exhaustive-deps': { create: () => ({}) } } } },
    rules: { 'no-undef': 'error' },
  },
])
