#!/bin/bash
set -euo pipefail

GO_VERSION="1.26.1"
INSTALL_DIR="/usr/local/go"

if [ -x "${INSTALL_DIR}/bin/go" ]; then
  installed=$("${INSTALL_DIR}/bin/go" version | awk '{print $3}' | sed 's/^go//')
  if [ "${installed}" = "${GO_VERSION}" ]; then
    echo "Go ${GO_VERSION} is already installed, skipping."
    exit 0
  fi
  echo "Updating Go ${installed} -> ${GO_VERSION}"
fi

os=$(uname -s | tr '[:upper:]' '[:lower:]')
arch=$(uname -m)
case "${arch}" in
  x86_64)  arch="amd64" ;;
  aarch64|arm64) arch="arm64" ;;
esac

tarball="go${GO_VERSION}.${os}-${arch}.tar.gz"
url="https://go.dev/dl/${tarball}"

tmpdir=$(mktemp -d)
trap 'rm -rf "${tmpdir}"' EXIT

echo "Downloading ${url}..."
curl -fSL -o "${tmpdir}/${tarball}" "${url}"

echo "Installing Go ${GO_VERSION} to ${INSTALL_DIR}..."
sudo rm -rf "${INSTALL_DIR}"
sudo tar -C /usr/local -xzf "${tmpdir}/${tarball}"

echo "Done: $("${INSTALL_DIR}/bin/go" version)"
