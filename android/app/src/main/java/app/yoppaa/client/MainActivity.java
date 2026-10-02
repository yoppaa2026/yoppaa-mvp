package app.yoppaa.client;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    static final String HOTE = "www.yoppaa.app";

    // Vrai quand Android RECREE l'activite (memoire liberee puis rendue) : il
    // redonne alors l'intention de lancement d'origine, et rouvrir son lien
    // rejouerait un lien deja consomme (un lien de connexion ne sert qu'une fois).
    private boolean restauree = false;
    private boolean premiereIntention = true;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // AVANT `super` : c'est `super.onCreate` qui appelle `onNewIntent` avec
        // l'intention de lancement (BridgeActivity.load).
        restauree = savedInstanceState != null;
        super.onCreate(savedInstanceState);

        // LE BOUTON RETOUR REMONTE DANS L'APP (02/10). Sans gestion, Android
        // fermait l'app depuis n'importe quelle page : un Yopper sur une fiche
        // qui voulait revenir a la liste se retrouvait sur son ecran d'accueil.
        // A la premiere page, l'app passe en arriere-plan, sans etre tuee.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView vue = getBridge() != null ? getBridge().getWebView() : null;
                if (vue != null && vue.canGoBack()) {
                    vue.goBack();
                } else {
                    moveTaskToBack(true);
                }
            }
        });
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        boolean lancement = premiereIntention;
        premiereIntention = false;
        if (lancement && restauree) return;
        ouvrirDansLApp(intent);
    }

    // LE LIEN S'OUVRE ICI, PAR LE CODE NATIF, ET PAS PAR LE SITE (02/10).
    // Quand la banque a fini dans Chrome, la vue de l'app est restee sur la page
    // Stripe : le code du site n'y tourne pas. Le natif charge donc l'adresse
    // directement dans la vue, quelle que soit la page affichee.
    private void ouvrirDansLApp(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return;
        // Relance depuis les applications recentes : Android redonne la vieille
        // intention, son lien a deja ete ouvert.
        if ((intent.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) return;
        final String cible = cible(intent.getData());
        if (cible == null || getBridge() == null) return;
        final WebView vue = getBridge().getWebView();
        if (vue == null) return;
        // Apres le chargement de l'accueil, comme Capacitor le fait.
        vue.post(() -> vue.loadUrl(cible));
    }

    // Seuls `yoppaa://www.yoppaa.app/...` et `https://www.yoppaa.app/...`
    // ouvrent une page, et toujours en https sur www.yoppaa.app. N'importe
    // quelle page web peut declencher un lien `yoppaa://` : il ne doit mener
    // que chez nous. Meme regle que `lienVersApp` (lib/retour-vers-app.js).
    static String cible(Uri lien) {
        if (lien == null) return null;
        String schema = lien.getScheme();
        String hote = lien.getHost();
        if (schema == null || hote == null) return null;
        if (!HOTE.equalsIgnoreCase(hote)) return null;
        if (!"yoppaa".equalsIgnoreCase(schema) && !"https".equalsIgnoreCase(schema)) return null;
        if (lien.getPort() != -1 || lien.getUserInfo() != null) return null;
        String chemin = lien.getEncodedPath();
        Uri.Builder b = new Uri.Builder()
            .scheme("https")
            .encodedAuthority(HOTE)
            .encodedPath(chemin == null || chemin.isEmpty() ? "/" : chemin);
        if (lien.getEncodedQuery() != null) b.encodedQuery(lien.getEncodedQuery());
        if (lien.getEncodedFragment() != null) b.encodedFragment(lien.getEncodedFragment());
        return b.build().toString();
    }
}
