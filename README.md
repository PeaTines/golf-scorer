# ⛳ Golf Scorer

A mobile-first, real-time golf competition scoring app with Stableford points and skins tracking. Built for holiday golf — no logins, no fuss, just golf.

---

## Features

- **Up to 8 players** with handicaps
- **3 rounds** on different courses
- **Stableford scoring** with automatic point calculation per hole
- **Skins game** with rollovers — live tracking of who owns which hole
- **Live leaderboard** — updates instantly as scores are entered via Firebase
- **Mobile-first** — big buttons, easy to use in bright sunlight on the course
- No login required — players just tap their name

---

## Step 1: Set Up Firebase

### Create a Firebase Project

1. Go to [https://console.firebase.google.com/](https://console.firebase.google.com/)
2. Click **"Add project"**
3. Give it a name (e.g. `golf-scorer-2025`)
4. Disable Google Analytics if you like (not needed), click **Create project**

### Add a Web App

5. In your project, click the **Web icon** (`</>`) — "Add app"
6. Give it a nickname: `golf-scorer`
7. **Don't** tick Firebase Hosting (we're using GitHub Pages)
8. Click **Register app**
9. You'll see a `firebaseConfig` object — **keep this page open**

### Enable Realtime Database

10. In the left sidebar: **Build → Realtime Database**
11. Click **Create Database**
12. Choose a location (e.g. Europe — Belgium)
13. Start in **Test mode** (we'll update rules after)
14. Click **Enable**

### Copy Your Config

15. Open `firebase-config.js` in your golf-scorer folder
16. Replace the placeholder values with your actual config values from step 8:

```js
export const FIREBASE_CONFIG = {
  apiKey:            "AIzaSy...",          // ← from Firebase
  authDomain:        "golf-scorer-2025.firebaseapp.com",
  databaseURL:       "https://golf-scorer-2025-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:         "golf-scorer-2025",
  storageBucket:     "golf-scorer-2025.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123456789:web:abc123"
};
```

> ⚠️ The `databaseURL` is important — make sure it matches what shows in the Realtime Database console.

### Set Database Rules

17. In Firebase Console → Realtime Database → **Rules** tab
18. Paste the contents of `database.rules.json`:

```json
{
  "rules": {
    "competition": {
      ".read": true,
      ".write": true
    },
    "scores": {
      ".read": true,
      ".write": true
    }
  }
}
```

19. Click **Publish**

---

## Step 2: Deploy to GitHub Pages

1. Create a new **GitHub repository** (e.g. `golf-scorer`)
2. Upload all the files from the `golf-scorer/` folder to the repo root:
   - `index.html`
   - `style.css`
   - `app.js`
   - `firebase-config.js` ← make sure you've filled in your config!
   - `database.rules.json` (optional — just for reference)
   - `README.md`

3. In GitHub: **Settings → Pages**
4. Source: **Deploy from a branch**
5. Branch: `main` / `(root)`
6. Click **Save**

After a minute or two, your app will be live at:
`https://YOUR-USERNAME.github.io/golf-scorer/`

Share that URL with all players!

---

## Step 3: Set Up a Competition

1. Open the app URL on your phone
2. Tap **🔧 Admin** at the bottom
3. Enter any PIN (there's no competition yet, so it'll go straight through)
4. Fill in:
   - **Competition name** (e.g. "Marbella 2025 ⛳")
   - **Admin PIN** — you'll need this to make changes later
   - **Player names and handicaps** — up to 8 players
   - **Course names** for each of the 3 rounds
   - For each course, tap **"Set Hole Pars & SIs"** to enter par and stroke index per hole
5. Tap **💾 Save & Start Competition**

Players can now visit the URL, tap their name, and start entering scores!

---

## How to Play

### Score Entry
- Player opens the app, taps their name on the home screen
- Switch between rounds using the tabs at the top
- Tap a hole to enter the gross (actual) score
- Points are calculated automatically — no mental arithmetic needed!

### Stableford Points
| Net Score vs Par | Points |
|---|---|
| Albatross (-3 or better) | 5 |
| Eagle (-2) | 4 |
| Birdie (-1) | 3 |
| Par | 2 |
| Bogey (+1) | 1 |
| Double bogey or worse | 0 |

**Net score** = Gross score − shots received  
**Shots received** on a hole = 1 if hole SI ≤ handicap (2 if handicap ≥ SI + 18)

### Skins
- Each hole is worth 1 skin
- The player with the **most Stableford points** on a hole wins the skin
- If two or more players tie → the skin **rolls over** to the next hole
- The leaderboard shows exactly who's won which holes

### Leaderboard
- Tap **📊 View Leaderboard** from the home screen
- Switch between Overall and individual rounds
- Skins summary shows each hole at a glance

---

## Resetting for a New Competition

1. Tap **🔧 Admin** → enter PIN
2. In the Admin Panel, tap **🗑️ Reset Competition**
3. This wipes all scores and competition data — ready for next time

---

## Tips for the Golf Course

- Bookmark the URL on everyone's phone before you head out
- One person (the admin) sets up the competition the night before
- Each player enters their own scores as they go — no paper needed!
- Check the leaderboard between holes for maximum bragging rights 🏆

---

## Tech Stack

- Pure HTML/CSS/JavaScript — no frameworks
- Firebase Realtime Database — live sync
- GitHub Pages — free hosting
- ES Modules — modern, no build step needed

---

*Built for Pete and the lads. Have a great trip! 🍺⛳*
