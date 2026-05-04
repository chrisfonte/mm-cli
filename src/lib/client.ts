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

export interface MattermostPostRecord {
  id: string;
  root_id: string;
  channel_id: string;
  channel_name?: string;
  user_id: string;
  author_username?: string;
  create_at: number;
  update_at: number;
  message: string;
  fetched_at: number;
}

export interface MattermostDeleteResponse {
  id: string;
  delete_at?: number;
}

interface Team {
  id: string;
}

interface Channel {
  id: string;
  name?: string;
}

interface UserSummary {
  id: string;
  username: string;
}

interface PostsByOrderResponse {
  order?: string[];
  posts?: Record<string, MattermostPost>;
}

interface SearchChannelsResponse {
  channels?: Channel[];
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

  async getChannel(channelId: string): Promise<Channel> {
    return this.requestJson<Channel>(`/api/v4/channels/${channelId}`);
  }

  async getPost(postId: string): Promise<MattermostPost> {
    return this.requestJson<MattermostPost>(`/api/v4/posts/${postId}`);
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

    const teams = await this.requestJson<Team[]>("/api/v4/users/me/teams");
    if (teams.length === 0) {
      throw new Error(
        "API: No user teams available to resolve channel name. Try channel id.",
      );
    }

    const team = teams[0];
    if (!team) {
      throw new Error(
        "API: No user teams available to resolve channel name. Try channel id.",
      );
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

  private async getUsersByIds(
    userIds: string[],
  ): Promise<Record<string, UserSummary>> {
    if (userIds.length === 0) {
      return {};
    }

    const users = await this.requestJson<UserSummary[]>("/api/v4/users/ids", {
      method: "POST",
      body: JSON.stringify(userIds),
    });

    return Object.fromEntries(users.map((user) => [user.id, user]));
  }

  private async enrichPosts(
    posts: MattermostPost[],
  ): Promise<MattermostPostRecord[]> {
    const uniqueUserIds = [...new Set(posts.map((post) => post.user_id))];
    const uniqueChannelIds = [...new Set(posts.map((post) => post.channel_id))];
    const fetchedAt = Date.now();

    const [usersById, channels] = await Promise.all([
      this.getUsersByIds(uniqueUserIds),
      Promise.all(
        uniqueChannelIds.map((channelId) => this.getChannel(channelId)),
      ),
    ]);

    const channelsById = Object.fromEntries(
      channels.map((channel) => [channel.id, channel]),
    );

    return posts.map((post) => ({
      id: post.id,
      root_id: post.root_id && post.root_id.length > 0 ? post.root_id : post.id,
      channel_id: post.channel_id,
      channel_name: channelsById[post.channel_id]?.name,
      user_id: post.user_id,
      author_username: usersById[post.user_id]?.username,
      create_at: post.create_at,
      update_at: post.update_at ?? post.create_at,
      message: post.message,
      fetched_at: fetchedAt,
    }));
  }

  async getPostRecord(postId: string): Promise<MattermostPostRecord> {
    const post = await this.getPost(postId);
    const [record] = await this.enrichPosts([post]);
    if (!record) {
      throw new Error(`API: Post ${postId} was not returned by Mattermost.`);
    }

    return record;
  }

  async deletePost(postId: string): Promise<MattermostDeleteResponse> {
    const response = await this.requestAllow404(`/api/v4/posts/${postId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `API: ${response.status} ${response.statusText} ${body}`.trim(),
      );
    }

    const text = await response.text();
    if (!text) {
      return {
        id: postId,
      };
    }

    return JSON.parse(text) as MattermostDeleteResponse;
  }

  async readChannelPosts(
    channelId: string,
    since?: number,
    limit = 10,
  ): Promise<MattermostPostRecord[]> {
    const response = await this.requestJson<PostsByOrderResponse>(
      `/api/v4/channels/${channelId}/posts?page=0&per_page=${limit}`,
    );

    const order = response.order ?? [];
    const postsMap = response.posts ?? {};
    const posts = order
      .map((id) => postsMap[id])
      .filter((post): post is MattermostPost => Boolean(post));

    const filtered =
      typeof since === "number"
        ? posts.filter((post) => post.create_at > since)
        : posts;

    return this.enrichPosts(filtered);
  }

  async searchMentions(
    username: string,
    since?: number,
  ): Promise<MattermostPostRecord[]> {
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

    const filtered =
      typeof since === "number"
        ? posts.filter((post) => post.create_at > since)
        : posts;

    return this.enrichPosts(filtered);
  }
}
