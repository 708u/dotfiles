.PHONY: install rebuild update

install:
	@./scripts/install.sh
	darwin-rebuild switch --flake .

rebuild:
	darwin-rebuild switch --flake .

update:
	nix flake update
