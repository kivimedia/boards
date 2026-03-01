figma.showUI(__html__, { width: 420, height: 620 });

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'collect-nodes') {
    const nodes: Array<{ id: string; name: string; type: string; depth: number }> = [];

    function walk(node: SceneNode, depth: number) {
      nodes.push({ id: node.id, name: node.name, type: node.type, depth });
      if ('children' in node) {
        for (const child of node.children) {
          walk(child, depth + 1);
        }
      }
    }

    for (const child of figma.currentPage.children) {
      walk(child, 0);
    }

    figma.ui.postMessage({
      type: 'nodes-collected',
      nodes,
      pageName: figma.currentPage.name,
    });
  }

  if (msg.type === 'apply-renames') {
    const renames: Array<{ nodeId: string; suggestedName: string }> = msg.renames;
    let applied = 0;
    let failed = 0;

    for (const r of renames) {
      const node = figma.getNodeById(r.nodeId);
      if (node) {
        node.name = r.suggestedName;
        applied++;
      } else {
        failed++;
      }
    }

    figma.ui.postMessage({ type: 'renames-applied', applied, failed });
    figma.notify(
      `Renamed ${applied} layers${failed > 0 ? ` (${failed} not found)` : ''}`
    );
  }

  if (msg.type === 'cancel') {
    figma.closePlugin();
  }
};
