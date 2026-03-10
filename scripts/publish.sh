#!/usr/bin/env bash
set -euo pipefail

# Publish all @lagless packages to npm in topological order.
# Usage:
#   ./scripts/publish.sh            # bump patch + publish
#   ./scripts/publish.sh --dry-run  # preview what would happen

DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# Topological publish order (dependencies first)
PACKAGES=(
  "libs/binary"
  "libs/math"
  "libs/misc"
  "libs/animate"
  "libs/animation-controller"
  "libs/core"
  "libs/net-wire"
  "libs/physics-shared"
  "libs/2d-map/2d-map-generator"
  "libs/2d-map/2d-map-renderer"
  "libs/physics2d"
  "libs/physics3d"
  "libs/character-controller-3d"
  "libs/matchmaking"
  "libs/relay-server"
  "libs/relay-client"
  "libs/relay-game-server"
  "libs/dev-tools"
  "tools/codegen"
  "tools/dev-player"
  "libs/react"
  "libs/desync-diagnostics"
  "libs/pixi-react"
  "tools/create"
)

# ---------- helpers ----------

get_version() {
  node -p "require('./$1/package.json').version"
}

bump_patch() {
  local pkg_dir="$1"
  local cur
  cur=$(get_version "$pkg_dir")
  local next
  next=$(node -p "const p=('$cur').split('.'); p[2]=+p[2]+1; p.join('.')")
  echo "$next"
}

set_version() {
  local pkg_dir="$1"
  local version="$2"
  node -e "
    const fs = require('fs');
    const p = JSON.parse(fs.readFileSync('$pkg_dir/package.json','utf8'));
    p.version = '$version';
    fs.writeFileSync('$pkg_dir/package.json', JSON.stringify(p, null, 2) + '\n');
  "
}

# ---------- 1. build everything ----------

echo "==> Building all packages..."
pnpm exec nx run-many -t build

# ---------- 2. determine next version ----------

CURRENT_VERSION=$(get_version "${PACKAGES[0]}")
NEXT_VERSION=$(bump_patch "${PACKAGES[0]}")

echo "==> Current version: $CURRENT_VERSION"
echo "==> Next version:    $NEXT_VERSION"

# ---------- 3. bump versions ----------

echo "==> Bumping versions..."
for pkg in "${PACKAGES[@]}"; do
  if [ -f "$pkg/package.json" ]; then
    set_version "$pkg" "$NEXT_VERSION"
    echo "   $pkg -> $NEXT_VERSION"
  fi
done

# ---------- 4. publish ----------

echo "==> Publishing packages..."
for pkg in "${PACKAGES[@]}"; do
  if [ ! -f "$pkg/package.json" ]; then
    echo "   SKIP $pkg (not found)"
    continue
  fi

  local_name=$(node -p "require('./$pkg/package.json').name")
  echo "   Publishing $local_name@$NEXT_VERSION ..."

  if [ "$DRY_RUN" = true ]; then
    (cd "$pkg" && pnpm publish --no-git-checks --dry-run 2>&1 | head -5) || true
  else
    (cd "$pkg" && pnpm publish --no-git-checks) || {
      echo "   WARN: failed to publish $local_name, continuing..."
    }
  fi
done

echo ""
if [ "$DRY_RUN" = true ]; then
  echo "==> Dry run complete. No packages were actually published."
else
  echo "==> Published all packages at version $NEXT_VERSION"
fi
