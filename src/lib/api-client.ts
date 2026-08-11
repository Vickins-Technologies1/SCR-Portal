export type JsonResponseLike = {
  ok: boolean;
  status: number;
  headers: Headers;
  text: () => Promise<string>;
};

export async function readResponseBody(response: JsonResponseLike): Promise<{ data: any; rawText: string; isJson: boolean }> {
  const contentType = response.headers.get("content-type") || "";
  const rawText = await response.text();
  const isJson = contentType.includes("application/json") || rawText.trim().startsWith("{") || rawText.trim().startsWith("[");

  if (!isJson) {
    return { data: null, rawText, isJson: false };
  }

  try {
    return { data: rawText ? JSON.parse(rawText) : {}, rawText, isJson: true };
  } catch {
    return { data: null, rawText, isJson: false };
  }
}

export async function readJsonResponse<T = any>(
  response: JsonResponseLike,
  fallbackMessage = "Unexpected server response."
): Promise<T & { success?: boolean; message?: string } | { success: false; message: string }> {
  const { data, rawText, isJson } = await readResponseBody(response);
  if (!isJson || data === null) {
    return {
      success: false,
      message: rawText.trim() || fallbackMessage,
    };
  }
  return data;
}

