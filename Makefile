.PHONY: apply bootstrap update

apply:
	sudo darwin-rebuild switch --flake .

bootstrap:
	sudo nix run nix-darwin -- switch --flake .

update:
	nix flake update
