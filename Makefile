PROJECT_NAME = kde-tilling-on-drag
KWINPKG_FILE=$(PROJECT_NAME).kwinscript
MAIN_FILE=contents/code/main.js

install: build
	plasmapkg2 -t kwinscript -i $(KWINPKG_FILE)
uninstall:
	plasmapkg2 -t kwinscript -r $(PROJECT_NAME)
debug:
	qdbus org.kde.plasmashell /PlasmaShell org.kde.PlasmaShell.showInteractiveKWinConsole
debug-run:
	bin/load-script.sh "$(MAIN_FILE)" "$(PROJECT_NAME)-test"
debug-stop:
	bin/load-script.sh "unload" "$(PROJECT_NAME)-test"
debug-logs:
	journalctl -f -t kwin_wayland
debug-console:
	plasma-interactiveconsole

build: clear
	rm -f "$(KWINPKG_FILE)"
	@7z a -tzip $(KWINPKG_FILE) ./*
clear:
	rm -f "$(KWINPKG_FILE)"
