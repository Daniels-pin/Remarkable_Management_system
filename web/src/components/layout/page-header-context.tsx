"use client";

import * as React from "react";

export type PageHeaderState = {
  title: string;
  subtitle?: string;
  headerActions?: React.ReactNode;
};

const DEFAULT_HEADER: PageHeaderState = { title: "" };

type PageHeaderContextValue = {
  header: PageHeaderState;
  setPageHeader: (header: PageHeaderState) => void;
};

const PageHeaderContext = React.createContext<PageHeaderContextValue | undefined>(
  undefined,
);

export function PageHeaderProvider({ children }: { children: React.ReactNode }) {
  const [header, setHeaderState] = React.useState<PageHeaderState>(DEFAULT_HEADER);

  const setPageHeader = React.useCallback((next: PageHeaderState) => {
    setHeaderState(next);
  }, []);

  const value = React.useMemo(
    () => ({ header, setPageHeader }),
    [header, setPageHeader],
  );

  return (
    <PageHeaderContext.Provider value={value}>{children}</PageHeaderContext.Provider>
  );
}

export function usePageHeaderContext() {
  const ctx = React.useContext(PageHeaderContext);
  if (!ctx) {
    throw new Error("usePageHeaderContext must be used within PageHeaderProvider");
  }
  return ctx;
}

/** Registers page title/subtitle with the shared operational shell. */
export function useOperationalPageHeader({
  title,
  subtitle,
  headerActions,
}: PageHeaderState) {
  const { setPageHeader } = usePageHeaderContext();

  React.useLayoutEffect(() => {
    setPageHeader({ title, subtitle, headerActions });
    return () => setPageHeader(DEFAULT_HEADER);
  }, [title, subtitle, headerActions, setPageHeader]);
}
