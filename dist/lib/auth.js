export async function loginAndGetToken(options) {
    const fetchImpl = options.fetchImpl ?? fetch;
    const response = await fetchImpl(`${options.serverUrl}/api/v4/users/login`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            login_id: options.email,
            password: options.password,
        }),
    });
    if (!response.ok) {
        throw new Error(`AUTH: Login failed with status ${response.status}.`);
    }
    const token = response.headers.get("Token") ?? response.headers.get("token");
    if (!token) {
        throw new Error("AUTH: Login response did not include a Token header.");
    }
    return token;
}
