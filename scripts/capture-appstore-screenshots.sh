#!/usr/bin/env bash
#
# App Store screenshot capture — reusable across any of our Expo/RN apps.
# You run this ONCE on your MacBook. It:
#   1. checks the machine has what it needs (Xcode+simctl, node, cocoapods, Maestro)
#   2. pulls the app source fresh
#   3. boots an iPhone 16 Pro Max simulator (6.9", 1320 x 2868 — the only size
#      the App Store still requires)
#   4. builds the Release app, installs it, and launches it STANDALONE
#      (embedded JS bundle — no Metro, no dev-client launcher)
#   5. drives the UI with Maestro and captures the screenshots
#   6. checks every PNG is exactly 1320 x 2868 and opens the folder in Finder
#
# Reuse for another app: set the three vars at the top (or pass as env), and
# edit ONLY the "PER-APP FLOWS" section — everything else is generic.
#
#   BUNDLE_ID=com.lukeholder.otherapp \
#   REPO_URL=https://github.com/lukecode99/other-app.git \
#   bash pdc-shots-v4.sh
#
set -euo pipefail

# ---- per-app config (override via env) -----------------------------------
BUNDLE_ID="${BUNDLE_ID:-com.lukeholder.propertydealcalc}"
REPO_URL="${REPO_URL:-https://github.com/lukecode99/property-deal-calculator.git}"
SIM_NAME="${SIM_NAME:-iPhone 16 Pro Max}"
WORKDIR="${WORKDIR:-${HOME}/appstore-shots/$(basename "${REPO_URL}" .git)}"
# --------------------------------------------------------------------------

APPDIR="${WORKDIR}/app"
OUTDIR="${WORKDIR}/out"
FLOWDIR="${WORKDIR}/flows"
BUILD_LOG="${WORKDIR}/build.log"

log(){  printf "\n\033[1;36m> %s\033[0m\n" "$*"; }
ok(){   printf "\033[1;32m+ %s\033[0m\n" "$*"; }
fail(){ printf "\n\033[1;31mX %s\033[0m\n" "$*" >&2; exit 1; }

# ---------------------------------------------------------------- 1. preflight
[[ "$(uname)" == "Darwin" ]] || fail "This runs on macOS only."
command -v xcrun >/dev/null 2>&1 || fail "Xcode not found. Install Xcode from the App Store, open it once, then re-run."
# simctl lives in FULL Xcode, not the Command Line Tools.
if ! xcrun simctl help >/dev/null 2>&1; then
  DEVDIR=$(xcode-select -p 2>/dev/null || true)
  XCODE_APP=$(ls -d /Applications/Xcode*.app 2>/dev/null | head -1 || true)
  if [[ -z "${XCODE_APP}" ]]; then
    fail "Full Xcode isn't installed - you have only the Command Line Tools. Install Xcode from the App Store (~7GB), open it once, then re-run."
  elif [[ "${DEVDIR}" != *"Xcode"*"/Contents/Developer" ]]; then
    fail "Xcode is installed but the tools point at '${DEVDIR}'. Fix with:\n    sudo xcode-select -s ${XCODE_APP}/Contents/Developer\n    xcodebuild -runFirstLaunch\nthen re-run."
  else
    fail "iOS simulators unavailable - open Xcode once to finish its first-run setup (Install additional components), then re-run."
  fi
fi
command -v node  >/dev/null 2>&1 || fail "Node not found. Install Node 20+ (brew install node) and re-run."
command -v git   >/dev/null 2>&1 || fail "git not found."

if ! command -v pod >/dev/null 2>&1; then
  log "CocoaPods missing - installing (needed to build the native iOS project)..."
  if command -v brew >/dev/null 2>&1; then brew install cocoapods
  else fail "CocoaPods not installed and Homebrew not found. Install with: sudo gem install cocoapods  - then re-run."; fi
fi

if ! command -v maestro >/dev/null 2>&1; then
  log "Installing Maestro (the UI driver that taps the screens)..."
  curl -Ls "https://get.maestro.mobile.dev" | bash
fi
export PATH="${PATH}:${HOME}/.maestro/bin"
command -v maestro >/dev/null 2>&1 || fail "Maestro install failed. See https://maestro.mobile.dev"

