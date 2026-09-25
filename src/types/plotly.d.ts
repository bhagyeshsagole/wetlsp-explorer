declare module 'plotly.js-dist-min' {
  export type PlotData = Record<string, unknown>;
  export type PlotLayout = Record<string, unknown>;
  export type PlotConfig = Record<string, unknown>;

  export function newPlot(
    root: HTMLElement,
    data: PlotData[],
    layout?: PlotLayout,
    config?: PlotConfig,
  ): Promise<HTMLElement>;
  export function react(
    root: HTMLElement,
    data: PlotData[],
    layout?: PlotLayout,
    config?: PlotConfig,
  ): Promise<HTMLElement>;
  export function purge(root: HTMLElement): void;
  export function relayout(root: HTMLElement, update: PlotLayout): Promise<HTMLElement>;
  export function Plots(): void;
  export function toImage(
    root: HTMLElement | { data: PlotData[]; layout: PlotLayout; config?: PlotConfig },
    opts: { format: string; width?: number; height?: number; scale?: number },
  ): Promise<string>;
  export function downloadImage(
    root: HTMLElement,
    opts: { format: string; filename: string; width?: number; height?: number; scale?: number },
  ): Promise<string>;
  const Plotly: {
    newPlot: typeof newPlot;
    react: typeof react;
    purge: typeof purge;
    relayout: typeof relayout;
    toImage: typeof toImage;
    downloadImage: typeof downloadImage;
  };
  export default Plotly;
}
