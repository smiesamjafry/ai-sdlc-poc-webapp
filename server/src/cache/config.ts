// Cache TTLs in seconds. Override with env vars, e.g. CACHE_TTL_PRODUCT_S=1800.
const n = (name: string, def: number) => Number(process.env[name] ?? def);

export const TTL = {
  list: n("CACHE_TTL_LIST_S", 300),
  product: n("CACHE_TTL_PRODUCT_S", 600),
  categories: n("CACHE_TTL_CATEGORIES_S", 3600),
  search: n("CACHE_TTL_SEARCH_S", 120),
  dashboard: n("CACHE_TTL_DASHBOARD_S", 60),
};
