#!/usr/bin/env bash
# Package payment.py + Pillow (Linux wheels) + fonts + template into payment.zip
set -euo pipefail
cd "$(dirname "$0")"

PKG=build_payment
rm -rf "$PKG" payment.zip
mkdir -p "$PKG/Input"

# Pillow built for Lambda's Amazon Linux (python3.12, x86_64) — NOT your Windows wheel
python -m pip install --platform manylinux2014_x86_64 --implementation cp \
  --python-version 3.12 --only-binary=:all: --target "$PKG" Pillow

cp payment.py "$PKG/"
cp /c/Windows/Fonts/arial.ttf /c/Windows/Fonts/arialbd.ttf "$PKG/"

# Template image the handler loads (TEMPLATE_PATH = Input/IMG-20260629-WA0003.jpg.jpeg)
if [ -f "Input/IMG-20260629-WA0003.jpg.jpeg" ]; then
  cp "Input/IMG-20260629-WA0003.jpg.jpeg" "$PKG/Input/"
else
  echo "!! MISSING: Input/IMG-20260629-WA0003.jpg.jpeg — drop it in before deploy or Lambda 500s"
fi

python -c "import shutil; shutil.make_archive('payment','zip','$PKG')"
echo "Built payment.zip ($(du -h payment.zip | cut -f1))"
