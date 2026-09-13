import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { z } from "zod";
import { sourceDigest } from "../../core/src/integrity";
import { GitSchema } from "../../core/src/domain";
const sourcePath = "apps/demo-service/src/services/refund-service.ts";
export class GitHubAdapter {
  private async get(path: string) {
    const owner = process.env.GITHUB_OWNER,
      repo = process.env.GITHUB_REPO;
    if (!owner || !repo) throw new Error("GitHub repository is not configured");
    const r = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${path}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(process.env.GITHUB_TOKEN
            ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
            : {}),
        },
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!r.ok) throw new Error(`GitHub HTTP ${r.status}`);
    return r.json() as Promise<unknown>;
  }
  async getCommit(sha: string) {
    return z
      .object({ sha: z.string(), commit: z.object({ message: z.string() }) })
      .parse(await this.get(`commits/${encodeURIComponent(sha)}`));
  }
  async getFileAtRef(path: string, ref: string) {
    if (path !== sourcePath) throw new Error("Source path is not allowlisted");
    const file = z
      .object({ content: z.string(), encoding: z.literal("base64") })
      .parse(await this.get(`contents/${path}?ref=${encodeURIComponent(ref)}`));
    return Buffer.from(file.content, "base64").toString("utf8");
  }
  async getRelevantSource(input: { sha: string; file: string }) {
    return (await this.getFileAtRef(input.file, input.sha)).slice(0, 12000);
  }
}
export async function gitEvidence(local = false) {
  const root = process.env.RECUR_ROOT ?? process.cwd();
  if (
    !local &&
    process.env.GITHUB_OWNER &&
    process.env.GITHUB_REPO &&
    process.env.GITHUB_DEMO_COMMIT_SHA
  ) {
    const api = new GitHubAdapter();
    const c = await api.getCommit(process.env.GITHUB_DEMO_COMMIT_SHA);
    const source = await api.getFileAtRef(sourcePath, c.sha);
    const excerpt = source.slice(0, 12000);
    return GitSchema.parse({
      sourceDigest: sourceDigest(source),
      repository: `${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}`,
      commitSha: c.sha,
      relevantFiles: [sourcePath],
      source: "GitHub Live",
      excerpt,
    });
  }
  let sha = "uncommitted-local-source";
  try {
    sha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {}
  const source = await readFile(resolve(root, sourcePath), "utf8");
  const excerpt = source.slice(0, 12000);
  return GitSchema.parse({
    sourceDigest: sourceDigest(source),
    repository: "local/recur",
    commitSha: sha,
    relevantFiles: [sourcePath],
    source: "GitHub Fixture",
    excerpt,
  });
}
