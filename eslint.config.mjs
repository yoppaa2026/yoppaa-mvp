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
  // ─── Ajustements de sévérité (décisions 18/07 puis 31/07/2026) ──────────────
  // Ces règles remontaient sur du code qui fonctionne et qui est en production.
  // On les neutralise plutôt que de refactorer du code critique (dont le tunnel
  // de paiement) pour satisfaire un linter.
  {
    rules: {
      // App francophone : apostrophes et guillemets dans le texte JSX = bruit, pas un bug.
      "react/no-unescaped-entities": "off",
      // Règles React Compiler (eslint-plugin-react-hooks v6) : elles frappent des
      // patterns valides et éprouvés (fonctions hoistées appelées dans un effet,
      // Date.now() dans un gestionnaire d'événement, setState maîtrisé dans un
      // effet). Passées de warn à off le 31/07 (sweep zéro warning) : elles ne
      // signalaient que des faux positifs depuis le 18/07.
      "react-hooks/immutability": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      // <img> volontaire : photos Supabase Storage déjà compressées côté client
      // (lib/compress-image), pas de next/image pour éviter le proxy
      // d'optimisation Vercel (coût + cache) sur des URLs publiques.
      "@next/next/no-img-element": "off",
      // Fonts Google chargées par <link> dans les pages client : choix assumé
      // (DM Sans par page publique), pas de _document custom dans l'app router.
      "@next/next/no-page-custom-font": "off",
      // Variables volontairement ignorées : préfixe _ et erreurs de catch
      // silencieux (pattern try/catch best-effort omniprésent dans l'app).
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
        caughtErrors: "none",
      }],
    },
  },
]);

export default eslintConfig;
