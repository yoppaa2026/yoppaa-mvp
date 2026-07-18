// lib/anthropic.js — Client Anthropic (Claude) lazy + génération de textes marchand.
//
// TEXTE UNIQUEMENT (décision produit : jamais d'image générée). Le modèle est choisi
// par l'appelant selon le palier du commerçant (Haiku pour Communiquer/Exister, Sonnet
// pour Vendre). Clé serveur ANTHROPIC_API_KEY (jamais exposée au client).
//
// Même philosophie lazy que lib/stripe.js / lib/resend.js : on n'instancie qu'au premier
// appel, et l'absence de clé ne casse ni le build ni le reste de l'app.

import Anthropic from '@anthropic-ai/sdk'

let client = null
function getClient() {
  if (client) return client
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  client = new Anthropic({ apiKey })
  return client
}

// true si l'IA est câblée ET non coupée par le kill-switch global (IA_TEXTE_ENABLED).
export function iaDisponible() {
  return !!process.env.ANTHROPIC_API_KEY && process.env.IA_TEXTE_ENABLED !== 'false'
}

// Appelle Claude et renvoie { texte, usage:{in,out} }. Lève si clé absente ou API KO.
// NB : on n'envoie PAS `temperature` — déprécié sur les modèles récents (Sonnet 5,
// Opus 4.8…) qui utilisent l'adaptive thinking. Les défauts du modèle suffisent.
export async function genererTexte({ model, systeme, prompt, maxTokens = 1024 }) {
  const anthropic = getClient()
  if (!anthropic) throw new Error('ANTHROPIC_API_KEY manquante')
  const res = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    system: systeme,
    messages: [{ role: 'user', content: prompt }],
  })
  const texte = (res.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim()
  const usage = { in: res.usage?.input_tokens || 0, out: res.usage?.output_tokens || 0 }
  return { texte, usage }
}
