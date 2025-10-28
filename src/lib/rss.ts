import { XMLParser } from 'fast-xml-parser';

const WIDELY_AVAILABLE_FEED =
  'https://web-platform-dx.github.io/web-features-explorer/widely-available.xml';
const NEWLY_AVAILABLE_FEED =
  'https://web-platform-dx.github.io/web-features-explorer/newly-available.xml';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
  trimValues: true,
  processEntities: true
});

export interface FeatureEntry {
  id: string;
  title: string;
  link: string;
  updated: string;
  summaryHtml: string;
  summaryText: string;
}

export interface TimelineData {
  widelyAvailable: FeatureEntry[];
  newlyAvailable: FeatureEntry[];
  lastUpdated: string;
}

function normalizeEntries(rawEntry: unknown): FeatureEntry[] {
  if (!rawEntry) {
    return [];
  }

  const entries = Array.isArray(rawEntry) ? rawEntry : [rawEntry];

  return entries
    .map((entry: any) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const link = extractLink(entry.link);
      const summaryHtml = extractContent(entry.content);
      const summaryText = stripHtml(summaryHtml);

      if (!entry.id || !entry.title || !link) {
        return null;
      }

      return {
        id: String(entry.id),
        title: String(entry.title),
        link,
        updated: entry.updated ? String(entry.updated) : '',
        summaryHtml,
        summaryText
      };
    })
    .filter((entry): entry is FeatureEntry => Boolean(entry));
}

function extractLink(linkNode: any): string {
  if (!linkNode) {
    return '';
  }

  if (typeof linkNode === 'string') {
    return linkNode;
  }

  if (Array.isArray(linkNode)) {
    const primaryLink = linkNode.find((link) => link?.rel !== 'self') ?? linkNode[0];
    return extractLink(primaryLink);
  }

  if (linkNode.href) {
    return String(linkNode.href);
  }

  return '';
}

function extractContent(contentNode: any): string {
  if (!contentNode) {
    return '';
  }

  if (typeof contentNode === 'string') {
    return contentNode;
  }

  const htmlCandidates = [
    contentNode['#text'],
    contentNode.cdata,
    contentNode.value
  ].filter(Boolean);

  if (htmlCandidates.length > 0) {
    return String(htmlCandidates[0]);
  }

  return '';
}

function stripHtml(html: string): string {
  return html
    .replace(/<\/?[^>]+(>|$)/g, '')
    .replace(/\s+/g, ' ')
    .replace(/&#x([0-9A-Fa-f]+);/g, (match, hex) => {
      return String.fromCharCode(parseInt(hex, 16));
    })
    .replace(/&#(\d+);/g, (match, dec) => {
      return String.fromCharCode(parseInt(dec, 10));
    })
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

async function fetchFeed(url: string): Promise<FeatureEntry[]> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to load feed: ${url} (${response.status})`);
  }

  const xml = await response.text();
  const data = parser.parse(xml);
  const feed = data?.feed ?? data?.rss;

  return normalizeEntries(feed?.entry ?? feed?.channel?.item);
}

let cachedData: TimelineData | null = null;

export async function fetchTimelineData(): Promise<TimelineData> {
  if (cachedData) {
    return cachedData;
  }

  const [widelyAvailable, newlyAvailable] = await Promise.all([
    fetchFeed(WIDELY_AVAILABLE_FEED),
    fetchFeed(NEWLY_AVAILABLE_FEED)
  ]);

  const sortedWidely = sortEntries(widelyAvailable);
  const sortedNewly = sortEntries(newlyAvailable);

  const lastUpdated = computeMostRecentDate([...sortedWidely, ...sortedNewly]);

  cachedData = {
    widelyAvailable: sortedWidely,
    newlyAvailable: sortedNewly,
    lastUpdated
  };

  return cachedData;
}

function computeMostRecentDate(entries: FeatureEntry[]): string {
  const timestamps = entries
    .map((entry) => Date.parse(entry.updated))
    .filter((value) => Number.isFinite(value));

  if (timestamps.length === 0) {
    return '';
  }

  const mostRecent = Math.max(...timestamps);
  return new Date(mostRecent).toISOString();
}

function sortEntries(entries: FeatureEntry[]): FeatureEntry[] {
  return [...entries].sort((a, b) => {
    const valueA = Date.parse(a.updated);
    const valueB = Date.parse(b.updated);

    if (!Number.isFinite(valueA) && !Number.isFinite(valueB)) {
      return a.title.localeCompare(b.title);
    }

    if (!Number.isFinite(valueA)) {
      return 1;
    }

    if (!Number.isFinite(valueB)) {
      return -1;
    }

    return valueB - valueA;
  });
}
