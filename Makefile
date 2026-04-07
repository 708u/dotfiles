.PHONY: apply bootstrap update mutagen-setup go-install

apply:
	sudo darwin-rebuild switch --flake .#708uMacBookPro
	./scripts/go-install.sh

bootstrap:
	sudo nix run nix-darwin -- switch --flake .#708uMacBookPro

update:
	nix flake update

go-install:
	./scripts/go-install.sh

mutagen-setup:
	./scripts/mutagen-setup.sh
