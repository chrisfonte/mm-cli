export interface JsonEnvelope<T> {
  schema_version: "1.0";
  command: string;
  data: T[];
  meta: Record<string, unknown>;
}

export function printJson<T>(
  command: string,
  data: T[],
  meta: Record<string, unknown> = {},
): JsonEnvelope<T> {
  const payload: JsonEnvelope<T> = {
    schema_version: "1.0",
    command,
    data,
    meta,
  };

  console.log(JSON.stringify(payload, null, 2));
  return payload;
}

export function printText(text: string): string {
  console.log(text);
  return text;
}
