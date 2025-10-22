#!/bin/bash
# Helper script to authenticate with Verdaccio using expect
# Usage: ./scripts/verdaccio-auth.sh

set -e

VERDACCIO_URL="${VERDACCIO_URL:-http://localhost:4873}"
VERDACCIO_USER="${VERDACCIO_USER:-test}"
VERDACCIO_PASS="${VERDACCIO_PASS:-test}"
VERDACCIO_EMAIL="${VERDACCIO_EMAIL:-test@test.com}"

# Check if expect is installed
if ! command -v expect &> /dev/null; then
  echo "❌ Error: 'expect' is not installed"
  echo ""
  echo "Install expect:"
  echo "  macOS: brew install expect"
  echo "  Linux: sudo apt-get install expect"
  echo ""
  exit 1
fi

# Use expect to handle npm adduser
expect << EOF
set timeout 30
spawn npm adduser --registry $VERDACCIO_URL
expect "Username:"
send "$VERDACCIO_USER\r"
expect "Password:"
send "$VERDACCIO_PASS\r"
expect "Email: (this IS public)"
send "$VERDACCIO_EMAIL\r"
expect {
  "Logged in" {
    puts "✓ Authentication successful"
    exit 0
  }
  "user registration disabled" {
    puts "❌ User registration is disabled"
    exit 1
  }
  timeout {
    puts "❌ Authentication timed out"
    exit 1
  }
  eof
}
EOF

