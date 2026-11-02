# iOSGames

Three.js games packaged as native iOS apps with Capacitor. Each game lives in its own folder; GitHub Actions builds an `.ipa` on a macOS runner.

| Game | Status | Folder |
|---|---|---|
| Pocket Ecosystem | Playable, 24 levels + sandbox | [`pocket-ecosystem/`](pocket-ecosystem) |
| Echo Cartographer | Planned | — |
| Mirror Twin | Planned | — |

## Pocket Ecosystem

A sealed terrarium you tilt with your phone. Water pools and flows with real gravity, evaporates by day, condenses on the glass at night and runs down the walls. Plants compete for water, light and nutrients; snails graze, pill bugs clean up rot, fireflies feed on flowers and lay eggs in moss, gnats breed on decay, and a frog keeps them in check. Oxygen, CO₂, humidity, temperature and mold are all simulated.

- **24 levels in 4 chapters** (First Jar, Rain in a Jar, Night Garden, Closed World), each teaching or combining mechanics, with 1–3 stars (finish / beat the par day / bonus challenge).
- **Sandbox** jar with every tool unlocked.
- **Tools:** tilt (gyroscope, or an on-screen pad), turn the jar toward or away from the window, mist, seeds (7 plants), creatures (4 animals), pruning shears, vent lid, grow lamp, and a soil lens that shows moisture, daylight or nutrients.
- **Field guide** that fills in as you meet species; an advisor warns when plants are drying, drowning, scorching, starving or molding.
- Procedural audio (water, drips, birds by day, crickets at night), haptics, offline fonts, save data in the app.

### How every level is checked

`npm run test:levels` plays every level with a heuristic gardener bot across several random seeds and also runs each level with no input at all. CI fails if any level can't be won by the bot or can be won by doing nothing. Two-star "par" days are calibrated from the bot's median finish.

## Getting the IPA

1. Go to **Actions → Build iOS IPA → Run workflow** (it also runs on every push to `main` that touches the game).
2. When it finishes, download the artifact `pocket-ecosystem-ipa-N`. It contains `pocket-ecosystem-unsigned.ipa`.

### Installing the unsigned IPA

An unsigned IPA must be signed before an iPhone will run it. With a free Apple ID you can do that from a Windows or Mac computer:

- **Sideloadly** or **AltStore**: open the IPA, sign in with your Apple ID, install to a USB-connected iPhone. Free accounts re-sign every 7 days.

### Signed builds and TestFlight (paid Apple Developer account)

Add these repository secrets, then run the workflow with **signed** checked:

| Secret | What it is |
|---|---|
| `IOS_P12_BASE64` | Your Apple Distribution certificate exported as .p12, base64-encoded |
| `IOS_P12_PASSWORD` | Password for that .p12 |
| `IOS_PROVISION_PROFILE_BASE64` | App Store (or Ad Hoc) provisioning profile for `com.mohamedt1996.pocketecosystem`, base64-encoded |
| `IOS_TEAM_ID` | Your 10-character team ID |

Optional: set the repository variable `IOS_EXPORT_METHOD` to `ad-hoc` for device installs (default `app-store-connect`). To upload straight to TestFlight, set the variable `UPLOAD_TESTFLIGHT=true` and add `ASC_KEY_ID`, `ASC_ISSUER_ID` and `ASC_PRIVATE_KEY` (an App Store Connect API key).

## Developing

```bash
cd pocket-ecosystem
npm install
npm run dev          # play in a browser; arrow keys / WASD tilt the jar
npm run test:levels  # bot playtest of all levels
npm run build && npx cap sync ios   # update the native project
```

The iOS project (`pocket-ecosystem/ios`) is committed, uses Swift Package Manager (no CocoaPods), is locked to portrait and asks for motion access with a plain-language reason.

### Layout

```
pocket-ecosystem/
  src/sim/        simulation: world grid, water, climate, plants, creatures, goals (no rendering)
  src/levels/     the 24 level definitions + sandbox
  src/render/     Three.js stage, terrain/water, instanced plants and animals, textures
  src/ui/         styles and icons
  src/game.js     one play session: HUD, tools, input, advisor, results
  src/main.js     title, jar shelves, field guide, settings, tilt input
  scripts/        gardener bot and automated playtest
  resources/      icon and splash sources
  ios/            Capacitor iOS project
```
