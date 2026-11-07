.PHONY: apply bootstrap update mutagen-setup

HOST ?= $(shell scutil --get LocalHostName)

apply:
	sudo darwin-rebuild switch --flake .#$(HOST)

bootstrap:
	sudo nix run nix-darwin -- switch --flake .#$(HOST)

update:
	nix flake update

mutagen-setup:
	./scripts/mutagen-setup.sh
