.PHONY: install rebuild update

install:
	@./scripts/install.sh
	sudo darwin-rebuild switch --flake .

rebuild:
	sudo darwin-rebuild switch --flake .

update:
	nix flake update
