# Sorana Mobile App (Capacitor Wrapper)

This repo now contains a production-ready Capacitor wrapper for the existing Next.js app. It **does not rebuild the backend**: the native shells load the deployed web app URL and rely on the same cookie/session/CSRF logic already implemented by `middleware.ts` + `src/proxy.ts`.

## 1) Configure the app URL

The wrapper loads the deployed website URL from `capacitor.config.ts`.

- Default: `https://app.soranapropertymanagers.com`
- Override for testing:
  - Set an environment variable before running Capacitor commands:
    - `CAP_SERVER_URL=https://your-domain.example`

## 2) Generate icons + splash screens

Source images live in `assets/` (generated from `public/logo.png`):

- `assets/logo.png`
- `assets/logo-dark.png`

Generate native + PWA assets:

```bash
npm run cap:assets
```

## 3) Sync web assets + plugins into native projects

```bash
npm run cap:sync
```

## 4) Open in Android Studio / Xcode

Android Studio:

```bash
npm run cap:open:android
```

Xcode (must be on macOS):

```bash
npm run cap:open:ios
```

## 5) Push notifications (FCM/APNS)

This repo includes:

- Native registration on device in `src/components/native/NativeBootstrap.tsx`
- Token upsert endpoint: `src/app/api/devices/push-token/route.ts`

To enable real push delivery you still need platform credentials:

### Android (FCM)

1. Create a Firebase project.
2. Add an Android app in Firebase with the same `appId` as `capacitor.config.ts`:
   - `com.soranapropertymanagers.portal`
3. Download `google-services.json` and place it at:
   - `android/app/google-services.json`
4. In Android Studio, ensure Google Services + Firebase Messaging are configured for the app module (Firebase console prompts you with the exact Gradle additions).

### iOS (APNS + FCM)

1. In Apple Developer:
   - enable **Push Notifications** for the App ID
   - create APNS key/cert as required
2. In Firebase:
   - add an iOS app with the same bundle id (`com.soranapropertymanagers.portal`)
   - download `GoogleService-Info.plist`
3. Place it at:
   - `ios/App/App/GoogleService-Info.plist`
4. In Xcode:
   - select target `App`
   - add capability **Push Notifications**
   - add capability **Background Modes** → check **Remote notifications**

## 6) Release builds

### Google Play (Android App Bundle)

0. Make sure the wrapper points to production:
   - `CAP_SERVER_URL=https://app.soranapropertymanagers.com`
   - then run `npm run cap:sync`

1. Create a release keystore (one time).
   - In Android Studio: **Build** → **Generate Signed Bundle / APK…** → create keystore
   - Or via CLI (example):
     - `keytool -genkeypair -v -keystore sorana-release.jks -keyalg RSA -keysize 2048 -validity 9125 -alias sorana`

2. Add keystore config (do not commit):
   - Copy `android/keystore.properties.example` → `android/keystore.properties`
   - Put the `.jks` at `android/keystore/sorana-release.jks` (recommended)

3. Bump version:
   - `android/app/build.gradle` → `versionCode` (integer, always increases) and `versionName` (e.g. `1.0.1`)

4. Build the signed App Bundle:
   - Android Studio → **Build** → **Generate Signed Bundle / APK…** → **Android App Bundle (.aab)**
   - OR CLI:
     - `cd android`
     - `gradlew bundleRelease`
   - Output:
     - `android/app/build/outputs/bundle/release/app-release.aab`

5. Upload in Play Console:
   - Create app → fill Store Listing, Content, Privacy policy
   - Upload the `.aab` to a release track (Internal testing first is recommended)
   - Enable Play App Signing when prompted

### App Store / TestFlight (iOS)

1. On macOS, open Xcode: `npm run cap:open:ios`
2. Set signing:
   - `App` target → **Signing & Capabilities**
   - choose your Team
3. Increment version/build number:
   - `App` target → **General** → Version / Build
4. Archive and upload:
   - Xcode → **Product** → **Archive**
   - Organizer → **Distribute App** → **App Store Connect** → Upload
5. In App Store Connect:
   - attach build to a release, complete compliance, submit for review.

## Notes / constraints

- This Next.js app uses server APIs + middleware + cookies + CSRF, so it **cannot** be shipped as a static `next export` bundle without removing those server features.
- The Capacitor wrapper is therefore configured to load the deployed site URL (`server.url`).

## Android build prerequisites (Windows)

Capacitor Android plugins require **JDK 21**.

- Install a JDK 21 (example used in this repo): `C:\\Program Files\\Zulu\\zulu-21`
- The Android build is configured to use it via `android/gradle.properties`.