# Maestro is a JVM app - it needs a JDK. macOS ships a /usr/bin/java STUB that
# always exists (it's what prints "Unable to locate a Java Runtime"), so we test
# whether java actually RUNS, not whether the command exists. We install the
# Temurin *cask* (a real SYSTEM JDK under /Library/Java) rather than the keg-only
# openjdk formula: the system JDK is found automatically by /usr/libexec/java_home
# and by the /usr/bin/java stub, so no PATH/JAVA_HOME gymnastics are needed and
# Maestro finds it too. (brew --cask temurin prompts once for your login password.)
if ! java -version >/dev/null 2>&1; then
  log "Installing Java (Maestro's UI driver needs a JDK - you may be asked for your Mac password)..."
  if command -v brew >/dev/null 2>&1; then
    brew install --cask temurin@17 || brew install --cask temurin
  else
    fail "Java missing and Homebrew not found. Install Temurin JDK 17 (https://adoptium.net) and re-run."
  fi
fi
# Point JAVA_HOME at whatever the system now resolves (system JDK, incl. Temurin).
JH="$(/usr/libexec/java_home 2>/dev/null || true)"
[[ -n "${JH}" ]] && export JAVA_HOME="${JH}" && export PATH="${JH}/bin:${PATH}"
java -version >/dev/null 2>&1 || fail "Java still not runnable after install - install Temurin JDK 17 (https://adoptium.net) and re-run."
ok "All tools present."

mkdir -p "${WORKDIR}" "${OUTDIR}" "${FLOWDIR}"

# ---------------------------------------------------------------- 2. source
if [[ -d "${APPDIR}/.git" ]]; then
  log "Updating app source..."
  git -C "${APPDIR}" fetch --depth 1 origin main
  git -C "${APPDIR}" reset --hard origin/main
else
  log "Cloning app source..."
  git clone --depth 1 "${REPO_URL}" "${APPDIR}"
fi

log "Installing JS dependencies (slow on first run)..."
cd "${APPDIR}"
# Clean slate so patch-package (e.g. the iOS 26 launch-crash fix) applies cleanly.
rm -rf node_modules
npm install

# ---------------------------------------------------------------- 3. simulator
UDID=$(xcrun simctl list devices available | grep -iE "^[[:space:]]*${SIM_NAME} \(" | grep -oiE "[0-9A-F-]{36}" | head -1 || true)
if [[ -z "${UDID:-}" ]]; then
  log "Creating an '${SIM_NAME}' simulator..."
  RUNTIME=$(xcrun simctl list runtimes | grep -oiE "com.apple.CoreSimulator.SimRuntime.iOS[^ ]+" | tail -1 || true)
  [[ -n "${RUNTIME}" ]] || fail "No iOS runtime installed. In Xcode: Settings > Components (or Platforms) > download an iOS runtime, then re-run."
  DEVTYPE=$(xcrun simctl list devicetypes | grep -m1 "${SIM_NAME}" | grep -oE "com.apple.CoreSimulator.SimDeviceType[^ )]+")
  UDID=$(xcrun simctl create "${SIM_NAME}" "${DEVTYPE}" "${RUNTIME}")
fi
log "Booting ${SIM_NAME}..."
xcrun simctl boot "${UDID}" 2>/dev/null || true
open -a Simulator
xcrun simctl bootstatus "${UDID}" -b
# Clean status bar for store shots: 9:41, full signal, 100% battery.
xcrun simctl status_bar "${UDID}" override \
  --time "09:41" --batteryState charged --batteryLevel 100 \
  --cellularBars 4 --wifiBars 3 --dataNetwork wifi 2>/dev/null || true
ok "Simulator ready (${UDID})."

# ---------------------------------------------------------------- 4. build
# THE KEY FIX vs earlier versions: `expo run:ios` builds, installs, launches,
# then ATTACHES to Metro and never returns - which hung the whole script. So we
# run it in the BACKGROUND with --no-bundler, wait until the app is actually
# installed on the sim, then stop it. A Release build embeds the JS bundle, so
# we then launch the app STANDALONE with simctl (no Metro, no dev-client
# launcher) - which is also what Maestro's launchApp does, cleanly.
log "Building the Release app (the long part - 5-15 min first time)..."
: > "${BUILD_LOG}"
npx expo run:ios --device "${SIM_NAME}" --configuration Release --no-bundler >"${BUILD_LOG}" 2>&1 &
EXPO_PID=$!
log "Compiling... (live log:  tail -f ${BUILD_LOG} )"
INSTALLED=0
for _ in $(seq 1 300); do            # up to ~50 min
  if xcrun simctl get_app_container "${UDID}" "${BUNDLE_ID}" >/dev/null 2>&1; then
    INSTALLED=1; break
  fi
  if ! kill -0 "${EXPO_PID}" 2>/dev/null; then
    xcrun simctl get_app_container "${UDID}" "${BUNDLE_ID}" >/dev/null 2>&1 && INSTALLED=1
    break
  fi
  sleep 10
