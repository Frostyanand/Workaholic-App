import { ValidationError } from '../../core/errors.js';

// Safe protocols for links and images
const DANGEROUS_PROTOCOLS =
  /^(javascript:|vbscript:|data:(?!image\/(png|jpe?g|gif|webp|svg\+xml);base64,)|file:)/i;

/**
 * Validates and sanitizes a URL.
 * Rejects dangerous protocols like javascript:, vbscript:, file:, etc.
 *
 * @param {string} url
 * @param {boolean} [throwOnError=false]
 * @returns {string} Safe URL or throws ValidationError
 */
export function sanitizeUrl(url, throwOnError = false) {
  if (!url || typeof url !== 'string') {
    return '';
  }

  const trimmed = url.trim();

  // Strip control characters without no-control-regex lint warning
  const sanitized = Array.from(trimmed)
    .filter(c => {
      const code = c.charCodeAt(0);
      return !(code <= 31 || (code >= 127 && code <= 159));
    })
    .join('');

  if (DANGEROUS_PROTOCOLS.test(sanitized)) {
    if (throwOnError) {
      throw new ValidationError(`Dangerous URL protocol rejected: ${sanitized.slice(0, 30)}`);
    }
    return 'about:blank';
  }

  return sanitized;
}

/**
 * Sanitizes raw HTML strings to remove script tags, event handlers, and dangerous attributes.
 *
 * @param {string} html
 * @returns {string}
 */
