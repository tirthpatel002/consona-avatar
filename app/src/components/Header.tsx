import React from 'react';
import { Button, Badge, useTheme } from '@consona/interface';

interface HeaderProps {
  onTriggerBlink: () => void;
  onRandomizeSeed: () => void;
  /** Family / app tabs (a TabList inside the app's Tabs). */
  tabs?: React.ReactNode;
}

const SunIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2" />
    <path d="M12 20v2" />
    <path d="m4.93 4.93 1.41 1.41" />
    <path d="m17.66 17.66 1.41 1.41" />
    <path d="M2 12h2" />
    <path d="M20 12h2" />
    <path d="m6.34 17.66-1.41 1.41" />
    <path d="m19.07 4.93-1.41 1.41" />
  </svg>
);

const MoonIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </svg>
);

const BoltIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
  </svg>
);

const SparklesIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    <path d="M5 3v4" />
    <path d="M3 5h4" />
    <path d="M19 17v4" />
    <path d="M17 19h4" />
  </svg>
);

export const Header: React.FC<HeaderProps> = ({
  onTriggerBlink,
  onRandomizeSeed,
  tabs,
}) => {
  const { resolvedMode, setMode } = useTheme();

  const toggleTheme = () => {
    setMode(resolvedMode === 'light' ? 'dark' : 'light');
  };

  return (
    <header className="sticky top-0 z-50 h-14 border-b border-border/70 bg-bg/85 backdrop-blur-xl px-4 sm:px-6 flex items-center justify-between gap-3 min-w-0">
      <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
        <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-macro bg-primary/15 border border-primary/30 flex items-center justify-center text-primary font-bold text-sm shadow-inner shrink-0">
          C
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <span className="font-semibold text-sm sm:text-base tracking-tight text-fg truncate">
              Consona Avatar
            </span>
            <Badge intent="primary" size="sm" className="hidden sm:inline-flex">
              Consona
            </Badge>
            <Badge intent="secondary" size="sm" className="hidden sm:inline-flex">
              Allie
            </Badge>
            <Badge intent="outline" size="sm" className="hidden md:inline-flex">
              v2.0
            </Badge>
          </div>
          <p className="hidden 2xl:block text-xs text-muted-fg truncate">
            Consona parametric eyes · Allie 3D avatar studio
          </p>
        </div>
      </div>

      {tabs && <nav className="flex-1 min-w-0 flex justify-center overflow-x-auto">{tabs}</nav>}

      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        {/* Consona Interface Theme Mode Toggle */}
        <Button
          size="sm"
          intent="outline"
          onClick={toggleTheme}
          className="flex items-center gap-1.5 px-2.5 sm:px-3 font-medium transition-all hover:border-primary/50"
          aria-label={`Switch to ${resolvedMode === 'light' ? 'dark' : 'light'} UI theme`}
        >
          {resolvedMode === 'light' ? (
            <>
              <SunIcon className="size-4 text-amber-500 shrink-0" />
              <span className="hidden sm:inline">Light UI</span>
            </>
          ) : (
            <>
              <MoonIcon className="size-4 text-sky-400 shrink-0" />
              <span className="hidden sm:inline">Dark UI</span>
            </>
          )}
        </Button>

        <Button
          size="sm"
          intent="secondary"
          onClick={onTriggerBlink}
          className="flex items-center gap-1.5 px-2.5 sm:px-3"
          aria-label="Trigger Blink"
        >
          <BoltIcon className="size-4 text-amber-400 shrink-0" />
          <span className="hidden md:inline">Trigger Blink</span>
          <span className="hidden sm:inline md:hidden">Blink</span>
        </Button>

        <Button
          size="sm"
          intent="primary"
          onClick={onRandomizeSeed}
          className="flex items-center gap-1.5 px-2.5 sm:px-3"
          aria-label="Randomize Seed"
        >
          <SparklesIcon className="size-4 shrink-0" />
          <span className="hidden md:inline">Randomize Seed</span>
          <span className="hidden sm:inline md:hidden">Randomize</span>
        </Button>
      </div>
    </header>
  );
};

