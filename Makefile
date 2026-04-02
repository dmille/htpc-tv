SHELL := /bin/bash

APP_NAME := htpc-tv
INSTALL_DIR := $(HOME)/.local/share/$(APP_NAME)
STATE_DIR := $(HOME)/.local/state/$(APP_NAME)
AUTOSTART_DIR := $(HOME)/.config/autostart
AUTOSTART_FILE := $(AUTOSTART_DIR)/tv-mode.desktop
LAUNCHER_URL := file://$(INSTALL_DIR)/index.html
CHROME_CMD := google-chrome
CHROME_FLAGS := --kiosk --homepage=$(LAUNCHER_URL)
REMOTE_DIR := $(CURDIR)/remote
MOTE_PORT := 8880

.PHONY: help bootstrap packages chrome configure launcher autostart doctor run clean uninstall remote remote-install remote-service

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
	@echo "  make remote-install - install Mote dev remote deps"
	@echo "  make remote      - start Mote dev remote (port 8880)"
	@echo "  make remote-service - install Mote as a systemd user service"
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
	INSTALL_DIR="$(INSTALL_DIR)" \
	CHROME_CMD="$(CHROME_CMD)" \
	CHROME_FLAGS="$(CHROME_FLAGS)" \
	bash scripts/launch-chrome.sh

remote-install:
	REMOTE_DIR="$(REMOTE_DIR)" bash scripts/install-remote.sh

remote:
	cd "$(REMOTE_DIR)" && MOTE_PORT="$(MOTE_PORT)" node server.js

remote-service:
	REMOTE_DIR="$(REMOTE_DIR)" MOTE_PORT="$(MOTE_PORT)" bash scripts/install-remote-service.sh

clean:
	rm -rf .tmp

uninstall:
	INSTALL_DIR="$(INSTALL_DIR)" \
	AUTOSTART_FILE="$(AUTOSTART_FILE)" \
	bash scripts/uninstall.sh
