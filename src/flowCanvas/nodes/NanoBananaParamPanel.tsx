import React from 'react';

type NanoBananaParamPanelProps = {
  ratio: string;
  ratios: string[];
  size: string;
  sizes: string[];
  onChangeRatio: (value: string) => void;
  onChangeSize: (value: string) => void;
};

const PANEL_RATIO_ORDER = ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '4:5', '5:4', '21:9'];

const formatSizeLabel = (value: string) => String(value || '').trim().toUpperCase();

const ratioPreviewStyle = (ratioValue: string, active: boolean): React.CSSProperties => {
  const [rw, rh] = ratioValue.split(':').map((part) => Math.max(1, Number(part) || 1));
  const wide = rw >= rh;
  const maxW = wide ? 24 : 14;
  const maxH = wide ? 14 : 24;
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

export function NanoBananaParamPanel({
  ratio,
  ratios,
  size,
  sizes,
  onChangeRatio,
  onChangeSize,
}: NanoBananaParamPanelProps) {
  const orderedRatios = PANEL_RATIO_ORDER.filter((item) => ratios.includes(item));

  return (
    <div data-testid="nano-banana-param-panel" style={{ display: 'grid', gap: 16 }}>
      <section data-testid="nano-banana-quality-section" style={{ display: 'grid', gap: 10 }}>
        <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 14, fontWeight: 700 }}>画质</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 4,
            padding: 4,
            borderRadius: 20,
            background: 'rgba(255,255,255,0.045)',
            border: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          {sizes.map((item) => {
            const active = item === size;
            return (
              <button
                key={item}
                type="button"
                aria-label={formatSizeLabel(item)}
                onClick={() => onChangeSize(item)}
                style={{
                  height: 58,
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 18,
                  background: active ? 'rgba(255,255,255,0.11)' : 'transparent',
                  color: active ? '#f8fafc' : 'rgba(255,255,255,0.62)',
                  fontSize: 20,
                  fontWeight: active ? 800 : 700,
                  cursor: 'pointer',
                }}
              >
                {formatSizeLabel(item)}
              </button>
            );
          })}
        </div>
      </section>

      <section data-testid="nano-banana-ratio-section" style={{ display: 'grid', gap: 10 }}>
        <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 14, fontWeight: 700 }}>比例</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
            gap: 10,
            padding: 14,
            borderRadius: 28,
            background: 'rgba(255,255,255,0.045)',
            border: '1px solid rgba(255,255,255,0.05)',
            overflow: 'hidden',
          }}
        >
          {orderedRatios.map((item) => {
            const active = item === ratio;
            return (
              <button
                key={item}
                type="button"
                aria-label={item}
                data-ratio={item}
                data-testid="nano-banana-ratio-item"
                onClick={() => onChangeRatio(item)}
                style={{
                  minHeight: 86,
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
    </div>
  );
}
