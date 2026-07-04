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
  fontSize: 13,
  fontWeight: 700,
};

const labelize = (value: string) => String(value || '').trim().toUpperCase();
const moderationLabel = (value: 'auto' | 'low') => `${value.toUpperCase()} MODERATION`;

const ratioPreviewStyle = (ratioValue: string, active: boolean): React.CSSProperties => {
  const [rw, rh] = ratioValue.split(':').map((part) => Math.max(1, Number(part) || 1));
  const wide = rw >= rh;
  const maxW = wide ? 22 : 14;
  const maxH = wide ? 14 : 22;
  const scale = Math.min(maxW / rw, maxH / rh);
  return {
    width: Math.max(8, rw * scale),
    height: Math.max(8, rh * scale),
    borderRadius: 3,
    border: active ? '1.5px solid rgba(255,255,255,0.96)' : '1.5px solid rgba(255,255,255,0.38)',
    background: active ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.03)',
    boxShadow: active ? '0 0 8px rgba(255,255,255,0.1)' : 'none',
  };
};

const segmentedRailStyle: React.CSSProperties = {
  display: 'grid',
  gap: 4,
  padding: 3,
  borderRadius: 14,
  background: 'rgba(255,255,255,0.045)',
  border: '1px solid rgba(255,255,255,0.05)',
};

const chipStyle = (active: boolean): React.CSSProperties => ({
  height: 36,
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.06)',
  background: active ? 'rgba(255,255,255,0.11)' : 'transparent',
  color: active ? '#f8fafc' : 'rgba(255,255,255,0.62)',
  fontSize: 13,
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
        gridTemplateColumns: 'minmax(0, 1.45fr) minmax(284px, 1fr)',
        gap: 14,
      }}
    >
      <section data-testid="gpt-image-2-left-zone" style={{ display: 'grid', gap: 9 }}>
        <div style={sectionLabelStyle}>尺寸</div>
        <div
          data-testid="gpt-image-2-size-rail"
          style={{ ...segmentedRailStyle, gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}
        >
          {sizes.map((item) => (
            <button
              key={item}
              type="button"
              aria-label={labelize(item)}
              onClick={() => onChangeSize(item)}
              style={{
                ...chipStyle(item === size),
                height: 40,
                fontSize: 16,
              }}
            >
              {labelize(item)}
            </button>
          ))}
        </div>

        <div style={sectionLabelStyle}>比例</div>
        <div
          data-testid="gpt-image-2-ratio-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: 4,
            padding: 8,
            borderRadius: 18,
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
                  minHeight: 58,
                  borderRadius: 14,
                  border: active ? '1px solid rgba(255,255,255,0.12)' : '1px solid transparent',
                  background: active ? 'rgba(255,255,255,0.09)' : 'transparent',
                  color: active ? '#ffffff' : 'rgba(255,255,255,0.5)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  cursor: 'pointer',
                }}
              >
                <span style={ratioPreviewStyle(item, active)} />
                <span style={{ fontSize: 12, fontWeight: active ? 800 : 600, lineHeight: 1 }}>{item}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section data-testid="gpt-image-2-right-zone" style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
        <div style={sectionLabelStyle}>质量</div>
        <div style={{ ...segmentedRailStyle, gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
          {QUALITY_OPTIONS.map((item) => (
            <button key={item} type="button" aria-label={labelize(item)} onClick={() => onChangeQuality(item)} style={chipStyle(item === quality)}>
              {labelize(item)}
            </button>
          ))}
        </div>

        <div style={sectionLabelStyle}>输出格式</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
          {FORMAT_OPTIONS.map((item) => (
            <button key={item} type="button" aria-label={labelize(item)} onClick={() => onChangeFormat(item)} style={chipStyle(item === format)}>
              {labelize(item)}
            </button>
          ))}
        </div>

        <div style={sectionLabelStyle}>审核强度</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
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
            marginTop: 2,
            borderRadius: 16,
            border: '1px solid rgba(255,255,255,0.05)',
            background: 'rgba(255,255,255,0.045)',
            padding: '10px 12px',
            color: '#d5d9e0',
            fontSize: 12,
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
