/**
 * @property {string} tagName
 *
 * Implements interface LangNode
 * @property {function(): NodeTypes} nodeType
 * @property {function(): function(number, number, number): Templating.HtmlTemplateElement} svgGenerator
 * @property {function(): string} contentText
 */
const LangNode_ApplyTag = class LangNode_ApplyTag {
    /** @returns {NodeTypes} */
    nodeType() {
        return NodeTypes.applyTag;
    }

    /** @returns {function(number, number, number): Templating.HtmlTemplateElement} */
    svgGenerator() {
        return SvgGenerator.applyTag;
    }

    /** @returns {string} */
    contentText() {
        return this.tagName;
    }

    /**
     * @param {string} tagName
     */
    constructor(tagName) {
        this.tagName = tagName;
    }
}
