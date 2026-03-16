const CHANNEL_ID_REGEX = /^[a-zA-Z0-9]{26}$/;
export class MattermostClient {
    serverUrl;
    token;
    fetchImpl;
    constructor(serverUrl, token, fetchImpl) {
        this.serverUrl = serverUrl;
        this.token = token;
        this.fetchImpl = fetchImpl ?? fetch;
    }
    async requestJson(path, init = {}) {
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
            throw new Error(`API: ${response.status} ${response.statusText} ${body}`.trim());
        }
        const text = await response.text();
        if (!text) {
            return {};
        }
        return JSON.parse(text);
    }
    async requestAllow404(path, init = {}) {
        return this.fetchImpl(`${this.serverUrl}${path}`, {
            ...init,
            headers: {
                Authorization: `Bearer ${this.token}`,
                "Content-Type": "application/json",
                ...(init.headers ?? {}),
            },
        });
    }
    async getCurrentUser() {
        return this.requestJson("/api/v4/users/me");
    }
    async getPost(postId) {
        return this.requestJson(`/api/v4/posts/${postId}`);
    }
    async createPost(channelId, message, rootId) {
        const payload = {
            channel_id: channelId,
            message,
        };
        if (rootId) {
            payload.root_id = rootId;
        }
        return this.requestJson("/api/v4/posts", {
            method: "POST",
            body: JSON.stringify(payload),
        });
    }
    async resolveChannelId(input) {
        if (CHANNEL_ID_REGEX.test(input)) {
            return input;
        }
        const teams = await this.requestJson("/api/v4/teams");
        if (teams.length === 0) {
            throw new Error("API: No teams available to resolve channel name.");
        }
        const team = teams[0];
        if (!team) {
            throw new Error("API: No teams available to resolve channel name.");
        }
        const teamId = team.id;
        const byNameResponse = await this.requestAllow404(`/api/v4/teams/${teamId}/channels/name/${encodeURIComponent(input)}`);
        if (byNameResponse.ok) {
            const channel = (await byNameResponse.json());
            return channel.id;
        }
        const search = await this.requestJson(`/api/v4/channels/search?term=${encodeURIComponent(input)}`, { method: "GET" });
        const first = search.channels?.[0];
        if (!first) {
            throw new Error(`USER: Unable to resolve channel '${input}'.`);
        }
        return first.id;
    }
    async readChannelPosts(channelId, since, limit = 10) {
        const response = await this.requestJson(`/api/v4/channels/${channelId}/posts?page=0&per_page=${limit}`);
        const order = response.order ?? [];
        const postsMap = response.posts ?? {};
        const posts = order
            .map((id) => postsMap[id])
            .filter((post) => Boolean(post));
        if (typeof since !== "number") {
            return posts;
        }
        return posts.filter((post) => post.create_at > since);
    }
    async searchMentions(username, since) {
        const response = await this.requestJson(`/api/v4/posts/search`, {
            method: "POST",
            body: JSON.stringify({
                terms: `@${username}`,
                is_or_search: false,
            }),
        });
        const order = response.order ?? [];
        const postsMap = response.posts ?? {};
        const posts = order
            .map((id) => postsMap[id])
            .filter((post) => Boolean(post));
        if (typeof since !== "number") {
            return posts;
        }
        return posts.filter((post) => post.create_at > since);
    }
}
