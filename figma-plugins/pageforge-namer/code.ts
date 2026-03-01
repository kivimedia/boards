figma.showUI(__html__, { width: 420, height: 620 });

// Load saved credentials on startup
async function loadSavedCredentials() {
  const email = await figma.clientStorage.getAsync('kmboards_email');
  const token = await figma.clientStorage.getAsync('kmboards_token');
  const buildId = await figma.clientStorage.getAsync('kmboards_build_id');
  figma.ui.postMessage({ type: 'stored-credentials', email, token, buildId });
}

loadSavedCredentials();

figma.ui.onmessage = async (msg: any) => {
  if (msg.type === 'save-credentials') {
    if (msg.email) await figma.clientStorage.setAsync('kmboards_email', msg.email);
    if (msg.token) await figma.clientStorage.setAsync('kmboards_token', msg.token);
    if (msg.buildId) await figma.clientStorage.setAsync('kmboards_build_id', msg.buildId);
  }

  if (msg.type === 'clear-credentials') {
    await figma.clientStorage.deleteAsync('kmboards_email');
    await figma.clientStorage.deleteAsync('kmboards_token');
    await figma.clientStorage.deleteAsync('kmboards_build_id');
  }

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
