import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// ⚠️ CES OPTIONS ÉTAIENT SUBIES, PAS CHOISIES. L'appel était nu, et les valeurs
// par défaut de la bibliothèque décidaient seules du sort de la session du
// Yopper. C'est ce qui rendait le défaut du 11/08 impossible à raisonner : rien
// dans le projet ne disait comment la session vivait ni quand elle mourait.
//
// Elles sont maintenant écrites, avec ce qu'elles impliquent :
//   • persistSession   : la session survit à la fermeture de l'application ;
//   • autoRefreshToken : la bibliothèque renouvelle le jeton toute seule. Elle
//     s'arrête quand l'onglet passe en arrière-plan et reprend au retour ;
//   • detectSessionInUrl : indispensable au lien magique, qui rapporte la
//     session dans l'adresse au retour de l'email.
//
// ⚠️ Ce qui n'est PAS réglable ici, et qu'il faut connaître : quand un
// renouvellement échoue de façon définitive (jeton déjà consommé), la
// bibliothèque EFFACE la session. Redémarrer l'application n'y change rien, il
// n'y a plus rien à récupérer. C'est `lib/fetch-yopper.js` qui rattrape ce cas,
// en tentant un renouvellement puis en refusant d'appeler le serveur en
// anonyme.
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
