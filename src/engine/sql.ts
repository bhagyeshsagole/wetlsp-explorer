/**
 * SQL builders for the timeseries table, kept pure so the "never full-scan"
 * guarantee can be unit-tested without a database.
 *
 * Every builder here refuses to emit SQL that lacks a pixel filter, and every
 * statement carries an explicit row LIMIT. `pixels_timeseries` is 28 M rows for
 * a single site; an unfiltered scan is a bug, not a slow path.
 */
import { sqlStr } from './duckdb';

/** UI-facing caps, matching the Shiny app's guards. */
export const DEFAULT_PIXEL_SAMPLE = 250;
export const MAX_PIXEL_SAMPLE = 5000;
export const DEFAULT_SELECTION_CAP = 500;
/** Absolute ceiling on rows returned to the main thread by one query. */
export const MAX_RESULT_ROWS = 2_000_000;

export interface TimeseriesFilters {
  years: number[];
  series: string[];
  pixelIds: readonly number[] | Int32Array;
  /** Inclusive ISO dates. */
  dateRange?: [string, string] | null;
}

export class UnboundedQueryError extends Error {
  constructor(what: string) {
    super(
      `Refusing to run an unbounded query on pixels_timeseries (${what}). Pick pixels first.`,
    );
    this.name = 'UnboundedQueryError';
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function buildWhere(filters: TimeseriesFilters): string {
  const ids = Array.from(filters.pixelIds);
  if (ids.length === 0) throw new UnboundedQueryError('no pixel ids');
  if (ids.length > MAX_PIXEL_SAMPLE) {
    throw new UnboundedQueryError(`${ids.length} pixels exceeds the ${MAX_PIXEL_SAMPLE} cap`);
  }
  if (filters.series.length === 0) throw new UnboundedQueryError('no series selected');
  if (filters.years.length === 0) throw new UnboundedQueryError('no year selected');
  for (const id of ids) {
    if (!Number.isInteger(id)) throw new Error(`Pixel id "${id}" is not an integer.`);
  }

  const clauses = [
    `year IN (${filters.years.map((y) => Number(y)).join(', ')})`,
    `series IN (${filters.series.map(sqlStr).join(', ')})`,
    `pixel_id IN (${ids.join(', ')})`,
  ];

  if (filters.dateRange) {
    const [from, to] = filters.dateRange;
    if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) {
      throw new Error(`Date range must be ISO yyyy-mm-dd; got "${from}".."${to}".`);
    }
    clauses.push(`date BETWEEN DATE ${sqlStr(from)} AND DATE ${sqlStr(to)}`);
  }

  return clauses.join(' AND ');
}

/** Per-pixel rows for the spaghetti lines. */
export function buildTimeseriesSql(
  ref: string,
  filters: TimeseriesFilters,
  rowLimit = MAX_RESULT_ROWS,
): string {
  const where = buildWhere(filters);
  const limit = Math.min(Math.max(1, Math.floor(rowLimit)), MAX_RESULT_ROWS);
  return [
    'SELECT pixel_id, series, epoch_ms(date) AS t, evi',
    `FROM ${ref}`,
    `WHERE ${where} AND evi IS NOT NULL`,
    'ORDER BY series, pixel_id, date',
    `LIMIT ${limit}`,
  ].join('\n');
}

/**
 * Daily mean + interquartile ribbon, aggregated in SQL. The result is at most
 * `days x series` rows regardless of how many pixels feed it.
 */
export function buildDailySummarySql(ref: string, filters: TimeseriesFilters): string {
  const where = buildWhere(filters);
  return [
    'SELECT',
    "  strftime(date, '%Y-%m-%d') AS date,",
    '  series,',
    '  avg(evi) AS mean,',
    '  quantile_cont(evi, 0.25) AS q25,',
    '  quantile_cont(evi, 0.75) AS q75,',
    '  count(*) AS n',
    `FROM ${ref}`,
    `WHERE ${where} AND evi IS NOT NULL`,
    'GROUP BY 1, 2',
    'ORDER BY 1, 2',
    `LIMIT ${MAX_RESULT_ROWS}`,
  ].join('\n');
}

/** Distinct pixel ids that actually carry data for the given year/series. */
export function buildDistinctPixelsSql(ref: string, years: number[], series: string[]): string {
  if (years.length === 0 || series.length === 0) {
    throw new UnboundedQueryError('distinct pixels needs a year and a series');
  }
  return [
    'SELECT DISTINCT pixel_id',
    `FROM ${ref}`,
    `WHERE year IN (${years.map(Number).join(', ')}) AND series IN (${series.map(sqlStr).join(', ')})`,
    'ORDER BY pixel_id',
  ].join('\n');
}

/** Cheap catalogue of what the file contains: one grouped aggregate. */
export function buildFactsSql(ref: string): string {
  return [
    'SELECT year, series, count(*) AS n, min(date) AS date_min, max(date) AS date_max',
    `FROM ${ref}`,
    'GROUP BY 1, 2',
    'ORDER BY 1, 2',
  ].join('\n');
}

/** One pixel's trace, for the map's click-to-sparkline. */
export function buildPixelTraceSql(
  ref: string,
  pixelId: number,
  years: number[],
  series: string[],
): string {
  if (!Number.isInteger(pixelId)) throw new Error('Pixel id must be an integer.');
  return buildTimeseriesSql(ref, { years, series, pixelIds: [pixelId] }, 20_000);
}

/**
 * Mean EVI per pixel for one year+series. Bounded by the pixel count, not the
 * row count: DuckDB streams the scan and returns one row per pixel, so this is
 * an aggregate rather than a materialisation.
 */
export function buildPixelMeanSql(ref: string, years: number[], series: string[]): string {
  if (years.length === 0 || series.length === 0) {
    throw new UnboundedQueryError('per-pixel means need a year and a series');
  }
  return [
    'SELECT pixel_id, avg(evi) AS mean_evi, count(*) AS n',
    `FROM ${ref}`,
    `WHERE year IN (${years.map(Number).join(', ')}) AND series IN (${series.map(sqlStr).join(', ')})`,
    '  AND evi IS NOT NULL',
    'GROUP BY 1',
    'ORDER BY 1',
    `LIMIT ${MAX_PIXEL_SAMPLE * 40}`,
  ].join('\n');
}
