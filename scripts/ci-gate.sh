#!/usr/bin/env bash
# SAP AlwaysOps v1.5 — CI Gate Script
# Exit on first failure
set -euo pipefail

echo "╔══════════════════════════════════════════════╗"
echo "║  SAP AlwaysOps v1.5 — CI Gate               ║"
echo "╚══════════════════════════════════════════════╝"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# 1. Verify version.json
echo ""
echo "▸ Step 1: Verify version.json..."
node -e "const v = require('$ROOT/version.json'); if (!v.version || !v.product) { throw new Error('Invalid version.json'); } console.log('  ✓ version.json valid:', v.product, v.version);"

# 2. npm audit
echo ""
echo "▸ Step 2: Security audit..."
cd "$ROOT/lambda"
if [ -f package-lock.json ]; then
  npm audit --audit-level=high 2>&1 || echo "  ⚠ npm audit found issues (non-blocking)"
else
  echo "  ⚠ No package-lock.json found (skipping audit)"
fi

# 3. Run all tests
echo ""
echo "▸ Step 3: Run test suite..."
cd "$ROOT"
node tests/run-all.js

# 4. Verify zero DynamoDB Scans in hot paths
echo ""
echo "▸ Step 4: DynamoDB Scan elimination check..."
SCAN_COUNT=$(grep -r "ScanCommand\|new.*Scan\b" "$ROOT/lambda/" --include="*.js" | grep -v node_modules | grep -v "// v1.5 Scan-retained" | grep -v test | wc -l | tr -d ' ')
if [ "$SCAN_COUNT" -gt "0" ]; then
  echo "  ✗ Found $SCAN_COUNT DynamoDB Scan operations in Lambda code!"
  grep -r "ScanCommand\|new.*Scan\b" "$ROOT/lambda/" --include="*.js" | grep -v node_modules | grep -v "// v1.5 Scan-retained" | grep -v test
  exit 1
else
  echo "  ✓ Zero DynamoDB Scans in hot-path Lambda code"
fi

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  ✓ All CI gates passed!                      ║"
echo "╚══════════════════════════════════════════════╝"
