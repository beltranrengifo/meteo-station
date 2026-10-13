// ECharts wrapper: registers only the chart types and components we use (smaller bundle)
// and follows the system light/dark theme.
import { LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsOption } from 'echarts';
// The ESM build: the CommonJS one (lib/) breaks the default import under Vite.
import ReactEChartsCore from 'echarts-for-react/esm/core';
import { useSyncExternalStore } from 'react';

echarts.use([LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

function usePrefersDark(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      darkQuery.addEventListener('change', onChange);
      return () => darkQuery.removeEventListener('change', onChange);
    },
    () => darkQuery.matches,
  );
}

interface ChartProps {
  option: EChartsOption;
  height?: number;
}

export function Chart({ option, height = 220 }: ChartProps) {
  const dark = usePrefersDark();
  return (
    <ReactEChartsCore
      echarts={echarts}
      option={{ backgroundColor: 'transparent', ...option }}
      theme={dark ? 'dark' : undefined}
      style={{ height }}
    />
  );
}
