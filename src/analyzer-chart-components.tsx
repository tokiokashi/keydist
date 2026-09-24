import {
  escapeText,
  type BarDatum,
  BarOptions,
  ColumnDatum,
  ColumnOptions,
  LineOptions,
  LineSeries,
  MatrixOptions,
  MatrixRow,
} from './chart.ts';

function barPath(x: number, y: number, w: number, h: number, r = 4): string {
  if (w <= r) return `M${x},${y} h${w} v${h} h${-w} z`;
  return (
    `M${x},${y} h${w - r} a${r},${r} 0 0 1 ${r},${r} `
    + `v${h - r * 2} a${r},${r} 0 0 1 ${-r},${r} h${-(w - r)} z`
  );
}

export function AnalyzerBarChart({
  data,
  options = {},
}: {
  data: readonly BarDatum[];
  options?: BarOptions;
}) {
  const format = options.format ?? ((value: number) => value.toFixed(0));
  const labelW = options.labelWidth ?? 92;
  const rowH = options.rowHeight ?? 26;
  const barH = 14;
  const valueW = 64;
  const width = options.width ?? 640;
  const height = data.length * rowH;
  const plotW = width - labelW - valueW;
  const max = Math.max(1e-9, ...data.map((datum) => datum.value));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img">
      {data.map((datum, index) => {
        const y = index * rowH;
        const barWidth = Math.max(0, (datum.value / max) * plotW);
        const fill = datum.color ?? 'var(--heat-1)';
        const valueLabel = datum.valueLabel ?? format(datum.value);
        const tip = datum.tip ?? `${escapeText(datum.label)}<br><b>${valueLabel}</b>`;
        return (
          <g data-tip={tip} key={`${datum.label}-${index}`}>
            <rect x={0} y={y} width={width} height={rowH} fill="transparent" />
            <text
              x={labelW - 10}
              y={y + rowH / 2 + 4}
              textAnchor="end"
              fontSize={12}
              fill="var(--fg)"
              fontWeight={datum.emphasise ? 700 : undefined}
            >
              {datum.label}
            </text>
            <path
              d={barPath(labelW, y + (rowH - barH) / 2, barWidth, barH)}
              fill={fill}
            />
            <text
              x={labelW + barWidth + 8}
              y={y + rowH / 2 + 4}
              fontSize={12}
              fill="var(--muted)"
              fontVariantNumeric="tabular-nums"
            >
              {valueLabel}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function AnalyzerLineChart({
  series,
  xTicks,
  format,
  options = {},
}: {
  series: readonly LineSeries[];
  xTicks: readonly number[];
  format(value: number): string;
  options?: LineOptions;
}) {
  const width = 700;
  const height = 260;
  const margin = { top: 14, right: 176, bottom: 28, left: 54 };
  const all = series.flatMap((item) => item.points.map((point) => point.y));
  const low = Math.min(...all);
  const high = options.yMax ?? Math.max(...all);
  const pad = Math.max((high - low) * 0.12, Math.abs(high) * 0.01, 1e-6);
  const yMin = low - pad;
  const yMax = options.yMax ?? high + pad;
  const span = yMax - yMin || 1;
  const x = (index: number) =>
    margin.left
    + (index / Math.max(1, xTicks.length - 1))
      * (width - margin.left - margin.right);
  const y = (value: number) =>
    height - margin.bottom
    - ((value - yMin) / span) * (height - margin.top - margin.bottom);

  const labels = series
    .map((item) => ({
      name: item.name,
      color: item.color,
      y: y(item.points[item.points.length - 1]?.y ?? 0),
    }))
    .sort((left, right) => left.y - right.y);
  for (let index = 1; index < labels.length; index++) {
    labels[index]!.y = Math.max(labels[index]!.y, labels[index - 1]!.y + 15);
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img">
      {[0, 0.5, 1].map((position) => {
        const value = yMin + span * position;
        return (
          <g key={position}>
            <line
              x1={margin.left}
              y1={y(value)}
              x2={width - margin.right}
              y2={y(value)}
              stroke="var(--line)"
            />
            <text
              x={margin.left - 8}
              y={y(value) + 4}
              textAnchor="end"
              fontSize={11}
              fill="var(--muted)"
              fontVariantNumeric="tabular-nums"
            >
              {format(value)}
            </text>
          </g>
        );
      })}
      {series.map((item) => (
        <path
          key={item.name}
          d={item.points
            .map((point, index) => `${index ? 'L' : 'M'}${x(index)},${y(point.y)}`)
            .join('')}
          fill="none"
          stroke={item.color}
          strokeWidth={2}
          strokeLinejoin="round"
        />
      ))}
      {labels.map((label) => (
        <g key={label.name}>
          <rect
            x={width - margin.right + 10}
            y={label.y - 4}
            width={9}
            height={9}
            rx={2}
            fill={label.color}
          />
          <text
            x={width - margin.right + 24}
            y={label.y + 4}
            fontSize={12}
            fill="var(--fg)"
          >
            {label.name}
          </text>
        </g>
      ))}
      {xTicks.map((tick, index) => (
        <text
          key={tick}
          x={x(index)}
          y={height - 8}
          textAnchor="middle"
          fontSize={11}
          fill="var(--muted)"
          fontVariantNumeric="tabular-nums"
        >
          {tick}
        </text>
      ))}
      {xTicks.map((tick, index) => {
        const half = (width - margin.left - margin.right)
          / Math.max(1, xTicks.length - 1)
          / 2;
        const rows = series.map((item) => {
          const point = item.points[index];
          if (!point) return '';
          const raw = point.raw === undefined
            ? ''
            : ` <span style="color:var(--muted)">(${point.raw.toFixed(0)} u)</span>`;
          return `<span style="color:${item.color}">■</span> ${escapeText(item.name)} <b>${format(point.y)}</b>${raw}`;
        }).join('<br>');
        return (
          <g data-tip={`N = ${tick}<br>${rows}`} key={`band-${tick}`}>
            <rect
              x={x(index) - half}
              y={margin.top}
              width={half * 2}
              height={height - margin.top - margin.bottom}
              fill="transparent"
            />
          </g>
        );
      })}
    </svg>
  );
}

export function AnalyzerColumnChart({
  data,
  options = {},
}: {
  data: readonly ColumnDatum[];
  options?: ColumnOptions;
}) {
  const format = options.format ?? ((value: number) => value.toFixed(1));
  const width = options.width ?? 420;
  const height = options.height ?? 190;
  const top = 18;
  const bottom = data.some((datum) => datum.group) ? 34 : 20;
  const plotH = height - top - bottom;
  const high = Math.max(...data.map((datum) => datum.value), 0);
  const low = Math.min(...data.map((datum) => datum.value), 0);
  const scaleHigh = high === 0 && low === 0 ? 1 : high;
  const span = Math.max(1e-9, scaleHigh - low);
  const yOf = (value: number) => top + ((scaleHigh - value) / span) * plotH;
  const baselineY = yOf(0);
  const gaps = data.reduce(
    (count, datum, index) => (
      index > 0 && datum.group !== data[index - 1]?.group ? count + 1 : count
    ),
    0,
  );
  const slot = width / (data.length + gaps * 0.5);
  const barW = Math.min(slot - 4, 46);
  let cursor = 0;
  const positions = data.map((datum, index) => {
    if (index > 0 && datum.group !== data[index - 1]?.group) cursor += slot * 0.5;
    const x = cursor + (slot - barW) / 2;
    const hitX = cursor;
    cursor += slot;
    return { datum, x, hitX };
  });

  const spans = new Map<string, { from: number; to: number }>();
  if (data.some((datum) => datum.group)) {
    positions.forEach(({ datum, hitX }) => {
      const key = datum.group ?? '';
      const current = spans.get(key);
      if (current) current.to = hitX + slot;
      else spans.set(key, { from: hitX, to: hitX + slot });
    });
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img">
      <line
        x1={0}
        y1={baselineY}
        x2={width}
        y2={baselineY}
        stroke="var(--line)"
      />
      {positions.map(({ datum, x, hitX }, index) => {
        const valueY = yOf(datum.value);
        const barHeight = Math.abs(valueY - baselineY);
        const y = Math.min(valueY, baselineY);
        const fill = datum.color ?? 'var(--heat-1)';
        const tip = datum.tip ?? `${escapeText(datum.label)}<br><b>${format(datum.value)}</b>`;
        const valueLabelY = datum.value < 0 ? y + barHeight + 14 : y - 5;
        return (
          <g data-tip={tip} key={`${datum.label}-${index}`}>
            <rect x={hitX} y={0} width={slot} height={height} fill="transparent" />
            {barHeight > 0.5 ? (
              <rect
                data-bar="true"
                x={x}
                y={y}
                width={barW}
                height={barHeight}
                rx={4}
                fill={fill}
              />
            ) : null}
            <text
              x={x + barW / 2}
              y={valueLabelY}
              textAnchor="middle"
              fontSize={11}
              fill="var(--muted)"
              fontVariantNumeric="tabular-nums"
            >
              {format(datum.value)}
            </text>
            <text
              x={x + barW / 2}
              y={top + plotH + 14}
              textAnchor="middle"
              fontSize={11}
              fill="var(--fg)"
            >
              {datum.label}
            </text>
          </g>
        );
      })}
      {[...spans].map(([name, group]) => (
        <text
          key={name}
          x={(group.from + group.to) / 2}
          y={height - 6}
          textAnchor="middle"
          fontSize={11}
          fill="var(--muted)"
        >
          {name}
        </text>
      ))}
    </svg>
  );
}

export function AnalyzerMatrixChart({
  rows,
  columns,
  options = {},
  onSort,
}: {
  rows: readonly MatrixRow[];
  columns: readonly string[];
  options?: MatrixOptions;
  onSort?(column: number): void;
}) {
  const format = options.format ?? ((value: number) => value.toFixed(2));
  const labelW = options.labelWidth ?? 116;
  const cellW = options.cellWidth ?? 54;
  const rowH = options.rowHeight ?? 24;
  const split = options.columnSplit;
  const gap = split !== undefined ? cellW * 0.4 : 0;
  const headerH = options.columnGroupLabels ? 36 : 20;
  const width = labelW + columns.length * cellW + gap;
  const height = headerH + rows.length * rowH;
  const values = rows.flatMap((row) => row.cells.map((cell) => cell.value));
  const high = Math.max(...values, 0);
  const low = options.colorBase === 'min' ? Math.min(...values, high) : 0;
  const span = Math.max(1e-9, high - low);
  const colX = (index: number) =>
    labelW + index * cellW + (split !== undefined && index >= split ? gap : 0);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
    >
      {options.columnGroupLabels ? (
        <>
          <text
            x={labelW + ((split ?? 0) * cellW) / 2}
            y={12}
            textAnchor="middle"
            fontSize={11}
            fill="var(--muted)"
          >
            {options.columnGroupLabels[0]}
          </text>
          <text
            x={colX(split ?? 0) + ((columns.length - (split ?? 0)) * cellW) / 2}
            y={12}
            textAnchor="middle"
            fontSize={11}
            fill="var(--muted)"
          >
            {options.columnGroupLabels[1]}
          </text>
        </>
      ) : null}
      {columns.map((column, index) => {
        const active = options.sort?.column === index
          ? options.sort.direction
          : undefined;
        const marker = active === 'asc' ? ' ↑' : active === 'desc' ? ' ↓' : '';
        const ariaSort = active === 'asc'
          ? 'ascending'
          : active === 'desc'
            ? 'descending'
            : 'none';
        return (
          <g
            data-tip="クリックごとに昇順・降順・選択順へ切り替える"
            key={column}
          >
            <text
              x={colX(index) + cellW / 2}
              y={headerH - 6}
              textAnchor="middle"
              fontSize={11}
              fill="var(--muted)"
              role="button"
              tabIndex={0}
              aria-label={`${column}で配列を並べ替え`}
              aria-sort={ariaSort}
              style={{ cursor: onSort ? 'pointer' : undefined }}
              onClick={() => onSort?.(index)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                onSort?.(index);
              }}
            >
              {column}{marker}
            </text>
          </g>
        );
      })}
      {rows.flatMap((row, rowIndex) => {
        const y = headerH + rowIndex * rowH;
        const result = [
          <rect
            key={`${row.label}-swatch`}
            x={0}
            y={y + (rowH - 9) / 2}
            width={9}
            height={9}
            rx={2}
            fill={row.color}
          />,
          <text
            key={`${row.label}-label`}
            x={labelW - 14}
            y={y + rowH / 2 + 4}
            textAnchor="end"
            fontSize={12}
            fill="var(--fg)"
          >
            {row.label}
          </text>,
        ];
        row.cells.forEach((cell, columnIndex) => {
          const x = colX(columnIndex);
          const intensity = Math.min(1, Math.max(0, (cell.value - low) / span));
          const tip = cell.tip
            ?? `${escapeText(row.label)} / ${escapeText(columns[columnIndex] ?? '')}<br><b>${format(cell.value)}</b>`;
          result.push(
            <g data-tip={tip} key={`${row.label}-${columnIndex}`}>
              <rect
                x={x + 2}
                y={y + 2}
                width={cellW - 4}
                height={rowH - 4}
                rx={4}
                fill={`color-mix(in oklab, var(--heat-1) ${(intensity * 100).toFixed(1)}%, var(--heat-0))`}
              />
              <text
                x={x + cellW / 2}
                y={y + rowH / 2 + 4}
                textAnchor="middle"
                fontSize={11}
                fontVariantNumeric="tabular-nums"
                fill={intensity > 0.5 ? 'var(--on-heat)' : 'var(--fg)'}
              >
                {format(cell.value)}
              </text>
            </g>,
          );
        });
        return result;
      })}
    </svg>
  );
}
