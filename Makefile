.PHONY: apply bootstrap update mutagen-setup go-install

HOST ?= $(shell scutil --get LocalHostName)

apply:
	sudo darwin-rebuild switch --flake .#$(HOST)
	./scripts/go-install.sh

bootstrap:
	sudo nix run nix-darwin -- switch --flake .#$(HOST)

update:
	nix flake update

go-install:
	./scripts/go-install.sh

mutagen-setup:
	./scripts/mutagen-setup.sh
