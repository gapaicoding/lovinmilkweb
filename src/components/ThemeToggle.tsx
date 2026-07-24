import {
  useEffect,
  useState,
} from "react";
import {
  Check,
  Monitor,
  Moon,
  Sun,
} from "lucide-react";

import {
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Theme =
  | "light"
  | "dark"
  | "system";

type ResolvedTheme =
  | "light"
  | "dark";

const THEME_STORAGE_KEY =
  "lovin-milk-theme";

const THEME_OPTIONS: Array<{
  value: Theme;
  label: string;
  icon: typeof Sun;
}> = [
  {
    value: "light",
    label: "Terang",
    icon: Sun,
  },
  {
    value: "dark",
    label: "Gelap",
    icon: Moon,
  },
  {
    value: "system",
    label: "Ikuti Sistem",
    icon: Monitor,
  },
];

export function ThemeToggle() {
  const [theme, setThemeState] =
    useState<Theme>("system");

  const [
    resolvedTheme,
    setResolvedTheme,
  ] = useState<ResolvedTheme>(
    "light",
  );

  const [mounted, setMounted] =
    useState(false);

  useEffect(() => {
    const savedTheme =
      window.localStorage.getItem(
        THEME_STORAGE_KEY,
      );

    if (isTheme(savedTheme)) {
      setThemeState(savedTheme);
    }

    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    const mediaQuery =
      window.matchMedia(
        "(prefers-color-scheme: dark)",
      );

    const applyCurrentTheme = () => {
      const nextResolvedTheme =
        resolveTheme(
          theme,
          mediaQuery.matches,
        );

      applyThemeToDocument(
        nextResolvedTheme,
      );

      setResolvedTheme(
        nextResolvedTheme,
      );
    };

    applyCurrentTheme();

    if (theme !== "system") {
      return;
    }

    mediaQuery.addEventListener(
      "change",
      applyCurrentTheme,
    );

    return () => {
      mediaQuery.removeEventListener(
        "change",
        applyCurrentTheme,
      );
    };
  }, [mounted, theme]);

  const changeTheme = (
    nextTheme: Theme,
  ) => {
    setThemeState(nextTheme);

    window.localStorage.setItem(
      THEME_STORAGE_KEY,
      nextTheme,
    );
  };

  const CurrentIcon =
    theme === "system"
      ? Monitor
      : resolvedTheme === "dark"
        ? Moon
        : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          aria-label="Ubah tema tampilan"
          tooltip="Tema"
        >
          <CurrentIcon />

          <span>Tema</span>
        </SidebarMenuButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side="right"
        align="end"
        className="w-48"
      >
        <DropdownMenuLabel>
          Pilih Tampilan
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {THEME_OPTIONS.map(
          (option) => {
            const Icon =
              option.icon;

            return (
              <DropdownMenuItem
                key={option.value}
                onSelect={() =>
                  changeTheme(
                    option.value,
                  )
                }
              >
                <Icon className="mr-2 h-4 w-4" />

                <span className="flex-1">
                  {option.label}
                </span>

                {theme ===
                option.value ? (
                  <Check className="ml-2 h-4 w-4" />
                ) : null}
              </DropdownMenuItem>
            );
          },
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function resolveTheme(
  theme: Theme,
  systemDarkMode: boolean,
): ResolvedTheme {
  if (theme === "system") {
    return systemDarkMode
      ? "dark"
      : "light";
  }

  return theme;
}

function applyThemeToDocument(
  theme: ResolvedTheme,
) {
  const root =
    document.documentElement;

  root.classList.remove(
    "light",
    "dark",
  );

  root.classList.add(theme);

  root.style.colorScheme =
    theme;
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