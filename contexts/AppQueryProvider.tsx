import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const defaultOptions = {
  queries: {
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  },
};

export function AppQueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions }));
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
