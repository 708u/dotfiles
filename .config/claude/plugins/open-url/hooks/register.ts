import type { Register } from "claude-code";

const TOOL = "open_url";

const HTTP_URL = /^https?:\/\/[^\s]+$/;

// ssh は引数を remote の shell で連結して解釈するため、single quote で囲んで渡す
const shellQuote = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`;

const DESCRIPTION = [
  "Open a URL in the browser of the machine the person is using, so they can look at it right away.",
  "Call it when you have just created something the person should review or use (a pull request, issue, Artifact, deployed page, document), or when you point them to a URL you want them to open now.",
  "Do not call it for URLs you only cite as background or references, URLs the person just gave you, or URLs you already opened in this session.",
  "Call it once per URL, after the URL exists. Still write the URL in your reply.",
].join(" ");

export const register: Register = (on) => {
  const opened = new Set<string>();

  on("session.start", async ($, e, next) => {
    const started = await next(e);
    await $.tool.register({
      name: TOOL,
      description: DESCRIPTION,
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "The http(s) URL to open." },
        },
        required: ["url"],
      },
      isDeferred: false,
    });
    return started;
  });

  on("tool.call", { tool: `mcp__open-url__${TOOL}` }, async ($, e) => {
    const url = typeof e.url === "string" ? e.url.trim() : "";
    if (!HTTP_URL.test(url)) {
      return { result: `Not opened: only http(s) URLs are accepted: ${url}` };
    }
    if (opened.has(url)) {
      return { result: `Already opened in this session: ${url}` };
    }

    // 人が別のマシンから操作する環境では OPEN_URL_SSH_HOST にそのマシンを指定し、ssh して開く
    const sshHost = (await $.env.get("OPEN_URL_SSH_HOST"))?.trim();
    const argv = sshHost
      ? [
          "ssh",
          "-o",
          "BatchMode=yes",
          "-o",
          "ConnectTimeout=5",
          sshHost,
          `open ${shellQuote(url)}`,
        ]
      : ["open", url];

    const { exitCode, stderr } = await $.process.run(argv, {
      timeoutMs: 15000,
    });
    if (exitCode !== 0) {
      $.ui.toast(`open-url: failed to open ${url}`);
      return { result: `Failed to open (exit ${exitCode}): ${stderr.trim()}` };
    }

    opened.add(url);
    $.ui.toast(`opened ${url}`);
    return { result: `Opened in the person's browser: ${url}` };
  }).catch(($, e) => ({
    result: `Failed to open: the open-url hook threw for ${String(e.url)}`,
  }));
};
