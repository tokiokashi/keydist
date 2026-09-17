import type { Finger } from './geometry.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export const el = {
  mode: $<HTMLSelectElement>('mode'),
  geometry: $<HTMLSelectElement>('geometry'),
  window: $<HTMLInputElement>('window'),
  windowOut: $<HTMLOutputElement>('window-out'),
  sfbHome: $<HTMLInputElement>('sfb-home'),
  preferOppositeThumb: $<HTMLInputElement>('prefer-opposite-thumb'),
  sample: $<HTMLSelectElement>('sample'),
  sampleReset: $<HTMLButtonElement>('sample-reset'),
  text: $<HTMLTextAreaElement>('text'),
  textSaveStatus: $<HTMLParagraphElement>('text-save-status'),
  textPanel: $<HTMLDetailsElement>('text-panel'),
  addPanel: $<HTMLDetailsElement>('add-panel'),
  sensitivityPanel: $<HTMLDetailsElement>('sensitivity-panel'),
  textMeta: $<HTMLParagraphElement>('text-meta'),
  errors: $<HTMLParagraphElement>('errors'),
  compareChart: $<HTMLDivElement>('compare-chart'),
  compareBaseline: $<HTMLSelectElement>('compare-baseline'),
  compareChartMetric: $<HTMLSelectElement>('compare-chart-metric'),
  compare: $<HTMLTableElement>('compare'),
  sensitivity: $<HTMLDivElement>('sensitivity'),
  sensitivityScale: $<HTMLDivElement>('sensitivity-scale'),
  picker: $<HTMLDivElement>('layout-picker'),
  romajiSettings: $<HTMLButtonElement>('romaji-settings'),
  newName: $<HTMLInputElement>('new-name'),
  newRows: $<HTMLDivElement>('new-rows'),
  newRomaji: $<HTMLSelectElement>('new-romaji'),
  newError: $<HTMLParagraphElement>('new-error'),
  addLayout: $<HTMLButtonElement>('add-layout'),
  importLayout: $<HTMLInputElement>('import-layout'),
  importError: $<HTMLParagraphElement>('import-error'),
  importWarning: $<HTMLParagraphElement>('import-warning'),
  detailLayout: $<HTMLSelectElement>('detail-layout'),
  playback: $<HTMLDivElement>('playback'),
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
  romajiForm: $<HTMLFormElement>('romaji-form'),
  romajiEdit: $<HTMLSelectElement>('romaji-edit'),
  romajiName: $<HTMLInputElement>('romaji-name'),
  romajiBase: $<HTMLSelectElement>('romaji-base'),
  romajiSokuon: $<HTMLInputElement>('romaji-sokuon'),
  romajiOverrides: $<HTMLTextAreaElement>('romaji-overrides'),
  romajiError: $<HTMLParagraphElement>('romaji-error'),
  romajiAssignments: $<HTMLDivElement>('romaji-assignments'),
  romajiVariants: $<HTMLDivElement>('romaji-variants'),
  romajiNew: $<HTMLButtonElement>('romaji-new'),
  calibrationDialog: $<HTMLDialogElement>('playback-calibration-dialog'),
  calibrationStart: $<HTMLButtonElement>('playback-calibration-start'),
  calibrationSave: $<HTMLButtonElement>('playback-calibration-save'),
  calibrationInstruction: $<HTMLParagraphElement>('playback-calibration-instruction'),
  calibrationProgress: $<HTMLOutputElement>('playback-calibration-progress'),
  calibrationError: $<HTMLParagraphElement>('playback-calibration-error'),
  calibrationResult: $<HTMLDivElement>('playback-calibration-result'),
  calibrationActions: $<HTMLInputElement>('playback-calibration-actions'),
  calibrationDirections: $<HTMLDivElement>('playback-calibration-directions'),
  calibrationSameHand: $<HTMLInputElement>('playback-calibration-same-hand'),
  calibrationSameHandPairs: $<HTMLDivElement>('playback-calibration-same-hand-pairs'),
  calibrationDirectedPairs: $<HTMLDivElement>('playback-calibration-directed-pairs'),
  calibrationFingerSpeed: $<HTMLInputElement>('playback-calibration-finger-speed'),
  calibrationFingerInputs: $<HTMLDivElement>('playback-calibration-finger-inputs'),
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
