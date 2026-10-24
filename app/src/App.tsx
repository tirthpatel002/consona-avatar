import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Tabs, TabList, Tab, TabPanel, useTheme } from '@consona/interface';
import { ConsonaAvatarProvider } from '@consona/avatar-enhanced';
import { listAvatarStudios, type AvatarStudioConfigSource } from '@consona/avatar-enhanced/core/index.ts';
import { Header } from './components/Header';
import { ExporterTab } from './components/tabs/ExporterTab';
import { AvatarStudio } from './studio/AvatarStudio';
import './studio/installAvatarPackages';
import { useStudioState } from './hooks/useStudioState';
import type { StudioTargetScope } from './types/studio';

export const App: React.FC = () => {
  const { resolvedMode } = useTheme();
  // one studio tab per registered manifest (Consona, Allie …)
  const studios = useMemo(() => listAvatarStudios(), []);
  const firstTab = studios[0]?.id ?? 'code';
  const [activeTab, setActiveTab] = useState<string>(firstTab);
  // 3D tabs stay mounted once visited (no renderer / rig / shader rebuild on every switch)
  const [visited, setVisited] = useState<Set<string>>(() => new Set([firstTab]));

  // header blink → the active studio (falls back to the config studio's stateless blink, e.g. on the Code tab)
  const blinkers = useRef(new Map<string, () => void>());
  const registerBlink = useCallback(
    (id: string) => (trigger: (() => void) | null) => {
      if (trigger) blinkers.current.set(id, trigger);
      else blinkers.current.delete(id);
    },
    [],
  );
  const blinkRegistrars = useMemo(() => Object.fromEntries(studios.map((s) => [s.id, registerBlink(s.id)])), [studios, registerBlink]);
  const triggerBlink = useCallback(() => {
    const own = blinkers.current.get(activeTab);
    if (own) return own();
    const fallback = studios.find((s) => s.source.kind === 'config' && (s.source as AvatarStudioConfigSource<unknown>).blink);
    (fallback?.source as AvatarStudioConfigSource<unknown> | undefined)?.blink?.(`${fallback!.id}-studio-stage`);
  }, [activeTab, studios]);

  // Consona size targets with localStorage persistence & reset capabilities
  const {
    scope,
    setScope,
    mainAvatarConfig,
    smallAvatarConfig,
    microAvatarConfig,
    updateParam,
    updateFullConfig,
    resetActive,
    resetAll,
  } = useStudioState();

  const activeConfig = useMemo(() => {
    switch (scope) {
      case 'micro':
        return microAvatarConfig;
      case 'small':
        return smallAvatarConfig;
      case 'main':
      case 'all':
      default:
        return mainAvatarConfig;
    }
  }, [scope, mainAvatarConfig, smallAvatarConfig, microAvatarConfig]);

  const consonaBinding = {
    value: activeConfig,
    onChange: updateFullConfig,
    sizes: {
      active: scope,
      select: (id: string) => setScope(id as StudioTargetScope),
      values: { main: mainAvatarConfig, small: smallAvatarConfig, micro: microAvatarConfig, all: mainAvatarConfig },
      onReset: resetActive,
      onResetAll: resetAll,
    },
  };

  return (
    <ConsonaAvatarProvider globalMode={resolvedMode}>
      {/* Tabs wrap the header (family tabs live in it) and the studio panels */}
      <Tabs
        defaultSelectedKey={firstTab}
        onSelectionChange={(key) => {
          setActiveTab(String(key));
          setVisited((v) => (v.has(String(key)) ? v : new Set(v).add(String(key))));
        }}
        className="min-h-screen flex flex-col bg-bg text-fg"
      >
        <Header
          onTriggerBlink={triggerBlink}
          onRandomizeSeed={() => updateParam('seed', `avatar-${Math.random().toString(36).substring(2, 7)}`)}
          tabs={
            <TabList aria-label="Avatar families" className="mb-0">
              {studios.flatMap((s) => [
                <Tab key={s.id} id={s.id}>
                  {s.label}
                </Tab>,
                // the exporter belongs to the config studio (Consona) and sits right after it
                ...(s.source.kind === 'config' ? [<Tab key="code" id="code">Code & Exporter</Tab>] : []),
              ])}
            </TabList>
          }
        />

        <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
            {studios.flatMap((s) => {
              const config = s.source.kind === 'config';
              const panel = config ? (
                <TabPanel key={s.id} id={s.id}>
                  <AvatarStudio manifest={s} config={consonaBinding} onRegisterBlink={blinkRegistrars[s.id]} />
                </TabPanel>
              ) : (
                // runtime (3D) studios: mounted once visited, hidden (paused) when inactive
                <TabPanel key={s.id} id={s.id} shouldForceMount={visited.has(s.id)}>
                  <div hidden={activeTab !== s.id}>
                    <AvatarStudio manifest={s} onRegisterBlink={blinkRegistrars[s.id]} />
                  </div>
                </TabPanel>
              );
              return config
                ? [
                    panel,
                    <TabPanel key="code" id="code">
                      <ExporterTab scope={scope} config={activeConfig} mainConfig={mainAvatarConfig} smallConfig={smallAvatarConfig} microConfig={microAvatarConfig} />
                    </TabPanel>,
                  ]
                : [panel];
            })}
        </main>
      </Tabs>
    </ConsonaAvatarProvider>
  );
};
