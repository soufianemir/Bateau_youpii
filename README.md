# Marine Companion — MVP

PWA mobile-first pour tester le concept d'un copilote de plaisance : **où aller, où mouiller, comment y aller, quelles conditions et quelles alertes**.

> **Nom de marque provisoire.** Le nom final doit passer une recherche d'antériorité avant publication commerciale.

## Fonctionnalités déjà présentes

- PWA installable iPhone / Android
- GPS réel via `navigator.geolocation.watchPosition()`
- déplacement du bateau sur la carte
- itinéraire indicatif vers un spot et ETA recalculée
- Screen Wake Lock pendant le guidage lorsque le navigateur le supporte
- carte MapLibre + OpenFreeMap
- `SEA SCORE` déterministe et explicable
- recommandations autour de Cannes / Lérins
- écran `Où mouiller` avec ZMEL Sainte-Anne et lien vers la source officielle
- conditions météo / mer de prototypage via Open-Meteo (usage non commercial uniquement sur le free tier)
- catalogue réglementaire : Préfecture maritime, Ville de Cannes, SHOM, CACEM, AVURNAV
- architecture zéro-backend pour la V0
- service worker et cache du shell PWA

## Important — sécurité et droit

Le MVP est un **assistant de préparation et d'aide à la décision**, pas un système de navigation homologué. Les routes et aplats cartographiques ne remplacent jamais les cartes nautiques officielles, les AVURNAV, les arrêtés ni la veille du chef de bord.

Les polygones colorés de la page `Où mouiller` sont **indicatifs pour valider l'UX**. La prochaine étape consiste à ingérer les géométries officielles SHOM/CACEM et les textes/dérogations applicables, avec version et fraîcheur.

Open-Meteo est utilisé ici pour prototypage personnel. Son endpoint gratuit n'autorise pas l'usage commercial (publicité, abonnement, etc.). Le `WeatherProvider` devra être remplacé ou auto-hébergé/licencié avant monétisation.

## Sources ciblées

- SHOM — Réglementation Navigation : https://www.data.gouv.fr/datasets/reglementation-navigation-1
- CACEM — zones réglementaires : https://www.data.gouv.fr/datasets/zones-reglementaires-cacem
- AVURNAV : https://www.data.gouv.fr/datasets/avis-urgents-aux-navigateurs-en-vigueur-en-eaux-francaises-metropolitaines
- Préfecture maritime Méditerranée : https://www.premar-mediterranee.gouv.fr/arretes
- Ville de Cannes — arrêtés : https://www.cannes.com/fr/cadre-de-vie/prevention-des-risques-majeurs-securite/securite/arretes-permanents.html
- ZMEL Sainte-Anne : https://www.cannes.com/fr/cadre-de-vie/plages-mer-nautisme/zone-de-mouillage-et-d-equipements-legers-zmel.html
- Copernicus Marine : https://data.marine.copernicus.eu/
- Copernicus Data Space : https://dataspace.copernicus.eu/

## Lancer localement

Aucun build n'est nécessaire.

```bash
python3 -m http.server 8080
```

Puis ouvrir `http://localhost:8080`.

## Déploiement

Le workflow `.github/workflows/pages.yml` publie le site statique sur GitHub Pages à chaque push sur `main` une fois GitHub Pages configuré avec **GitHub Actions** comme source.

## Prochaines étapes produit

1. Ingestion réelle des géométries SHOM/CACEM autour de Cannes.
2. Synchronisation AVURNAV + arrêtés Préfecture maritime avec détection des dates d'effet.
3. Pipeline Copernicus Marine et Sentinel-1/2/3 avec métadonnées de fraîcheur.
4. Routing côtier local H3/A* en Web Worker, puis validation géométrique.
5. Calcul d'un `Anchor Score`, `Comfort Score`, `Data Confidence` et explication « Pourquoi ? ».
6. Contributions communautaires et prédiction d'affluence.
7. Passage en natif/hybride uniquement lorsque le GPS background / alarme d'ancre devient nécessaire.
