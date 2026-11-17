# personalsite

Personal site of Pearl Franz, data engineer and computational neuroscience tinkerer. Static HTML/CSS/JS with a live spike raster hero, deployed on GitHub Pages.

Live at https://pearlfranz20.github.io/personalsite/ until a custom domain is set.

## Files

- `index.html` is the whole page.
- `styles.css` holds the styles. Dark is the default, and a light theme follows the visitor's system setting.
- `main.js` draws the simulated spike raster in the hero, the small generated drawings on each project, and the scroll reveals. The raster pauses when it is off screen, and everything holds still when the visitor prefers reduced motion.
- `favicon.svg` is the tab icon.
- `fonts/` holds self-hosted Fraunces, Atkinson Hyperlegible and IBM Plex Mono (all SIL Open Font License, licenses included), so the site makes no third-party requests.
- `.github/workflows/pages.yml` deploys the site with GitHub Actions.
- `.nojekyll` tells GitHub Pages to serve files as they are.

All asset paths are relative, so the site works both at `/personalsite/` on github.io and at the root of a custom domain.

## Preview locally

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000. Opening `index.html` straight from disk also works, but some browsers block the self-hosted fonts over `file://`.

## Deploy on GitHub Pages

1. Push this repository (`pearlfranz20/personalsite`) to the `main` branch on GitHub.
2. In the repository, open Settings, then Pages, and set Source to "GitHub Actions".
3. The workflow runs on every push to `main`. You can also start it by hand from the Actions tab.

If you add new top-level files or folders, also add them to the "Collect site files" step in the workflow.

## Custom domain (later)

There is no `CNAME` file in the repo. When you are ready to use a domain such as pearlfranz.page:

1. Point DNS at GitHub Pages. For the apex domain, add A records to `185.199.108.153`, `185.199.109.153`, `185.199.110.153` and `185.199.111.153`. For a `www` subdomain, add a CNAME record to `pearlfranz20.github.io`.
2. In Settings, Pages, enter the domain under Custom domain and save. With the GitHub Actions source, this setting is all that is needed.
3. Turn on "Enforce HTTPS" once the certificate is issued.
