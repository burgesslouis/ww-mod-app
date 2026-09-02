# Wherewolf Moderator

An offline, moderator-only progressive web app. It is independent of the Python/AI application in the repository and keeps all definitions and active games in the browser's IndexedDB database.

## Local development

```powershell
pnpm install
pnpm dev
```

Open the local address shown by Vite. For installation on a phone, serve the production build over HTTPS, open it once, then use the browser's **Add to Home Screen** action. After the first load, the application and game data work without a network connection.

## Publish with GitHub Pages

This folder is a standalone GitHub repository. The workflow in `.github/workflows/deploy-pages.yml` publishes the app whenever `main` is updated:

1. GitHub checks out the source.
2. It installs the locked dependencies.
3. It runs the unit and browser tests.
4. GitHub supplies the site's base path, such as `/wherewolf-moderator/`.
5. Vite creates `dist` with scripts, icons, the manifest and service worker using that path.
6. GitHub uploads `dist` and deploys it to Pages over HTTPS.

`dist` is deliberately ignored by Git. It is a generated deployment artifact, while the source and lockfile remain the versioned inputs.

### One-time GitHub setup

Create an empty GitHub repository, for example `wherewolf-moderator`. Do not add a README or `.gitignore` on GitHub, because those files already exist here. Then run these commands from this folder, replacing the example URL with your repository URL:

```powershell
git add .
git commit -m "Initial moderator app"
git remote add origin https://github.com/YOUR-NAME/wherewolf-moderator.git
git push -u origin main
```

On GitHub, open **Settings → Pages** and set **Source** to **GitHub Actions**. Open the **Actions** tab to watch `Test and deploy GitHub Pages`. When it finishes, the deployment job shows the public HTTPS address.

The first workflow may reach GitHub before Pages has been enabled and fail at **Configure GitHub Pages**. If that happens, choose **GitHub Actions** in **Settings → Pages**, return to the failed workflow and select **Re-run all jobs**. This is only a one-time setup issue.

For later releases:

```powershell
git add .
git commit -m "Describe the change"
git push
```

Every push to `main` repeats the tests and deployment. You can also run it manually from **Actions → Test and deploy GitHub Pages → Run workflow**.

### Rehearse a Pages build locally

To see what GitHub will generate for a repository named `wherewolf-moderator`:

```powershell
pnpm exec tsc -b
pnpm exec vite build --base /wherewolf-moderator/
pnpm exec vite preview
```

Open `http://localhost:4173/wherewolf-moderator/`. The normal `pnpm build` command continues to build for `/`, which is appropriate for local preview and non-nested hosting.

### Install on a phone

Open the Pages address in Chrome or Safari and use **Add to Home Screen**. Load the app once while online so its offline files are cached. Games and custom definitions are stored in that phone's browser database; publishing a new version does not upload or synchronize them.

## Distribute roles on the phone

In **Deal and review**, enable **Use app to distribute roles**. Pass the phone to each named player in order. They pick a face-down card, read its role description and press **Ready**. That card is removed before the next player takes a turn.

Random allocation lets players draw from the shuffled deck. Gardened seats receive their reserved card; everyone else draws from the remaining deck. After everyone is ready, return the phone to the moderator and press **Begin game** to start N0 with those assignments.

The dealing screen contains no moderator navigation, roster or previous cards. Progress is saved after each pick and confirmation; **Resume game** resumes an unfinished deal behind a handoff screen. The artwork and dealing flow work offline after the app has loaded online once.

## Validation

```powershell
pnpm test
pnpm build
pnpm test:e2e
```

The tests are provider-free. They do not run an AI game or make paid model calls.

## Definition files

- `*.wwrole.json` contains one role.
- `*.wwpack.json` embeds a collection of roles.
- `*.wwscenario.json` embeds its default packs and rules.

All definitions are versioned JSON using typed triggers, conditions, selectors and effects. Imported JavaScript is never evaluated. Built-ins use the same format and can be cloned, exported and re-imported.

The Base pack contains all 21 dealt roles from `ww_roles.py` plus the Romeo status. The Base scenario intentionally contains no ready-made secret deck presets.
