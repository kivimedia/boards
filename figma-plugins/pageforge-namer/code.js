var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
figma.showUI(__html__, { width: 420, height: 620 });
// Load saved credentials on startup
function loadSavedCredentials() {
    return __awaiter(this, void 0, void 0, function* () {
        const email = yield figma.clientStorage.getAsync('kmboards_email');
        const token = yield figma.clientStorage.getAsync('kmboards_token');
        const buildId = yield figma.clientStorage.getAsync('kmboards_build_id');
        figma.ui.postMessage({ type: 'stored-credentials', email, token, buildId });
    });
}
loadSavedCredentials();
figma.ui.onmessage = (msg) => __awaiter(this, void 0, void 0, function* () {
    if (msg.type === 'save-credentials') {
        if (msg.email)
            yield figma.clientStorage.setAsync('kmboards_email', msg.email);
        if (msg.token)
            yield figma.clientStorage.setAsync('kmboards_token', msg.token);
        if (msg.buildId)
            yield figma.clientStorage.setAsync('kmboards_build_id', msg.buildId);
    }
    if (msg.type === 'clear-credentials') {
        yield figma.clientStorage.deleteAsync('kmboards_email');
        yield figma.clientStorage.deleteAsync('kmboards_token');
        yield figma.clientStorage.deleteAsync('kmboards_build_id');
    }
    if (msg.type === 'collect-nodes') {
        const nodes = [];
        function walk(node, depth) {
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
        const renames = msg.renames;
        let applied = 0;
        let failed = 0;
        for (const r of renames) {
            const node = figma.getNodeById(r.nodeId);
            if (node) {
                node.name = r.suggestedName;
                applied++;
            }
            else {
                failed++;
            }
        }
        figma.ui.postMessage({ type: 'renames-applied', applied, failed });
        figma.notify(`Renamed ${applied} layers${failed > 0 ? ` (${failed} not found)` : ''}`);
    }
    if (msg.type === 'cancel') {
        figma.closePlugin();
    }
});
