const TreeHelper = {
    /**
     * @template T
     * @param {T} rootNode
     * @param {function(node: T): T[]} childMapper
     * @param {function(layer: T[])} callback
     */
    iterateLayers: (rootNode, childMapper, callback) => {
        let nodes = [rootNode];
        let nextNodes = [];
        while (nodes.length > 0) {
            callback(nodes);
            for (let node of nodes) {
                nextNodes.push(...childMapper(node));
            }
            nodes = nextNodes;
            nextNodes = [];
        }
    },

    /**
     * @template T
     * @param {T} rootNode
     * @param {function(node: T): T[]} childMapper
     * @param {function(node: T)} callback
     */
    iteratePreorder: (rootNode, childMapper, callback) => {
        let nodeStack = [rootNode];
        while (nodeStack.length > 0) {
            let node = nodeStack.pop();
            callback(node);
            nodeStack.push(...childMapper(node).toReversed());
        }
    },

    /**
     * @template T
     * @param {T} rootNode
     * @param {function(node: T): T[]} childMapper
     * @returns {T[]}
     */
    toPreorderList: (rootNode, childMapper) => {
        let result = [];
        let nodeStack = [rootNode];
        while (nodeStack.length > 0) {
            let node = nodeStack.pop();
            result.push(node);
            nodeStack.push(...childMapper(node).toReversed());
        }
        return result;
    },
}