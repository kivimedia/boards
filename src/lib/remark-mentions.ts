import { visit } from 'unist-util-visit';
import type { Plugin } from 'unified';
import type { Text, Html, Parent } from 'mdast';

/**
 * Remark plugin: highlights @mention text in rendered markdown.
 *
 * Finds text nodes containing @Name or @First Last patterns and
 * replaces them with a mix of text + HTML span nodes so react-markdown
 * (with rehype-raw) can render them as styled elements.
 */
const remarkMentions: Plugin = () => {
  return (tree) => {
    visit(tree, 'text', (node: Text, index: number | undefined, parent: Parent | undefined) => {
      if (!node.value.includes('@') || index === undefined || !parent) return;

      // Match @Name or @First Last (up to 3 words, stops at punctuation)
      const MENTION_RE = /@([A-Za-zÀ-ÿ0-9_]+(?:\s+[A-Za-zÀ-ÿ0-9_]+){0,2})/g;
      const parts: (Text | Html)[] = [];
      let last = 0;
      let match: RegExpExecArray | null;

      while ((match = MENTION_RE.exec(node.value)) !== null) {
        if (match.index > last) {
          parts.push({ type: 'text', value: node.value.slice(last, match.index) } as Text);
        }
        // Inline HTML span — processed by rehype-raw
        parts.push({
          type: 'html',
          value: `<span class="mention-chip">@${match[1]}</span>`,
        } as Html);
        last = match.index + match[0].length;
      }

      if (parts.length === 0) return; // no mentions found

      if (last < node.value.length) {
        parts.push({ type: 'text', value: node.value.slice(last) } as Text);
      }

      // Replace the current text node with the split parts
      parent.children.splice(index, 1, ...parts);
    });
  };
};

export default remarkMentions;
