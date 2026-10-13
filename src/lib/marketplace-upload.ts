export function marketplaceFileKey(file: Pick<File, "name" | "size" | "lastModified" | "type">): string {
  return `${file.name}:${file.size}:${file.lastModified}:${file.type}`;
}

export async function uploadMarketplaceFiles(
  files: File[],
  alreadyUploaded: Record<string, string>,
  uploadFile: (file: File, onProgress: (percentage: number) => void) => Promise<string>,
  onProgress: (file: File, index: number, total: number, percentage?: number) => void,
  onUploaded: (key: string, url: string) => void,
): Promise<string[]> {
  const completed = { ...alreadyUploaded };
  for (const file of files) {
    const key = marketplaceFileKey(file);
    if (completed[key]) continue;
    const index = Object.keys(completed).length + 1;
    onProgress(file, index, files.length);
    try {
      const url = await uploadFile(file, (percentage) => onProgress(file, index, files.length, percentage));
      completed[key] = url;
      onUploaded(key, url);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "network error";
      throw new Error(`${file.name}: upload failed (${detail}). Check your connection and retry; completed images are kept.`);
    }
  }
  return files.map((file) => completed[marketplaceFileKey(file)]).filter(Boolean);
}
