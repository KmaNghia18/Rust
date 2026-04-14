"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "#252840",
            color: "#dcdbf0",
            border: "1px solid #2e3150",
            borderRadius: "8px",
            fontSize: "14px",
          },
          success: { iconTheme: { primary: "#57f287", secondary: "#252840" } },
          error:   { iconTheme: { primary: "#ed4245", secondary: "#252840" } },
        }}
      />
    </QueryClientProvider>
  );
}
