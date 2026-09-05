// L'adresse partageable de « Rien ne se perd ».
//
// 🔴 ELLE NE DUPLIQUE RIEN, ELLE RENVOIE. La liste des invendus vit dans
// l'accueil, parce qu'elle a besoin des commerces, des lieux, de la position,
// des distances et du relevé des ventes : tout ce que l'accueil charge déjà.
// En faire une page autonome aurait recopié ces cinq chargements, donc créé
// cinq occasions de diverger, sur le calcul de distance qui nous a déjà mordus.
//
// ⚠️ CE FICHIER EXISTE POUR LA COMMUNICATION, PAS POUR L'APPLICATION. Le Yopper
// qui utilise Yoppaa arrive par la bande de l'accueil ; cette adresse sert aux
// sept endroits où l'anti-gaspi va être annoncé, parce qu'on ne colle pas
// « /commander?invendus=1 » sur une affiche.
//
// ⚠️ `replace` PAR DÉFAUT, ET ON LE GARDE. Avec `push`, le bouton retour du
// téléphone ramènerait ici, qui redirigerait aussitôt : le Yopper se
// retrouverait enfermé, incapable de sortir de la liste.

import { redirect } from 'next/navigation'
import { CHEMIN_LISTE } from '@/lib/anti-gaspi'

export const metadata = {
  title: 'Rien ne se perd · Yoppaa',
  description: 'Les derniers du jour, avant la fermeture, chez les commerçants de ta commune.',
}

export default function RienNeSePerd() {
  redirect(CHEMIN_LISTE)
}
