export const LIBRARY_KEY = 'toy2game-library-v1';

export type Library = {
  favorites: string[];
  recent: { id: string; playedAt: number }[];
};

export function readLibrary(): Library {
  try {
    const data = JSON.parse(localStorage.getItem(LIBRARY_KEY) ?? '{}');
    return {
      favorites: Array.isArray(data?.favorites)
        ? [...new Set<string>(data.favorites.filter((id: unknown) => typeof id === 'string'))]
        : [],
      recent: Array.isArray(data?.recent)
        ? data.recent.filter((entry: Library['recent'][number]) =>
          typeof entry?.id === 'string' && Number.isFinite(entry?.playedAt)).slice(0, 24)
        : [],
    };
  } catch {
    return { favorites: [], recent: [] };
  }
}

export function writeLibrary(library: Library): boolean {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
    return true;
  } catch {
    return false;
  }
}

export function recordVisit(_id: string) { /* Visits belong to Fufu's learner game directory. */ }

export function libraryUrl(_base: string) { return '/#arcade'; }
