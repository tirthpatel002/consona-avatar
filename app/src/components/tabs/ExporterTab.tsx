import React, { useState, useMemo, useCallback } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Badge,
} from '@consona/interface';
import {
  renderAvatarToSvg,
  normalizeToCanvas,
  encodeAvatarConfig,
  type ConsonaAvatarConfig,
} from '@consona/avatar-enhanced';
import type { StudioTargetScope } from '../../types/studio';

export interface ExporterTabProps {
  scope?: StudioTargetScope;
  config: ConsonaAvatarConfig;
  mainConfig?: ConsonaAvatarConfig;
  smallConfig?: ConsonaAvatarConfig;
  microConfig?: ConsonaAvatarConfig;
}

export const ExporterTab: React.FC<ExporterTabProps> = ({
  scope = 'main',
  config,
}) => {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const stageSize = useMemo(() => {
    switch (scope) {
      case 'micro':
        return 40;
      case 'small':
        return 64;
      case 'main':
      case 'all':
      default:
        return 260;
    }
  }, [scope]);

  // Live Encoded Avatar Share Code
  const shareCode = useMemo(() => {
    try {
      return encodeAvatarConfig(config);
    } catch {
      return '';
    }
  }, [config]);

  // Live Compiled Standalone SVG String
  const svgExportCode = useMemo(() => {
    return renderAvatarToSvg(config, {
      size: stageSize,
      background: 'transparent',
      glow: config.behavior?.glow,
    });
  }, [config, stageSize]);

  // Copy Helper
  const copyText = useCallback((text: string, sectionKey: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopiedSection(sectionKey);
    setTimeout(() => {
      setCopiedSection((cur) => (cur === sectionKey ? null : cur));
    }, 2000);
  }, []);

  // Download SVG File
  const handleDownloadSvg = useCallback(() => {
    if (typeof window === 'undefined') return;
    const blob = new Blob([svgExportCode], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${config.seed || 'avatar'}-${scope}-${config.paletteId}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [svgExportCode, config.seed, config.paletteId, scope]);

  // Clean React Component Snippet
  const reactComponentSnippet = useMemo(() => {
    const isCustomized =
      config.head.roundness !== 0.85 ||
      config.eyes.spacing !== 0.5 ||
      config.eyes.tiltAngle !== 0 ||
      config.eyes.yOffset !== 0 ||
      config.eyes.xOffset !== 0 ||
      config.eyes.gazeExcursion !== 0.5 ||
      config.eyes.borderWidth ||
      config.eyes.pupilScale !== 0.48;

    const lean = {
      seed: config.seed,
      paletteId: config.paletteId,
      head: { shape: config.head.shape, surfaceShadow: Boolean(config.head.surfaceShadow) },
      eyes: { showPupil: Boolean(config.eyes.showPupil || config.eyes.pupil) },
      behavior: { preset: config.behavior?.preset ?? 'neutral', interactive: config.behavior?.interactive ?? true, autoBlink: config.behavior?.autoBlink !== false },
    };
    if (!isCustomized) {
      return `import { Avatar } from '@consona/avatar-enhanced';

<Avatar
  family="consona"
  config={${JSON.stringify(lean, null, 2).replace(/\n/g, '\n  ')}}
  size={${stageSize}}
/>`;
    }

    return `import { Avatar, decodeAvatarConfig } from '@consona/avatar-enhanced';

// Option A: Instant drop-in with encoded portable share code
<Avatar
  family="consona"
  config={decodeAvatarConfig('${shareCode}')}
  size={${stageSize}}
/>

// Option B: Direct Parametric Configuration Object
<Avatar
  family="consona"
  config={${JSON.stringify(config, null, 2)}}
  size={${stageSize}}
/>`;
  }, [config, stageSize, shareCode]);

  // Programmatic Behavior API Snippet
  const behaviorApiSnippet = `import { Avatar, useAvatarHandle } from '@consona/avatar-enhanced';

// One handle for every family (Consona SVG, Allie 3D):
function MyAssistantAvatar() {
  const avatar = useAvatarHandle();
  return (
    <>
      <Avatar
        ref={avatar.ref}
        family="consona"
        config={{ seed: '${config.seed}', paletteId: '${config.paletteId}' }}
        size={${stageSize}}
        onClick={(a) => a.play('jump')}
      />
      <button onClick={() => avatar.play('jump', { then: 'spin' })}>Jump</button>
      <button onClick={() => avatar.blink()}>Blink</button>
      <button onClick={() => avatar.setGazeTarget({ x: 0.5, y: 0 })}>Look right</button>
    </>
  );
}`;

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full">
      {/* Target Status Header Card */}
      <Card variant="default" padding="md" className="border-border/80 bg-surface/30 backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <span className="text-base font-bold text-fg">Avatar Integration & Code Exporter</span>
              <span className="text-xs text-muted-fg">
                Target: <span className="font-semibold text-fg uppercase">{scope}</span> ({stageSize}px) · Palette: <span className="font-semibold text-fg font-mono">{config.paletteId}</span> · Shape: <span className="font-semibold text-fg">{config.head.shape}</span>
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge intent="primary" size="sm" className="font-mono text-[11px]">
              {config.behavior?.preset ?? 'neutral'}
            </Badge>
            <Badge intent={config.behavior?.autoBlink !== false ? 'success' : 'outline'} size="sm" className="font-mono text-[11px]">
              Blink: {config.behavior?.autoBlink !== false ? 'ON' : 'OFF'}
            </Badge>
          </div>
        </div>
      </Card>

      {/* 1. Portable Avatar Share Code */}
      <Card variant="default" padding="lg" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-sm font-bold text-fg">Universal Avatar Share Code</span>
            <span className="text-xs text-muted-fg">
              Compact, lossless URL-safe Base64 representation. Usable in query params, databases, and config decoders.
            </span>
          </div>
          <Button
            size="sm"
            intent={copiedSection === 'shareCode' ? 'primary' : 'secondary'}
            onClick={() => copyText(shareCode, 'shareCode')}
          >
            {copiedSection === 'shareCode' ? 'Copied Code' : 'Copy Code'}
          </Button>
        </div>
        <div className="p-3.5 rounded-xl bg-surface/80 border border-border font-mono text-xs text-primary break-all select-all">
          {shareCode}
        </div>
      </Card>

      {/* 2. React Component Snippet */}
      <Card variant="default" padding="lg" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-sm font-bold text-fg">React Component Integration</span>
            <span className="text-xs text-muted-fg">
              Drop-in component usage from <code className="text-primary">@consona/avatar-enhanced</code>.
            </span>
          </div>
          <Button
            size="sm"
            intent={copiedSection === 'react' ? 'primary' : 'secondary'}
            onClick={() => copyText(reactComponentSnippet, 'react')}
          >
            {copiedSection === 'react' ? 'Copied JSX' : 'Copy JSX'}
          </Button>
        </div>
        <pre className="p-4 rounded-xl bg-surface/80 border border-border text-emerald-400 font-mono text-xs overflow-x-auto whitespace-pre leading-relaxed">
          {reactComponentSnippet}
        </pre>
      </Card>

      {/* 3. Programmatic Behaviors & Runtime Hook */}
      <Card variant="default" padding="lg" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-sm font-bold text-fg">Physical Micro-Behaviors & Runtime API</span>
            <span className="text-xs text-muted-fg">
              Trigger procedural animations, ballistic jumps, spins, nods, and spring gaze tracking via SDK.
            </span>
          </div>
          <Button
            size="sm"
            intent={copiedSection === 'behaviors' ? 'primary' : 'secondary'}
            onClick={() => copyText(behaviorApiSnippet, 'behaviors')}
          >
            {copiedSection === 'behaviors' ? 'Copied Snippet' : 'Copy Snippet'}
          </Button>
        </div>
        <pre className="p-4 rounded-xl bg-surface/80 border border-border text-sky-400 font-mono text-xs overflow-x-auto whitespace-pre leading-relaxed">
          {behaviorApiSnippet}
        </pre>
      </Card>

      {/* 4. Standalone Vector SVG Markup */}
      <Card variant="default" padding="lg" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-sm font-bold text-fg">Standalone Vector SVG Markup</span>
            <span className="text-xs text-muted-fg">
              Self-contained SVG with embedded geometry and theme variables. Ready for Figma, static assets, or emails.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              intent="secondary"
              onClick={handleDownloadSvg}
            >
              Download SVG
            </Button>
            <Button
              size="sm"
              intent={copiedSection === 'svg' ? 'primary' : 'secondary'}
              onClick={() => copyText(svgExportCode, 'svg')}
            >
              {copiedSection === 'svg' ? 'Copied SVG' : 'Copy SVG'}
            </Button>
          </div>
        </div>
        <textarea
          readOnly
          rows={6}
          value={svgExportCode}
          className="p-4 rounded-xl bg-surface/80 border border-border text-muted-fg font-mono text-xs outline-none resize-y"
        />
      </Card>
    </div>
  );
};

