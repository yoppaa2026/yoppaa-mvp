// lib/resend-signalement.js
// ════════════════════════════════════════════════════════════════════
// Template email envoyé à la commune (ou Alex pour la démo) à chaque
// signalement citoyen créé via Yoppaa.
//
// Le mail contient :
//   - Type de problème + emoji
//   - Adresse + coordonnées GPS (lien Google Maps)
//   - Photo (URL Supabase Storage cliquable + thumbnail inline si possible)
//   - Description optionnelle
//   - Identité du Yopper (prénom + email pour reply-to)
//   - Date/heure du signalement (timezone Bruxelles)
// ════════════════════════════════════════════════════════════════════

const TYPE_LABEL = {
  nid_poule:     { emoji: '🕳️',  label: 'Nid de poule / dégât de voirie' },
  depot_sauvage: { emoji: '🗑️', label: 'Dépôt sauvage d\'immondices' },
  egout:         { emoji: '🚰', label: 'Égout / avaloir bouché' },
  autre:         { emoji: '⚠️',  label: 'Autre problème' },
}

const C = {
  bg:    '#F8F6FF',
  ink:   '#1A0840',
  panel: '#160636',
  main:  '#6B35C4',
  light: '#C4A0F4',
  pale:  '#EDE0FF',
  muted: '#6B7280',
}

export function emailSignalementCommune({
  type,
  adresse,
  latitude,
  longitude,
  photo_url,
  description,
  yopper_prenom,
  yopper_email,
  created_at,
  service_nom,
}) {
  const t = TYPE_LABEL[type] || TYPE_LABEL.autre
  const date = new Date(created_at)
  const dateBruxelles = date.toLocaleString('fr-BE', {
    timeZone: 'Europe/Brussels',
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  const mapsUrl = (latitude && longitude)
    ? `https://www.google.com/maps?q=${latitude},${longitude}`
    : (adresse ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse)}` : null)

  const subject = `[YOPPAA] ${t.emoji} ${t.label} — ${adresse || 'Mettet'}`

  const html = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:${C.ink};">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">

    <!-- Header violet avec emoji + type -->
    <div style="background:linear-gradient(135deg,${C.panel} 0%,#2D0F6B 60%,${C.ink} 100%);border-radius:18px 18px 0 0;padding:28px 28px 22px;">
      <div style="display:flex;gap:5px;margin-bottom:12px;">
        <span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:#fff;opacity:0.5;"></span>
        <span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:${C.light};"></span>
        <span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:${C.main};"></span>
      </div>
      <p style="margin:0;color:#fff;font-weight:900;font-size:26px;letter-spacing:-1.2px;line-height:1;">yoppaa</p>
      <p style="margin:8px 0 0;color:${C.light};font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">Signalement citoyen</p>
    </div>

    <!-- Corps -->
    <div style="background:#fff;border-radius:0 0 18px 18px;padding:30px 28px;border:1px solid ${C.pale};border-top:none;">

      <!-- Type de problème (gros) -->
      <div style="background:${C.pale};border-radius:14px;padding:18px 20px;margin-bottom:22px;text-align:center;">
        <p style="margin:0 0 6px;font-size:42px;line-height:1;">${t.emoji}</p>
        <p style="margin:0;color:${C.ink};font-weight:900;font-size:18px;letter-spacing:-0.3px;">${t.label}</p>
      </div>

      <!-- Adresse + lien Maps -->
      ${adresse ? `
        <div style="margin-bottom:18px;">
          <p style="margin:0 0 4px;font-size:10px;font-weight:800;color:${C.main};letter-spacing:0.8px;text-transform:uppercase;">📍 Adresse</p>
          <p style="margin:0;font-size:15px;font-weight:600;color:${C.ink};line-height:1.4;">${adresse}</p>
        </div>
      ` : ''}

      ${(latitude && longitude) ? `
        <div style="margin-bottom:18px;">
          <p style="margin:0 0 4px;font-size:10px;font-weight:800;color:${C.main};letter-spacing:0.8px;text-transform:uppercase;">🗺 Coordonnées GPS</p>
          <p style="margin:0 0 8px;font-size:13px;color:${C.muted};font-family:monospace;">${Number(latitude).toFixed(6)}, ${Number(longitude).toFixed(6)}</p>
          ${mapsUrl ? `
            <a href="${mapsUrl}" style="display:inline-block;padding:10px 18px;background:linear-gradient(135deg,${C.panel},${C.main});color:#fff;text-decoration:none;border-radius:100px;font-weight:800;font-size:13px;letter-spacing:-0.1px;">
              Ouvrir dans Google Maps →
            </a>
          ` : ''}
        </div>
      ` : ''}

      <!-- Description -->
      ${description ? `
        <div style="background:#FEF3C7;border-left:3px solid #D97706;border-radius:10px;padding:14px 16px;margin-bottom:18px;">
          <p style="margin:0 0 4px;font-size:10px;font-weight:800;color:#78350F;letter-spacing:0.8px;text-transform:uppercase;">💬 Description du Yopper</p>
          <p style="margin:0;font-size:14px;color:#78350F;line-height:1.5;font-weight:500;font-style:italic;">« ${description.replace(/"/g, '&quot;')} »</p>
        </div>
      ` : ''}

      <!-- Photo -->
      ${photo_url ? `
        <div style="margin-bottom:22px;">
          <p style="margin:0 0 8px;font-size:10px;font-weight:800;color:${C.main};letter-spacing:0.8px;text-transform:uppercase;">📸 Photo</p>
          <a href="${photo_url}" style="display:block;border-radius:14px;overflow:hidden;border:1px solid ${C.pale};">
            <img src="${photo_url}" alt="Photo du signalement" style="display:block;width:100%;max-width:540px;height:auto;"/>
          </a>
          <p style="margin:6px 0 0;font-size:11px;color:${C.muted};text-align:center;">Cliquer sur la photo pour l'ouvrir en grand</p>
        </div>
      ` : ''}

      <!-- Identité Yopper (séparateur) -->
      <div style="border-top:1px solid ${C.pale};padding-top:18px;margin-top:8px;">
        <p style="margin:0 0 4px;font-size:10px;font-weight:800;color:${C.main};letter-spacing:0.8px;text-transform:uppercase;">👤 Signalé par</p>
        <p style="margin:0 0 4px;font-size:14px;color:${C.ink};font-weight:700;">${yopper_prenom || 'Yopper anonyme'}</p>
        <p style="margin:0;font-size:12px;color:${C.muted};">
          📧 <a href="mailto:${yopper_email}" style="color:${C.main};text-decoration:underline;">${yopper_email}</a>
        </p>
        <p style="margin:8px 0 0;font-size:11px;color:${C.muted};font-style:italic;">
          ↩ Tu peux répondre directement à ce mail pour contacter le Yopper.
        </p>
      </div>

      <!-- Date -->
      <p style="margin:18px 0 0;font-size:11px;color:${C.muted};text-align:center;">
        🕐 Signalé le ${dateBruxelles}
      </p>

    </div>

    <!-- Footer Yoppaa -->
    <p style="margin:20px 0 0;text-align:center;font-size:11px;color:${C.muted};line-height:1.6;">
      yoppaa.app · Mettet, Belgique<br/>
      Tu reçois cet email parce que tu es le destinataire des signalements citoyens<br/>
      enregistrés sur ${service_nom || 'la fiche communale'} dans l'application Yoppaa.
    </p>
  </div>
</body>
</html>`

  return { subject, html }
}
