.PHONY: apply update

apply:
	sudo darwin-rebuild switch --flake .

update:
	nix flake update
