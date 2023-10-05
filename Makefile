PROJECT_NAME = kde-tiling-on-drag
KWINPKG_FILE=$(PROJECT_NAME).kwinscript
MAIN_FILE=contents/code/main.js
MAIN_FILE_TYPESCRIPT=contents/code/main.ts

install: build # Install script
	plasmapkg2 -t kwinscript -s $(PROJECT_NAME) \
		&& plasmapkg2 -u $(KWINPKG_FILE) \
		|| plasmapkg2 -i $(KWINPKG_FILE)
uninstall: # Uninstall script
	plasmapkg2 -t kwinscript -r $(PROJECT_NAME)

reload: build # Reinstall script and reload it (must be activated in kwin settings)
	dbus-send --session --print-reply=literal --dest="org.kde.KWin" "/Scripting" "org.kde.kwin.Scripting.unloadScript" string:"$(PROJECT_NAME)"
	@make install
	dbus-send --session --print-reply=literal --dest="org.kde.KWin" "/Scripting" "org.kde.kwin.Scripting.start"

debug-logs: # Show kwin logs
	journalctl -f -t kwin_wayland
debug-console: # Open interactive console
	plasma-interactiveconsole
list: # help
	@grep '^[^#[:space:]].*:' Makefile
compile: # Compile typescript
	npx tsc
clear: # Clear build files and artifacts
	rm -f "$(KWINPKG_FILE)"
	rm -Rf build
	rm -f contents/code/main.js
	npm install
lint: clear # Lint
	npx eslint -c .eslintrc.json contents
fix: clear # Lint and fix
	npx eslint -c .eslintrc.json contents --fix
build: clear compile # Build package
	mkdir -p build/contents/code
	cp -r contents/code build/contents/
	cp -r contents/config build/contents/
	cp -r contents/ui build/contents/
	@find "build/" '(' -name "*.ts" ')' -delete
	@find "build/" -type d -empty -print -delete
	cp metadata.json build/
	@7z a -tzip $(KWINPKG_FILE) ./build/*
	rm -f $(MAIN_FILE)
