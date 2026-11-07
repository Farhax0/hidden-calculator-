# Hidden Calculator Vault

An app that looks and works like a normal **Calculator**. Typing your **secret calculation**
(for example `123+123`) and pressing **=** opens a hidden, encrypted vault for your private
photos, videos and other files.

## How it works

1. **First launch:** a card asks you to create your secret code. Type any calculation you will
   remember, such as `123+123`, then press `=`. Type it again and press `=` to confirm.
2. **Everyday use:** the app is a normal working calculator. Anyone who opens it sees only a calculator.
3. **Open the vault:** type your code (`123+123`) and press `=`.
4. **Hide files:** tap **+** and pick photos, videos, PDFs, music or any other files.
   They are encrypted and stored inside the app.
   **Then delete the originals from your Gallery or Files app.** A web app is not allowed
   to delete them for you.
5. **Lock:** tap 🔒. The vault also locks itself whenever you switch to another app or turn off the screen.

In the vault you can:

* view photos, play videos and audio, and read PDFs and text files
* swipe between files
* filter the list by Photos, Videos or Files
* **⬇ Export** a file to save a copy back to your phone
* **🗑 Delete** a file from the vault
* **⚙ Settings → Change secret code**

## Security

* Files, file names and thumbnails are encrypted with **AES-256-GCM** before they are saved
  on the device (in IndexedDB).
* The encryption key is protected by your secret code (PBKDF2-SHA256, 310,000 iterations).
  The code itself is never stored.
* Everything stays on your device. Nothing is uploaded anywhere.
* ⚠️ **If you forget your code, your files cannot be recovered.** Choose a code you will
  remember, and avoid codes that are easy to guess.
* Clearing the browser's or app's site data, or uninstalling the app, deletes the vault.
  Export anything you want to keep first.

## Install the Android app (APK)

1. On your Android phone, open this repository on GitHub and go to
   [`apk/HiddenCalculator.apk`](apk/HiddenCalculator.apk). Tap **Download** (the ⬇ "Download raw file" button).
2. Open the downloaded file. If Android asks, allow **Install unknown apps** for your browser or Files app.
3. Tap **Install**. The app appears in your app drawer as **Calculator**, with a calculator icon.

The Android app adds:

* **No screenshots.** Screenshots and screen recording are blocked, and the recent-apps screen shows a blank card.
* **Locks instantly.** The vault locks the moment you leave the app, press Home, or turn off the screen.
* **Delete originals.** After you hide files, the app offers to delete the originals from your
  Gallery or Files, so the only copy is the encrypted one in the vault.
  Android shows its own "Allow Calculator to delete…" confirmation for photos and videos.
* **Back button.** It closes the viewer, then locks the vault, then leaves the app.
* **Export.** ⬇ lets you pick where to save a decrypted copy.
* **No backups.** The vault is excluded from Google cloud backup and device transfer.

> ⚠️ **Uninstalling the app or using "Clear storage" deletes the vault.** Export anything you want to keep first.
> Updating to a newer APK is safe: install it over the old one. Do not uninstall first.

### Build the APK yourself

Every push to GitHub rebuilds the APK automatically (**Actions → Build Android APK → Artifacts**).
To build it locally you need JDK 17 and the Android SDK:

```bash
cd android
./gradlew assembleRelease
# -> android/app/build/outputs/apk/release/app-release.apk
```

The Android project (`android/`) is a small native shell. It runs the same web app from the
repository root inside a secure WebView, and the build copies the web files in automatically.
The APK is signed with `android/app/signing.keystore`, which is kept in the repo so every build
can update the previous install. If you publish the app, use your own private key instead.

## Install as a web app (iPhone or any phone)

This is also a Progressive Web App (PWA). It must be served over **HTTPS**. The easiest way is GitHub Pages:

1. In this repository, open **Settings → Pages**.
2. Under **Source**, choose *Deploy from a branch*. Pick the branch and the `/ (root)` folder, then click **Save**.
3. After a minute, open `https://<your-username>.github.io/hidden-calculator-/` on your phone.
4. Install it:
   * **Android (Chrome):** tap ⋮ → **Add to Home screen** (or **Install app**).
   * **iPhone (Safari):** tap Share → **Add to Home Screen**.

The app appears on your home screen as **Calculator**, with a calculator icon. It opens
full screen and works offline.

To try it on a computer, run `python3 -m http.server 8000` in this folder and open
<http://localhost:8000>.

## Project structure

| File | Purpose |
|------|---------|
| `index.html`, `style.css` | Calculator and vault UI |
| `js/main.js` | Calculator keys, secret-code detection, first-run setup |
| `js/calc.js` | Safe arithmetic evaluator (no `eval`) |
| `js/crypto.js` | Key derivation, key wrapping, AES-GCM encryption |
| `js/db.js` | IndexedDB storage |
| `js/vault.js` | Vault grid, import, viewer, export, delete, settings, auto-lock |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installable offline web app |
| `android/` | Android app project (Gradle). `MainActivity.java` hosts the web app |
| `apk/HiddenCalculator.apk` | Ready-to-install Android APK |
