import UIKit
import WebKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = CAPBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)

        // Lancement a froid PAR un lien : l'app etait fermee, elle s'ouvre
        // directement sur la page demandee au lieu de l'accueil.
        if let url = connectionOptions.urlContexts.first?.url {
            ouvrirDansLApp(url)
        } else if let activite = connectionOptions.userActivities.first(where: { $0.activityType == NSUserActivityTypeBrowsingWeb }),
                  let url = activite.webpageURL {
            ouvrirDansLApp(url)
        }
    }

    // Le lien `yoppaa://` (bouton « Revenir dans Yoppaa » apres la banque).
    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
        if let url = URLContexts.first?.url {
            ouvrirDansLApp(url)
        }
    }

    // Le lien universel (un lien www.yoppaa.app touche dans un email).
    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
        if userActivity.activityType == NSUserActivityTypeBrowsingWeb, let url = userActivity.webpageURL {
            ouvrirDansLApp(url)
        }
    }

    // LE LIEN S'OUVRE ICI, PAR LE CODE NATIF, ET PAS PAR LE SITE (02/10).
    //
    // Quand la banque a fini dans Safari, la vue de l'app est restee sur la
    // page Stripe : le code du site n'y tourne pas, personne n'y ecouterait le
    // lien. Le natif, lui, est toujours la. On charge donc l'adresse
    // directement dans la vue, quelle que soit la page affichee.
    private func ouvrirDansLApp(_ url: URL) {
        guard let cible = LienYoppaa.cible(url) else { return }
        // La vue est creee par `makeKeyAndVisible` ; on attend le tour suivant
        // pour passer apres le chargement de l'accueil, comme Capacitor le fait.
        DispatchQueue.main.async { [weak self] in
            guard let pont = self?.window?.rootViewController as? CAPBridgeViewController,
                  let vue = pont.webView else { return }
            _ = vue.load(URLRequest(url: cible))
        }
    }
}

// Seuls `yoppaa://www.yoppaa.app/...` et `https://www.yoppaa.app/...` ouvrent
// une page, et toujours en https sur www.yoppaa.app.
//
// N'importe quelle page web peut declencher un lien `yoppaa://` : il ne doit
// mener que chez nous. Meme regle que `lienVersApp` (lib/retour-vers-app.js).
enum LienYoppaa {
    static let hote = "www.yoppaa.app"

    static func cible(_ url: URL) -> URL? {
        guard var morceaux = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        guard morceaux.host?.lowercased() == hote else { return nil }
        guard let schema = morceaux.scheme?.lowercased(), schema == "yoppaa" || schema == "https" else { return nil }
        guard morceaux.user == nil, morceaux.password == nil, morceaux.port == nil else { return nil }
        morceaux.scheme = "https"
        morceaux.host = hote
        if morceaux.path.isEmpty { morceaux.path = "/" }
        return morceaux.url
    }
}
