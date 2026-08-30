'use client'
// LA PHRASE QUI DIT AU YOPPER OÙ IL SE TROUVE.
//
// 🔴 CE QU'ALEX A VU (30/08). Il annule un rendez-vous depuis le lien reçu par
// email. iOS ouvre ce lien dans le NAVIGATEUR, pas dans l'application installée
// sur son écran d'accueil. Il annule, clique « Retour à Yoppaa »… et se retrouve
// dans une application qui ne le reconnaît pas et lui redemande sa position.
//
// ⚠️ LE DÉFAUT N'EST PAS LE NAVIGATEUR, C'EST LE SILENCE. Le Yopper croit être
// dans son application : il ne comprend pas pourquoi « elle » a oublié qui il
// est. Une phrase suffit, et elle transforme un dysfonctionnement apparent en
// situation compréhensible.
//
// ⚠️ ON NE PROMET PAS D'OUVRIR L'APPLICATION. Une page web n'a aucun moyen de
// lancer une application installée sur iOS. Un bouton « Ouvre l'application »
// qui ne ferait rien serait pire que pas de bouton du tout.
//
// ⚠️ ET RIEN NE S'AFFICHE TANT QU'ON NE SAIT PAS. Au premier rendu, la réponse
// est `null` : « on ne sait pas » n'est pas « tu es dans un navigateur », et une
// phrase qui apparaît puis disparaît est un défaut à elle seule.

import { useEffect, useState } from 'react'
import { estDansLApp, messageHorsApp } from '@/lib/retour-app'

export default function NoteHorsApp() {
  const [message, setMessage] = useState(null)

  // Après le montage : `window` n'existe pas au rendu serveur, et l'interroger
  // là produirait une hydratation qui ne correspond pas au HTML envoyé.
  useEffect(() => { setMessage(messageHorsApp(estDansLApp())) }, [])

  if (!message) return null

  return (
    <p style={{
      margin: '14px 0 0', padding: '10px 12px', borderRadius: 12,
      background: '#F8F6FF', border: '1px solid #EDE0FF',
      color: '#2D0F6B', fontSize: '0.78rem', fontWeight: 600, lineHeight: 1.5,
      textAlign: 'center',
    }}>
      {message}
    </p>
  )
}
