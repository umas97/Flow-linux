#!/bin/sh
# Toglie la voce di menu e l'icona. Non tocca data/: board.json, i backup e
# il registro restano dove sono, e riavviando ./flow si ritrova tutto.

set -e

applicazioni="$HOME/.local/share/applications"
icone="$HOME/.local/share/icons/hicolor/scalable/apps"

rm -f "$applicazioni/it.flow.Flow.desktop"
rm -f "$icone/it.flow.Flow.svg"

if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$applicazioni" || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" || true
fi

echo "Voce di menu e icona rimosse."
echo "La cartella data/ non è stata toccata."
