{ ... }:
{
  programs.mise = {
    enable = true;
    globalConfig = {
      tools = {
        node = "22";
        python = "3.10";
        terraform = "1.7.5";
      };
    };
  };
}
