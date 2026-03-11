.PHONY: apply bootstrap update mutagen-setup

apply:
	sudo darwin-rebuild switch --flake .#708uMacBookPro

bootstrap:
	sudo nix run nix-darwin -- switch --flake .#708uMacBookPro

update:
	nix flake update

mutagen-setup:
	./scripts/mutagen-setup.sh
