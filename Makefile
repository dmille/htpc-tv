SHELL := /bin/bash

APP_NAME := htpc-tv
INSTALL_DIR := $(HOME)/.local/share/$(APP_NAME)
STATE_DIR := $(HOME)/.local/state/$(APP_NAME)
AUTOSTART_DIR := $(HOME)/.config/autostart
AUTOSTART_FILE := $(AUTOSTART_DIR)/tv-mode.desktop
LAUNCHER_URL := file://$(INSTALL_DIR)/index.html
CHROME_CMD := google-chrome
CHROME_FLAGS := --kiosk

.PHONY: help bootstrap packages chrome configure launcher autostart doctor run clean uninstall

help:
	@echo "Targets:"
	@echo "  make bootstrap   - full setup"
	@echo "  make packages    - install required packages"
	@echo "  make chrome      - install Google Chrome"
	@echo "  make configure   - apply desktop/power settings"
	@echo "  make launcher    - install launcher webpage"
	@echo "  make autostart   - install autostart entry"
	@echo "  make doctor      - validate system setup"
	@echo "  make run         - run launcher now"
	@echo "  make clean       - remove generated temp files"
	@echo "  make uninstall   - remove installed repo-managed files"

bootstrap: packages chrome configure launcher autostart doctor

packages:
	bash scripts/install-packages.sh

chrome:
	bash scripts/install-chrome.sh

configure:
	bash scripts/configure-system.sh

launcher:
	INSTALL_DIR="$(INSTALL_DIR)" bash scripts/install-launcher.sh

autostart:
	AUTOSTART_DIR="$(AUTOSTART_DIR)" \
	INSTALL_DIR="$(INSTALL_DIR)" \
	CHROME_CMD="$(CHROME_CMD)" \
	CHROME_FLAGS="$(CHROME_FLAGS)" \
	bash scripts/install-autostart.sh

doctor:
	INSTALL_DIR="$(INSTALL_DIR)" \
	AUTOSTART_FILE="$(AUTOSTART_FILE)" \
	bash scripts/doctor.sh

run:
	$(CHROME_CMD) $(CHROME_FLAGS) file://$(INSTALL_DIR)/index.html

clean:
	rm -rf .tmp

uninstall:
	INSTALL_DIR="$(INSTALL_DIR)" \
	AUTOSTART_FILE="$(AUTOSTART_FILE)" \
	bash scripts/uninstall.sh