done
# Stop the background build / any lingering Metro - not needed for a Release app.
kill "${EXPO_PID}" 2>/dev/null || true
wait "${EXPO_PID}" 2>/dev/null || true
if [[ "${INSTALLED}" != "1" ]]; then
  echo "----- last 40 lines of ${BUILD_LOG} -----"; tail -40 "${BUILD_LOG}" || true
  fail "Build didn't install the app - the reason is in the log above (usually a pod/xcodebuild issue)."
fi
ok "App installed."

# Launch standalone off the embedded Release bundle. This first launch also
# initialises the app's on-disk storage, which we seed below.
xcrun simctl terminate "${UDID}" "${BUNDLE_ID}" 2>/dev/null || true
xcrun simctl launch "${UDID}" "${BUNDLE_ID}" >/dev/null 2>&1 || true
sleep 8
ok "App launched standalone."

# =============================================================== SEED DEMO DATA
# Store shots need a populated deal, not an empty form. This app restores its
# inputs from AsyncStorage (key below), MERGING over its built-in defaults - so
# we write a small overrides JSON straight into the app's storage and relaunch.
# Reuse for another app: set SEED_KEY + SEED_INPUTS (or SEED_INPUTS='' to skip).
SEED_KEY="${SEED_KEY:-pdc:lastInputs:v1}"
SEED_INPUTS="${SEED_INPUTS:-{\"strategy\":\"brr\",\"refinanceAfterRefurb\":\"yes\",\"brrPurchaseMethod\":\"bridge\",\"purchasePrice\":\"100000\",\"estimatedFairValue\":\"120000\",\"renovatedValue\":\"200000\",\"refurbCost\":\"30000\",\"rentPerMonth\":\"1195\",\"interestRate\":\"5.5\",\"newMortgagePct\":\"75\",\"furtherDetails\":\"yes\",\"epcRating\":\"D\",\"floorSpace\":\"85\",\"bedrooms\":\"3\",\"bathrooms\":\"1\"}}"
if [[ -n "${SEED_INPUTS}" ]]; then
  log "Seeding an example deal so the screenshots aren't empty..."
  DATA_DIR=$(xcrun simctl get_app_container "${UDID}" "${BUNDLE_ID}" data 2>/dev/null || true)
  MANIFEST=$(find "${DATA_DIR}" -name manifest.json -path '*RCTAsyncLocalStorage*' 2>/dev/null | head -1 || true)
  [[ -z "${MANIFEST}" ]] && MANIFEST=$(find "${DATA_DIR}" -name manifest.json 2>/dev/null | head -1 || true)
  if [[ -z "${MANIFEST}" ]]; then
    SDIR="${DATA_DIR}/Documents/RCTAsyncLocalStorage_V1"; mkdir -p "${SDIR}"
    MANIFEST="${SDIR}/manifest.json"; echo '{}' > "${MANIFEST}"
  fi
  # Merge our key into the existing manifest (small values live inline as strings).
  node -e 'const fs=require("fs");const f=process.argv[1];let m={};try{m=JSON.parse(fs.readFileSync(f,"utf8"))}catch(e){}m[process.argv[2]]=process.argv[3];fs.writeFileSync(f,JSON.stringify(m));' \
    "${MANIFEST}" "${SEED_KEY}" "${SEED_INPUTS}" && ok "Seed written to $(basename "$(dirname "${MANIFEST}")")/manifest.json"
  xcrun simctl terminate "${UDID}" "${BUNDLE_ID}" 2>/dev/null || true
  xcrun simctl launch "${UDID}" "${BUNDLE_ID}" >/dev/null 2>&1 || true
  sleep 8
  ok "Example deal loaded."
fi

# ============================================================== PER-APP FLOWS
# Edit ONLY this block for a different app. Maestro just NAVIGATES here (scrolls
# to a section); the screenshot itself is taken by simctl in the capture loop
# below, which avoids Maestro's "path resolves outside the run folder" sandbox.
# Each flow relaunches the app (scroll resets to top), so they're independent.
# Prefer scrollUntilVisible on a stable on-screen heading over pixel swipes.
#
# SHOTS maps each flow file to its output name; keep the two in sync.
SHOTS=( "01-overview" "02-results" "03-costs" "04-returns" "05-stress" )

