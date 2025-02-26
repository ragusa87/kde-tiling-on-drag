PROJECT_NAME = kde-tiling-on-drag
KWINPKG_FILE=$(PROJECT_NAME).kwinscript
MAIN_FILE=contents/code/main.js
MAIN_FILE_TYPESCRIPT=contents/code/main.ts

install: build # Install script
	# kpackagetool6 -t kwinscript
	kpackagetool6 -t KWin/Script -s $(PROJECT_NAME) \
		&& kpackagetool6 -t KWin/Script -u $(KWINPKG_FILE) \
		|| kpackagetool6 -t KWin/Script -i $(KWINPKG_FILE)
uninstall: # Uninstall script
	kpackagetool6 -t KWin/Script -r $(PROJECT_NAME)

reload: build # Reinstall script and reload it (must be activated in kwin settings)
	dbus-send --session --print-reply=literal --dest="org.kde.KWin" "/Scripting" "org.kde.kwin.Scripting.unloadScript" string:"$(PROJECT_NAME)"
	@make install
	dbus-send --session --print-reply=literal --dest="org.kde.KWin" "/Scripting" "org.kde.kwin.Scripting.start"

debug-logs: # Show kwin logs
	@if [ "${XDG_SESSION_TYPE}" = "x11" ]; then \
	    journalctl -f -t kwin_x11; \
	else \
	    journalctl -f -t kwin_wayland; \
	fi
debug-console: # Open interactive console
	plasma-interactiveconsole
list: # help
	@grep '^[^#[:space:]].*:' Makefile
compile: # Compile typescript
	npx tsc
	npx rollup contents/code/main.js --format cjs --file contents/code/all.js
clear: # Clear build files and artifacts
	rm -f "$(KWINPKG_FILE)"
	rm -Rf build
	rm -f contents/code/*.js
	bash -c "set -xve; [[ ! -d node_modules ]] && npm install || exit 0"
lint: clear # Lint
	npx eslint -c .eslintrc.json contents
fix: clear # Lint and fix
	npx eslint -c .eslintrc.json contents --fix
build: clear compile # Build package
	mkdir -p build/contents/code
	cp -r contents/code build/contents/
	cp -r contents/config build/contents/
	cp -r contents/ui build/contents/
	@find "build/" '(' -name "*.js" ')' -delete
	@find "build/" '(' -name "*.ts" ')' -delete
	@find "build/" -type d -empty -print -delete
	mkdir -p build/contents/code/
	cp contents/code/all.js build/contents/code/main.js
	cp metadata.json build/
	@7zz a -tzip $(KWINPKG_FILE) ./build/*
	rm -f $(MAIN_FILE)
	rm -f contents/code/all.js
