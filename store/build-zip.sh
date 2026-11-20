#!/bin/sh
# Skapar zip-filen som laddas upp till Chrome Web Store (manifest.json i roten).
set -e
cd "$(dirname "$0")/../extension"
rm -f ../store/provtidsbevakning.zip
zip -qr ../store/provtidsbevakning.zip . -x '*.DS_Store'
echo "Skapade store/provtidsbevakning.zip"
