.PHONY: apply bootstrap update mutagen-setup

HOST ?= $(shell scutil --get LocalHostName)

# UPGRADE_PACKAGES=1 を付けると、apply で更新しないマシンでも既存のパッケージを更新する
apply:
	sudo darwin-rebuild switch --flake .#$(HOST)
ifneq ($(UPGRADE_PACKAGES),)
	./scripts/upgrade-packages.sh
endif

bootstrap:
	sudo nix run nix-darwin -- switch --flake .#$(HOST)

update:
	nix flake update

mutagen-setup:
	./scripts/mutagen-setup.sh
