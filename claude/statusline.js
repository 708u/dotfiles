#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

async function main() {
  // Read input from stdin
  const input = await new Promise((resolve) => {
    let data = "";
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
  });

  const context = JSON.parse(input);
  const currentDir = context.workspace?.current_dir || process.cwd();
  const model = context.model?.display_name || "Unknown";
  const transcriptPath = context.transcript_path;

  // Get git branch using execFileSync (safer than execSync)
  let gitBranch = "";
  try {
    gitBranch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: currentDir,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    gitBranch = "";
  }

  // Calculate token usage from transcript
  let tokenCount = 0;
  let tokenRatio = 0;
  const COMPACTION_THRESHOLD = 160000; // 80% of 200K

  if (transcriptPath && fs.existsSync(transcriptPath)) {
    try {
      const content = fs.readFileSync(transcriptPath, "utf8");
      const lines = content.trim().split("\n");

      // Find the last assistant message with usage info
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const entry = JSON.parse(lines[i]);
          if (entry.message?.usage?.cache_read_input_tokens !== undefined) {
            // Calculate total tokens from the usage data
            const usage = entry.message.usage;
            tokenCount =
              (usage.input_tokens || 0) +
              (usage.output_tokens || 0) +
              (usage.cache_read_input_tokens || 0);
            break;
          }
        } catch {
          continue;
        }
      }

      tokenRatio = Math.min(
        100,
        Math.round((tokenCount / COMPACTION_THRESHOLD) * 100),
      );
    } catch {
      tokenCount = 0;
      tokenRatio = 0;
    }
  }

  // Format token count
  const formatTokens = (count) => {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    } else if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  };

  // Format directory
  const dir = path.basename(currentDir);
  const parent = path.basename(path.dirname(currentDir));
  const displayDir =
    parent !== "/" && parent !== "." ? `${parent}/${dir}` : dir;

  // Build output
  const parts = [displayDir];
  if (gitBranch) {
    parts.push(`git:${gitBranch}`);
  }
  parts.push(model);
  parts.push(`${formatTokens(tokenCount)} (${tokenRatio}%)`);

  console.log(parts.join(" | "));
}

main().catch(() => process.exit(1));
