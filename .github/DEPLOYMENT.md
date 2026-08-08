# Free deployment

## MVP: GitHub Pages

1. Repository **Settings** → **Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. The existing workflow `.github/workflows/pages.yml` deploys every push to `main`.
4. Expected project URL: `https://soufianemir.github.io/Bateau_youpii/`.

GitHub Pages is suitable for this free, non-commercial MVP/test. For a future advertising or commercial SaaS release, move the same static PWA to a host whose terms permit that use (for example Cloudflare Pages) while keeping GitHub as source control.
