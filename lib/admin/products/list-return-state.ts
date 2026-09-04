export type ProductsListReturnState = {
  productId: string;
  searchQuery: string;
  viewMode: 'cards' | 'list';
  loadedCount: number;
};

const STORAGE_KEY = 'admin:products:returnState';

export function writeProductsListReturnState(state: ProductsListReturnState): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // sessionStorage unavailable (private mode etc.) — list just reloads from the top.
  }
}

export function consumeProductsListReturnState(): ProductsListReturnState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(STORAGE_KEY);
    return JSON.parse(raw) as ProductsListReturnState;
  } catch {
    return null;
  }
}
