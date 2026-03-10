.PHONY: install rebuild update

install:
	@./scripts/install.sh
	sudo nix run nix-darwin -- switch --flake .

rebuild:
	sudo nix run nix-darwin -- switch --flake .

update:
	nix flake update
