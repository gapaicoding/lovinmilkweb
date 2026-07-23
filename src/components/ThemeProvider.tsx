import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

interface ThemeProviderContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}

const ThemeProviderContext =
  createContext<ThemeProviderContextValue | null>(null);

export const THEME_STORAGE_KEY = "lovin-milk-theme";

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = THEME_STORAGE_KEY,
}: ThemeProviderProps) {
  const [theme, setThemeState] =
    useState<Theme>(defaultTheme);
  const [resolvedTheme, setResolvedTheme] =
    useState<ResolvedTheme>("light");

  useEffect(() => {
    const storedTheme =
      window.localStorage.getItem(storageKey);

    if (isTheme(storedTheme)) {
      setThemeState(storedTheme);
    }
  }, [storageKey]);

  useEffect(() => {
    const mediaQuery = window.matchMedia(
      "(prefers-color-scheme: dark)",
    );

    const applyTheme = () => {
      const nextResolvedTheme: ResolvedTheme =
        theme === "system"
          ? mediaQuery.matches
            ? "dark"
            : "light"
          : theme;

      const root = document.documentElement;

      root.classList.remove("light", "dark");
      root.classList.add(nextResolvedTheme);
      root.style.colorScheme = nextResolvedTheme;

      setResolvedTheme(nextResolvedTheme);
    };

    applyTheme();

    if (theme !== "system") {
      return;
    }

    mediaQuery.addEventListener("change", applyTheme);

    return () => {
      mediaQuery.removeEventListener(
        "change",
        applyTheme,
      );
    };
  }, [theme]);

  const setTheme = (nextTheme: Theme) => {
    setThemeState(nextTheme);
    window.localStorage.setItem(
      storageKey,
      nextTheme,
    );
  };

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
    }),
    [theme, resolvedTheme],
  );

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export function useTheme(): ThemeProviderContextValue {
  const context = useContext(
    ThemeProviderContext,
  );

  if (!context) {
    throw new Error(
      "useTheme harus digunakan di dalam ThemeProvider.",
    );
  }

  return context;
}

function isTheme(
  value: string | null,
): value is Theme {
  return (
    value === "light" ||
    value === "dark" ||
    value === "system"
  );
}