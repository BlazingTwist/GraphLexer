/**
 * @typedef LangNode
 * @property {function(): NodeTypes} nodeType
 * @property {function(): function(number, number, number): Templating.HtmlTemplateElement} svgGenerator
 * @property {function(): string} contentText
 */

/**
 * @property {boolean} commit
 * @property {LangNode} node
 * @property {LangTreeNode[]} transitions
 */
const LangTreeNode = class LangTreeNode {
    /**
     * @param {boolean} commit
     * @param {LangNode} node
     * @param {LangTreeNode[]} transitions
     */
    constructor(commit, node, transitions) {
        this.commit = commit;
        this.node = node;
        this.transitions = transitions;
    }

    nodeContentText() {
        return escapeStr(this.node.contentText());
    }
}
