#!/bin/bash
# Claude Code SessionStart Hook: Install GitHub CLI
# This script installs gh CLI on session start if not already installed

set -e

# Check if gh is already installed
if command -v gh &> /dev/null; then
    echo "GitHub CLI already installed: $(gh --version | head -1)"
    exit 0
fi

echo "Installing GitHub CLI..."

# Download and install from GitHub releases (avoids apt issues)
GH_VERSION="2.63.2"
curl -fsSL "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_amd64.tar.gz" -o /tmp/gh.tar.gz
tar -xzf /tmp/gh.tar.gz -C /tmp
sudo mv "/tmp/gh_${GH_VERSION}_linux_amd64/bin/gh" /usr/local/bin/
rm -rf /tmp/gh.tar.gz "/tmp/gh_${GH_VERSION}_linux_amd64"

echo "GitHub CLI installed: $(gh --version | head -1)"
