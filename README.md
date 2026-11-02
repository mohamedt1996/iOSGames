# iOSGames

Three.js games packaged as native iOS apps with Capacitor. Each game lives in its own folder; GitHub Actions builds an `.ipa` on a macOS runner.

| Game | Status | Folder |
|---|---|---|
| Pocket Ecosystem | Playable, 24 levels + sandbox | [`pocket-ecosystem/`](pocket-ecosystem) |
| Dominion of Ash | Playable: war-map campaign, 24 Chronicle battles, skirmish | [`dominion-of-ash/`](dominion-of-ash) |
| Crown of Thorns | Playable: 24 scenarios, open realm | [`crown-of-thorns/`](crown-of-thorns) |

Dominion of Ash and Crown of Thorns share the CC0 KayKit models (Kay Lousberg) in [`shared-assets/`](shared-assets), packed by [`tools/build-assets.mjs`](tools/build-assets.mjs) (meshopt + WebP).

## Pocket Ecosystem

A sealed terrarium you tilt with your phone. Water pools and flows with real gravity, evaporates by day, condenses on the glass at night and runs down the walls. Plants compete for water, light and nutrients; snails graze, pill bugs clean up rot, fireflies feed on flowers and lay eggs in moss, gnats breed on decay, and a frog keeps them in check. Oxygen, CO₂, humidity, temperature and mold are all simulated.

- **24 levels in 4 chapters** (First Jar, Rain in a Jar, Night Garden, Closed World), each teaching or combining mechanics, with 1–3 stars (finish / beat the par day / bonus challenge).
- **Sandbox** jar with every tool unlocked.
- **Tools:** tilt (gyroscope, or an on-screen pad), turn the jar toward or away from the window, mist, seeds (7 plants), creatures (4 animals), pruning shears, vent lid, grow lamp, and a soil lens that shows moisture, daylight or nutrients.
- **Field guide** that fills in as you meet species; an advisor warns when plants are drying, drowning, scorching, starving or molding.
- Procedural audio (water, drips, birds by day, crickets at night), haptics, offline fonts, save data in the app.

### How every level is checked

`npm run test:levels` plays every level with a heuristic gardener bot across several random seeds and also runs each level with no input at all. CI fails if any level can't be won by the bot or can be won by doing nothing. Two-star "par" days are calibrated from the bot's median finish.

## Dominion of Ash

Real-time tactics in landscape. You command the Emberlight host against the Ashen Legion of skeletons, raised dead and necromancers, led by **the Ashen King, a rival who learns from every battle you fight** and keeps learning across the campaign, the Chronicles and skirmishes.

- **Battles:** 11 unit types with abilities (shield wall, whirlwind, volleys, fireballs that set forests burning and spreading, smoke and backstabs, rally, raising the dead, the King's wail). Flanking, high ground, cover, river fords, morale and routing, night battles, a banner hill to hold. Touch controls: tap to select, double-tap for all of a type, tap the ground to move (Charge or March), tap an enemy to attack, pinch and twist the camera, slow-motion and 2× speed.
- **The Ashen King's mind:** a model of you built from moving averages (which flank you favour, how early you charge, how much you rely on crossbows or pyromancers, how often you burn forests, what you focus). Thompson-sampling bandits choose his battle plan (8 plans) and his army archetype for the kind of commander you are, plus learned focus and spacing. After every battle the ledger shows his plan and what he has newly concluded about you.
- **Campaign:** a hex war map with towns, mines, shrines, gold, recruiting, veterancy, Commander perks, events, night every third turn, Legion warbands that grow, raid your land and avoid the places you guard, and the Ashen Citadel to storm.
- **The Chronicles:** 24 set-piece battles in four acts with ambushes, wildfire and reinforcement waves, 1–3 stars each.
- `npm run test:ai` runs headless AI-vs-scripted-player battles and prints how the King's win rate and chosen plans shift as he learns each style.

## Crown of Thorns

Portrait grand strategy for 2–4 houses on a hex realm. Each round, at **court** you answer offers, buy cards and recruit; then at the **war table** houses take turns placing three cards face-down. Everyone sees where a card points, never which card it is: a March, a Feint and a Raid look identical until the reveal, and so do a Hold and an Ambush. Spies peek at one hidden card. Then everything flips and resolves at once: battles, raids, plague, rallies and broken pacts.

- **The Council of Houses remembers you across every game:** how often your threats are bluffs (by placement slot, province value and whether a pact stands), whether you answer threats, what your hidden card is when threatened, whether you keep your word and who you prey on. Rivals use it to defend against the attacks you mean and ignore the ones you don't, to feint at you if you over-defend, to buy Spies against a bluffer or Sieges against a turtle, and to refuse pacts if you've broken them. A Thompson-sampling bandit picks their temperament (Conqueror, Guardian, Trickster, Merchant) for your profile.
- **24 scenarios** in four books (pacts at the start, plague decks, lakes, extra castles, rival coalitions, playing as another house) with stars for winning fast and winning without betrayal, plus an **Open Realm** with custom size and houses.
- `npm test` plays scripted bluffing, honest and betraying players against the Council and prints how its reading of them changes.

## Getting the IPA

1. Go to **Actions → Build iOS IPA → Run workflow** and pick a game or `all`. Pushes to `main` build whichever games changed (all of them when `shared-assets/` or the workflow changes).
2. When it finishes, download the artifact `<game>-ipa-N` (for example `dominion-of-ash-ipa-12`). It contains `<game>-unsigned.ipa`.

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

Every game follows the same pattern (`npm install`, `npm run dev`, `npm test`, `npm run build && npx cap sync ios`). Dominion of Ash and Crown of Thorns load models from `../shared-assets` as Vite's public folder.

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
