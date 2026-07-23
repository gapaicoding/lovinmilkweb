import {
  Check,
  Monitor,
  Moon,
  Sun,
} from "lucide-react";

import {
  useTheme,
  type Theme,
} from "@/components/ThemeProvider";
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
  const {
    theme,
    resolvedTheme,
    setTheme,
  } = useTheme();

  const CurrentIcon =
    resolvedTheme === "dark" ? Moon : Sun;

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
          Tampilan
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {THEME_OPTIONS.map((option) => {
          const Icon = option.icon;

          return (
            <DropdownMenuItem
              key={option.value}
              onClick={() =>
                setTheme(option.value)
              }
            >
              <Icon className="mr-2 h-4 w-4" />
              <span className="flex-1">
                {option.label}
              </span>

              {theme === option.value ? (
                <Check className="ml-2 h-4 w-4" />
              ) : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}