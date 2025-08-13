#!/usr/bin/env bash
set -euo pipefail

# -------------------------------
# Config & CLI
# -------------------------------
BUMP="patch"        # patch | minor | major | prerelease | prepatch | preminor | premajor
NPM_TAG="latest"
DRY_RUN=0
OTP=""
SCOPE_PREFIX="@lagless/"
BUILD_TARGET="build"  # change if your nx target differs
ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

usage() {
  cat <<EOF
Usage: $(basename "$0") [--bump patch|minor|major|...] [--tag TAG] [--otp CODE] [--dry-run]

Options:
  --bump <type>   npm version bump type (default: patch)
  --tag <tag>     npm dist-tag (default: latest)
  --otp <code>    npm two-factor code if required
  --dry-run       run everything except the final npm publish
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --bump) BUMP="${2:-}"; shift 2 ;;
    --tag)  NPM_TAG="${2:-}"; shift 2 ;;
    --otp)  OTP="${2:-}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1"; usage; exit 1 ;;
  esac
done

# -------------------------------
# Preconditions
# -------------------------------
command -v jq >/dev/null || { echo "jq is required"; exit 1; }
command -v npm >/dev/null || { echo "npm is required"; exit 1; }
command -v nx >/dev/null || { echo "nx is required"; exit 1; }

# Ensure clean git working tree (so version bumps are visible)
if [[ $DRY_RUN -eq 0 ]]; then
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "Your git working tree is not clean. Commit/stash before publishing."
    exit 1
  fi
fi

# -------------------------------
# Helper functions
# -------------------------------

# find all package.json files that define @lagless/* and are not in node_modules/dist
find_lagless_packages() {
  # Use git ls-files when available to avoid untracked junk; fallback to find
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git ls-files "**/package.json" \
      | grep -Ev '(^|/)node_modules/|(^|/)dist/' \
      | while read -r pkg; do
          name=$(jq -r '.name // empty' "$pkg")
          private=$(jq -r '(.private // false)|tostring' "$pkg")
          if [[ "$name" == ${SCOPE_PREFIX}* && "$private" != "true" ]]; then
            echo "$pkg"
          fi
        done
  else
    find . -type f -name package.json \
      -not -path "*/node_modules/*" -not -path "*/dist/*" \
      -print0 | xargs -0 -I{} sh -c '
        name=$(jq -r ".name // empty" "{}");
        private=$(jq -r "(.private // false)|tostring" "{}");
        case "$name" in
          "'${SCOPE_PREFIX}'"*) [ "$private" != "true" ] && echo "{}" ;;
        esac
      '
  fi
}

# get Nx project name for a package.json path
nx_project_from_pkgjson() {
  local pkgjson="$1"
  # Try heuristic: walk up to the directory that contains project.json or nx.json "projects" mapping
  local dir; dir="$(dirname "$pkgjson")"
  while [[ "$dir" != "/" && "$dir" != "." ]]; do
    if [[ -f "$dir/project.json" ]]; then
      jq -r '.name // empty' "$dir/project.json"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  # fallback: extract folder name
  basename "$(dirname "$pkgjson")"
}

# bump version IN-PLACE in the real package.json
bump_version() {
  local dir="$1"
  (cd "$dir" && npm version "$BUMP" --no-git-tag-version >/dev/null)
}

# build via Nx (assumes target "build")
nx_build() {
  local project="$1"
  if [[ -n "$project" && "$project" != "null" ]]; then
    nx run "$project:$BUILD_TARGET"
  else
    # If project name couldn't be resolved, try nx build with inferred name
    nx build "$project"
  fi
}

