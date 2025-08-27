#!/usr/bin/env bash
set -euo pipefail
trap 'echo "❌ Error at line $LINENO"; exit 1' ERR

# =========================================
# Config & CLI
# =========================================
BUMP="patch"          # patch | minor | major | prerelease | prepatch | preminor | premajor
NPM_TAG="latest"
DRY_RUN=0
OTP=""
FILTER=""             # comma-separated list of package names, e.g. @lagless/core,@lagless/types
VERBOSE=0
SCOPE_PREFIX="@lagless/"
BUILD_TARGET="build"
ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Options:
  --bump <type>    npm version bump type (default: patch)
  --tag <tag>      npm dist-tag (default: latest)
  --otp <code>     npm two-factor code for publish
  --dry-run        run all steps except npm publish
  --filter <list>  comma-separated package names to process (e.g. @lagless/core,@lagless/types)
  --verbose        enable bash tracing
  -h, --help       show help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --bump) BUMP="${2:-}"; shift 2 ;;
    --tag)  NPM_TAG="${2:-}"; shift 2 ;;
    --otp)  OTP="${2:-}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --filter) FILTER="${2:-}"; shift 2 ;;
    --verbose) VERBOSE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1"; usage; exit 1 ;;
  esac
done

[[ $VERBOSE -eq 1 ]] && set -x

# =========================================
# Preconditions
# =========================================
command -v jq >/dev/null || { echo "jq is required"; exit 1; }
command -v npm >/dev/null || { echo "npm is required"; exit 1; }
command -v nx  >/dev/null || { echo "nx is required";  exit 1; }

# Clean git tree (чтобы видеть бампы версий)
if [[ $DRY_RUN -eq 0 ]]; then
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "Git working tree не чистый. Сначала commit/stash."
    exit 1
  fi
fi

# =========================================
# Helpers
# =========================================

# Собираем все package.json с name=@lagless/* и private!=true
find_lagless_packages() {
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git ls-files "**/package.json" \
      | grep -Ev '(^|/)node_modules/|(^|/)dist/' \
      | while read -r pkg; do
          local name private
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

# Фильтрация по --filter (список имён)
filter_pkgs() {
  local pkg_list=("$@")
  [[ -z "$FILTER" ]] && { printf "%s\n" "${pkg_list[@]}"; return; }

  IFS=',' read -r -a allow <<< "$FILTER"
  for p in "${pkg_list[@]}"; do
    local name; name=$(jq -r '.name' "$p")
    for a in "${allow[@]}"; do
      if [[ "$name" == "$a" ]]; then
        echo "$p"
        break
      fi
    done
  done
}

# Получить Nx project name по пути package.json
nx_project_from_pkgjson() {
  local pkgjson="$1"
  local dir; dir="$(dirname "$pkgjson")"
  while [[ "$dir" != "/" && "$dir" != "." ]]; do
    if [[ -f "$dir/project.json" ]]; then
      jq -r '.name // empty' "$dir/project.json"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  # запасной вариант — имя папки
  basename "$(dirname "$pkgjson")"
}

# Бамп версии в ОРИГИНАЛЬНОМ пакете
bump_version() {
  local dir="$1"
  (cd "$dir" && npm version "$BUMP" --no-git-tag-version >/dev/null)
}

# Nx build
nx_build() {
  local project="$1"
  if [[ -n "$project" && "$project" != "null" ]]; then
    nx run "$project:$BUILD_TARGET"
  else
    nx build "$project"
  fi
}

# Поиск выходной папки билда (несколько популярных layout'ов Nx)
detect_out_dir() {
  local pkgjson="$1"
  local pkg_dir; pkg_dir="$(dirname "$pkgjson")"
  local base; base="$(basename "$pkg_dir")"

  local candidates=(
    "$pkg_dir/dist"
    "dist/$base"
    "dist/libs/$base"
    "dist/packages/$base"
    "dist/libs/${base}/"*
    "dist/packages/${base}/"*
  )

  for p in "${candidates[@]}"; do
    for q in $p; do
      [[ -d "$q" ]] && { echo "$q"; return 0; }
    done
  done

  return 1
}

# Подготовка временной директории публикации (копия dist + пропатченный package.json)
prepare_publish_dir() {
  local pkgjson="$1"
  local pkg_dir; pkg_dir="$(dirname "$pkgjson")"
  local out_dir
  out_dir="$(detect_out_dir "$pkgjson")" || {
    echo "❌ dist не найден для $(jq -r '.name' "$pkgjson"). Проверь outputPath в project.json"
    return 1
  }

  local tmpdir; tmpdir="$(mktemp -d)"

  # 1) Создаём dist в temp и КОПИРУЕМ В НЕГО (сохраняем путь 'dist/')
  mkdir -p "$tmpdir/dist"
  rsync -a "$out_dir/" "$tmpdir/dist/"

  # 2) Кладём package.json/README/LICENSE
  cp "$pkg_dir/package.json" "$tmpdir/package.json"
  [[ -f "$pkg_dir/README.md" ]] && cp "$pkg_dir/README.md" "$tmpdir/README.md"
  [[ -f "$ROOT_DIR/LICENSE" ]] && cp "$ROOT_DIR/LICENSE" "$tmpdir/LICENSE"

  # 3) Патчим только temp package.json: удаляем exports["."].development
  jq 'if has("exports") and (.exports|has(".")) and (.exports["."]|has("development"))
      then .exports["."] |= del(.development)
      else .
      end' "$tmpdir/package.json" > "$tmpdir/package.json.tmp" \
      && mv "$tmpdir/package.json.tmp" "$tmpdir/package.json"

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
  [[ -n "$otp" ]] && publish_cmd+=(--otp "$otp")

  if [[ $DRY_RUN -eq 1 ]]; then
    echo "DRY RUN: (${publish_cmd[*]}) in $dir"
  else
    (cd "$dir" && "${publish_cmd[@]}")
  fi
}

# =========================================
# Main
# =========================================
# 0) Собираем список пакетов
mapfile -t ALL_PKGS < <(find_lagless_packages)
mapfile -t PKGS < <(filter_pkgs "${ALL_PKGS[@]}")

if [[ ${#PKGS[@]} -eq 0 ]]; then
  echo "Нет подходящих ${SCOPE_PREFIX} пакетов."
  exit 0
fi

echo "Found ${#PKGS[@]} ${SCOPE_PREFIX} packages to process:"
printf ' - %s\n' "${PKGS[@]}"

# 1) Бамп версий
for pkgjson in "${PKGS[@]}"; do
  dir="$(dirname "$pkgjson")"
  name="$(jq -r '.name' "$pkgjson")"
  echo "🔧 Bumping $name -> $BUMP"
  bump_version "$dir"
done

# Коммитим бампы (можно убрать при желании)
if [[ $DRY_RUN -eq 0 ]]; then
  git add .
  git commit -m "chore(release): bump ${SCOPE_PREFIX} packages (${BUMP})" || true
fi

# 2) Билд + 3) Подготовка temp dir + 4) Публикация
for pkgjson in "${PKGS[@]}"; do
  name="$(jq -r '.name' "$pkgjson")"
  project="$(nx_project_from_pkgjson "$pkgjson")"

  echo "🧱 nx build: $project ($name)"
  nx_build "$project"

  echo "📦 preparing temp publish dir for $name"
  tmpdir="$(prepare_publish_dir "$pkgjson")"

  echo "exports after patch:"
  jq '.exports // empty' "$tmpdir/package.json" || true

  npm_publish_from_dir "$tmpdir" "$NPM_TAG" "$OTP"

  rm -rf "$tmpdir"
done

echo "✅ Done."
