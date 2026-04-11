#!/usr/bin/env bash
# ============================================================
#  clasp-deploy.sh — Safe Apps Script deployment helper
#  Usage:
#    ./scripts/clasp-deploy.sh test    # Push to TEST project
#    ./scripts/clasp-deploy.sh prod    # Push to PROD project (requires confirmation)
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
AS_DIR="$REPO_ROOT/apps-script"

CLASP_TEST="$AS_DIR/.clasp.json"
CLASP_PROD="$AS_DIR/.clasp.json.prod"
CLASP_ACTIVE="$AS_DIR/.clasp.json"
CLASP_BACKUP="$AS_DIR/.clasp.json.bak"

TARGET="${1:-}"

if [ -z "$TARGET" ]; then
  echo "Usage: $0 <test|prod>"
  echo ""
  echo "  test  — Push to TEST Apps Script project (safe default)"
  echo "  prod  — Push to PROD Apps Script project (requires confirmation)"
  exit 1
fi

# Verify we're on main branch for PROD deploys
CURRENT_BRANCH=$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)

case "$TARGET" in
  test|TEST)
    echo "=== DEPLOYING TO TEST ==="
    echo "Branch: $CURRENT_BRANCH"
    echo "Config: $CLASP_TEST"
    echo ""
    # .clasp.json already points to TEST by default — just push
    cd "$AS_DIR"
    clasp push
    echo ""
    echo "✓ Pushed to TEST successfully."
    ;;

  prod|PROD)
    echo "=== DEPLOYING TO PROD ==="
    echo ""

    # Safety checks
    if [ "$CURRENT_BRANCH" != "main" ]; then
      echo "ERROR: PROD deploy only allowed from 'main' branch."
      echo "       Current branch: $CURRENT_BRANCH"
      echo "       Merge your changes first, then deploy."
      exit 1
    fi

    # Check for uncommitted changes
    if ! git -C "$REPO_ROOT" diff --quiet HEAD; then
      echo "ERROR: Uncommitted changes detected. Commit or stash first."
      exit 1
    fi

    echo "WARNING: You are about to push to PRODUCTION Apps Script."
    echo "Branch: $CURRENT_BRANCH"
    echo "Config: $CLASP_PROD"
    echo ""
    read -p "Type 'DEPLOY PROD' to confirm: " CONFIRM
    if [ "$CONFIRM" != "DEPLOY PROD" ]; then
      echo "Aborted."
      exit 1
    fi

    # Swap .clasp.json to PROD, push, then swap back
    echo ""
    echo "Swapping .clasp.json to PROD config..."
    cp "$CLASP_ACTIVE" "$CLASP_BACKUP"
    cp "$CLASP_PROD" "$CLASP_ACTIVE"

    cd "$AS_DIR"
    PUSH_EXIT=0
    clasp push || PUSH_EXIT=$?

    # Always restore TEST config
    echo "Restoring .clasp.json to TEST config..."
    cp "$CLASP_BACKUP" "$CLASP_ACTIVE"
    rm -f "$CLASP_BACKUP"

    if [ $PUSH_EXIT -ne 0 ]; then
      echo "ERROR: clasp push failed (exit $PUSH_EXIT). .clasp.json restored to TEST."
      exit $PUSH_EXIT
    fi

    echo ""
    echo "✓ Pushed to PROD successfully. .clasp.json restored to TEST."
    ;;

  *)
    echo "Unknown target: $TARGET"
    echo "Usage: $0 <test|prod>"
    exit 1
    ;;
esac
