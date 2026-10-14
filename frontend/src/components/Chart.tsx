// ECharts wrapper: registers only the chart types and components we use (smaller bundle)
// and follows the system light/dark theme, with themes matching the dashboard's CSS tokens.
import { BarChart, LineChart } from 'echarts/charts';
import { BrushComponent, GridComponent, LegendComponent, ToolboxComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsOption } from 'echarts';
// The ESM build: the CommonJS one (lib/) breaks the default import under Vite.
import ReactEChartsCore from 'echarts-for-react/esm/core';
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

// The brush needs the toolbox registered, even with no toolbox shown: without it no brushEnd fires.
echarts.use([BarChart, LineChart, BrushComponent, ToolboxComponent, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

// Series colors, the same in both modes (index.css: --blue, --teal, --violet, --amber).
export const COLORS = {
  blue: '#5578f5',
  teal: '#19a7a0',
  violet: '#8b6bea',
  amber: '#e3a51d',
};

// Same values as the text, border and surface tokens in index.css.
const PALETTES = {
  light: { text: '#182033', muted: '#667085', grid: '#e6eaf1', border: '#e4e8f0', surface: '#ffffff' },
  dark: { text: '#e6eaf2', muted: '#98a2b6', grid: '#263049', border: '#2c3650', surface: '#161d2e' },
};

function theme(palette: (typeof PALETTES)['light']) {
  const axis = {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: palette.muted, fontSize: 10 },
    splitLine: { show: false },
  };
  return {
    color: [COLORS.blue, COLORS.amber, COLORS.teal, COLORS.violet],
    backgroundColor: 'transparent',
    textStyle: { fontFamily: 'Arial, Helvetica, sans-serif', color: palette.muted },
    timeAxis: axis,
    categoryAxis: axis,
    valueAxis: { ...axis, splitLine: { show: true, lineStyle: { color: palette.grid } } },
    legend: { textStyle: { color: palette.muted, fontSize: 10 } },
    tooltip: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      textStyle: { color: palette.text, fontSize: 12 },
    },
  };
}

echarts.registerTheme('meteo-light', theme(PALETTES.light));
echarts.registerTheme('meteo-dark', theme(PALETTES.dark));

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
  );
}

// Dragging across a chart selects a stretch of the x axis. Only with a mouse or trackpad: on a
// touch screen the same drag has to scroll the page.
export function useCanBrush(): boolean {
  return useMediaQuery('(pointer: fine)');
}

const BRUSH = {
  xAxisIndex: 0,
  brushType: 'lineX' as const,
  brushMode: 'single' as const,
  transformable: false,
  brushStyle: { color: 'rgba(85, 120, 245, 0.12)', borderColor: 'rgba(85, 120, 245, 0.6)', borderWidth: 1 },
  outOfBrush: { colorAlpha: 1 },
};

// Without a toolbox button the brush has to be switched on by hand: when the chart is created
// and again after every new option (notMerge resets it).
function activateBrush(chart: echarts.ECharts) {
  chart.dispatchAction({
    type: 'takeGlobalCursor',
    key: 'brush',
    brushOption: { brushType: BRUSH.brushType, brushMode: BRUSH.brushMode },
  });
}

interface BrushEndEvent {
  areas: { coordRange?: number[] }[];
}

interface ChartProps {
  option: EChartsOption;
  height?: number;
  // Called with the x axis values at both ends of a drag (time axis: ms; category axis: indices).
  onBrush?: (start: number, end: number) => void;
}

export function Chart({ option, height = 195, onBrush }: ChartProps) {
  const dark = useMediaQuery('(prefers-color-scheme: dark)');
  const canBrush = useCanBrush();
  const brush = Boolean(onBrush) && canBrush;
  // The chart echarts-for-react finally draws on, from onChartReady. Its getEchartsInstance()
  // looks the chart up by DOM node, which can return a stale one: it draws a temporary chart
  // first, and React's dev double mount races with that.
  const chartRef = useRef<echarts.ECharts | null>(null);
  // The ECharts handler is bound once; it calls the latest onBrush through this ref.
  const onBrushRef = useRef(onBrush);
  useEffect(() => {
    onBrushRef.current = onBrush;
  }, [onBrush]);

  // The brush adds its own toolbox buttons; hidden, since it is switched on below.
  const fullOption = useMemo(() => (brush ? { ...option, brush: BRUSH, toolbox: { show: false } } : option), [option, brush]);
  const events = useMemo(
    () => ({
      brushEnd: (event: BrushEndEvent) => {
        const range = event.areas[0]?.coordRange;
        if (range && range.length === 2) {
          onBrushRef.current?.(range[0], range[1]);
        }
      },
    }),
    [],
  );

  // On updates; the first render goes through onChartReady.
  useEffect(() => {
    const chart = chartRef.current;
    if (brush && chart && !chart.isDisposed()) {
      activateBrush(chart);
    }
  }, [fullOption, brush, dark]);

  return (
    <ReactEChartsCore
      echarts={echarts}
      option={fullOption}
      notMerge
      theme={dark ? 'meteo-dark' : 'meteo-light'}
      onEvents={events}
      onChartReady={(chart: echarts.ECharts) => {
        chartRef.current = chart;
        if (brush) {
          activateBrush(chart);
        }
      }}
      style={{ height }}
    />
  );
}