export function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') {
    return '';
  }

  let clean = html;

  // 1. Strip script tags and content
  clean = clean.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // 2. Strip dangerous embedded tags
  clean = clean.replace(
    /<\/?(iframe|object|embed|applet|meta|link|base|form|input|button)\b[^>]*>/gi,
    '',
  );

  // 3. Strip inline event handlers (e.g. onload, onerror, onclick)
  clean = clean.replace(/\s+on\w+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '');

  // 4. Neutralize javascript: inside href or src
  clean = clean.replace(/(href|src)\s*=\s*(['"])\s*javascript:[^'"]*(\2)/gi, '$1="about:blank"');

  return clean;
}

/**
 * Validates and sanitizes rich content nodes.
 *
 * @param {Array|Object|string} content
 * @returns {{ sanitizedContent: any, plainText: string }}
 */
export function sanitizeNoteContent(content) {
  if (content === null || content === undefined) {
    return { sanitizedContent: [], plainText: '' };
  }

  // Handle plain string content (e.g., Markdown or plain text)
  if (typeof content === 'string') {
    if (content.length > 500000) {
      throw new ValidationError('Note content exceeds maximum allowed size (500,000 characters)');
    }
    const cleanHtml = sanitizeHtml(content);
    const plainText = cleanHtml
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return {
      sanitizedContent: [
        {
          id: 'p_1',
          type: 'paragraph',
          text: plainText,
        },
      ],
      plainText,
    };
  }

  // Handle single object wrapped in array
  const nodes = Array.isArray(content) ? content : [content];

  if (nodes.length > 5000) {
    throw new ValidationError('Note contains too many nodes (maximum 5,000 allowed)');
  }

  const textParts = [];
  const sanitizedNodes = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node || typeof node !== 'object') {
      continue;
    }

    const type = String(node.type || 'paragraph').toLowerCase();

    switch (type) {
      case 'heading': {
        const level = Math.max(1, Math.min(6, parseInt(node.level, 10) || 1));
        const text = sanitizeHtml(String(node.text || ''));
        if (text) textParts.push(text);
        sanitizedNodes.push({
          id: node.id || `node_${i}`,
          type: 'heading',
          level,
          text,
        });
        break;
      }

      case 'paragraph': {
        const text = sanitizeHtml(String(node.text || ''));
        if (text) textParts.push(text);
        sanitizedNodes.push({
          id: node.id || `node_${i}`,
          type: 'paragraph',
          text,
        });
        break;
      }

      case 'list':
      case 'bullet_list':
      case 'ordered_list': {
        const rawItems = Array.isArray(node.items) ? node.items : [];
        const cleanItems = rawItems.map(item => {
          const itemText = sanitizeHtml(String(item || ''));
          if (itemText) textParts.push(itemText);
          return itemText;
        });
        sanitizedNodes.push({
          id: node.id || `node_${i}`,
          type: 'list',
          listType: node.listType || (type === 'ordered_list' ? 'ordered' : 'bullet'),
          items: cleanItems,
        });
        break;
      }

      case 'checklist': {
        const rawItems = Array.isArray(node.items) ? node.items : [];
        const cleanItems = rawItems.map((item, idx) => {
          if (!item || typeof item !== 'object') {
            const fallbackText = sanitizeHtml(String(item || ''));
            if (fallbackText) textParts.push(fallbackText);
            return {
              id: `chk_${i}_${idx}`,
              text: fallbackText,
              checked: false,
            };
          }
          const itemText = sanitizeHtml(String(item.text || ''));
          if (itemText) textParts.push(itemText);
          return {
            id: String(item.id || `chk_${i}_${idx}`),
            text: itemText,
            checked: Boolean(item.checked),
            convertedTaskId: item.convertedTaskId ? String(item.convertedTaskId) : null,
          };
        });
        sanitizedNodes.push({
          id: node.id || `node_${i}`,
          type: 'checklist',
          items: cleanItems,
        });
        break;
      }

      case 'link': {
        const url = sanitizeUrl(String(node.url || ''));
        const text = sanitizeHtml(String(node.text || url));
        if (text) textParts.push(text);
        sanitizedNodes.push({
          id: node.id || `node_${i}`,
          type: 'link',
          url,
          text,
        });
        break;
      }

      case 'image': {
        const url = sanitizeUrl(String(node.url || ''));
        const alt = sanitizeHtml(String(node.alt || ''));
        const caption = node.caption ? sanitizeHtml(String(node.caption)) : undefined;
        if (alt) textParts.push(alt);
        if (caption) textParts.push(caption);
        sanitizedNodes.push({
          id: node.id || `node_${i}`,
          type: 'image',
          url,
          alt,
          caption,
        });
        break;
      }

      case 'code':
      case 'code_block': {
        const code = String(node.code || '');
        const language = String(node.language || 'text').slice(0, 50);
        if (code) textParts.push(code);
        sanitizedNodes.push({
          id: node.id || `node_${i}`,
          type: 'code',
          language,
          code,
        });
        break;
      }

      case 'table': {
        const rawHeaders = Array.isArray(node.headers) ? node.headers : [];
        const cleanHeaders = rawHeaders.map(h => {
          const cleanH = sanitizeHtml(String(h || ''));
          if (cleanH) textParts.push(cleanH);
          return cleanH;
        });

        const rawRows = Array.isArray(node.rows) ? node.rows : [];
        const cleanRows = rawRows.map(row => {
          if (!Array.isArray(row)) return [];
          return row.map(cell => {
            const cleanCell = sanitizeHtml(String(cell || ''));
            if (cleanCell) textParts.push(cleanCell);
            return cleanCell;
          });
        });

        sanitizedNodes.push({
          id: node.id || `node_${i}`,
          type: 'table',
          headers: cleanHeaders.length > 0 ? cleanHeaders : undefined,
          rows: cleanRows,
        });
        break;
      }

      default: {
        const fallbackText = sanitizeHtml(String(node.text || JSON.stringify(node)));
        if (fallbackText) textParts.push(fallbackText);
        sanitizedNodes.push({
          id: node.id || `node_${i}`,
          type: 'paragraph',
          text: fallbackText,
        });
      }
    }
  }

  const plainText = textParts.join(' ').replace(/\s+/g, ' ').trim();

  return {
    sanitizedContent: sanitizedNodes,
    plainText,
  };
}
