import { getOctokit } from "./client.js";

export interface RepoDetails {
  fullName: string;
  description: string | null;
  htmlUrl: string;
  cloneUrl: string;
  sshUrl: string;
  isPrivate: boolean;
  defaultBranch: string;
  stars: number;
  forks: number;
  openIssuesCount: number;
  license: string | null;
  topics: string[];
  branches: string[];
  recentCommits?: Array<{
    sha: string;
    message: string;
    author: string;
    date: string;
  }>;
}

/**
 * Retrieves comprehensive details about a GitHub repository.
 */
export async function getRepoInfo(
  owner: string,
  repo: string,
  includeRecentCommits: boolean = true
): Promise<RepoDetails> {
  const octokit = getOctokit();

  const { data: repoData } = await octokit.rest.repos.get({ owner, repo });

  // List branches (limit to top 15)
  let branches: string[] = [];
  try {
    const { data: branchData } = await octokit.rest.repos.listBranches({
      owner,
      repo,
      per_page: 15,
    });
    branches = branchData.map((b) => b.name);
  } catch {
    branches = [repoData.default_branch];
  }

  // List recent commits on default branch
  let recentCommits: RepoDetails["recentCommits"] = [];
  if (includeRecentCommits) {
    try {
      const { data: commitsData } = await octokit.rest.repos.listCommits({
        owner,
        repo,
        sha: repoData.default_branch,
        per_page: 5,
      });
      recentCommits = commitsData.map((c) => ({
        sha: c.sha.slice(0, 7),
        message: c.commit.message.split("\n")[0] || "",
        author: c.commit.author?.name || c.author?.login || "Unknown",
        date: c.commit.author?.date || "",
      }));
    } catch {
      recentCommits = [];
    }
  }

  return {
    fullName: repoData.full_name,
    description: repoData.description,
    htmlUrl: repoData.html_url,
    cloneUrl: repoData.clone_url,
    sshUrl: repoData.ssh_url,
    isPrivate: repoData.private,
    defaultBranch: repoData.default_branch,
    stars: repoData.stargazers_count,
    forks: repoData.forks_count,
    openIssuesCount: repoData.open_issues_count,
    license: repoData.license?.name || null,
    topics: repoData.topics || [],
    branches,
    recentCommits,
  };
}

/**
 * Creates a new GitHub repository for the authenticated user or an organization.
 */
export async function createRepository(params: {
  name: string;
  description?: string;
  private?: boolean;
  autoInit?: boolean;
  org?: string;
  hasIssues?: boolean;
  hasWiki?: boolean;
}) {
  const octokit = getOctokit();
  const { name, description, private: isPrivate = true, autoInit = false, org, hasIssues = true, hasWiki = false } = params;

  if (org && org.trim() !== "") {
    const { data } = await octokit.rest.repos.createInOrg({
      org: org.trim(),
      name,
      description,
      private: isPrivate,
      auto_init: autoInit,
      has_issues: hasIssues,
      has_wiki: hasWiki,
    });
    return {
      name: data.name,
      fullName: data.full_name,
      htmlUrl: data.html_url,
      cloneUrl: data.clone_url,
      sshUrl: data.ssh_url,
      isPrivate: data.private,
      defaultBranch: data.default_branch,
    };
  } else {
    const { data } = await octokit.rest.repos.createForAuthenticatedUser({
      name,
      description,
      private: isPrivate,
      auto_init: autoInit,
      has_issues: hasIssues,
      has_wiki: hasWiki,
    });
    return {
      name: data.name,
      fullName: data.full_name,
      htmlUrl: data.html_url,
      cloneUrl: data.clone_url,
      sshUrl: data.ssh_url,
      isPrivate: data.private,
      defaultBranch: data.default_branch,
    };
  }
}

/**
 * Updates repository metadata (description, visibility, topics, etc.).
 */
export async function editRepository(params: {
  owner: string;
  repo: string;
  description?: string;
  homepage?: string;
  private?: boolean;
  topics?: string[];
  defaultBranch?: string;
  hasIssues?: boolean;
  hasWiki?: boolean;
}) {
  const octokit = getOctokit();
  const { owner, repo, description, homepage, private: isPrivate, topics, defaultBranch, hasIssues, hasWiki } = params;

  const updatePayload: Record<string, unknown> = { owner, repo };
  if (description !== undefined) updatePayload.description = description;
  if (homepage !== undefined) updatePayload.homepage = homepage;
  if (isPrivate !== undefined) updatePayload.private = isPrivate;
  if (defaultBranch !== undefined) updatePayload.default_branch = defaultBranch;
  if (hasIssues !== undefined) updatePayload.has_issues = hasIssues;
  if (hasWiki !== undefined) updatePayload.has_wiki = hasWiki;

  const { data } = await octokit.rest.repos.update(updatePayload as Parameters<typeof octokit.rest.repos.update>[0]);

  let updatedTopics = data.topics || [];
  if (topics && Array.isArray(topics)) {
    const { data: topicsData } = await octokit.rest.repos.replaceAllTopics({
      owner,
      repo,
      names: topics,
    });
    updatedTopics = topicsData.names;
  }

  return {
    fullName: data.full_name,
    description: data.description,
    homepage: data.homepage,
    isPrivate: data.private,
    defaultBranch: data.default_branch,
    topics: updatedTopics,
    htmlUrl: data.html_url,
  };
}

/**
 * Lists repositories accessible to the authenticated user.
 */
