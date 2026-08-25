# Concert Thing mobile

An Expo SDK 57 companion for the Concert Thing archive. The mobile app is intentionally separate from the web bundle and talks to the same Worker API with a short-lived Clerk session token.

## Setup

```bash
pnpm install
pnpm exec expo start
```

Set `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` in the Expo build environment before starting the app. The Clerk provider persists its session token with Expo SecureStore. Never add a Clerk secret key to the mobile project.

Use a development build for native background transfers and the system photo picker:

```bash
pnpm exec expo run:ios
pnpm exec expo run:android
```

Sign in or create an account from the first screen. The default archive URL is `https://shows.krejzac.cz`; it can be changed in Settings. API requests obtain a fresh Clerk session token, and no permanent Owner token is stored on the device.

The native Clerk `AuthView` is hosted in a React Native `Modal`. On Android,
embedding the Compose view directly in a flex container can render only the
header and footer while leaving the form body empty. Keep
`useAuth({ treatPendingAsSignedOut: false })` and `useAuthViewState()` together
so native post-authentication work is not unmounted early.
Automatic song recognition is opt-in from Settings. When enabled, each newly completed video upload is submitted to the app-level recognition queue before the upload background task finishes.

Useful checks:

```bash
pnpm run typecheck
pnpm test
pnpm dlx expo-doctor
```

## Android builds

Android builds need a **full JDK**, not only a Java runtime. JDK 17 or 21 is
supported; Java 25 is not a safe choice for the Android toolchain. On Fedora,
install the compiler package first:

```bash
sudo dnf install java-21-openjdk-devel
```

The local EAS build wrapper selects a JDK with `javac` automatically (including
JDKs installed under `~/.jdks`):

```bash
pnpm run build:android:local
```

You can also select one explicitly with `JAVA_HOME=/path/to/jdk-21 ...`.

For a release APK, select the JDK before running Gradle:

```bash
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk
```

Gradle also needs a machine-local Android SDK path. If `android/local.properties`
is missing, create it from the SDK location on the current machine (this file
is intentionally not committed):

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
echo "sdk.dir=$ANDROID_HOME" > android/local.properties
```

Then build the release APK from the Android project:

```bash
cd android
./gradlew assembleRelease
```

The APK is written to
`android/app/build/outputs/apk/release/app-release.apk`. The public download
route is backed by the R2 object `releases/concert-thing-0.1.4.apk` and is
served at `https://shows.krejzac.cz/downloads/concert-thing.apk`.

## Upload queue

Selected files are copied into app-owned document storage before they are added to SQLite. The queue has normalized upload and part rows, persists the Clerk account ID alongside multipart session IDs and ETags, limits active transfers to two, retries with exponential backoff, reconciles completion after a lost response, and rehydrates interrupted transfers on app launch. Queue reads and mutations are account-scoped, so signing out or switching accounts cannot process another account's local work. Rows from an older pre-auth build are claimed once by the first signed-in account on that device. Completed local copies are removed after the server reports the original ready in R2.

The multipart sequence matches the Worker API: videos are SHA-256 hashed in bounded local chunks, then `POST /api/uploads` sends the hash with a stable `clientUploadId`, followed by `PATCH` metadata, `PUT` each part, and `POST /complete`. Hashes are persisted with the durable queue so retries do not read the full video again. A duplicate response is terminal and releases the redundant app-owned copy. A completion retry is safe because the Worker checks the ready object and the queue can safely re-upload a part when its response was lost.

On Android, a local Expo module streams file ranges directly from app storage through OkHttp, so video bytes never cross the JavaScript boundary. It also hashes videos natively and runs a foreground data-sync service with a low-priority progress notification while the user-initiated queue is active. Large videos run one at a time; photos retain bounded parallelism. `expo-background-task` remains the deferred retry mechanism. Android can still defer periodic work, and a force-stop ends all app work, but reopening the app safely resumes the durable multipart queue.

The local Android module lives in `modules/background-upload`. Because it contains native Kotlin, use a development/release build (`pnpm exec expo run:android`), not Expo Go. On Android 13+, allow notifications when prompted so upload progress remains visible in the notification shade.

## Screens

- Library: timeline grouped by Shows, local search, and file picker entry point.
- Inbox: unassigned media and explicit Show assignment.
- Shows: search, create form with native date/time pickers, per-Show archive, and a bulk song-recognition rerun for every ready video in a Show.
- Media detail: signed adaptive HLS playback with an authenticated byte-range fallback, assignment, Song Match search/review, recognition, and manual song add.
- Queue: globally reachable durable upload status, retry/cancel controls, and background behavior guidance.

Video grids use short-lived signed Cloudflare Stream thumbnails instead of downloading original MP4 files. The app can derive HLS and thumbnail URLs from the currently deployed signed iframe response, while the enhanced Worker response also returns those URLs explicitly.

The visual system lives in `src/theme/tokens.ts` and `tokens.css`: cool near-white canvas, coal text, hairline dividers, one electric-blue accent, deliberate type pairing, and no decorative gradients or fake data.
