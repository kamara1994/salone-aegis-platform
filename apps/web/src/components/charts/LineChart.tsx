'use client';

import { useEffect, useRef } from 'react';
import { useUi } from '@/state/ui';

export interface Series {
  name: string;
  values: number[];
  color: string; // CSS variable name, e.g. --action
}

function v(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Small themed line chart (ECharts), redrawn on theme change and resize. */
export function LineChart({ labels, series, yMax, unit, label }: { labels: string[]; series: Series[]; yMax?: number; unit?: string; label: string }) {
  const el = useRef<HTMLDivElement>(null);
  const theme = useUi((s) => s.theme);
  useEffect(() => {
    let disposed = false;
    let chart: import('echarts').ECharts | null = null;
    let ro: ResizeObserver | null = null;
    void import('echarts').then((echarts) => {
      if (disposed || !el.current) return;
      chart = echarts.init(el.current, undefined, { renderer: 'svg' });
      const text = v('--muted');
      const grid = v('--line');
      chart.setOption({
        animation: false,
        grid: { left: 40, right: 16, top: 28, bottom: 28 },
        legend: { top: 0, left: 0, textStyle: { color: text, fontSize: 12 }, icon: 'roundRect', itemWidth: 12, itemHeight: 3 },
        tooltip: { trigger: 'axis', backgroundColor: v('--pane'), borderColor: v('--line-strong'), textStyle: { color: v('--text'), fontSize: 12 }, valueFormatter: (x: number) => `${x}${unit ?? ''}` },
        xAxis: { type: 'category', data: labels, axisLine: { lineStyle: { color: grid } }, axisTick: { show: false }, axisLabel: { color: text, fontSize: 11 } },
        yAxis: { type: 'value', max: yMax, splitLine: { lineStyle: { color: grid } }, axisLabel: { color: text, fontSize: 11, formatter: `{value}${unit ?? ''}` } },
        series: series.map((s) => ({ name: s.name, type: 'line', data: s.values, smooth: false, symbol: 'circle', symbolSize: 5, lineStyle: { width: 2, color: v(s.color) }, itemStyle: { color: v(s.color) } })),
      });
      ro = new ResizeObserver(() => chart?.resize());
      ro.observe(el.current);
    });
    return () => {
      disposed = true;
      ro?.disconnect();
      chart?.dispose();
    };
  }, [labels, series, yMax, unit, theme]);
  return <div ref={el} className="h-56 w-full" role="img" aria-label={label} />;
}