export async function listUserRepos(options: {
  type?: "all" | "owner" | "public" | "private" | "member";
  sort?: "created" | "updated" | "pushed" | "full_name";
  direction?: "asc" | "desc";
  perPage?: number;
} = {}) {
  const octokit = getOctokit();
  const { type = "owner", sort = "updated", direction = "desc", perPage = 20 } = options;

  const { data } = await octokit.rest.repos.listForAuthenticatedUser({
    type,
    sort,
    direction,
    per_page: Math.min(perPage, 100),
  });

  return data.map((r) => ({
    name: r.name,
    fullName: r.full_name,
    description: r.description,
    isPrivate: r.private,
    htmlUrl: r.html_url,
    defaultBranch: r.default_branch,
    updatedAt: r.updated_at,
  }));
}

/**
 * Manages GitHub issues (create, list, get, close, comment).
 */
export async function manageIssue(params: {
  action: "list" | "get" | "create" | "close" | "comment";
  owner: string;
  repo: string;
  issueNumber?: number;
  title?: string;
  body?: string;
  state?: "open" | "closed" | "all";
  labels?: string[];
}) {
  const octokit = getOctokit();
  const { action, owner, repo, issueNumber, title, body, state = "open", labels } = params;

  switch (action) {
    case "list": {
      const { data } = await octokit.rest.issues.listForRepo({
        owner,
        repo,
        state,
        labels: labels ? labels.join(",") : undefined,
        per_page: 25,
      });
      return data.map((i) => ({
        number: i.number,
        title: i.title,
        state: i.state,
        user: i.user?.login,
        commentsCount: i.comments,
        labels: i.labels.map((l) => (typeof l === "string" ? l : l.name || "")),
        htmlUrl: i.html_url,
        createdAt: i.created_at,
      }));
    }

    case "get": {
      if (!issueNumber) throw new Error("issueNumber is required for 'get' action");
      const { data } = await octokit.rest.issues.get({ owner, repo, issue_number: issueNumber });
      return {
        number: data.number,
        title: data.title,
        body: data.body,
        state: data.state,
        user: data.user?.login,
        labels: data.labels.map((l) => (typeof l === "string" ? l : l.name || "")),
        commentsCount: data.comments,
        htmlUrl: data.html_url,
        createdAt: data.created_at,
      };
    }

    case "create": {
      if (!title) throw new Error("title is required for 'create' action");
      const { data } = await octokit.rest.issues.create({
        owner,
        repo,
        title,
        body,
        labels,
      });
      return {
        action: "created",
        number: data.number,
        title: data.title,
        htmlUrl: data.html_url,
        state: data.state,
      };
    }

    case "close": {
      if (!issueNumber) throw new Error("issueNumber is required for 'close' action");
      const { data } = await octokit.rest.issues.update({
        owner,
        repo,
        issue_number: issueNumber,
        state: "closed",
      });
      return {
        action: "closed",
        number: data.number,
        title: data.title,
        htmlUrl: data.html_url,
        state: data.state,
      };
    }

    case "comment": {
      if (!issueNumber) throw new Error("issueNumber is required for 'comment' action");
      if (!body) throw new Error("body is required for 'comment' action");
      const { data } = await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body,
      });
      return {
        action: "commented",
        commentId: data.id,
        htmlUrl: data.html_url,
        createdAt: data.created_at,
      };
    }
  }
}

/**
 * Creates a pull request on GitHub.
 */
export async function createPullRequest(params: {
  owner: string;
  repo: string;
  title: string;
  head: string;
  base?: string;
  body?: string;
  draft?: boolean;
}) {
  const octokit = getOctokit();
  const { owner, repo, title, head, base = "main", body = "", draft = false } = params;

  const { data } = await octokit.rest.pulls.create({
    owner,
    repo,
    title,
    head,
    base,
    body,
    draft,
  });

  return {
    number: data.number,
    title: data.title,
    state: data.state,
    htmlUrl: data.html_url,
    diffUrl: data.diff_url,
    head: data.head.ref,
    base: data.base.ref,
    draft: data.draft,
  };
}

/**
 * Creates a new branch from a source branch.
 */
export async function createBranch(params: {
  owner: string;
  repo: string;
  newBranch: string;
  fromBranch?: string;
}) {
  const octokit = getOctokit();
  const { owner, repo, newBranch, fromBranch } = params;

  // Resolve source branch name (or repo default branch if unspecified)
  let sourceBranch = fromBranch;
  if (!sourceBranch) {
    const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
    sourceBranch = repoData.default_branch;
  }

  // Get SHA of source branch
  const { data: refData } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${sourceBranch}`,
  });
  const sourceSha = refData.object.sha;

  // Create new branch ref
  const { data: newRef } = await octokit.rest.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${newBranch}`,
    sha: sourceSha,
  });

  return {
    ref: newRef.ref,
    branchName: newBranch,
    createdFrom: sourceBranch,
    commitSha: sourceSha,
  };
}

/**
 * Commits a file (create or update) directly to a GitHub branch.
 */
export async function commitFileToGitHub(params: {
  owner: string;
  repo: string;
  path: string;
  content: string;
  message: string;
  branch?: string;
}) {
  const octokit = getOctokit();
  const { owner, repo, path: filePath, content, message, branch = "main" } = params;

  // Check if file exists to get current blob SHA
  let existingSha: string | undefined;
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: filePath,
      ref: branch,
    });
    if (!Array.isArray(data) && "sha" in data) {
      existingSha = data.sha;
    }
  } catch {
    // 404 means creating a new file
    existingSha = undefined;
  }

  const base64Content = Buffer.from(content, "utf8").toString("base64");

  const { data } = await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: filePath,
    message,
    content: base64Content,
    branch,
    sha: existingSha,
  });

  return {
    action: existingSha ? "updated" : "created",
    path: filePath,
    commitSha: data.commit.sha,
    htmlUrl: data.commit.html_url,
    branch,
  };
}
