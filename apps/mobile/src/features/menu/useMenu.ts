import type { MenuItem, MenuResponse } from '@intelligent-bistro/contracts';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { fetchMenu } from './menuApi';

type MenuState = {
  data?: MenuResponse;
  error?: string;
  isLoading: boolean;
};

export function useMenu() {
  const [state, setState] = useState<MenuState>({
    isLoading: true,
  });

  const loadMenu = useCallback(async () => {
    setState((currentState) => ({ ...currentState, error: undefined, isLoading: true }));

    try {
      const data = await fetchMenu();
      setState({ data, isLoading: false });
    } catch {
      setState({
        error: 'Menu is unavailable right now. Check that the API server is running.',
        isLoading: false,
      });
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const data = await fetchMenu();

        if (isMounted) {
          setState({ data, isLoading: false });
        }
      } catch {
        if (isMounted) {
          setState({
            error: 'Menu is unavailable right now. Check that the API server is running.',
            isLoading: false,
          });
        }
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, []);

  const itemsById = useMemo<Record<string, MenuItem>>(
    () =>
      Object.fromEntries((state.data?.items ?? []).map((item) => [item.id, item])) as Record<
        string,
        MenuItem
      >,
    [state.data?.items]
  );

  return {
    categories: state.data?.categories ?? [],
    error: state.error,
    isLoading: state.isLoading,
    items: state.data?.items ?? [],
    itemsById,
    refetch: loadMenu,
  };
}
