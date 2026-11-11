#!/usr/bin/env bash
# Генерация public/assets/og-image.png (1200×630) и apple-touch-icon.png (180×180).
# Требуется ImageMagick (convert). Шрифты (Playfair Display, Inter) скачиваются
# в .cache/og-fonts/ при первом запуске и переиспользуются.
# Запуск: npm run gen:og
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FONTS="$ROOT/.cache/og-fonts"
mkdir -p "$FONTS"

fetch_font() {
  local family="$1" out="$2"
  if [ ! -f "$FONTS/$out" ]; then
    echo "Скачиваю шрифт: $family -> $out"
    local url
    url=$(curl -s --max-time 20 -A "curl" "https://fonts.googleapis.com/css?family=${family}" \
      | grep -o "https://[^)]*\.ttf" | head -1)
    [ -n "$url" ] || { echo "Не удалось получить ссылку на $family" >&2; exit 1; }
    curl -sL --max-time 30 -o "$FONTS/$out" "$url"
  fi
}

fetch_font "Playfair+Display:600" "PlayfairDisplay-SemiBold.ttf"
fetch_font "Inter:regular" "Inter-Regular.ttf"
fetch_font "Inter:500" "Inter-Medium.ttf"

# ВНИМАНИЕ: -strokewidth только целые числа — дробные валит отрисовку
# больших окружностей в ImageMagick 6 (memory allocation failed).

echo "Генерирую og-image.png…"
# Диагональный градиент через sparse-color: без -rotate, который
# оставляет белые треугольники в углах.
convert -size 1200x630 xc: -sparse-color barycentric "0,0,#263F4C 1199,629,#132432" -depth 8 \
  -fill none -stroke "rgba(217,201,174,0.10)" -strokewidth 1 \
    -draw "circle 60,40 460,40" -draw "circle 60,40 620,40" \
    -draw "circle 1160,600 1560,600" -draw "circle 1160,600 1810,600" \
  -stroke "rgba(217,201,174,0.38)" -strokewidth 2 \
    -draw "rectangle 30,30 1169,599" \
  -font "$FONTS/Inter-Medium.ttf" -pointsize 26 -kerning 9 -fill "#D9C9AE" -gravity north -annotate +0+165 "СЕМЕЙНЫЙ ГЕНЕАЛОГИЧЕСКИЙ АРХИВ" \
  -font "$FONTS/PlayfairDisplay-SemiBold.ttf" -pointsize 100 -fill "#F5F1EB" -gravity north -annotate +0+218 "Род Логвиновых" \
  -stroke "rgba(217,201,174,0.55)" -strokewidth 2 -draw "line 525,412 675,412" \
  -stroke none -fill "#D9C9AE" -draw "circle 600,412 605,412" \
  -font "$FONTS/Inter-Regular.ttf" -pointsize 34 -fill "#D5DCE0" -gravity north -annotate +0+442 "Древо  ·  Хронология  ·  Галерея" \
  -font "$FONTS/Inter-Regular.ttf" -pointsize 26 -fill "#B9C3C9" -gravity north -annotate +0+524 "logvinov-tree.ru" \
  -define png:color-type=2 "$ROOT/public/assets/og-image.png"

echo "Генерирую apple-touch-icon.png…"
convert -background none -density 600 "$ROOT/public/assets/favicon.svg" -resize 180x180 \
  "$ROOT/public/assets/apple-touch-icon.png"

echo "Готово:"
identify "$ROOT/public/assets/og-image.png" "$ROOT/public/assets/apple-touch-icon.png"
