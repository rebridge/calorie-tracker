# Calorie Tracker for iPhone

A native SwiftUI version of the app that works without the home server. Everything you log is saved on the phone first. The phone uploads it to the server whenever it can reach it over your tailnet, so Tailscale only needs to be on now and then.

```
 you log a meal ──▶ Claude API (from the phone, with its own key) ──▶ saved on the phone
                                                                         │
             whenever https://<host>.<tailnet>.ts.net/api/health answers │
                                                                         ▼
                                                    uploaded to the server, then the
                                                    phone reloads today, the day on
                                                    screen and the charts
```

## What it does

- **Log, Day and Settings**, like the web app: meals grouped by type, tap an item to edit it, swipe to delete, change an entry's meal type from its ⋯ menu, burns, weight, macro bars, and the calories and weight trend charts. On the Day tab, use the arrows or tap the date to move between days, or swipe the budget card.
- **Estimates on the phone.** With a Claude API key saved in Settings, the phone calls Claude itself (`claude-haiku-5-5`, the same prompt and output schema as the server), so you get calories right away, even away from home.
- **No key, or no internet?** The meal is saved as text ("Estimated when it syncs") and the server estimates it with its own key when the phone next syncs.
- **Every row shows whether it has synced.** "Waiting to sync" means it's only on the phone so far. "Sync failed" means the server refused it; Settings → Sync shows why, with Retry and Discard.

### When it syncs

- when the app opens, and when the network changes (turning Tailscale on, joining Wi-Fi)
- every 30 seconds while the app is open and something is waiting, otherwise every couple of minutes
- when you pull down on a list, or tap the status at the top left
- now and then in the background, when iOS allows it (background refresh is opportunistic: iOS decides when, based on how often you use the app)

### How conflicts work

It's a single-user app, so the rules are simple: changes upload in the order you made them, and the last one to reach the server wins. If you edit an item on the phone and in the browser before the phone syncs, the phone's edit lands last. Deleting something that was already deleted elsewhere is fine. Each upload carries the phone's ID for the record, so a retry after a dropped connection never creates a duplicate.

The charts come from the server, so they show the data as of the last sync. The calories chart also counts what you've logged on the phone since.

## 1. Update the server

The app needs two new endpoints and a small migration (a `client_id` column on entries and burns). On the server:

```sh
git pull && docker compose up -d --build
```

Migrations run on startup. If you skip this, uploads from the phone fail with "The server is out of date".

## 2. Install it on your iPhone

You don't need a paid Apple Developer account. A free Apple ID can sign apps for your own phone, with two limits: **the app stops opening after 7 days** until it's signed again, and you can have at most 3 such apps installed at once. Your data stays on the phone when you re-sign.

### Option A: with a Mac and Xcode

1. Install Xcode 16 or later from the App Store, open it, and sign in with your Apple ID under **Xcode → Settings → Accounts**.
2. Open `ios/CalorieTracker.xcodeproj`.
3. Select the **CalorieTracker** target → **Signing & Capabilities**. Set **Team** to your name (Personal Team). If Xcode says the bundle identifier is taken, change `com.rebridge.CalorieTracker` to something unique, like `com.yourname.CalorieTracker`.
4. Plug in your iPhone (or pair it over Wi-Fi), pick it as the run destination at the top of the window, and press **Run** (⌘R).
5. The first time:
   - On the iPhone, turn on **Settings → Privacy & Security → Developer Mode** and restart when asked.
   - If iOS says the developer isn't trusted, go to **Settings → General → VPN & Device Management**, tap your Apple ID, and tap **Trust**.

To renew it every week, plug the phone in and press **Run** again.

### Option B: without a Mac

GitHub builds an unsigned copy of the app on every change to `ios/` (the **iOS** workflow under the repo's **Actions** tab). A sideloading tool signs it with your free Apple ID as it installs it.

1. On GitHub, open **Actions → iOS**, pick the latest green run, and download the **CalorieTracker-unsigned-ipa** artifact. Unzip it to get `CalorieTracker-unsigned.ipa`. Artifacts are kept for 30 days; to make a fresh one, open the workflow and click **Run workflow**.
2. Install it with one of these, which run on Windows or macOS:
   - [Sideloadly](https://sideloadly.io/): plug in the iPhone, drop the `.ipa` in, enter your Apple ID, and click Start. You redo this every 7 days.
   - [AltStore](https://altstore.io/) (or SideStore): more setup, but it re-signs the app in the background every few days, so it doesn't expire as long as the computer running AltServer is on now and then.
3. Turn on Developer Mode and trust the developer profile, as in step 5 of option A.

These tools ask for your Apple ID password and send it to Apple to create the signing certificate. If that bothers you, use a separate Apple ID made just for this.

## 3. Set it up

Open the app, tap the gear icon, and fill in:

- **Home server:** the address from `tailscale serve status` on the server, e.g. `https://myserver.tail1234.ts.net`. Tap **Test** with Tailscale on to check it. A plain `http://` address (a LAN IP and port, or the server's Tailscale IP with `:8080`) works too, but `tailscale serve` gives you HTTPS.
- **Claude API key:** optional but recommended. The server's key works, but a new key from the [Claude Console](https://console.anthropic.com/) named something like "iPhone" lets you see the phone's usage on its own and revoke it without touching the server. It's stored in the iOS Keychain, on this phone only.
- **Daily goals:** these are the server's goals; a change uploads like anything else.

If the server isn't set up yet, the app still works: everything is kept on the phone and uploads once you add the address.

## Develop

| Path | What |
|---|---|
| `CalorieCore/` | Swift package with everything that isn't UI: the server's types, the offline store and its outbox of pending changes, the merged day view, the Claude client, and the sync engine. Has unit tests. |
| `CalorieTracker/` | The SwiftUI app: `AppModel` (state, sync scheduling, Keychain), and the screens in `Views/`. |
| `CalorieTracker.xcodeproj` | Uses Xcode 16's synchronized folders: files added under `CalorieTracker/` are picked up without editing the project. |

Run the core tests on a Mac with `swift test` in `CalorieCore/`, or anywhere Docker runs:

```sh
docker run --rm -v "$PWD/ios/CalorieCore":/pkg -w /pkg swift:6.1 swift test
```

The server endpoints the app adds:

| Method | Path | Purpose |
|---|---|---|
| `PUT` | `/api/sync/entries/:client_id` | An entry the phone estimated itself. Creates it (201), or replaces its meal type and items if that ID was uploaded before (200). |
| `PUT` | `/api/sync/burns/:client_id` | Same for a burn. |
| `POST` | `/api/entries` | Now also takes `client_id` and `logged_at`, for text the phone queued offline: a retry returns the saved entry without calling Claude again, and `logged_at` sets the entry's time. |

---

Claude was used in the writing of this README.
