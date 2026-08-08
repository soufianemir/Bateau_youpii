# Marine Companion — MVP

PWA mobile-first pour tester le concept d'un copilote de plaisance : **où aller, où mouiller, comment y aller, quelles conditions et quelles alertes**.

> **Nom de marque provisoire.** Le nom final doit passer une recherche d'antériorité avant publication commerciale.

## Fonctionnalités

- PWA installable iPhone / Android
- GPS réel via `navigator.geolocation.watchPosition()`
- déplacement du bateau sur la carte, cap, vitesse, distance et ETA
- Screen Wake Lock pendant le guidage lorsque le navigateur le supporte
- MapLibre + OpenFreeMap
- `SEA SCORE` déterministe et explicable
- recommandations Cannes / Lérins / Antibes / Théoule
- `Où mouiller` alimenté par snapshots officiels : zones de mouillage SHOM, restrictions, chenaux et CACEM
- AVURNAV actifs à proximité dans l'écran Alertes
- catalogue Copernicus STAC : dernières acquisitions Sentinel-1 / Sentinel-2 et inventaire Sentinel-3
- fraîcheur et état de chaque source visibles
- données officielles conservées localement pour un mode dégradé/offline
- architecture sans backend permanent

## Sources et synchronisation

### Toutes les 6 heures

`.github/workflows/sync-official-data.yml` exécute `scripts/sync_official_data.py` et prépare de petits snapshots pour la zone Cannes / Antibes / Îles de Lérins :

- SHOM WFS `achare_polygon` : zones de mouillage
- SHOM WFS `resare_polygon` : zones de restriction
- SHOM WFS `fairwy_polygon` : chenaux
- API AVURNAV Méditerranée, filtrée à proximité de Cannes
- Copernicus Data Space STAC : Sentinel-1 GRD et Sentinel-2 L2A

La **nature du fond n'est pas encore utilisée dans le calcul de mouillage** : le WFS SHOM testé pour cette couche exige une authentification. Le MVP l'indique comme source non branchée et n'invente jamais `sable`, `roche`, etc. Une source ouverte ou licenciée vérifiée devra être ajoutée avant l'Anchor Score avancé.

### Hebdomadaire

`.github/workflows/sync-cacem.yml` télécharge le GeoPackage national CACEM, le découpe à la bbox du MVP avec GDAL puis ne commit que le petit GeoJSON utile à l'application.

Le job est volontairement hebdomadaire car le fichier national est volumineux.

## Sécurité et droit

Le produit reste un **assistant de préparation et d'aide à la décision**, pas un système de navigation homologué. Les routes affichées ne remplacent jamais cartes nautiques officielles, AVURNAV, arrêtés, balisage ni veille du chef de bord.

- Les couches SHOM sont affichées avec attribution et provenance.
- Le CACEM précise que ses tracés sont une interprétation : seuls les textes réglementaires font foi.
- Une donnée indisponible ne devient jamais une fausse donnée : le dernier snapshot connu est conservé et son âge reste visible.
- La route actuelle reste indicative ; le futur routing H3/A* devra intégrer terre, restrictions et données navigation-grade adaptées.

Open-Meteo est utilisé dans la V0 pour prototypage personnel. Son endpoint gratuit ne doit pas être utilisé pour la monétisation ; ce provider devra être remplacé/licencié avant publicité ou usage commercial.

## Sources

- SHOM Réglementation-Navigation : https://www.data.gouv.fr/datasets/reglementation-navigation-1
- CACEM : https://www.data.gouv.fr/datasets/zones-reglementaires-cacem
- AVURNAV : https://www.data.gouv.fr/datasets/avis-urgents-aux-navigateurs-en-vigueur-en-eaux-francaises-metropolitaines
- Préfecture maritime Méditerranée : https://www.premar-mediterranee.gouv.fr/arretes
- Ville de Cannes : https://www.cannes.com/fr/cadre-de-vie/prevention-des-risques-majeurs-securite/securite/arretes-permanents.html
- Copernicus Marine : https://data.marine.copernicus.eu/
- Copernicus Data Space : https://dataspace.copernicus.eu/

## Lancer localement

Aucun build n'est nécessaire.

```bash
python3 -m http.server 8080
```

Puis ouvrir `http://localhost:8080`.

## Déployer gratuitement sur GitHub Pages

Le dépôt contient déjà `.github/workflows/pages.yml`.

1. GitHub → dépôt `Bateau_youpii` → **Settings**.
2. Dans la colonne de gauche : **Pages**.
3. Dans **Build and deployment / Source**, choisir **GitHub Actions**.
4. Aller dans **Actions** et lancer `Deploy Marine PWA to GitHub Pages` si aucun déploiement n'est parti automatiquement.
5. Le site projet sera normalement disponible sous `https://soufianemir.github.io/Bateau_youpii/`.

Le workflow publie automatiquement chaque nouveau commit de `main`.

> GitHub Pages convient au MVP public gratuit et au test. Pour une future version commerciale avec publicité/SaaS, migrer le même site statique vers Cloudflare Pages ou une autre plateforme autorisant explicitement cet usage.

## Prochaines étapes

1. Vérifier le premier snapshot CACEM et affiner le mapping de ses attributs.
2. Ajouter les arrêtés temporaires de la Préfecture maritime et des communes comme données structurées.
3. Brancher une source vérifiée de nature du fond / habitat / posidonie.
4. Brancher Copernicus Marine comme provider océanique de production.
5. Construire le routing côtier local H3/A* et son contrôle géométrique.
6. Ajouter Anchor Score / Comfort Score / Data Confidence et explication « Pourquoi ? ».
7. Ajouter contributions communautaires et prédiction d'affluence.
8. Passer en natif/hybride seulement quand GPS background / alarme d'ancre l'exigent.
