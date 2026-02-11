import { useState, useEffect, useCallback } from 'react';

interface TerminalSettings {
  font: string;
  fontSize: number;
}

const STORAGE_KEY = 'terminal.settings';

const DEFAULT_SETTINGS: TerminalSettings = {
  font: 'JetBrainsMono Nerd Font',
  fontSize: 14,
};

function loadSettings(): TerminalSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_SETTINGS;
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<TerminalSettings>;
      return {
        font: parsed.font || DEFAULT_SETTINGS.font,
        fontSize: typeof parsed.fontSize === 'number' ? parsed.fontSize : DEFAULT_SETTINGS.fontSize,
      };
    }
  } catch {
    // Ignore parse errors
  }

  return DEFAULT_SETTINGS;
}

function saveSettings(settings: TerminalSettings): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors
  }
}

export const SUGGESTED_FONTS = [
  'JetBrainsMono Nerd Font',
  'FiraCode Nerd Font',
  'CaskaydiaCove Nerd Font',
  'Hack Nerd Font',
  'MesloLGS Nerd Font',
  'Custom',
];

export function useTerminalSettings() {
  const [settings, setSettingsState] = useState<TerminalSettings>(loadSettings);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const setFont = useCallback((font: string) => {
    setSettingsState((prev) => ({ ...prev, font }));
  }, []);

  const setFontSize = useCallback((fontSize: number) => {
    setSettingsState((prev) => ({ ...prev, fontSize }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettingsState(DEFAULT_SETTINGS);
  }, []);

  const isCustomFont = !SUGGESTED_FONTS.includes(settings.font);

  return {
    ...settings,
    setFont,
    setFontSize,
    resetSettings,
    isCustomFont,
  };
}

export function getTerminalFontFamily(preferredFont: string): string {
  return `"${preferredFont}", "JetBrainsMono Nerd Font", "FiraCode Nerd Font", "CaskaydiaCove Nerd Font", "Hack Nerd Font", "MesloLGS Nerd Font", monospace`;
}
