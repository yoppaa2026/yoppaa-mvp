# Email de confirmation d'inscription (Supabase)

⚠️ **CE GABARIT NE VIT PAS DANS LE DÉPÔT.** Il est stocké dans le tableau de bord
Supabase, et c'est pour ça qu'il est resté en anglais pendant que tout le reste
de l'application passait au français : aucun `npm run verif`, aucun build,
aucune relecture de code ne pouvait le voir. Un commerçant qui s'inscrit reçoit
aujourd'hui **« Confirm Your Signup / Follow this link to confirm your user »**,
en anglais, sans logo, juste avant l'écran qui lui parle en français.

## Où le coller

Supabase → **Authentication → Emails → Templates → Confirm signup**

**Subject heading** :

```
Confirme ton adresse, et on continue
```

**Message body** : tout le bloc HTML ci-dessous.

## Le lien, et pourquoi il s'écrit comme ça

```
{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=signup
```

- `{{ .RedirectTo }}` porte **déjà** un `?next=…`, posé par `emailRedirectTo`
  dans `app/signup/page.js`. D'où le `&`, jamais un second `?`.
- C'est lui qui distingue un commerçant d'un Yopper. Un lien écrit en dur vers
  `{{ .SiteURL }}/auth/confirm` renverrait **tout le monde** sur le tableau de
  bord commerçant, y compris un client : c'est exactement le défaut réparé le
  13/07 sur les cinq gabarits.
- `type=signup` est écrit à la main : Supabase n'expose aucune variable
  `.Type`.
- ⚠️ `.RedirectTo` n'est peuplé **que si l'URL est dans l'allowlist**
  (Authentication → URL Configuration → Redirect URLs). Si elle en sort, la
  variable devient vide et le lien casse **sans le dire**.

## Le HTML

```html
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Confirme ton adresse</title>
</head>
<body style="margin:0;padding:0;background:#F8F6FF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#1A0840;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
    <div style="background:linear-gradient(135deg,#160636 0%,#2D0F6B 60%,#1A0840 100%);border-radius:18px 18px 0 0;padding:28px 28px 22px;">
      
    <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;">
      <tr><td align="center" style="text-align:center;">
        <p style="margin:0;font-family:'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;font-weight:800;font-size:32px;letter-spacing:-0.05em;line-height:1;text-align:center;">
          <span style="color:#FFFFFF;">yo</span><span style="color:#C4A0F4;">pp</span><span style="color:#9660E0;">aa</span>
        </p>
        <table cellpadding="0" cellspacing="0" border="0" align="center" role="presentation" style="margin:9px auto 0;border-collapse:collapse;">
          <tr>
            <td valign="top" style="padding:0px 4px 0 0;font-size:0;line-height:0;mso-line-height-rule:exactly;"><div style="width:8px;height:8px;background:#FFFFFF;border-radius:50%;font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</div></td>
            <td valign="top" style="padding:3px 4px 0 0;font-size:0;line-height:0;mso-line-height-rule:exactly;"><div style="width:4px;height:4px;background:#C4A0F4;border-radius:50%;font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</div></td>
            <td valign="top" style="padding:3px 4px 0 0;font-size:0;line-height:0;mso-line-height-rule:exactly;"><div style="width:8px;height:8px;background:#C4A0F4;border-radius:50%;font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</div></td>
            <td valign="top" style="padding:3px 4px 0 0;font-size:0;line-height:0;mso-line-height-rule:exactly;"><div style="width:4px;height:4px;background:#9660E0;border-radius:50%;font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</div></td>
            <td valign="top" style="padding:0px 0px 0 0;font-size:0;line-height:0;mso-line-height-rule:exactly;"><div style="width:8px;height:8px;background:#9660E0;border-radius:50%;font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</div></td>
          </tr>
        </table>
      </td></tr>
    </table>
      <p style="margin:14px 0 0;color:#C4A0F4;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">Confirme ton adresse</p>
    </div>
    <div style="background:#fff;border-radius:0 0 18px 18px;padding:28px;border:1px solid #EDE0FF;border-top:none;">
      <p style="margin:0 0 18px;font-size:15px;line-height:1.55;color:#1A0840;">Il reste un clic, et ton espace Yoppaa s’ouvre. 🟣</p>
      
      <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#1A0840;">
        On a besoin de vérifier que cette adresse est bien la tienne : c’est elle
        qui recevra tes commandes, tes rendez-vous et tes factures.
      </p>
      <div style="background:#F8F6FF;border-radius:12px;padding:14px 16px;border:1px solid #EDE0FF;margin-bottom:6px;">
        <p style="margin:0;font-size:12.5px;color:#2D0F6B;line-height:1.6;">
          <strong>Ce qui se passe juste après :</strong> tu reviens sur ton inscription,
          tu remplis ta fiche en quelques minutes, et notre équipe la valide en général sous 24 heures.
        </p>
      </div>
      <p style="margin:20px 0 0;font-size:11.5px;color:#6B7280;line-height:1.55;">
        Ce lien est valable une seule fois et expire au bout d’une heure. Si tu n’es
        pas à l’origine de cette inscription, ignore simplement cet email : aucun
        compte ne sera ouvert.
      </p>
  
      
        <p style="margin:24px 0 0;text-align:center;">
          <a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=signup" style="display:inline-block;padding:13px 28px;background:linear-gradient(135deg,#160636,#6B35C4);color:#fff;text-decoration:none;border-radius:100px;font-weight:800;font-size:15px;letter-spacing:-0.2px;">
            Confirmer mon adresse →
          </a>
        </p>
      
    </div>
    <p style="margin:18px 0 0;text-align:center;font-size:11px;color:#6B7280;">
      yoppaa.app · Ton quartier dans ta poche<br/>Tu reçois cet email parce que tu es commerçant Yoppaa.
    </p>
  </div>
</body>
</html>
```

## À vérifier après avoir collé

1. S'inscrire pour de vrai sur `/signup` et regarder l'email reçu : logo
   Yoppaa, texte français, bouton violet.
2. Cliquer le lien et **arriver sur `/signup`**, pas sur `/dashboard` ni sur
   une page d'erreur.
3. Refaire le même test côté **Yopper** (`/commander/auth`) : le même gabarit
   sert les deux, et il doit ramener sur `/commander`.
