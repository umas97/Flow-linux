#!/bin/sh
# Registra Flow in GNOME: voce di menu e icona.
#
# Non copia l'applicazione da nessuna parte — la cartella resta dov'è e la
# voce di menu la punta. Spostandola va rilanciato questo script.

set -e

qui=$(dirname "$(readlink -f "$0")")
applicazioni="$HOME/.local/share/applications"
icone="$HOME/.local/share/icons/hicolor/scalable/apps"

mkdir -p "$applicazioni" "$icone"
cp "$qui/app/flow.svg" "$icone/it.flow.Flow.svg"
chmod +x "$qui/flow"

# Il nome del file deve combaciare con l'application-id dell'host: è così che
# GNOME collega la finestra alla voce di menu e le dà l'icona giusta.
cat > "$applicazioni/it.flow.Flow.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Flow
Comment=Gestore di attività locale
Exec="$qui/flow"
Icon=it.flow.Flow
Terminal=false
Categories=Office;ProjectManagement;
StartupNotify=true
EOF

if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$applicazioni" || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" || true
fi

echo "Fatto: Flow è nel menu delle applicazioni."
echo "L'archivio resta in $qui/data — l'installazione non lo tocca."
