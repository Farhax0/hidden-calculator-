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

## Install it on your phone

This is a Progressive Web App (PWA). It must be served over **HTTPS**. The easiest way is GitHub Pages:

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
| `sw.js`, `manifest.webmanifest`, `icons/` | Installable offline app |
