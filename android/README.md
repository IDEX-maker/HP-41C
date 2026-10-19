# Android app (Trusted Web Activity)

The Play Store app is a thin wrapper that opens https://idex-maker.github.io/HP-41C/ in Chrome without a
browser bar, so the emulator, its service worker (offline use) and printing work exactly as on the web.
Package: `io.github.idexmaker.hp41`. `twa-manifest.json` here is the Bubblewrap configuration.

## Build
Needs Node, JDK 17 and the Android SDK (platform 36, build-tools 36.1.0). Bubblewrap can install them.
```
npm install @bubblewrap/cli
npx bubblewrap update --manifest=twa-manifest.json --skipVersionUpgrade
npx bubblewrap build        # asks for the keystore passwords, or set BUBBLEWRAP_KEYSTORE_PASSWORD / BUBBLEWRAP_KEY_PASSWORD
```
Output: `app-release-bundle.aab` (upload to Google Play) and `app-release-signed.apk` (install directly).
Raise `appVersionCode` (and `appVersion`) in `twa-manifest.json` for every Play upload.
The wrapper only loads the website, so web updates reach installed apps without a new upload.

## Signing and verification
- The upload keystore is **not** in this repo. Back it up: without it you cannot publish updates.
- Chrome only hides the browser bar if `https://idex-maker.github.io/.well-known/assetlinks.json` lists the
  SHA-256 fingerprint of the key that signed the installed app. It lives in the repo
  [IDEX-maker.github.io](https://github.com/IDEX-maker/IDEX-maker.github.io) and currently lists the upload key.
  With Play App Signing, Google re-signs the app, so add the **App signing key certificate** SHA-256
  (Play Console, Test and release, App signing) to the same file as a second fingerprint.
