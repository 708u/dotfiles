{
  description = "708u's macOS configuration";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    nix-darwin = {
      url = "github:LnL7/nix-darwin";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    inputs@{
      nixpkgs,
      nix-darwin,
      home-manager,
      ...
    }:
    let
      system = "aarch64-darwin";
      username = "708u";
      dotfilesDir = "/Users/${username}/ghq/github.com/708u/dotfiles";
      mkDarwin =
        {
          hostname,
          extraModules ? [ ],
        }:
        nix-darwin.lib.darwinSystem {
          inherit system;
          modules = [
            ./nix/darwin.nix
            home-manager.darwinModules.home-manager
            {
              home-manager.useGlobalPkgs = true;
              home-manager.useUserPackages = true;
              home-manager.extraSpecialArgs = { inherit dotfilesDir; };
              home-manager.users.${username} = import ./nix/home.nix;
            }
          ]
          ++ extraModules;
          specialArgs = { inherit inputs username hostname; };
        };
    in
    {
      darwinConfigurations = {
        "708uMacBookPro" = mkDarwin { hostname = "708uMacBookPro"; };
        "708uServer" = mkDarwin {
          hostname = "708uServer";
          extraModules = [ ./nix/server.nix ];
        };
      };
    };
}
