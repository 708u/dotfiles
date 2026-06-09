{ ... }:
{
  programs.mise = {
    enable = true;
    globalConfig = {
      settings = {
        legacy_version_file = true;
      };
      tools = {
        node = "22";
        python = "3.10";
        terraform = "1.7.5";
        dart = "3.12.2";
      };
    };
  };
}
