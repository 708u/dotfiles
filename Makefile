.PHONY: install rebuild update

install:
	darwin-rebuild switch --flake .

rebuild:
	darwin-rebuild switch --flake .

update:
	nix flake update
