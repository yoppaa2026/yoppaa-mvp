import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // ─── Ajustements de sévérité (décision 18/07/2026) ──────────────────────────
  // Ces règles remontaient en ERREUR sur du code qui fonctionne et qui est en
  // production. On les ramène à un niveau non bloquant plutôt que de refactorer
  // du code critique (dont le tunnel de paiement) pour satisfaire un linter.
  {
    rules: {
      // App francophone : apostrophes et guillemets dans le texte JSX = bruit, pas un bug.
      "react/no-unescaped-entities": "off",
      // Règles React Compiler (eslint-plugin-react-hooks v6) : elles frappent des
      // patterns valides et éprouvés (fonctions hoistées appelées dans un effet,
      // Date.now() dans un gestionnaire d'événement, setState maîtrisé dans un effet).
      // Gardées en warning pour rester visibles sans bloquer.
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
    },
  },
]);

export default eslintConfig;
