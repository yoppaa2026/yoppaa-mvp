import type { CapacitorConfig } from '@capacitor/cli'

// L'ENVELOPPE NATIVE DE YOPPAA, POUR LES DEUX STORES.
//
// 🔴 CE FICHIER NE FABRIQUE PAS UNE APPLICATION, IL EN EMBALLE UNE.
// L'application a 100 routes serveur et un middleware : un export statique est
// IMPOSSIBLE. Capacitor pointe donc vers le site de production plutôt que
// d'embarquer un paquet figé, et cela a deux conséquences qu'il faut avoir en
// tête à chaque déploiement :
//
//   ✅ toute modification du site est IMMÉDIATEMENT dans l'app installée,
//      sans nouvelle soumission ni attente de revue ;
//   🔴 un déploiement raté casse l'app installée, pour tout le monde, à la
//      seconde. Ce qui n'était qu'une page blanche sur le site devient une
//      application morte sur des téléphones.
//
// ⚠️ ON PUBLIE YOPPAA, JAMAIS YOPPAA PRO. Décision du 09/08, et ce n'est pas un
// détail d'organisation : l'app des habitants ne vend que des biens physiques
// et des services réels, que les stores excluent expressément de leur
// facturation. Le tableau de bord commerçant, lui, vend un ABONNEMENT, donc un
// service numérique : publié dans une app, il devrait passer par la
// facturation des stores et leurs 15 à 30 % de commission. Yoppaa Pro reste une
// PWA installée depuis le navigateur.
//
// ⚠️ `appId` EST FIGÉ ET UNIQUE SUR TOUT GOOGLE PLAY. `app.yoppaa.client` est
// déposé depuis le 11/08 et laisse `app.yoppaa.pro` libre. Le changer, c'est
// perdre la fiche et repartir de zéro.

const config: CapacitorConfig = {
  appId: 'app.yoppaa.client',
  appName: 'Yoppaa',

  // ⚠️ REQUIS PAR LA CLI MÊME QUAND ON NE L'UTILISE PAS. Avec `server.url`, ce
  // dossier n'est JAMAIS servi : il doit simplement exister, sinon `cap sync`
  // s'arrête.
  //
  // 🔴 IL POINTAIT D'ABORD VERS `public/` : 1,2 Mo d'icônes et de splash
  // recopiés dans chaque paquet natif, à chaque synchronisation, pour du
  // contenu que personne ne verra. Un dossier dédié d'un seul fichier fait le
  // même travail sans alourdir l'app que les gens téléchargent.
  webDir: 'capacitor-web',

  server: {
    // 🔴 LE SITE DE PRODUCTION, PAS UN PAQUET EMBARQUÉ. Voir l'en-tête.
    url: 'https://www.yoppaa.app',
    // ⚠️ JAMAIS DE HTTP EN CLAIR. Un jeton de session qui voyage en clair sur
    // le réseau d'un café ne se rattrape pas, et les deux stores le refusent.
    cleartext: false,
    // 🔴 LE PAIEMENT DOIT POUVOIR S'OUVRIR, SINON LE TUNNEL MEURT DANS L'APP.
    // Stripe Checkout est une page hébergée chez Stripe : sans cette
    // autorisation, la WebView refuse d'y naviguer et le client reste bloqué
    // sur un écran vide, sa commande créée et jamais payée.
    // ⚠️ Le retour se fait tout seul : `success_url` et `cancel_url` pointent
    // vers yoppaa.app, donc la navigation revient dans le domaine de l'app.
    allowNavigation: [
      'checkout.stripe.com',
      'js.stripe.com',
      'hooks.stripe.com',
      // Le lien magique de connexion et la confirmation d'email passent par le
      // domaine Supabase avant de revenir sur yoppaa.app.
      '*.supabase.co',
    ],
  },

  android: {
    // ⚠️ AUCUN CONTENU MIXTE. Même raison que `cleartext`.
    allowMixedContent: false,
    // Les WebView Android récentes acceptent le zoom : on le laisse, un écran
    // qu'on ne peut pas agrandir est un écran inaccessible.
    webContentsDebuggingEnabled: false,
  },

  ios: {
    // ⚠️ `automatic` LAISSE LE CLAVIER REDIMENSIONNER LA VUE. Sans cela, un
    // champ de formulaire disparaît derrière le clavier sur les petits écrans,
    // et le client ne voit plus ce qu'il tape.
    contentInset: 'automatic',
    // Les liens qui sortent du domaine passent par le navigateur du système
    // plutôt que par la WebView, sauf ceux autorisés ci-dessus.
    limitsNavigationsToAppBoundDomains: false,
  },
}

export default config
