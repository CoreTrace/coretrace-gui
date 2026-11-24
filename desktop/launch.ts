export function isLocalSource(path: string): boolean {
  return /\.(c|cc|cpp|cxx|c\+\+|h|hh|hpp|hxx)$/i.test(path);
}

export function downloadSize(bytes: number): string {
  return `${Math.ceil(bytes / 1_000_000).toLocaleString("fr-FR")} Mo`;
}
