import type { FetchLike } from "./auth.js";

const CHANNEL_ID_REGEX = /^[a-zA-Z0-9]{26}$/;

export interface MattermostPost {
  id: string;
  create_at: number;
  update_at?: number;
  delete_at?: number;
  user_id: string;
  channel_id: string;
  root_id?: string;
  message: string;
}

interface Team {
  id: string;
}

interface Channel {
  id: string;
  name?: string;
}

interface PostsByOrderResponse {
  order?: string[];
  posts?: Record<string, MattermostPost>;
}

interface SearchChannelsResponse {
  channels?: Channel[];
}

interface PostByIdResponse {
  id: string;
  channel_id: string;
}

export class MattermostClient {
  private readonly serverUrl: string;

  private readonly token: string;

  private readonly fetchImpl: FetchLike;

  constructor(serverUrl: string, token: string, fetchImpl?: FetchLike) {
    this.serverUrl = serverUrl;
    this.token = token;
    this.fetchImpl = fetchImpl ?? fetch;
  }

  private async requestJson<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const response = await this.fetchImpl(`${this.serverUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `API: ${response.status} ${response.statusText} ${body}`.trim(),
      );
    }

    const text = await response.text();
    if (!text) {
      return {} as T;
    }

    return JSON.parse(text) as T;
  }

  private async requestAllow404(
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    return this.fetchImpl(`${this.serverUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
  }

  async getCurrentUser(): Promise<{ id: string; username: string }> {
    return this.requestJson<{ id: string; username: string }>(
      "/api/v4/users/me",
    );
  }

  async getPost(postId: string): Promise<PostByIdResponse> {
    return this.requestJson<PostByIdResponse>(`/api/v4/posts/${postId}`);
  }

  async createPost(
    channelId: string,
    message: string,
    rootId?: string,
  ): Promise<MattermostPost> {
    const payload: { channel_id: string; message: string; root_id?: string } = {
      channel_id: channelId,
      message,
    };

    if (rootId) {
      payload.root_id = rootId;
    }

    return this.requestJson<MattermostPost>("/api/v4/posts", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async resolveChannelId(input: string): Promise<string> {
    if (CHANNEL_ID_REGEX.test(input)) {
      return input;
    }

    const teams = await this.requestJson<Team[]>("/api/v4/teams");
    if (teams.length === 0) {
      throw new Error("API: No teams available to resolve channel name.");
    }

    const team = teams[0];
    if (!team) {
      throw new Error("API: No teams available to resolve channel name.");
    }

    const teamId = team.id;
    const byNameResponse = await this.requestAllow404(
      `/api/v4/teams/${teamId}/channels/name/${encodeURIComponent(input)}`,
    );

    if (byNameResponse.ok) {
      const channel = (await byNameResponse.json()) as Channel;
      return channel.id;
    }

    const search = await this.requestJson<SearchChannelsResponse>(
      `/api/v4/channels/search?term=${encodeURIComponent(input)}`,
      { method: "GET" },
    );

    const first = search.channels?.[0];
    if (!first) {
      throw new Error(`USER: Unable to resolve channel '${input}'.`);
    }

    return first.id;
  }

  async readChannelPosts(
    channelId: string,
    since?: number,
    limit = 10,
  ): Promise<MattermostPost[]> {
    const response = await this.requestJson<PostsByOrderResponse>(
      `/api/v4/channels/${channelId}/posts?page=0&per_page=${limit}`,
    );

    const order = response.order ?? [];
    const postsMap = response.posts ?? {};
    const posts = order
      .map((id) => postsMap[id])
      .filter((post): post is MattermostPost => Boolean(post));

    if (typeof since !== "number") {
      return posts;
    }

    return posts.filter((post) => post.create_at > since);
  }

  async searchMentions(
    username: string,
    since?: number,
  ): Promise<MattermostPost[]> {
    const response = await this.requestJson<PostsByOrderResponse>(
      `/api/v4/posts/search`,
      {
        method: "POST",
        body: JSON.stringify({
          terms: `@${username}`,
          is_or_search: false,
        }),
      },
    );

    const order = response.order ?? [];
    const postsMap = response.posts ?? {};
    const posts = order
      .map((id) => postsMap[id])
      .filter((post): post is MattermostPost => Boolean(post));

    if (typeof since !== "number") {
      return posts;
    }

    return posts.filter((post) => post.create_at > since);
  }
}
