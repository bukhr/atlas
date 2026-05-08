import { authStore } from '$lib/stores/auth.svelte';
import { config } from '$lib/config';
import { cacheStore } from '$lib/stores/cache.svelte';
import { createLimiter } from '$lib/utils/concurrency';

const DOCS_API_BASE = config.api.docsBaseUrl;
const apiLimiter = createLimiter(config.api.maxConcurrent);

export interface DocHeading {
  id: string;
  text: string;
  level: number; // 1-6
}

export interface TabHeadings {
  tabId: string;
  title: string;
  depth: number; // 0 = top-level, 1 = child, 2 = grandchild
  headings: DocHeading[];
}

interface DocsApiParagraph {
  elements?: Array<{
    textRun?: { content?: string };
  }>;
  paragraphStyle?: {
    namedStyleType?: string;
    headingId?: string;
  };
}

interface DocsApiContent {
  paragraph?: DocsApiParagraph;
}

interface DocsApiTab {
  tabProperties?: {
    tabId?: string;
    title?: string;
  };
  documentTab?: {
    body?: {
      content?: DocsApiContent[];
    };
  };
  childTabs?: DocsApiTab[];
}

interface DocsApiResponse {
  tabs?: DocsApiTab[];
}

const HEADING_STYLE_MAP: Record<string, number> = {
  HEADING_1: 1,
  HEADING_2: 2,
  HEADING_3: 3,
  HEADING_4: 4,
  HEADING_5: 5,
  HEADING_6: 6
};

class DocsService {
  async #apiFetch(url: string): Promise<Response> {
    const token = await authStore.ensureValidToken();
    if (!token) throw new Error('Authentication expired');

    const headers = new Headers();
    headers.set('Authorization', `Bearer ${token}`);

    const { maxRetries, baseDelay, maxDelay } = config.api;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const response = await apiLimiter(() => fetch(url, { headers }));

      if (response.ok) return response;

      if (response.status === 401) throw new Error('Authentication expired');

      const isRetryable = response.status === 429 || response.status >= 500;
      if (!isRetryable || attempt === maxRetries) {
        throw new Error(`Docs API error: ${response.status}`);
      }

      const delay = Math.min(baseDelay * 2 ** attempt, maxDelay);
      await new Promise((r) => setTimeout(r, delay + delay * 0.5 * Math.random()));
    }

    throw new Error('Max retries exceeded');
  }

  #extractHeadings(content: DocsApiContent[]): DocHeading[] {
    const headings: DocHeading[] = [];
    for (const block of content) {
      const paragraph = block.paragraph;
      if (!paragraph?.paragraphStyle?.namedStyleType) continue;

      const level = HEADING_STYLE_MAP[paragraph.paragraphStyle.namedStyleType];
      if (!level) continue;

      const headingId = paragraph.paragraphStyle.headingId;
      if (!headingId) continue;

      const text = (paragraph.elements ?? [])
        .map((el) => el.textRun?.content ?? '')
        .join('')
        .trim();

      if (text) {
        headings.push({ id: headingId, text, level });
      }
    }
    return headings;
  }

  async #fetchDocument(documentId: string): Promise<DocsApiResponse> {
    const tabFields = 'tabProperties(tabId,title),documentTab.body.content.paragraph(elements.textRun.content,paragraphStyle(namedStyleType,headingId))';
    const fields = `tabs(${tabFields},childTabs(${tabFields},childTabs(${tabFields})))`;
    const params = new URLSearchParams({ fields, includeTabsContent: 'true' });
    const response = await this.#apiFetch(`${DOCS_API_BASE}/documents/${documentId}?${params}`);
    return response.json();
  }

  /** Aplana tabs recursivamente (incluyendo childTabs) preservando profundidad */
  #flattenTabs(tabs: DocsApiTab[], depth = 0): Array<DocsApiTab & { _depth: number }> {
    const result: Array<DocsApiTab & { _depth: number }> = [];
    for (const tab of tabs) {
      result.push({ ...tab, _depth: depth });
      if (tab.childTabs?.length) {
        result.push(...this.#flattenTabs(tab.childTabs, depth + 1));
      }
    }
    return result;
  }

  async getHeadings(documentId: string): Promise<DocHeading[]> {
    const cacheKey = `doc-headings:${documentId}`;
    const cached = await cacheStore.get<DocHeading[]>(cacheKey);
    if (cached) return cached;

    const data = await this.#fetchDocument(documentId);
    const allTabs = this.#flattenTabs(data.tabs ?? []);
    const headings: DocHeading[] = [];
    for (const tab of allTabs) {
      headings.push(...this.#extractHeadings(tab.documentTab?.body?.content ?? []));
    }

    await cacheStore.set(cacheKey, headings, config.cache.treeStructure);
    return headings;
  }

  async getTabHeadings(documentId: string): Promise<TabHeadings[]> {
    const cacheKey = `doc-tab-headings:${documentId}`;
    const cached = await cacheStore.get<TabHeadings[]>(cacheKey);
    if (cached) return cached;

    const data = await this.#fetchDocument(documentId);
    const allTabs = this.#flattenTabs(data.tabs ?? []);

    const result: TabHeadings[] = allTabs.map((tab) => ({
      tabId: tab.tabProperties?.tabId ?? '',
      title: tab.tabProperties?.title ?? '',
      depth: tab._depth,
      headings: this.#extractHeadings(tab.documentTab?.body?.content ?? [])
    }));

    await cacheStore.set(cacheKey, result, config.cache.treeStructure);
    return result;
  }
}

export const docsService = new DocsService();
