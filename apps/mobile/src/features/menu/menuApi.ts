import type { MenuResponse } from '@intelligent-bistro/contracts';

import { getJson } from '@/src/lib/api';

export function fetchMenu() {
  return getJson<MenuResponse>('/api/menu');
}
