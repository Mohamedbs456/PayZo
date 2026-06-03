import { useColorScheme as useNativewindColorScheme } from "nativewind";
import { paletteFor, type Palette, type ThemeName } from "@/lib/tokens";

export function useColorScheme() {
  const { colorScheme, setColorScheme, toggleColorScheme } =
    useNativewindColorScheme();
  const scheme: ThemeName = colorScheme === "dark" ? "dark" : "light";
  const colors: Palette = paletteFor(scheme);
  return { scheme, colors, setColorScheme, toggleColorScheme };
}
