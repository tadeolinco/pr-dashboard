import { parseFiltersFromSearch, type DashboardFilters } from "@/lib/filters";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
  type MouseEvent,
  type ReactNode,
} from "react";

type NavigationContextValue = {
  navigate: (href: string) => void;
  filters: DashboardFilters;
};

const NavigationContext = createContext<NavigationContextValue | null>(null);

function currentSearch() {
  return window.location.search;
}

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [search, setSearch] = useState(currentSearch);
  const filters = useMemo(() => parseFiltersFromSearch(search), [search]);

  const navigate = useCallback((href: string) => {
    window.history.pushState(null, "", href);
    setSearch(window.location.search);
  }, []);

  useEffect(() => {
    function onPopState() {
      setSearch(window.location.search);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const value = useMemo(() => ({ navigate, filters }), [navigate, filters]);

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const value = useContext(NavigationContext);
  if (!value) {
    throw new Error("useNavigation must be used within NavigationProvider");
  }
  return value;
}

function isExternalHref(href: string) {
  return /^https?:/i.test(href);
}

function isInternalHref(href: string) {
  return href === "/" || href.startsWith("/?");
}

function isModifiedClick(event: MouseEvent<HTMLAnchorElement>) {
  return (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}

export function AppLink({
  href,
  onClick,
  ...props
}: ComponentProps<"a"> & { href: string }) {
  const { navigate } = useNavigation();

  if (isExternalHref(href)) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={onClick}
        {...props}
      />
    );
  }

  return (
    <a
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || isModifiedClick(event)) return;
        if (!isInternalHref(href)) return;
        event.preventDefault();
        navigate(href);
      }}
      {...props}
    />
  );
}
