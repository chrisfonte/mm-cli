export function printJson(command, data, meta = {}) {
    const payload = {
        schema_version: "1.0",
        command,
        data,
        meta,
    };
    console.log(JSON.stringify(payload, null, 2));
    return payload;
}
export function printText(text) {
    console.log(text);
    return text;
}