# make a temp publish folder that mirrors dist + patched package.json
prepare_publish_dir() {
  local pkgjson="$1"
  local pkg_dir; pkg_dir="$(dirname "$pkgjson")"
  local name; name="$(jq -r '.name' "$pkgjson")"
  local out_dir="dist/$(basename "$pkg_dir")"  # adjust if your dist path differs

  # If your Nx puts builds elsewhere, update this detection:
  if [[ ! -d "$out_dir" ]]; then
    # try common Nx layout: dist/libs/<libname>
    local base; base="$(basename "$pkg_dir")"
    if [[ -d "dist/libs/$base" ]]; then
      out_dir="dist/libs/$base"
    elif [[ -d "dist/packages/$base" ]]; then
      out_dir="dist/packages/$base"
    fi
  fi

  if [[ ! -d "$out_dir" ]]; then
    echo "❌ Could not find dist for $name (looked in $out_dir). Check your Nx output path."
    return 1
  fi

  local tmpdir
  tmpdir="$(mktemp -d)"
  rsync -a "$out_dir/." "$tmpdir/"

  # bring along README/LICENSE from source if present
  [[ -f "$pkg_dir/README.md" ]] && cp "$pkg_dir/README.md" "$tmpdir/README.md"
  [[ -f "$ROOT_DIR/LICENSE" ]] && cp "$ROOT_DIR/LICENSE" "$tmpdir/LICENSE"

  # Patch package.json in the tmpdir:
  if [[ -f "$tmpdir/package.json" ]]; then
    # Remove exports["."].development only in the temp copy
    jq 'if .exports and (."."|tostring|length) >= 0
        then .exports |=
             ( . as $e
               | if $e["."] and $e["."]["development"] then
                   .["."] |= (del(.development))
                 else .
                 end
             )
        else .
        end' "$tmpdir/package.json" > "$tmpdir/package.json.tmp"

    mv "$tmpdir/package.json.tmp" "$tmpdir/package.json"
  else
    # Some builds copy the root package.json; if not, copy and patch it
    jq 'if .exports and .exports["."] and .exports["."]["development"]
        then .exports["."] |= (del(.development))
        else .
        end' "$pkgjson" > "$tmpdir/package.json"
  fi

  echo "$tmpdir"
}

npm_publish_from_dir() {
  local dir="$1"
  local tag="$2"
  local otp="$3"
  local name; name="$(jq -r '.name' "$dir/package.json")"
  local version; version="$(jq -r '.version' "$dir/package.json")"

  echo "🛫 Publishing $name@$version (tag: $tag)"

  local publish_cmd=(npm publish --access public --tag "$tag")
  if [[ -n "$otp" ]]; then
    publish_cmd+=(--otp "$otp")
  fi

  if [[ $DRY_RUN -eq 1 ]]; then
    echo "DRY RUN: (${publish_cmd[*]}) in $dir"
  else
    (cd "$dir" && "${publish_cmd[@]}")
  fi
}

# -------------------------------
# Main
# -------------------------------
PKGS=()
while IFS= read -r pkg; do PKGS+=("$pkg"); done < <(find_lagless_packages)

if [[ ${#PKGS[@]} -eq 0 ]]; then
  echo "No publishable ${SCOPE_PREFIX} packages found."
  exit 0
fi

echo "Found ${#PKGS[@]} ${SCOPE_PREFIX} packages to process:"
printf ' - %s\n' "${PKGS[@]}"

# 1) bump versions in-source
for pkgjson in "${PKGS[@]}"; do
  dir="$(dirname "$pkgjson")"
  name="$(jq -r '.name' "$pkgjson")"
  echo "🔧 Bumping $name -> $BUMP"
  bump_version "$dir"
done

# Commit version bumps (optional but recommended)
if [[ $DRY_RUN -eq 0 ]]; then
  git add .
  git commit -m "chore(release): bump ${SCOPE_PREFIX} packages (${BUMP})" || true
fi

# 2) build + 3) prep temp publish dir + 4) publish
for pkgjson in "${PKGS[@]}"; do
  name="$(jq -r '.name' "$pkgjson")"
  project="$(nx_project_from_pkgjson "$pkgjson")"

  echo "🧱 nx build: $project ($name)"
  nx_build "$project"

  echo "📦 preparing temp publish dir for $name"
  tmpdir="$(prepare_publish_dir "$pkgjson")"

  # show the exports section after patch (for visibility)
  echo "exports after patch:"
  jq '.exports // empty' "$tmpdir/package.json" || true

  npm_publish_from_dir "$tmpdir" "$NPM_TAG" "$OTP"

  # cleanup
  rm -rf "$tmpdir"
done

echo "✅ Done."
