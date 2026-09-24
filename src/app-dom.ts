import type { Finger } from './geometry.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export const el = {
  app: $<HTMLDivElement>('app'),
  geometry: $<HTMLSelectElement>('geometry'),
  geometryEdit: $<HTMLButtonElement>('geometry-edit'),
  geometryCurrent: $<HTMLParagraphElement>('geometry-current'),
  geometryExport: $<HTMLButtonElement>('geometry-export'),
  geometryImport: $<HTMLInputElement>('geometry-import'),
  geometryStatus: $<HTMLParagraphElement>('geometry-status'),
  geometryDialog: $<HTMLDialogElement>('geometry-dialog'),
  window: $<HTMLInputElement>('window'),
  windowOut: $<HTMLOutputElement>('window-out'),
  sfbHome: $<HTMLInputElement>('sfb-home'),
  preferOppositeThumb: $<HTMLInputElement>('prefer-opposite-thumb'),
  textPanel: $<HTMLDetailsElement>('text-panel'),
  addPanel: $<HTMLDetailsElement>('add-panel'),
  sensitivityPanel: $<HTMLDetailsElement>('sensitivity-panel'),
  textMeta: $<HTMLParagraphElement>('text-meta'),
  errors: $<HTMLParagraphElement>('errors'),
  compareChart: $<HTMLDivElement>('compare-chart'),
  compare: $<HTMLTableElement>('compare'),
  sensitivity: $<HTMLDivElement>('sensitivity'),
  picker: $<HTMLDivElement>('layout-picker'),
  conditionsOpenSidebar: $<HTMLButtonElement>('conditions-open-sidebar'),
  romajiSettings: $<HTMLButtonElement>('romaji-settings'),
  detailLayout: $<HTMLSelectElement>('detail-layout'),
  detailGeometry: $<HTMLSelectElement>('detail-geometry'),
  detailConditions: $<HTMLParagraphElement>('detail-conditions'),
  playback: $<HTMLDivElement>('playback'),
  playbackSettingsPanel: $<HTMLDivElement>('playback-settings-panel'),
  heatmap: $<HTMLDivElement>('heatmap'),
  gapFigure: $<HTMLDivElement>('gap-figure'),
  fingerChart: $<HTMLDivElement>('finger-chart'),
  adjacentChart: $<HTMLDivElement>('adjacent-chart'),
  fingerMatrix: $<HTMLDivElement>('finger-matrix'),
  pressMatrix: $<HTMLDivElement>('press-matrix'),
  adjacentMeanMatrix: $<HTMLDivElement>('adjacent-mean-matrix'),
  adjacentStdDevMatrix: $<HTMLDivElement>('adjacent-stddev-matrix'),
  howDialog: $<HTMLDialogElement>('how-dialog'),
  howOpen: $<HTMLButtonElement>('how-open'),
  howClose: $<HTMLButtonElement>('how-close'),
  conditionsDialog: $<HTMLDialogElement>('conditions-dialog'),
  conditionsOpen: $<HTMLButtonElement>('conditions-open'),
  conditionsClose: $<HTMLButtonElement>('conditions-close'),
  conditionDescription: $<HTMLDivElement>('condition-description'),
  romajiDialog: $<HTMLDialogElement>('romaji-dialog'),
  calibrationDialog: $<HTMLDialogElement>('playback-calibration-dialog'),
};

export type AppElements = typeof el;

export const FINGER_LABEL: Record<Finger, string> = {
  LP: '左小指', LR: '左薬指', LM: '左中指', LI: '左人差指', LT: '左親指',
  RT: '右親指', RI: '右人差指', RM: '右中指', RR: '右薬指', RP: '右小指',
};

/** 図の軸に載せる短い指名。左右は塊のラベルで示す */
export const SHORT_FINGER: Record<Finger, string> = {
  LP: '小', LR: '薬', LM: '中', LI: '人', LT: '親',
  RT: '親', RI: '人', RM: '中', RR: '薬', RP: '小',
};

/** 配列の識別色。色は一覧での位置に固定する。 */
export const PALETTE_SIZE = 8;
export const SERIES = (i: number) => `var(--series-${(i % PALETTE_SIZE) + 1})`;