# 01 - top of the form (title + inputs), no scroll.
cat > "${FLOWDIR}/01-overview.yaml" <<YAML
appId: ${BUNDLE_ID}
---
- launchApp: { clearState: false }
- waitForAnimationToEnd: { timeout: 6000 }
YAML

# Helper text for the scroll flows: scroll DOWN until a heading is on screen.
mk_scroll_flow(){  # $1 = flow file, $2 = heading text
  cat > "$1" <<YAML
appId: ${BUNDLE_ID}
---
- launchApp: { clearState: false }
- waitForAnimationToEnd: { timeout: 6000 }
- scrollUntilVisible:
    element:
      text: "$2"
    direction: DOWN
    timeout: 20000
- waitForAnimationToEnd: { timeout: 2000 }
YAML
}
mk_scroll_flow "${FLOWDIR}/02-results.yaml" "Results"
mk_scroll_flow "${FLOWDIR}/03-costs.yaml"   "Costs Summary"
mk_scroll_flow "${FLOWDIR}/04-returns.yaml" "Returns"
mk_scroll_flow "${FLOWDIR}/05-stress.yaml"  "Stress Test"
# ============================================================ END PER-APP FLOWS

log "Capturing screenshots..."
for f in "${SHOTS[@]}"; do
  if maestro test "${FLOWDIR}/${f}.yaml"; then :
  else printf "\033[1;33m! %s navigation had a problem - grabbing whatever is on screen\033[0m\n" "${f}"; fi
  sleep 1
  # simctl captures the current sim screen at native 1320x2868 - no path sandbox.
  if xcrun simctl io "${UDID}" screenshot "${OUTDIR}/${f}.png" >/dev/null 2>&1; then ok "captured ${f}"
  else printf "\033[1;31mX could not capture %s\033[0m\n" "${f}"; fi
done

# ---------------------------------------------------------------- 6. verify
log "Verifying dimensions (App Store 6.9\" wants 1320 x 2868)..."
BAD=0
shopt -s nullglob
PNGS=("${OUTDIR}"/*.png)
[[ ${#PNGS[@]} -gt 0 ]] || fail "No screenshots were produced - scroll up for the failing step (or check ${BUILD_LOG})."
for png in "${PNGS[@]}"; do
  W=$(sips -g pixelWidth  "${png}" | awk '/pixelWidth/{print $2}')
  H=$(sips -g pixelHeight "${png}" | awk '/pixelHeight/{print $2}')
  if [[ "${W}" == "1320" && "${H}" == "2868" ]]; then ok "$(basename "${png}")  ${W}x${H}"
  else printf "\033[1;33m! %s is %sx%s (expected 1320x2868)\033[0m\n" "$(basename "${png}")" "${W}" "${H}"; BAD=1; fi
done

echo
if [[ "${BAD}" == "0" ]]; then ok "All screenshots are the right size."
else printf "\033[1;33mSome sizes are off - send them anyway, I'll tell you which to redo.\033[0m\n"; fi

# ---------------------------------------------------------------- 7. hand off
# Bundle the shots (+ build log for debugging) and upload to a temp host so Nano
# can pull them from one link - no dragging files into chat.
cp "${BUILD_LOG}" "${OUTDIR}/build.log" 2>/dev/null || true
ARCHIVE="${WORKDIR}/appstore-shots.tgz"
tar -C "${OUTDIR}" -czf "${ARCHIVE}" . 2>/dev/null || true
log "Uploading results so Nano can pull them..."
URL=""
if [[ -f "${ARCHIVE}" ]]; then
  URL=$(curl -fsS -A "nano-shots/1.0" -F "file=@${ARCHIVE}" https://0x0.st 2>/dev/null | tr -d '\n' || true)
  if [[ -z "${URL}" || "${URL}" != http* ]]; then
    URL=$(curl -fsS -F "file=@${ARCHIVE}" https://file.io 2>/dev/null | grep -oE 'https://file\.io/[A-Za-z0-9]+' | head -1 || true)
  fi
fi
echo
if [[ -n "${URL}" && "${URL}" == http* ]]; then
  printf "\033[1;32m================ COPY THIS ONE LINE TO NANO ================\033[0m\n"
  printf "\033[1;33mSHOTS: %s\033[0m\n" "${URL}"
  printf "\033[1;32m===========================================================\033[0m\n"
else
  printf "\033[1;33mAuto-upload failed - just drag the PNGs from the Finder window into the chat.\033[0m\n"
fi

open "${OUTDIR}"
echo
echo "Done. The PNGs are in:  ${OUTDIR}"
