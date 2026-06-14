import React from 'react';

type GptImage2ParamPanelProps = {
  format: 'jpeg' | 'png' | 'webp';
  moderation: 'auto' | 'low';
  quality: 'auto' | 'high' | 'low' | 'medium';
  ratio: string;
  ratios: string[];
  size: string;
  sizes: string[];
  onChangeFormat: (value: 'jpeg' | 'png' | 'webp') => void;
  onChangeModeration: (value: 'auto' | 'low') => void;
  onChangeQuality: (value: 'auto' | 'high' | 'low' | 'medium') => void;
  onChangeRatio: (value: string) => void;
  onChangeSize: (value: string) => void;
};

const PANEL_RATIO_ORDER = ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '21:9'];
const QUALITY_OPTIONS = ['auto', 'low', 'medium', 'high'] as const;
const FORMAT_OPTIONS = ['png', 'jpeg', 'webp'] as const;
const MODERATION_OPTIONS = ['auto', 'low'] as const;

const sectionLabelStyle: React.CSSProperties = {
  color: 'rgba(255,255,255,0.72)',
  fontSize: 14,
  fontWeight: 700,
};

const labelize = (value: string) => String(value || '').trim().toUpperCase();
const moderationLabel = (value: 'auto' | 'low') => `${value.toUpperCase()} MODERATION`;

const ratioPreviewStyle = (ratioValue: string, active: boolean): React.CSSProperties => {
  const [rw, rh] = ratioValue.split(':').map((part) => Math.max(1, Number(part) || 1));
  const wide = rw >= rh;
  const maxW = wide ? 28 : 18;
  const maxH = wide ? 18 : 28;
  const scale = Math.min(maxW / rw, maxH / rh);
  return {
    width: Math.max(8, rw * scale),
    height: Math.max(8, rh * scale),
    borderRadius: 4,
    border: active ? '1.6px solid rgba(255,255,255,0.96)' : '1.6px solid rgba(255,255,255,0.38)',
    background: active ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.03)',
    boxShadow: active ? '0 0 10px rgba(255,255,255,0.12)' : 'none',
  };
};

const segmentedRailStyle: React.CSSProperties = {
  display: 'grid',
  gap: 6,
  padding: 4,
  borderRadius: 20,
  background: 'rgba(255,255,255,0.045)',
  border: '1px solid rgba(255,255,255,0.05)',
};

const chipStyle = (active: boolean): React.CSSProperties => ({
  height: 44,
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,0.06)',
  background: active ? 'rgba(255,255,255,0.11)' : 'transparent',
  color: active ? '#f8fafc' : 'rgba(255,255,255,0.62)',
  fontSize: 14,
  fontWeight: active ? 800 : 700,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
});

export function GptImage2ParamPanel({
  format,
  moderation,
  quality,
  ratio,
  ratios,
  size,
  sizes,
  onChangeFormat,
  onChangeModeration,
  onChangeQuality,
  onChangeRatio,
  onChangeSize,
}: GptImage2ParamPanelProps) {
  const orderedRatios = PANEL_RATIO_ORDER.filter((item) => ratios.includes(item));
  const summary = `${labelize(size)} · ${ratio} · ${labelize(quality)} · ${labelize(format)} · ${labelize(moderation)}`;

  return (
    <div
      data-testid="gpt-image-2-param-panel"
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.55fr) minmax(320px, 1fr)',
        gap: 20,
      }}
    >
      <section data-testid="gpt-image-2-left-zone" style={{ display: 'grid', gap: 14 }}>
        <div style={sectionLabelStyle}>尺寸</div>
        <div style={{ ...segmentedRailStyle, gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
          {sizes.map((item) => (
            <button
              key={item}
              type="button"
              aria-label={labelize(item)}
              onClick={() => onChangeSize(item)}
              style={{
                ...chipStyle(item === size),
                height: 56,
                fontSize: 20,
              }}
            >
              {labelize(item)}
            </button>
          ))}
        </div>

        <div style={{ ...sectionLabelStyle, marginTop: 2 }}>比例</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: 10,
            padding: 14,
            borderRadius: 28,
            background: 'rgba(255,255,255,0.045)',
            border: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          {orderedRatios.map((item) => {
            const active = item === ratio;
            return (
              <button
                key={item}
                type="button"
                aria-label={item}
                onClick={() => onChangeRatio(item)}
                style={{
                  minHeight: 84,
                  borderRadius: 22,
                  border: active ? '1px solid rgba(255,255,255,0.12)' : '1px solid transparent',
                  background: active ? 'rgba(255,255,255,0.09)' : 'transparent',
                  color: active ? '#ffffff' : 'rgba(255,255,255,0.5)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 9,
                  cursor: 'pointer',
                }}
              >
                <span style={ratioPreviewStyle(item, active)} />
                <span style={{ fontSize: 13, fontWeight: active ? 800 : 600, lineHeight: 1 }}>{item}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section data-testid="gpt-image-2-right-zone" style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
        <div style={sectionLabelStyle}>质量</div>
        <div style={{ ...segmentedRailStyle, gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
          {QUALITY_OPTIONS.map((item) => (
            <button key={item} type="button" aria-label={labelize(item)} onClick={() => onChangeQuality(item)} style={chipStyle(item === quality)}>
              {labelize(item)}
            </button>
          ))}
        </div>

        <div style={sectionLabelStyle}>输出格式</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
          {FORMAT_OPTIONS.map((item) => (
            <button key={item} type="button" aria-label={labelize(item)} onClick={() => onChangeFormat(item)} style={chipStyle(item === format)}>
              {labelize(item)}
            </button>
          ))}
        </div>

        <div style={sectionLabelStyle}>审核强度</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          {MODERATION_OPTIONS.map((item) => (
            <button
              key={item}
              type="button"
              aria-label={moderationLabel(item)}
              onClick={() => onChangeModeration(item)}
              style={chipStyle(item === moderation)}
            >
              {labelize(item)}
            </button>
          ))}
        </div>

        <div
          style={{
            marginTop: 6,
            borderRadius: 22,
            border: '1px solid rgba(255,255,255,0.05)',
            background: 'rgba(255,255,255,0.045)',
            padding: '16px 18px',
            color: '#d5d9e0',
            fontSize: 14,
            fontWeight: 700,
            lineHeight: 1.25,
          }}
        >
          {summary}
        </div>
      </section>
    </div>
  );
}
